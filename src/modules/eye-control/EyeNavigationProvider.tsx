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
    nodesRef.current.set(node.id, node);
    // If no active focus, default to first registered node
    setActiveFocusId(prev => {
      if (!prev || !nodesRef.current.has(prev)) {
        return node.id;
      }
      return prev;
    });
  }, []);

  const unregisterFocusNode = useCallback((id: string) => {
    nodesRef.current.delete(id);
    setActiveFocusId(prev => {
      if (prev === id) {
        const remaining = Array.from(nodesRef.current.keys());
        return remaining.length > 0 ? remaining[0] : null;
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

      // Group-based / grid-based directional navigation
      if (currNode.row !== undefined && currNode.col !== undefined) {
        const sameGroupNodes = allNodes.filter(n => n.groupId === currNode.groupId && n.row !== undefined && n.col !== undefined);
        
        let targetNode: EyeFocusNode | undefined;
        if (direction === 'NEXT') {
          // Right: next col on same row
          targetNode = sameGroupNodes.find(n => n.row === currNode.row && n.col === currNode.col! + 1);
        } else if (direction === 'BACK') {
          // Left: prev col on same row
          targetNode = sameGroupNodes.find(n => n.row === currNode.row && n.col === currNode.col! - 1);
        } else if (direction === 'DOWN') {
          // Down: next row on same or closest col
          targetNode = sameGroupNodes.find(n => n.row === currNode.row! + 1 && n.col === currNode.col);
          if (!targetNode) {
            targetNode = sameGroupNodes.find(n => n.row === currNode.row! + 1);
          }
        } else if (direction === 'UP') {
          // Up: prev row on same or closest col
          targetNode = sameGroupNodes.find(n => n.row === currNode.row! - 1 && n.col === currNode.col);
          if (!targetNode) {
            targetNode = sameGroupNodes.find(n => n.row === currNode.row! - 1);
          }
        }

        if (targetNode) return targetNode.id;
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
