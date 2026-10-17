import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { EyeAction, EyeFocusNode } from './types';
import { useEyeTrackingSettings } from './useEyeTracking';
import { ensureEyeFocusVisible } from './eyeFocusAutoScroll';

interface EyeNavigationContextType {
  activeFocusId: string | null;
  activeScopeId: string | null;
  registerFocusNode: (node: EyeFocusNode) => void;
  unregisterFocusNode: (id: string) => void;
  setFocusId: (id: string) => void;
  navigate: (direction: EyeAction) => boolean;
  triggerSelect: () => boolean;
  ensureFocusVisible: (id?: string) => void;
  pushFocusScope: (scopeId: string, initialFocusId?: string) => void;
  popFocusScope: (scopeId: string) => void;
  registerEscapeHandler: (handler: () => boolean | void) => () => void;
  triggerEscape: () => boolean;
}

const EyeNavigationContext = createContext<EyeNavigationContextType | undefined>(undefined);

/**
 * Sorts focusable nodes in visual 2D reading/DOM order (top-to-bottom, left-to-right).
 */
function sortNodesByVisualOrder(nodes: EyeFocusNode[]): EyeFocusNode[] {
  return [...nodes].sort((a, b) => {
    // 1. Explicit row and column grid indexing
    if (a.row !== undefined && b.row !== undefined) {
      if (a.row !== b.row) return a.row - b.row;
      if (a.col !== undefined && b.col !== undefined) return a.col - b.col;
    }

    // 2. DOM geometry check
    if (a.element && b.element) {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      if (rectA.height > 0 && rectB.height > 0) {
        // Vertical comparison with 10px line tolerance
        if (Math.abs(rectA.top - rectB.top) > 10) {
          return rectA.top - rectB.top;
        }
        return rectA.left - rectB.left;
      }
      // Document order fallback
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    }
    return 0;
  });
}

export function EyeNavigationProvider({ children }: { children: ReactNode }) {
  const { registerGestureCallback, settings, isKeyboardOpen } = useEyeTrackingSettings();
  const nodesRef = useRef<Map<string, EyeFocusNode>>(new Map());
  
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);
  const activeFocusIdRef = useRef<string | null>(null);

  // Stack of active focus scopes. When empty, global (page) scope is active.
  const scopeStackRef = useRef<string[]>([]);
  const [activeScopeId, setActiveScopeId] = useState<string | null>(null);

  // Map to remember previous focus element before entering each modal scope
  const previousFocusByScopeRef = useRef<Map<string, string | null>>(new Map());

  // Escape handlers stack for custom modal/task rollback
  const escapeHandlersRef = useRef<Array<() => boolean | void>>([]);

  const registerEscapeHandler = useCallback((handler: () => boolean | void) => {
    escapeHandlersRef.current.push(handler);
    return () => {
      escapeHandlersRef.current = escapeHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  // Keep activeFocusIdRef in sync with activeFocusId state
  useEffect(() => {
    activeFocusIdRef.current = activeFocusId;
  }, [activeFocusId]);

  /**
   * Helper to retrieve all nodes eligible in the given scope.
   */
  const getScopedCandidates = useCallback((scopeId: string | null): EyeFocusNode[] => {
    const all = Array.from(nodesRef.current.values()) as EyeFocusNode[];
    if (scopeId) {
      return all.filter(n => n.scopeId === scopeId);
    }
    return all.filter(n => !n.scopeId);
  }, []);

  /**
   * Pushes a new focus scope (e.g. 'contact-action-modal') onto the scope stack.
   * Traps all eye navigation inside this scope until popped.
   */
  const pushFocusScope = useCallback((scopeId: string, initialFocusId?: string) => {
    const currentFocused = activeFocusIdRef.current;
    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    // Record previous focus if not already inside the same scope
    if (currentScope !== scopeId) {
      previousFocusByScopeRef.current.set(scopeId, currentFocused);
    }

    const newStack = [...scopeStackRef.current.filter(s => s !== scopeId), scopeId];
    scopeStackRef.current = newStack;
    setActiveScopeId(scopeId);

    // Determine initial focus in the new modal scope
    const scopedNodes = (Array.from(nodesRef.current.values()) as EyeFocusNode[]).filter(
      n => n.scopeId === scopeId
    );
    if (initialFocusId && nodesRef.current.has(initialFocusId)) {
      const target = nodesRef.current.get(initialFocusId);
      if (target?.scopeId === scopeId) {
        activeFocusIdRef.current = initialFocusId;
        setActiveFocusId(initialFocusId);
        return;
      }
    }

    if (scopedNodes.length > 0) {
      const sorted = sortNodesByVisualOrder(scopedNodes);
      activeFocusIdRef.current = sorted[0].id;
      setActiveFocusId(sorted[0].id);
    }
  }, []);

  /**
   * Pops the specified focus scope and restores focus to previous element.
   */
  const popFocusScope = useCallback((scopeId: string) => {
    const prevFocusId = previousFocusByScopeRef.current.get(scopeId) || null;
    previousFocusByScopeRef.current.delete(scopeId);

    const newStack = scopeStackRef.current.filter(s => s !== scopeId);
    scopeStackRef.current = newStack;
    const nextScope = newStack.length > 0 ? newStack[newStack.length - 1] : null;
    setActiveScopeId(nextScope);

    // Restore focus to previous node or nearest valid element in nextScope
    setActiveFocusId(currentId => {
      // 1. Check if previousFocusId is valid in nextScope
      if (prevFocusId && nodesRef.current.has(prevFocusId)) {
        const targetNode = nodesRef.current.get(prevFocusId);
        if ((!nextScope && !targetNode?.scopeId) || (nextScope && targetNode?.scopeId === nextScope)) {
          activeFocusIdRef.current = prevFocusId;
          return prevFocusId;
        }
      }

      // 2. Find eligible candidates in nextScope
      const eligibleNodes = (Array.from(nodesRef.current.values()) as EyeFocusNode[]).filter(
        n => (nextScope ? n.scopeId === nextScope : !n.scopeId)
      );

      if (eligibleNodes.length === 0) {
        activeFocusIdRef.current = null;
        return null;
      }

      // 3. Fallback: if currentId is already an eligible node in nextScope, keep it
      if (currentId && eligibleNodes.some(n => n.id === currentId)) {
        activeFocusIdRef.current = currentId;
        return currentId;
      }

      // 4. Otherwise pick the first eligible node in visual order
      const sorted = sortNodesByVisualOrder(eligibleNodes);
      activeFocusIdRef.current = sorted[0].id;
      return sorted[0].id;
    });
  }, []);

  const registerFocusNode = useCallback((node: EyeFocusNode) => {
    const isExisting = nodesRef.current.has(node.id);
    nodesRef.current.set(node.id, node);

    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    const nodeMatchesScope = currentScope ? node.scopeId === currentScope : !node.scopeId;

    if (isExisting) {
      if (nodeMatchesScope) {
        setActiveFocusId(prev => {
          if (!prev || !nodesRef.current.has(prev) || (node.id === 'card-speak' && !currentScope)) {
            activeFocusIdRef.current = node.id;
            return node.id;
          }
          const prevNode = nodesRef.current.get(prev);
          const prevMatches = currentScope ? prevNode?.scopeId === currentScope : !prevNode?.scopeId;
          if (!prevMatches) {
            activeFocusIdRef.current = node.id;
            return node.id;
          }
          return prev;
        });
      }
      return;
    }

    if (nodeMatchesScope) {
      setActiveFocusId(prev => {
        if (!prev || !nodesRef.current.has(prev) || (node.id === 'card-speak' && !currentScope)) {
          activeFocusIdRef.current = node.id;
          return node.id;
        }
        const prevNode = nodesRef.current.get(prev);
        const prevMatches = currentScope ? prevNode?.scopeId === currentScope : !prevNode?.scopeId;
        if (!prevMatches) {
          activeFocusIdRef.current = node.id;
          return node.id;
        }
        return prev;
      });
    }
  }, []);

  const unregisterFocusNode = useCallback((id: string) => {
    const nodeToRemove = nodesRef.current.get(id);
    nodesRef.current.delete(id);

    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    setActiveFocusId(prev => {
      if (prev === id) {
        const remainingCandidates = (Array.from(nodesRef.current.values()) as EyeFocusNode[]).filter(
          n => (currentScope ? n.scopeId === currentScope : !n.scopeId)
        );

        if (remainingCandidates.length === 0) {
          activeFocusIdRef.current = null;
          return null;
        }

        // If the unregistered node belonged to a specific group (e.g. virtual-keyboard),
        // try to keep focus inside that same group!
        if (nodeToRemove?.groupId) {
          const sameGroupNodes = remainingCandidates.filter(n => n.groupId === nodeToRemove.groupId);
          if (sameGroupNodes.length > 0) {
            activeFocusIdRef.current = sameGroupNodes[0].id;
            return sameGroupNodes[0].id;
          }
        }

        const sorted = sortNodesByVisualOrder(remainingCandidates);
        activeFocusIdRef.current = sorted[0].id;
        return sorted[0].id;
      }
      return prev;
    });
  }, []);

  const setFocusId = useCallback((id: string) => {
    if (nodesRef.current.has(id)) {
      const currentScope = scopeStackRef.current.length > 0
        ? scopeStackRef.current[scopeStackRef.current.length - 1]
        : null;
      const node = nodesRef.current.get(id)!;
      const nodeMatchesScope = currentScope ? node.scopeId === currentScope : !node.scopeId;
      if (nodeMatchesScope) {
        activeFocusIdRef.current = id;
        setActiveFocusId(id);
      }
    }
  }, []);

  const navigate = useCallback((direction: EyeAction): boolean => {
    if (direction === 'NONE' || direction === 'SELECT' || direction === 'ESCAPE' || direction === 'DOUBLE_BLINK') return false;

    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    // Strict candidate filtering by active scope (modal trap) and visibility
    const scopedCandidates = (Array.from(nodesRef.current.values()) as EyeFocusNode[]).filter(
      node => {
        const scopeMatch = currentScope ? node.scopeId === currentScope : !node.scopeId;
        if (!scopeMatch || !node.element || !node.element.isConnected) return false;
        const rect = node.element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
    );

    if (scopedCandidates.length === 0) return false;

    const currentId = activeFocusIdRef.current;
    if (!currentId || !scopedCandidates.some(n => n.id === currentId)) {
      const sorted = sortNodesByVisualOrder(scopedCandidates);
      const first = sorted[0];
      activeFocusIdRef.current = first.id;
      setActiveFocusId(first.id);
      ensureEyeFocusVisible(first.id, nodesRef.current);
      return true;
    }

    const currNode = nodesRef.current.get(currentId)!;
    let targetNode: EyeFocusNode | null = null;

    // 1. Grid-based navigation (when rows and cols are defined)
    if (currNode.row !== undefined && currNode.col !== undefined) {
      const sameGroupCandidates = scopedCandidates.filter(
        n => n.row !== undefined && n.col !== undefined && (!currNode.groupId || n.groupId === currNode.groupId)
      );

      if (sameGroupCandidates.length > 1) {
        if (direction === 'NEXT' || direction === 'RIGHT') {
          const sameRowRight = sameGroupCandidates
            .filter(n => n.row === currNode.row && n.col! > currNode.col!)
            .sort((a, b) => a.col! - b.col!);
          if (sameRowRight.length > 0) {
            targetNode = sameRowRight[0];
          }
        } else if (direction === 'BACK' || direction === 'LEFT') {
          const sameRowLeft = sameGroupCandidates
            .filter(n => n.row === currNode.row && n.col! < currNode.col!)
            .sort((a, b) => b.col! - a.col!);
          if (sameRowLeft.length > 0) {
            targetNode = sameRowLeft[0];
          }
        } else if (direction === 'DOWN') {
          const rowsDown = Array.from(new Set(sameGroupCandidates.filter(n => n.row! > currNode.row!).map(n => n.row!))).sort((a, b) => a - b);
          if (rowsDown.length > 0) {
            const nextRow = rowsDown[0];
            const nextRowNodes = sameGroupCandidates.filter(n => n.row === nextRow);
            let bestColNode = nextRowNodes[0];
            let minColDiff = Infinity;
            for (const n of nextRowNodes) {
              const diff = Math.abs(n.col! - currNode.col!);
              if (diff < minColDiff) {
                minColDiff = diff;
                bestColNode = n;
              }
            }
            targetNode = bestColNode;
          }
        } else if (direction === 'UP') {
          const rowsUp = Array.from(new Set(sameGroupCandidates.filter(n => n.row! < currNode.row!).map(n => n.row!))).sort((a, b) => b - a);
          if (rowsUp.length > 0) {
            const prevRow = rowsUp[0];
            const prevRowNodes = sameGroupCandidates.filter(n => n.row === prevRow);
            let bestColNode = prevRowNodes[0];
            let minColDiff = Infinity;
            for (const n of prevRowNodes) {
              const diff = Math.abs(n.col! - currNode.col!);
              if (diff < minColDiff) {
                minColDiff = diff;
                bestColNode = n;
              }
            }
            targetNode = bestColNode;
          }
        }
      }
    }

    // 2. Spatial 2D Bounding Box Search (if no grid target found or freeform layout)
    if (!targetNode) {
      const currRect = currNode.element.getBoundingClientRect();
      const currCenter = {
        x: currRect.left + currRect.width / 2,
        y: currRect.top + currRect.height / 2,
      };

      let bestSpatialCandidate: EyeFocusNode | null = null;
      let minScore = Infinity;

      scopedCandidates.forEach(node => {
        if (node.id === currentId) return;
        const rect = node.element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const dx = center.x - currCenter.x;
        const dy = center.y - currCenter.y;

        const overlapY = Math.max(0, Math.min(currRect.bottom, rect.bottom) - Math.max(currRect.top, rect.top));
        const overlapX = Math.max(0, Math.min(currRect.right, rect.right) - Math.max(currRect.left, rect.left));

        let isValidDir = false;
        let score = Infinity;

        if (direction === 'NEXT' || direction === 'RIGHT') {
          if (dx > 4) {
            isValidDir = overlapY > 0 || Math.abs(dy) <= dx * 2.2;
            score = overlapY > 0 ? dx * 0.6 : dx + Math.abs(dy) * 1.8;
          }
        } else if (direction === 'BACK' || direction === 'LEFT') {
          if (dx < -4) {
            isValidDir = overlapY > 0 || Math.abs(dy) <= (-dx) * 2.2;
            score = overlapY > 0 ? (-dx) * 0.6 : (-dx) + Math.abs(dy) * 1.8;
          }
        } else if (direction === 'DOWN') {
          if (dy > 4) {
            isValidDir = overlapX > 0 || Math.abs(dx) <= dy * 2.2;
            score = overlapX > 0 ? dy * 0.6 : dy + Math.abs(dx) * 1.8;
          }
        } else if (direction === 'UP') {
          if (dy < -4) {
            isValidDir = overlapX > 0 || Math.abs(dx) <= (-dy) * 2.2;
            score = overlapX > 0 ? (-dy) * 0.6 : (-dy) + Math.abs(dx) * 1.8;
          }
        }

        if (isValidDir && score < minScore) {
          minScore = score;
          bestSpatialCandidate = node;
        }
      });

      if (bestSpatialCandidate) {
        targetNode = bestSpatialCandidate;
      }
    }

    // 3. Evaluate Result
    if (targetNode && targetNode.id !== currentId) {
      activeFocusIdRef.current = targetNode.id;
      setActiveFocusId(targetNode.id);
      ensureEyeFocusVisible(targetNode.id, nodesRef.current);
      return true; // Successfully moved to a new element!
    }

    // No valid element in that direction (boundary reached)
    return false;
  }, []);

  const triggerSelect = useCallback((): boolean => {
    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    let currentFocus = activeFocusIdRef.current;

    // Fallback: if no focus is active, pick the first valid node in scope
    if (!currentFocus || !nodesRef.current.has(currentFocus)) {
      const candidates = (Array.from(nodesRef.current.values()) as EyeFocusNode[]).filter(
        n => (currentScope ? n.scopeId === currentScope : !n.scopeId)
      );
      if (candidates.length > 0) {
        const sorted = sortNodesByVisualOrder(candidates);
        currentFocus = sorted[0].id;
        activeFocusIdRef.current = currentFocus;
        setActiveFocusId(currentFocus);
        ensureEyeFocusVisible(currentFocus, nodesRef.current);
      }
    }

    if (currentFocus && nodesRef.current.has(currentFocus)) {
      const node = nodesRef.current.get(currentFocus)!;
      const nodeMatchesScope = currentScope ? node.scopeId === currentScope : !node.scopeId;
      if (nodeMatchesScope) {
        if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
          console.log(`[EYE NAV][SELECT] selectedNode: ${currentFocus}, scope: ${currentScope || 'global'}`);
        }
        if (node.onSelect) {
          node.onSelect();
        } else {
          node.element.click();
        }
        return true;
      }
    }
    return false;
  }, []);

  const triggerEscape = useCallback((): boolean => {
    if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
      console.log('[EYE NAV] triggerEscape called (DOUBLE BLINK)');
    }

    // 1. Run top registered escape handler if available
    if (escapeHandlersRef.current.length > 0) {
      const topHandler = escapeHandlersRef.current[escapeHandlersRef.current.length - 1];
      const handled = topHandler();
      if (handled !== false) return true;
    }

    // 2. If inside a modal scope, pop scope
    if (scopeStackRef.current.length > 0) {
      const topScope = scopeStackRef.current[scopeStackRef.current.length - 1];
      popFocusScope(topScope);
      return true;
    }

    // 3. Look for explicit Back button in active view
    const backBtn =
      document.getElementById('btn-header-back') ||
      document.getElementById('btn-speak-back') ||
      document.getElementById('btn-ai-back') ||
      document.getElementById('btn-chat-back') ||
      document.getElementById('btn-player-back') ||
      (document.querySelector('[data-eye-back="true"]') as HTMLElement | null);

    if (backBtn) {
      backBtn.click();
      return true;
    }

    // 4. Dispatch global eyeai:escape event
    window.dispatchEvent(new CustomEvent('eyeai:escape'));
    return true;
  }, [popFocusScope]);

  const ensureFocusVisible = useCallback((id?: string) => {
    const targetId = id || activeFocusId;
    if (targetId) {
      ensureEyeFocusVisible(targetId, nodesRef.current);
    }
  }, [activeFocusId]);

  // Global Viewport Auto-Follow Eye Focus
  useEffect(() => {
    if (!activeFocusId) return;

    const frameId = requestAnimationFrame(() => {
      ensureEyeFocusVisible(activeFocusId, nodesRef.current);
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeFocusId, isKeyboardOpen]);

  // Recalculate safe visibility on window resize or orientation changes
  useEffect(() => {
    function handleResize() {
      if (activeFocusId) {
        ensureEyeFocusVisible(activeFocusId, nodesRef.current, { smooth: false });
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeFocusId]);

  // Subscribe to gesture actions from EyeTrackingProvider
  useEffect(() => {
    const unbind = registerGestureCallback(action => {
      if (action === 'SELECT') {
        return triggerSelect();
      } else if (action === 'ESCAPE' || action === 'DOUBLE_BLINK') {
        return triggerEscape();
      } else {
        return navigate(action);
      }
    });

    return unbind;
  }, [registerGestureCallback, navigate, triggerSelect, triggerEscape]);

  const contextValue = useMemo<EyeNavigationContextType>(() => ({
    activeFocusId,
    activeScopeId,
    registerFocusNode,
    unregisterFocusNode,
    setFocusId,
    navigate,
    triggerSelect,
    ensureFocusVisible,
    pushFocusScope,
    popFocusScope,
    registerEscapeHandler,
    triggerEscape,
  }), [
    activeFocusId,
    activeScopeId,
    registerFocusNode,
    unregisterFocusNode,
    setFocusId,
    navigate,
    triggerSelect,
    ensureFocusVisible,
    pushFocusScope,
    popFocusScope,
    registerEscapeHandler,
    triggerEscape,
  ]);

  return (
    <EyeNavigationContext.Provider value={contextValue}>
      {children}
    </EyeNavigationContext.Provider>
  );
}

export function useEyeNavigationContext() {
  const ctx = useContext(EyeNavigationContext);
  if (!ctx) throw new Error('useEyeNavigationContext must be used within EyeNavigationProvider');
  return ctx;
}
