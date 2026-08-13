import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { EyeAction, EyeFocusNode } from './types';
import { useEyeTrackingSettings } from './useEyeTracking';

interface EyeNavigationContextType {
  activeFocusId: string | null;
  registerFocusNode: (node: EyeFocusNode) => void;
  unregisterFocusNode: (id: string) => void;
  setFocusId: (id: string) => void;
  navigate: (direction: EyeAction) => void;
  triggerSelect: () => void;
}

const EyeNavigationContext = createContext<EyeNavigationContextType | undefined>(undefined);

export function EyeNavigationProvider({ children }: { children: ReactNode }) {
  const { registerGestureCallback, settings } = useEyeTrackingSettings();
  const nodesRef = useRef<Map<string, EyeFocusNode>>(new Map());
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);

  const registerFocusNode = useCallback((node: EyeFocusNode) => {
    const isExisting = nodesRef.current.has(node.id);
    nodesRef.current.set(node.id, node);
    
    // If node was already registered (just updating properties), do not reset focus
    if (isExisting) return;

    setActiveFocusId(prev => {
      if (!prev || !nodesRef.current.has(prev)) {
        return node.id;
      }
      return prev;
    });
  }, []);

  const unregisterFocusNode = useCallback((id: string) => {
    const nodeToRemove = nodesRef.current.get(id);
    nodesRef.current.delete(id);
    
    setActiveFocusId(prev => {
      if (prev === id) {
        const remainingNodes: EyeFocusNode[] = Array.from(nodesRef.current.values());
        if (remainingNodes.length === 0) return null;

        // If the unregistered node belonged to a specific group (e.g. virtual-keyboard),
        // try to keep focus inside that same group!
        if (nodeToRemove?.groupId) {
          const sameGroupNodes = remainingNodes.filter(n => n.groupId === nodeToRemove.groupId);
          if (sameGroupNodes.length > 0) {
            return sameGroupNodes[0].id;
          }
        }

        return remainingNodes[0].id;
      }
      return prev;
    });
  }, []);

  const setFocusId = useCallback((id: string) => {
    if (nodesRef.current.has(id)) {
      setActiveFocusId(id);
    }
  }, []);

  const navigate = useCallback((direction: EyeAction) => {
    if (direction === 'NONE' || direction === 'SELECT') return;

    const allNodes: EyeFocusNode[] = Array.from(nodesRef.current.values());
    if (allNodes.length === 0) return;

    setActiveFocusId(currentId => {
      if (!currentId || !nodesRef.current.has(currentId)) {
        return allNodes[0].id;
      }

      const currNode = nodesRef.current.get(currentId)!;

      // Group-based cyclic & nearest-X grid navigation (especially for virtual-keyboard)
      if (currNode.groupId && currNode.row !== undefined && currNode.col !== undefined) {
        const sameGroupNodes = allNodes.filter(
          n => n.groupId === currNode.groupId && n.row !== undefined && n.col !== undefined
        );

        if (sameGroupNodes.length > 0) {
          // Unique sorted rows
          const rows = Array.from(new Set(sameGroupNodes.map(n => n.row!))).sort((a, b) => a - b);
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
                  // WRAP RIGHT EDGE TO LEFT-MOST KEY OF SAME ROW
                  targetNode = currRowNodes[0];
                  isWrap = true;
                }
              } else { // BACK (Left)
                if (currColIdx > 0) {
                  targetNode = currRowNodes[currColIdx - 1];
                } else {
                  // WRAP LEFT EDGE TO RIGHT-MOST KEY OF SAME ROW
                  targetNode = currRowNodes[currRowNodes.length - 1];
                  isWrap = true;
                }
              }

              if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
                console.log(`[KEYBOARD][NAV] fromKey: ${currentId}, dir: ${direction}, toKey: ${targetNode.id}, wrap: ${isWrap}`);
              }
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
                  // TOP KEYBOARD ROW + UP: DO NOT wrap to bottom row!
                  // Exit keyboard upward to generic EyeFocusable above, or stay on current key if no candidate.
                  const currRect = currNode.element.getBoundingClientRect();
                  const currCenter = {
                    x: currRect.width > 0 ? currRect.left + currRect.width / 2 : window.innerWidth / 2,
                    y: currRect.height > 0 ? currRect.top + currRect.height / 2 : window.innerHeight,
                  };

                  const outsideNodes = allNodes.filter(n => n.groupId !== currNode.groupId && n.id !== currentId);
                  let bestCandidateAbove: EyeFocusNode | null = null;
                  let minDistance = Infinity;

                  outsideNodes.forEach(node => {
                    const rect = node.element.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return; // ignore invisible elements

                    const center = {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    };

                    const dy = center.y - currCenter.y;
                    const dx = center.x - currCenter.x;

                    // Candidate must be above current key
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
                    return (bestCandidateAbove as EyeFocusNode).id;
                  }

                  // If no candidate above, stay on current key (never wrap to bottom row!)
                  if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
                    console.log(`[KEYBOARD][NAV] TOP ROW UP -> No candidate above, staying on: ${currentId}`);
                  }
                  return currentId;
                }
              } else { // DOWN
                if (currRowIdx < rows.length - 1) {
                  targetRowIdx = currRowIdx + 1;
                } else {
                  // WRAP BOTTOM ROW TO TOP ROW
                  targetRowIdx = 0;
                  isWrap = true;
                }
              }

              const targetRowNumber = rows[targetRowIdx];
              const targetRowNodes = sameGroupNodes.filter(n => n.row === targetRowNumber);

              // Calculate current key horizontal center (centerX)
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
                // Ratio-based fallback when rects are 0 (e.g. initial frame or offscreen)
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
              return bestCandidate.id;
            }
          }
        }
      }

      // 2D Spatial bounding box nearest neighbor search
      const currRect = currNode.element.getBoundingClientRect();
      const currCenter = {
        x: currRect.left + currRect.width / 2,
        y: currRect.top + currRect.height / 2,
      };

      let bestCandidate: EyeFocusNode | null = null;
      let minDistance = Infinity;

      allNodes.forEach(node => {
        if (node.id === currentId) return;
        const rect = node.element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return; // ignore invisible nodes

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
        return (bestCandidate as EyeFocusNode).id;
      }

      // Linear cyclic fallback if no spatial node found in directional cone
      const currentIndex = allNodes.findIndex(n => n.id === currentId);
      if (direction === 'NEXT' || direction === 'DOWN') {
        const nextIndex = (currentIndex + 1) % allNodes.length;
        return allNodes[nextIndex].id;
      } else if (direction === 'BACK' || direction === 'UP') {
        const prevIndex = (currentIndex - 1 + allNodes.length) % allNodes.length;
        return allNodes[prevIndex].id;
      }

      return currentId;
    });
  }, []);

  const triggerSelect = useCallback(() => {
    if (activeFocusId && nodesRef.current.has(activeFocusId)) {
      const node = nodesRef.current.get(activeFocusId)!;
      if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
        console.log(`[KEYBOARD][SELECT] selectedKey: ${activeFocusId}, focusBefore: ${activeFocusId}, focusAfter: ${activeFocusId}`);
      }
      if (node.onSelect) {
        node.onSelect();
      } else {
        node.element.click();
      }
    }
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
    registerFocusNode,
    unregisterFocusNode,
    setFocusId,
    navigate,
    triggerSelect,
  }), [
    activeFocusId,
    registerFocusNode,
    unregisterFocusNode,
    setFocusId,
    navigate,
    triggerSelect,
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
