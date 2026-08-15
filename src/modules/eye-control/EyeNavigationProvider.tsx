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
  navigate: (direction: EyeAction) => void;
  triggerSelect: () => void;
  ensureFocusVisible: (id?: string) => void;
  pushFocusScope: (scopeId: string, initialFocusId?: string) => void;
  popFocusScope: (scopeId: string) => void;
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
          if (!prev || !nodesRef.current.has(prev)) return node.id;
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
        if (!prev || !nodesRef.current.has(prev)) {
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

  const navigate = useCallback((direction: EyeAction) => {
    if (direction === 'NONE' || direction === 'SELECT') return;

    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    // Strict candidate filtering by active scope (modal trap)
    const scopedCandidates = (Array.from(nodesRef.current.values()) as EyeFocusNode[]).filter(
      node => (currentScope ? node.scopeId === currentScope : !node.scopeId)
    );

    if (scopedCandidates.length === 0) return;

    setActiveFocusId(currentId => {
      if (!currentId || !scopedCandidates.some(n => n.id === currentId)) {
        const sorted = sortNodesByVisualOrder(scopedCandidates);
        activeFocusIdRef.current = sorted[0].id;
        return sorted[0].id;
      }

      const currNode = nodesRef.current.get(currentId)!;

      // Group-based cyclic & nearest-X grid navigation (especially for virtual-keyboard)
      if (currNode.groupId && currNode.row !== undefined && currNode.col !== undefined) {
        const sameGroupNodes = scopedCandidates.filter(
          n => n.groupId === currNode.groupId && n.row !== undefined && n.col !== undefined
        );

        if (sameGroupNodes.length > 0) {
          // Unique sorted rows
          const rows: number[] = Array.from(new Set(sameGroupNodes.map(n => n.row!))).sort((a, b) => a - b);
          const currRowIdx = rows.indexOf(currNode.row);

          if (currRowIdx !== -1) {
            const currRowNodes = sameGroupNodes
              .filter(n => n.row === currNode.row)
              .sort((a, b) => a.col! - b.col!);

            const currColIdx = currRowNodes.findIndex(n => n.id === currentId);

            // HORIZONTAL WRAP (NEXT = Right, BACK = Left)
            if (direction === 'NEXT' || direction === 'BACK') {
              let targetNode: EyeFocusNode;
              let isWrap = false;

              if (direction === 'NEXT') {
                if (currColIdx !== -1 && currColIdx < currRowNodes.length - 1) {
                  targetNode = currRowNodes[currColIdx + 1];
                } else {
                  targetNode = currRowNodes[0];
                  isWrap = true;
                }
              } else { // BACK (Left)
                if (currColIdx > 0) {
                  targetNode = currRowNodes[currColIdx - 1];
                } else {
                  targetNode = currRowNodes[currRowNodes.length - 1];
                  isWrap = true;
                }
              }

              if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
                console.log(`[KEYBOARD][NAV] fromKey: ${currentId}, dir: ${direction}, toKey: ${targetNode.id}, wrap: ${isWrap}`);
              }
              activeFocusIdRef.current = targetNode.id;
              return targetNode.id;
            }

            // VERTICAL WRAP & GEOMETRIC NEAREST-X SELECTION (UP / DOWN)
            if (direction === 'UP' || direction === 'DOWN') {
              let targetRowIdx: number;
              let isWrap = false;

              if (direction === 'UP') {
                if (currRowIdx > 0) {
                  targetRowIdx = currRowIdx - 1;
                } else {
                  // TOP KEYBOARD ROW + UP: Exit keyboard upward to generic EyeFocusable in active scope
                  const currRect = currNode.element.getBoundingClientRect();
                  const currCenter = {
                    x: currRect.width > 0 ? currRect.left + currRect.width / 2 : window.innerWidth / 2,
                    y: currRect.height > 0 ? currRect.top + currRect.height / 2 : window.innerHeight,
                  };

                  const outsideNodes = scopedCandidates.filter(n => n.groupId !== currNode.groupId && n.id !== currentId);
                  let bestCandidateAbove: EyeFocusNode | null = null;
                  let minDistance = Infinity;

                  outsideNodes.forEach(node => {
                    const rect = node.element.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return;

                    const center = {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    };

                    const dy = center.y - currCenter.y;
                    const dx = center.x - currCenter.x;

                    if (dy < -5) {
                      const dist = Math.hypot(dx, dy * 0.8);
                      if (dist < minDistance) {
                        minDistance = dist;
                        bestCandidateAbove = node;
                      }
                    }
                  });

                  if (bestCandidateAbove) {
                    if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
                      console.log(`[KEYBOARD][NAV] TOP ROW UP -> Exit keyboard to: ${(bestCandidateAbove as EyeFocusNode).id}`);
                    }
                    activeFocusIdRef.current = (bestCandidateAbove as EyeFocusNode).id;
                    return (bestCandidateAbove as EyeFocusNode).id;
                  }

                  if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
                    console.log(`[KEYBOARD][NAV] TOP ROW UP -> No candidate above, staying on: ${currentId}`);
                  }
                  activeFocusIdRef.current = currentId;
                  return currentId;
                }
              } else { // DOWN
                if (currRowIdx < rows.length - 1) {
                  targetRowIdx = currRowIdx + 1;
                } else {
                  targetRowIdx = 0;
                  isWrap = true;
                }
              }

              const targetRowNumber = rows[targetRowIdx];
              const targetRowNodes = sameGroupNodes.filter(n => n.row === targetRowNumber);

              let currCenterX = 0;
              let hasDomGeometry = false;
              const currRect = currNode.element.getBoundingClientRect();
              if (currRect.width > 0) {
                currCenterX = currRect.left + currRect.width / 2;
                hasDomGeometry = true;
              }

              let bestCandidate: EyeFocusNode = targetRowNodes[0];

              if (hasDomGeometry) {
                let minDistX = Infinity;
                for (const candidate of targetRowNodes) {
                  const candRect = candidate.element.getBoundingClientRect();
                  const candCenterX = candRect.left + candRect.width / 2;
                  const distX = Math.abs(candCenterX - currCenterX);
                  if (distX < minDistX) {
                    minDistX = distX;
                    bestCandidate = candidate;
                  }
                }
              } else {
                const currRatio = (currNode.col! + 0.5) / Math.max(1, currRowNodes.length);
                let minRatioDiff = Infinity;
                for (const candidate of targetRowNodes) {
                  const candRatio = (candidate.col! + 0.5) / Math.max(1, targetRowNodes.length);
                  const diff = Math.abs(candRatio - currRatio);
                  if (diff < minRatioDiff) {
                    minRatioDiff = diff;
                    bestCandidate = candidate;
                  }
                }
              }

              if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
                console.log(`[KEYBOARD][NAV] fromKey: ${currentId}, dir: ${direction}, toKey: ${bestCandidate.id}, wrap: ${isWrap}`);
              }
              activeFocusIdRef.current = bestCandidate.id;
              return bestCandidate.id;
            }
          }
        }
      }

      // 2D Spatial bounding box nearest neighbor search on scoped candidates
      const currRect = currNode.element.getBoundingClientRect();
      const currCenter = {
        x: currRect.left + currRect.width / 2,
        y: currRect.top + currRect.height / 2,
      };

      let bestCandidate: EyeFocusNode | null = null;
      let minDistance = Infinity;

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

        let isCorrectDirection = false;
        switch (direction) {
          case 'NEXT': // Move right
            isCorrectDirection = dx > 20 && Math.abs(dy) <= Math.abs(dx) * 1.5;
            break;
          case 'BACK': // Move left
            isCorrectDirection = dx < -20 && Math.abs(dy) <= Math.abs(dx) * 1.5;
            break;
          case 'DOWN': // Move down
            isCorrectDirection = dy > 20 && Math.abs(dx) <= Math.abs(dy) * 1.5;
            break;
          case 'UP': // Move up
            isCorrectDirection = dy < -20 && Math.abs(dx) <= Math.abs(dy) * 1.5;
            break;
        }

        if (isCorrectDirection) {
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) {
            minDistance = dist;
            bestCandidate = node;
          }
        }
      });

      if (bestCandidate) {
        activeFocusIdRef.current = (bestCandidate as EyeFocusNode).id;
        return (bestCandidate as EyeFocusNode).id;
      }

      // Linear cyclic fallback if no spatial node found in directional cone
      // strictly contained within scopedCandidates
      const sorted = sortNodesByVisualOrder(scopedCandidates);
      const currentIndex = sorted.findIndex(n => n.id === currentId);
      if (currentIndex !== -1) {
        if (direction === 'NEXT' || direction === 'DOWN') {
          const nextIndex = (currentIndex + 1) % sorted.length;
          activeFocusIdRef.current = sorted[nextIndex].id;
          return sorted[nextIndex].id;
        } else if (direction === 'BACK' || direction === 'UP') {
          const prevIndex = (currentIndex - 1 + sorted.length) % sorted.length;
          activeFocusIdRef.current = sorted[prevIndex].id;
          return sorted[prevIndex].id;
        }
      }

      activeFocusIdRef.current = currentId;
      return currentId;
    });
  }, []);

  const triggerSelect = useCallback(() => {
    const currentScope = scopeStackRef.current.length > 0
      ? scopeStackRef.current[scopeStackRef.current.length - 1]
      : null;

    const currentFocus = activeFocusIdRef.current;
    if (currentFocus && nodesRef.current.has(currentFocus)) {
      const node = nodesRef.current.get(currentFocus)!;
      const nodeMatchesScope = currentScope ? node.scopeId === currentScope : !node.scopeId;
      if (nodeMatchesScope) {
        if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
          console.log(`[KEYBOARD][SELECT] selectedKey: ${currentFocus}, scope: ${currentScope || 'global'}`);
        }
        if (node.onSelect) {
          node.onSelect();
        } else {
          node.element.click();
        }
      }
    }
  }, []);

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
    if (!settings.eyeControlEnabled) return;

    const unbind = registerGestureCallback(action => {
      if (action === 'SELECT') {
        triggerSelect();
      } else {
        navigate(action);
      }
    });

    return unbind;
  }, [registerGestureCallback, navigate, triggerSelect, settings.eyeControlEnabled]);

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
