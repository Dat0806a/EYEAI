import { supabase } from '../lib/supabase';

export interface PreloadTask {
  id: string;
  name: string;
  isCritical: boolean;
  run: () => Promise<void>;
}

export interface PreloadProgressState {
  progress: number; // 0 - 100
  completedTasks: number;
  totalTasks: number;
  currentTaskName: string;
  isComplete: boolean;
  hasError: boolean;
  errorMessage?: string;
}

type ProgressCallback = (state: PreloadProgressState) => void;

/**
 * Preload Manager for LUCKY DREAM - EYEAI
 * Performs genuine preloading of critical assets, web fonts, core routes, and auth session.
 * Does NOT call heavy 3rd-party APIs (no Gemini API, no YouTube search API, no Maps tile downloads, no camera getUserMedia).
 */
export class PreloadManager {
  private tasks: PreloadTask[] = [];
  private completedCount = 0;
  private isRunning = false;
  private isFinished = false;
  private listeners: ProgressCallback[] = [];

  constructor() {
    this.registerDefaultTasks();
  }

  private registerDefaultTasks() {
    // 1. Critical: Font & Typography readiness
    this.addTask({
      id: 'task-fonts',
      name: 'Kiểm tra phông chữ hệ thống...',
      isCritical: false,
      run: async () => {
        if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.ready === 'object') {
          try {
            await Promise.race([
              document.fonts.ready,
              new Promise((resolve) => setTimeout(resolve, 800)),
            ]);
          } catch {
            // Font fallback is safe
          }
        }
      },
    });

    // 2. Critical: Initial Auth Session Restore
    this.addTask({
      id: 'task-auth-session',
      name: 'Khởi tạo phiên đăng nhập...',
      isCritical: false,
      run: async () => {
        try {
          await Promise.race([
            supabase.auth.getSession(),
            new Promise((resolve) => setTimeout(resolve, 1200)),
          ]);
        } catch (err) {
          console.warn('[SPLASH][PRELOAD] Non-critical auth check timeout/warn:', err);
        }
      },
    });

    // 3. Critical: Core UI & Layout Shell
    this.addTask({
      id: 'task-core-ui',
      name: 'Chuẩn bị giao diện chính...',
      isCritical: true,
      run: async () => {
        await Promise.allSettled([
          import('../components/ui/PageHeader'),
          import('../components/ui/FeatureCard'),
          import('../components/ui/Avatar3D'),
          import('../components/ui/GlobalEyeHUD'),
          import('../components/ui/BackgroundVideo'),
          import('../tokens/index'),
        ]);
      },
    });

    // 4. Critical: Home & Speak Page Chunks
    this.addTask({
      id: 'task-route-home',
      name: 'Tải các module giao tiếp...',
      isCritical: true,
      run: async () => {
        await Promise.allSettled([
          import('../pages/HomePage'),
          import('../pages/SpeakPage'),
          import('../components/home/SpeakHeroCard'),
          import('../components/home/SosHeroCard'),
          import('../components/home/AiVisual'),
          import('../components/home/ContactsVisual'),
          import('../components/home/EntertainmentVisual'),
          import('../components/home/LocationVisual'),
        ]);
      },
    });

    // 5. Critical: Auth & Onboarding Gateway Chunks
    this.addTask({
      id: 'task-route-auth',
      name: 'Tải module xác thực & trợ lý...',
      isCritical: true,
      run: async () => {
        await Promise.allSettled([
          import('../pages/AuthPage'),
          import('../components/auth/AuthStage'),
          import('../components/auth/LoginForm'),
          import('../components/auth/RegisterForm'),
          import('../components/auth/AuthBackgroundVideo'),
        ]);
      },
    });

    // 6. Secondary: Settings & AI Chunks
    this.addTask({
      id: 'task-route-settings-ai',
      name: 'Tải cài đặt & trợ lý thông minh...',
      isCritical: false,
      run: async () => {
        await Promise.allSettled([
          import('../pages/SettingsPage'),
          import('../pages/AiPage'),
        ]);
      },
    });

    // 7. Secondary: SOS & Entertainment Chunks
    this.addTask({
      id: 'task-route-sos-ent',
      name: 'Tải trung tâm SOS & Giải trí...',
      isCritical: false,
      run: async () => {
        await Promise.allSettled([
          import('../pages/SosPage'),
          import('../pages/EntertainmentPage'),
          import('../modules/entertainment/entertainmentConfig'),
        ]);
      },
    });

    // 8. Secondary: Location, Contacts & Chat Chunks
    this.addTask({
      id: 'task-route-location-contacts',
      name: 'Tải vị trí & danh bạ...',
      isCritical: false,
      run: async () => {
        await Promise.allSettled([
          import('../pages/LocationPage'),
          import('../pages/ContactsPage'),
          import('../pages/HumanChatPage'),
          import('../modules/location/luckydreamMapStyle'),
        ]);
      },
    });

    // 9. Secondary: Virtual Keyboard & Telex Engine
    this.addTask({
      id: 'task-virtual-keyboard',
      name: 'Sẵn sàng bàn phím điều khiển mắt...',
      isCritical: false,
      run: async () => {
        await Promise.allSettled([
          import('../modules/virtual-keyboard/VirtualKeyboard'),
          import('../modules/virtual-keyboard/keyboardLayout'),
          import('../modules/virtual-keyboard/vietnameseTelex'),
        ]);
      },
    });
  }

  public addTask(task: PreloadTask) {
    this.tasks.push(task);
  }

  public subscribe(callback: ProgressCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify(state: PreloadProgressState) {
    this.listeners.forEach((callback) => callback(state));
  }

  public async startPreload(): Promise<boolean> {
    if (this.isRunning) return this.isFinished;
    this.isRunning = true;
    this.completedCount = 0;

    const total = this.tasks.length;
    if (total === 0) {
      this.isFinished = true;
      this.notify({
        progress: 100,
        completedTasks: 0,
        totalTasks: 0,
        currentTaskName: 'Sẵn sàng',
        isComplete: true,
        hasError: false,
      });
      return true;
    }

    if (import.meta.env.DEV) {
      console.log(`[SPLASH][PRELOAD] Starting ${total} genuine preload tasks...`);
    }

    let criticalFailure = false;
    let criticalErrorMessage = '';

    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      const taskProgress = Math.round(((i) / total) * 100);

      this.notify({
        progress: taskProgress,
        completedTasks: this.completedCount,
        totalTasks: total,
        currentTaskName: task.name,
        isComplete: false,
        hasError: false,
      });

      try {
        await task.run();
        this.completedCount++;
        if (import.meta.env.DEV) {
          console.log(`[SPLASH][PRELOAD] Completed (${this.completedCount}/${total}): ${task.id}`);
        }
      } catch (err: any) {
        if (task.isCritical) {
          console.error(`[SPLASH][PRELOAD][CRITICAL FAIL] Task ${task.id}:`, err);
          criticalFailure = true;
          criticalErrorMessage = err?.message || 'Lỗi tải tài nguyên hệ thống';
          break;
        } else {
          console.warn(`[SPLASH][PRELOAD][NON-CRITICAL FAIL] Task ${task.id}:`, err);
          // Count non-critical tasks so progress continues
          this.completedCount++;
        }
      }

      const updatedProgress = Math.round((this.completedCount / total) * 100);
      this.notify({
        progress: updatedProgress,
        completedTasks: this.completedCount,
        totalTasks: total,
        currentTaskName: task.name,
        isComplete: this.completedCount === total && !criticalFailure,
        hasError: criticalFailure,
        errorMessage: criticalErrorMessage || undefined,
      });
    }

    if (!criticalFailure) {
      this.isFinished = true;
      this.notify({
        progress: 100,
        completedTasks: total,
        totalTasks: total,
        currentTaskName: 'Sẵn sàng',
        isComplete: true,
        hasError: false,
      });
      if (import.meta.env.DEV) {
        console.log('[SPLASH][PRELOAD] All app resources successfully preloaded & ready!');
      }
      return true;
    } else {
      return false;
    }
  }
}

// Singleton Preload Manager instance for startup
export const preloadManager = new PreloadManager();
