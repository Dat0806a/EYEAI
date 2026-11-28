import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import {
  ActionExecutionRecord,
  AgentConversationMessage,
  AgentTaskState,
  ConfirmationRequest,
  UserGestureRequest,
} from '../types/agentTypes';
import {
  observeWorkspaceMutations,
  scanPatientWorkspace,
  validateFreshReference,
} from '../observation/semanticObserver';
import { executeGenericAction } from '../execution/genericActionExecutor';
import { useManualTakeoverWatcher } from '../runtime/manualTakeoverController';
import { runAutonomousAgentLoop } from '../runtime/agentLoopRuntime';
import { PlanTurnRequest, PlanTurnResponse } from '../planning/agentPlannerClient';
import {
  createPatientVoiceInputController,
  isPatientSpeechRecognitionSupported,
  PatientVoiceInputController,
} from '../voice/patientVoiceInput';
import {
  createPatientVoiceOutputController,
  PatientVoiceOutputController,
} from '../voice/patientVoiceOutput';

const INITIAL_GREETING: AgentConversationMessage = {
  id: 'msg-welcome',
  role: 'assistant',
  content:
    'Xin chào! Tôi là EYEAI AI Agent. Bạn có thể nói hoặc nhập điều bạn muốn làm — ví dụ quét phiếu xét nghiệm, xem kết quả, thực đơn, bài tập hoặc hỏi đáp về các chỉ số.',
  timestamp: new Date().toISOString(),
  kind: 'chat',
};

export interface PatientAgentContextValue {
  sessionId: string;
  userId: string | null;
  currentRoute: string;
  previousRoute: string | null;
  stateEpoch: number;
  messages: AgentConversationMessage[];
  taskState: AgentTaskState;
  userGoal: string | null;
  activeActionSummary: string | null;
  popupOpen: boolean;
  isMinimized: boolean;
  input: string;
  interimTranscript: string;
  isListening: boolean;
  sttSupported: boolean;
  sttNotice: string | null;
  voiceOutputEnabled: boolean;
  pendingConfirmation: ConfirmationRequest | null;
  pendingGesture: UserGestureRequest | null;
  errorText: string | null;
  setInput: (val: string) => void;
  openPopup: () => void;
  minimizePopup: () => void;
  togglePopup: () => void;
  toggleVoiceOutput: () => void;
  toggleListening: () => void;
  sendMessage: (text?: string, source?: 'text' | 'voice') => Promise<void>;
  stopTask: () => void;
  resetSession: () => void;
  speakMessage: (text: string) => void;
  respondToConfirmation: (approved: boolean) => Promise<void>;
  triggerPendingGesture: () => Promise<void>;
  dismissPendingGesture: () => void;
}

const PatientAgentContext = createContext<PatientAgentContextValue | undefined>(undefined);

export interface PatientAgentProviderProps {
  userId: string | null;
  currentRoute: string;
  onNavigate: (route: string, params?: Record<string, any>) => void;
  plannerFn?: (payload: PlanTurnRequest, signal?: AbortSignal) => Promise<PlanTurnResponse>;
  children: ReactNode;
}

function createSessionId(uid: string | null): string {
  return `pas_${uid || 'anon'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function PatientAgentProvider({
  userId,
  currentRoute,
  onNavigate,
  plannerFn,
  children,
}: PatientAgentProviderProps) {
  const [sessionId, setSessionId] = useState<string>(() => createSessionId(userId));
  const [previousRoute, setPreviousRoute] = useState<string | null>(null);
  const currentRouteRef = useRef<string>(currentRoute);
  const previousRouteRef = useRef<string | null>(null);
  const [stateEpoch, setStateEpoch] = useState<number>(1);
  const stateEpochRef = useRef<number>(1);
  const stateVersionRef = useRef<number>(1);

  const [messages, setMessages] = useState<AgentConversationMessage[]>([INITIAL_GREETING]);
  const messagesRef = useRef<AgentConversationMessage[]>([INITIAL_GREETING]);
  const actionHistoryRef = useRef<ActionExecutionRecord[]>([]);

  const [taskState, setTaskState] = useState<AgentTaskState>('IDLE');
  const [userGoal, setUserGoal] = useState<string | null>(null);
  const userGoalRef = useRef<string | null>(null);
  const [activeActionSummary, setActiveActionSummary] = useState<string | null>(null);

  const [popupOpen, setPopupOpen] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState<boolean>(true);
  const voiceOutputEnabledRef = useRef<boolean>(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(null);
  const [pendingGesture, setPendingGesture] = useState<UserGestureRequest | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isAgentActingRef = useRef<boolean>(false);
  const manualInterventionRef = useRef<boolean>(false);
  const activeTaskIdRef = useRef<string>(`task_${Date.now()}`);
  const voiceOutputRef = useRef<PatientVoiceOutputController | null>(null);
  const voiceInputRef = useRef<PatientVoiceInputController | null>(null);
  const sendMessageRef = useRef<(text?: string, source?: 'text' | 'voice') => Promise<void>>(async () => {});

  const sttSupported = isPatientSpeechRecognitionSupported();

  // Initialize patient-only TTS controller (disposed cleanly on unmount)
  useEffect(() => {
    const outCtrl = createPatientVoiceOutputController();
    voiceOutputRef.current = outCtrl;
    return () => {
      outCtrl.dispose();
      voiceOutputRef.current = null;
    };
  }, []);

  // Initialize patient-only STT controller (never auto-starts without explicit mic click)
  useEffect(() => {
    const inCtrl = createPatientVoiceInputController({
      onStart: () => {
        setIsListening(true);
        setSttNotice(null);
        setTaskState('LISTENING');
      },
      onInterimTranscript: (partial) => {
        setInterimTranscript(partial);
      },
      onFinalTranscript: (finalText) => {
        setIsListening(false);
        setInterimTranscript('');
        void sendMessageRef.current(finalText, 'voice');
      },
      onError: (friendlyMsg) => {
        setIsListening(false);
        setInterimTranscript('');
        setSttNotice(friendlyMsg);
        setTaskState((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
      },
      onEnd: () => {
        setIsListening(false);
        setInterimTranscript('');
        setTaskState((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
      },
    });
    voiceInputRef.current = inCtrl;
    return () => {
      inCtrl.abort();
      voiceInputRef.current = null;
    };
  }, []);

  useEffect(() => {
    voiceOutputEnabledRef.current = voiceOutputEnabled;
    voiceOutputRef.current?.setMuted(!voiceOutputEnabled);
  }, [voiceOutputEnabled]);

  const bumpStateEpoch = useCallback(() => {
    stateEpochRef.current += 1;
    stateVersionRef.current += 1;
    setStateEpoch(stateEpochRef.current);
    return stateEpochRef.current;
  }, []);

  const appendMessage = useCallback(
    (msg: Omit<AgentConversationMessage, 'id' | 'timestamp'>) => {
      const entry: AgentConversationMessage = {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      };
      messagesRef.current = [...messagesRef.current, entry];
      setMessages(messagesRef.current);
    },
    []
  );

  // Track route changes while preserving conversation & task continuity
  useEffect(() => {
    if (currentRouteRef.current !== currentRoute) {
      previousRouteRef.current = currentRouteRef.current;
      currentRouteRef.current = currentRoute;
      setPreviousRoute(previousRouteRef.current);
      bumpStateEpoch();
    }
  }, [currentRoute, bumpStateEpoch]);

  // Observe patient workspace DOM mutations cleanly (debounced)
  useEffect(() => {
    const unobserve = observeWorkspaceMutations(() => {
      bumpStateEpoch();
    }, 150);
    return unobserve;
  }, [currentRoute, bumpStateEpoch]);

  const stopAllActiveResources = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Ignore
      }
      abortControllerRef.current = null;
    }
    voiceInputRef.current?.abort();
    voiceOutputRef.current?.stop();
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  // Isolate strictly by userId: switching accounts or clearing userId wipes session cleanly
  const prevUserIdRef = useRef<string | null>(userId);
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      stopAllActiveResources();
      setSessionId(createSessionId(userId));
      messagesRef.current = [INITIAL_GREETING];
      setMessages(messagesRef.current);
      actionHistoryRef.current = [];
      setTaskState('IDLE');
      setUserGoal(null);
      userGoalRef.current = null;
      setActiveActionSummary(null);
      setPendingConfirmation(null);
      setPendingGesture(null);
      setErrorText(null);
      setPopupOpen(false);
      setIsMinimized(false);
    }
  }, [userId, stopAllActiveResources]);

  // Cleanup on unmount (switching to Mode A or logging out)
  useEffect(() => {
    return () => {
      stopAllActiveResources();
    };
  }, [stopAllActiveResources]);

  const isLoopBusy =
    taskState === 'PLANNING' ||
    taskState === 'EXECUTING' ||
    taskState === 'OBSERVING' ||
    taskState === 'VERIFYING' ||
    taskState === 'WAITING_FOR_RESULT';

  // Detect manual human interaction while Agent is executing
  useManualTakeoverWatcher({
    isAgentActive: isLoopBusy,
    isAgentActingRef,
    onManualTakeover: () => {
      manualInterventionRef.current = true;
      stopAllActiveResources();
      bumpStateEpoch();
      setTaskState('PAUSED');
      setActiveActionSummary('Đã tạm dừng do bạn đang thao tác trực tiếp');
      appendMessage({
        role: 'assistant',
        content: 'Tôi thấy bạn vừa thao tác trên màn hình nên đã tạm dừng để nhường quyền điều khiển cho bạn.',
        kind: 'progress',
      });
    },
  });

  const openPopup = useCallback(() => {
    setPopupOpen(true);
    setIsMinimized(false);
  }, []);

  const minimizePopup = useCallback(() => {
    setPopupOpen(false);
    setIsMinimized(true);
  }, []);

  const togglePopup = useCallback(() => {
    setPopupOpen((prev) => {
      const next = !prev;
      setIsMinimized(!next);
      return next;
    });
  }, []);

  const toggleVoiceOutput = useCallback(() => {
    setVoiceOutputEnabled((prev) => {
      const next = !prev;
      voiceOutputRef.current?.setMuted(!next);
      return next;
    });
  }, []);

  const toggleListening = useCallback(() => {
    if (!sttSupported) {
      setSttNotice('Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói. Bạn vui lòng nhập văn bản.');
      return;
    }
    const ctrl = voiceInputRef.current;
    if (!ctrl) return;
    if (ctrl.isListening()) {
      ctrl.stop();
      setIsListening(false);
      return;
    }
    // Barge-in / STT-TTS coordination: always stop Agent speech before listening
    voiceOutputRef.current?.stop();
    ctrl.start();
  }, [sttSupported]);

  const speakMessage = useCallback((text: string) => {
    // Prevent self-recognition echo by stopping STT while Agent starts speaking
    if (voiceInputRef.current?.isListening()) {
      voiceInputRef.current.abort();
      setIsListening(false);
    }
    voiceOutputRef.current?.speak(text);
  }, []);

  const speakIfEnabled = useCallback(
    (text: string) => {
      if (voiceOutputEnabledRef.current) {
        speakMessage(text);
      }
    },
    [speakMessage]
  );

  const stopTask = useCallback(() => {
    stopAllActiveResources();
    setPendingConfirmation(null);
    setPendingGesture(null);
    setActiveActionSummary(null);
    setTaskState('CANCELLED');
    appendMessage({
      role: 'assistant',
      content: 'Tôi đã dừng tác vụ hiện tại theo yêu cầu của bạn.',
      kind: 'progress',
    });
  }, [stopAllActiveResources, appendMessage]);

  const resetSession = useCallback(() => {
    stopAllActiveResources();
    setSessionId(createSessionId(userId));
    messagesRef.current = [INITIAL_GREETING];
    setMessages(messagesRef.current);
    actionHistoryRef.current = [];
    setTaskState('IDLE');
    setUserGoal(null);
    userGoalRef.current = null;
    setActiveActionSummary(null);
    setPendingConfirmation(null);
    setPendingGesture(null);
    setErrorText(null);
    setInput('');
  }, [stopAllActiveResources, userId]);

  const startLoop = useCallback(
    async (goalText: string, userMessage: string, taskId: string) => {
      stopAllActiveResources();
      manualInterventionRef.current = false;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      await runAutonomousAgentLoop({
        sessionId,
        taskId,
        userMessage,
        userGoal: goalText,
        getCurrentRoute: () => currentRouteRef.current,
        getPreviousRoute: () => previousRouteRef.current,
        getStateEpoch: () => stateEpochRef.current,
        bumpStateEpoch,
        getStateVersion: () => stateVersionRef.current,
        getMessages: () => messagesRef.current,
        getActionHistory: () => actionHistoryRef.current,
        pushActionRecord: (rec) => {
          actionHistoryRef.current = [...actionHistoryRef.current, rec];
        },
        setTaskState,
        setActiveActionSummary,
        addAssistantMessage: (content, kind = 'chat') => {
          appendMessage({ role: 'assistant', content, kind });
        },
        setPendingConfirmation,
        setPendingGesture,
        minimizePopup,
        openPopup,
        speakIfEnabled,
        navigateTo: onNavigate,
        isAgentActingRef,
        isManualInterventionTriggered: () => manualInterventionRef.current,
        abortSignal: controller.signal,
        plannerFn,
      });
    },
    [
      sessionId,
      stopAllActiveResources,
      bumpStateEpoch,
      appendMessage,
      minimizePopup,
      openPopup,
      speakIfEnabled,
      onNavigate,
      plannerFn,
    ]
  );

  const sendMessage = useCallback(
    async (explicitText?: string, source: 'text' | 'voice' = 'text') => {
      const text = (explicitText ?? input).trim();
      if (!text) return;

      if (!explicitText) {
        setInput('');
      }
      setErrorText(null);
      setPendingConfirmation(null);
      setPendingGesture(null);

      const nextGoal = text;
      setUserGoal(nextGoal);
      userGoalRef.current = nextGoal;
      activeTaskIdRef.current = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      actionHistoryRef.current = [];
      appendMessage({ role: 'user', content: text, source, kind: 'chat' });

      await startLoop(nextGoal, text, activeTaskIdRef.current);
    },
    [input, appendMessage, startLoop]
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const respondToConfirmation = useCallback(
    async (approved: boolean) => {
      const req = pendingConfirmation;
      setPendingConfirmation(null);
      if (!req) return;

      if (!approved) {
        setTaskState('CANCELLED');
        appendMessage({
          role: 'assistant',
          content: 'Đã hủy thao tác theo xác nhận của bạn.',
          kind: 'progress',
        });
        return;
      }

      // Execute confirmed action with fresh observation validation
      const obs = scanPatientWorkspace(currentRouteRef.current, stateEpochRef.current);
      const outcome = await executeGenericAction(
        req.action,
        {
          sessionId,
          taskId: activeTaskIdRef.current,
          contextVersion: stateVersionRef.current,
          currentRoute: currentRouteRef.current,
          observation: obs,
          isAgentActingRef,
          navigateTo: onNavigate,
          refreshObservation: () => {
            const nextEp = bumpStateEpoch();
            return scanPatientWorkspace(currentRouteRef.current, nextEp);
          },
        },
        { confirmedByUser: true }
      );
      actionHistoryRef.current = [...actionHistoryRef.current, outcome.record];

      if (outcome.record.success) {
        // Allow async action (e.g. confirmAnalysis) + route transition to settle
        await new Promise((r) => setTimeout(r, 250));
        await startLoop(
          userGoalRef.current || req.title,
          `Người dùng đã xác nhận và hoàn tất thao tác: ${outcome.record.outcomeSummary}`,
          activeTaskIdRef.current
        );
      } else {
        setTaskState('FAILED');
        appendMessage({
          role: 'assistant',
          content: outcome.record.outcomeSummary,
          kind: 'error',
        });
      }
    },
    [pendingConfirmation, sessionId, onNavigate, bumpStateEpoch, appendMessage, startLoop]
  );

  const triggerPendingGesture = useCallback(async () => {
    const req = pendingGesture;
    setPendingGesture(null);
    if (!req) return;

    // MUST execute DOM click synchronously inside the user's click handler to retain trusted user activation
    const obs = scanPatientWorkspace(currentRouteRef.current, stateEpochRef.current);
    if (req.targetRef) {
      const check = validateFreshReference(obs, req.targetRef, obs.stateEpoch);
      if (check.valid) {
        isAgentActingRef.current = true;
        try {
          check.entry.element.click();
        } finally {
          setTimeout(() => {
            isAgentActingRef.current = false;
          }, 50);
        }
        actionHistoryRef.current = [
          ...actionHistoryRef.current,
          {
            actionId: `gest_exec_${Date.now()}`,
            sessionId,
            taskId: activeTaskIdRef.current,
            contextVersion: stateVersionRef.current,
            actionType: 'activate_element',
            targetRef: req.targetRef,
            success: true,
            verified: true,
            outcomeSummary: `Người dùng đã chạm thực hiện "${req.buttonLabel}".`,
            timestamp: new Date().toISOString(),
          },
        ];
        bumpStateEpoch();

        // Multi-step continuation: if there's an active user goal, resume the
        // autonomous loop so the planner can decide the next step instead of
        // immediately marking COMPLETED. Only mark COMPLETED if no goal exists.
        const goal = userGoalRef.current;
        if (goal) {
          // Allow DOM/route to settle after gesture-triggered action (e.g., file picker, camera)
          await new Promise((r) => setTimeout(r, 200));
          await startLoop(
            goal,
            `Người dùng đã chạm "${req.buttonLabel}" – tiếp tục thực hiện mục tiêu.`,
            activeTaskIdRef.current
          );
        } else {
          setTaskState('COMPLETED');
          setActiveActionSummary(null);
        }
        return;
      }
    }

    setTaskState('PAUSED');
    appendMessage({
      role: 'assistant',
      content: 'Phần tử yêu cầu thao tác không còn khả dụng trên màn hình hiện tại.',
      kind: 'error',
    });
  }, [pendingGesture, sessionId, bumpStateEpoch, appendMessage, startLoop]);

  const dismissPendingGesture = useCallback(() => {
    setPendingGesture(null);
    setTaskState('PAUSED');
    setActiveActionSummary(null);
  }, []);

  return (
    <PatientAgentContext.Provider
      value={{
        sessionId,
        userId,
        currentRoute,
        previousRoute,
        stateEpoch,
        messages,
        taskState,
        userGoal,
        activeActionSummary,
        popupOpen,
        isMinimized,
        input,
        interimTranscript,
        isListening,
        sttSupported,
        sttNotice,
        voiceOutputEnabled,
        pendingConfirmation,
        pendingGesture,
        errorText,
        setInput,
        openPopup,
        minimizePopup,
        togglePopup,
        toggleVoiceOutput,
        toggleListening,
        sendMessage,
        stopTask,
        resetSession,
        speakMessage,
        respondToConfirmation,
        triggerPendingGesture,
        dismissPendingGesture,
      }}
    >
      {children}
    </PatientAgentContext.Provider>
  );
}

export function usePatientAgent(): PatientAgentContextValue {
  const ctx = useContext(PatientAgentContext);
  if (!ctx) {
    throw new Error('usePatientAgent must be used within PatientAgentProvider');
  }
  return ctx;
}
