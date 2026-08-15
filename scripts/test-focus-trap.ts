import React from 'react';

// Unit & Integration Test for Eye Focus Trap Logic
import { EyeFocusNode, EyeAction } from '../src/modules/eye-control/types';

console.log('====================================================');
console.log('RUNNING EYE FOCUS TRAP VERIFICATION SUITE');
console.log('====================================================');

// Mock DOM elements
function createMockElement(id: string, rect: { top: number; left: number; width: number; height: number }): HTMLElement {
  return {
    id,
    getBoundingClientRect: () => ({
      top: rect.top,
      bottom: rect.top + rect.height,
      left: rect.left,
      right: rect.left + rect.width,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => {},
    }),
    compareDocumentPosition: () => 0,
    click: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
  } as unknown as HTMLElement;
}

// Visual order sorter
function sortNodesByVisualOrder(nodes: EyeFocusNode[]): EyeFocusNode[] {
  return [...nodes].sort((a, b) => {
    if (a.row !== undefined && b.row !== undefined) {
      if (a.row !== b.row) return a.row - b.row;
      if (a.col !== undefined && b.col !== undefined) return a.col - b.col;
    }
    if (a.element && b.element) {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      if (rectA.height > 0 && rectB.height > 0) {
        if (Math.abs(rectA.top - rectB.top) > 10) {
          return rectA.top - rectB.top;
        }
        return rectA.left - rectB.left;
      }
    }
    return 0;
  });
}

// Focus Engine Simulation
class FocusEngine {
  nodes = new Map<string, EyeFocusNode>();
  activeFocusId: string | null = null;
  scopeStack: string[] = [];
  previousFocusByScope = new Map<string, string | null>();

  pushFocusScope(scopeId: string, initialFocusId?: string) {
    const currentScope = this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : null;
    if (currentScope !== scopeId) {
      this.previousFocusByScope.set(scopeId, this.activeFocusId);
    }
    this.scopeStack = [...this.scopeStack.filter(s => s !== scopeId), scopeId];

    const scopedNodes = Array.from(this.nodes.values()).filter(n => n.scopeId === scopeId);
    if (initialFocusId && this.nodes.has(initialFocusId)) {
      this.activeFocusId = initialFocusId;
      return;
    }
    if (scopedNodes.length > 0) {
      const sorted = sortNodesByVisualOrder(scopedNodes);
      this.activeFocusId = sorted[0].id;
    }
  }

  popFocusScope(scopeId: string) {
    const prevFocusId = this.previousFocusByScope.get(scopeId) || null;
    this.previousFocusByScope.delete(scopeId);
    this.scopeStack = this.scopeStack.filter(s => s !== scopeId);
    const nextScope = this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : null;

    if (prevFocusId && this.nodes.has(prevFocusId)) {
      const targetNode = this.nodes.get(prevFocusId);
      if ((!nextScope && !targetNode?.scopeId) || (nextScope && targetNode?.scopeId === nextScope)) {
        this.activeFocusId = prevFocusId;
        return;
      }
    }

    const eligibleNodes = Array.from(this.nodes.values()).filter(n =>
      nextScope ? n.scopeId === nextScope : !n.scopeId
    );
    if (eligibleNodes.length === 0) {
      this.activeFocusId = null;
      return;
    }
    const sorted = sortNodesByVisualOrder(eligibleNodes);
    this.activeFocusId = sorted[0].id;
  }

  register(node: EyeFocusNode) {
    this.nodes.set(node.id, node);
    const currentScope = this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : null;
    const nodeMatchesScope = currentScope ? node.scopeId === currentScope : !node.scopeId;

    if (nodeMatchesScope) {
      if (!this.activeFocusId || !this.nodes.has(this.activeFocusId)) {
        this.activeFocusId = node.id;
      } else {
        const prevNode = this.nodes.get(this.activeFocusId);
        const prevMatches = currentScope ? prevNode?.scopeId === currentScope : !prevNode?.scopeId;
        if (!prevMatches) {
          this.activeFocusId = node.id;
        }
      }
    }
  }

  unregister(id: string) {
    this.nodes.delete(id);
    if (this.activeFocusId === id) {
      const currentScope = this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : null;
      const remaining = Array.from(this.nodes.values()).filter(n =>
        currentScope ? n.scopeId === currentScope : !n.scopeId
      );
      if (remaining.length > 0) {
        const sorted = sortNodesByVisualOrder(remaining);
        this.activeFocusId = sorted[0].id;
      } else {
        this.activeFocusId = null;
      }
    }
  }

  navigate(direction: EyeAction) {
    if (direction === 'NONE' || direction === 'SELECT') return;
    const currentScope = this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : null;
    const candidates = Array.from(this.nodes.values()).filter(n =>
      currentScope ? n.scopeId === currentScope : !n.scopeId
    );
    if (candidates.length === 0) return;

    if (!this.activeFocusId || !candidates.some(n => n.id === this.activeFocusId)) {
      const sorted = sortNodesByVisualOrder(candidates);
      this.activeFocusId = sorted[0].id;
      return;
    }

    const currNode = this.nodes.get(this.activeFocusId)!;
    const currRect = currNode.element.getBoundingClientRect();
    const currCenter = { x: currRect.left + currRect.width / 2, y: currRect.top + currRect.height / 2 };

    let bestCandidate: EyeFocusNode | null = null;
    let minDistance = Infinity;

    candidates.forEach(node => {
      if (node.id === this.activeFocusId) return;
      const rect = node.element.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const dx = center.x - currCenter.x;
      const dy = center.y - currCenter.y;

      let isCorrectDirection = false;
      switch (direction) {
        case 'NEXT':
          isCorrectDirection = dx > 20 && Math.abs(dy) <= Math.abs(dx) * 1.5;
          break;
        case 'BACK':
          isCorrectDirection = dx < -20 && Math.abs(dy) <= Math.abs(dx) * 1.5;
          break;
        case 'DOWN':
          isCorrectDirection = dy > 20 && Math.abs(dx) <= Math.abs(dy) * 1.5;
          break;
        case 'UP':
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
      this.activeFocusId = (bestCandidate as EyeFocusNode).id;
      return;
    }

    // Cyclic fallback within candidates
    const sorted = sortNodesByVisualOrder(candidates);
    const currentIndex = sorted.findIndex(n => n.id === this.activeFocusId);
    if (currentIndex !== -1) {
      if (direction === 'NEXT' || direction === 'DOWN') {
        const nextIdx = (currentIndex + 1) % sorted.length;
        this.activeFocusId = sorted[nextIdx].id;
      } else if (direction === 'BACK' || direction === 'UP') {
        const prevIdx = (currentIndex - 1 + sorted.length) % sorted.length;
        this.activeFocusId = sorted[prevIdx].id;
      }
    }
  }
}

// 1. SETUP CONTACTS SCREEN NODES
const engine = new FocusEngine();
engine.register({ id: 'btn-back', element: createMockElement('btn-back', { top: 10, left: 10, width: 40, height: 40 }) });
engine.register({ id: 'btn-add-friend', element: createMockElement('btn-add-friend', { top: 70, left: 20, width: 150, height: 50 }) });
engine.register({ id: 'btn-friend-card-A', element: createMockElement('btn-friend-card-A', { top: 150, left: 20, width: 160, height: 120 }) });
engine.register({ id: 'btn-friend-card-B', element: createMockElement('btn-friend-card-B', { top: 150, left: 190, width: 160, height: 120 }) });
engine.register({ id: 'btn-friend-card-C', element: createMockElement('btn-friend-card-C', { top: 290, left: 20, width: 160, height: 120 }) });

// Set focus to Friend B
engine.activeFocusId = 'btn-friend-card-B';
console.log('Initial Contacts Focus:', engine.activeFocusId, engine.activeFocusId === 'btn-friend-card-B' ? '✓ PASS' : '✗ FAIL');

// TEST CASE 1: OPEN MODAL
engine.pushFocusScope('contact-action-modal');
engine.register({ id: 'btn-friend-start-chat', scopeId: 'contact-action-modal', element: createMockElement('btn-friend-start-chat', { top: 300, left: 50, width: 260, height: 50 }) });
engine.register({ id: 'btn-friend-start-call', scopeId: 'contact-action-modal', element: createMockElement('btn-friend-start-call', { top: 360, left: 50, width: 260, height: 50 }) });
engine.register({ id: 'btn-close-friend-modal', scopeId: 'contact-action-modal', element: createMockElement('btn-close-friend-modal', { top: 420, left: 50, width: 260, height: 50 }) });

console.log('\nTEST CASE 1 — OPEN MODAL:');
console.log('Active Scope:', engine.scopeStack[engine.scopeStack.length - 1]);
console.log('Immediate Modal Focus:', engine.activeFocusId);
console.log('Result:', engine.activeFocusId === 'btn-friend-start-chat' ? '✓ PASS' : '✗ FAIL');

// TEST CASE 2 & 3: MODAL NAVIGATION & BOUNDARY CONTAINMENT
console.log('\nTEST CASE 2 & 3 — MODAL NAVIGATION & BOUNDARIES:');
engine.navigate('DOWN');
console.log('Navigate DOWN ->', engine.activeFocusId, engine.activeFocusId === 'btn-friend-start-call' ? '✓ PASS' : '✗ FAIL');

engine.navigate('DOWN');
console.log('Navigate DOWN ->', engine.activeFocusId, engine.activeFocusId === 'btn-close-friend-modal' ? '✓ PASS' : '✗ FAIL');

// Edge boundary DOWN (must wrap or stay in modal, NEVER touch background)
engine.navigate('DOWN');
console.log('Edge DOWN (Cyclic Wrap) ->', engine.activeFocusId, engine.activeFocusId === 'btn-friend-start-chat' ? '✓ PASS' : '✗ FAIL');

// Edge boundary UP from top
engine.navigate('UP');
console.log('Edge UP (Cyclic Wrap) ->', engine.activeFocusId, engine.activeFocusId === 'btn-close-friend-modal' ? '✓ PASS' : '✗ FAIL');

// Background access test: Verify background nodes cannot be focused
const backgroundNodes = ['btn-back', 'btn-add-friend', 'btn-friend-card-A', 'btn-friend-card-B', 'btn-friend-card-C'];
let backgroundLeaked = false;
for (let i = 0; i < 20; i++) {
  const dirs: EyeAction[] = ['UP', 'DOWN', 'NEXT', 'BACK'];
  engine.navigate(dirs[i % dirs.length]);
  if (backgroundNodes.includes(engine.activeFocusId!)) {
    backgroundLeaked = true;
  }
}
console.log('Background isolation test (20 random navigations):', !backgroundLeaked ? '✓ PASS (No background leakage)' : '✗ FAIL (Focus leaked to background)');

// TEST CASE 4: CLOSE MODAL -> RESTORE ORIGINAL CONTACT FOCUS
console.log('\nTEST CASE 4 — CLOSE & RESTORE FOCUS:');
engine.unregister('btn-friend-start-chat');
engine.unregister('btn-friend-start-call');
engine.unregister('btn-close-friend-modal');
engine.popFocusScope('contact-action-modal');

console.log('Active Scope after close:', engine.scopeStack.length === 0 ? 'null (Global Page)' : engine.scopeStack);
console.log('Restored Focus:', engine.activeFocusId);
console.log('Restored correctly to Friend B:', engine.activeFocusId === 'btn-friend-card-B' ? '✓ PASS' : '✗ FAIL');

// TEST REPEATED OPEN/CLOSE FOR DIFFERENT CONTACTS
console.log('\nTEST CASE — REPEATED OPEN/CLOSE:');
const testFriends = ['btn-friend-card-A', 'btn-friend-card-B', 'btn-friend-card-C'];
let allRepeatsPassed = true;

for (const friendId of testFriends) {
  engine.activeFocusId = friendId;
  engine.pushFocusScope('contact-action-modal');
  engine.register({ id: 'btn-friend-start-chat', scopeId: 'contact-action-modal', element: createMockElement('btn-friend-start-chat', { top: 300, left: 50, width: 260, height: 50 }) });
  engine.register({ id: 'btn-friend-start-call', scopeId: 'contact-action-modal', element: createMockElement('btn-friend-start-call', { top: 360, left: 50, width: 260, height: 50 }) });
  engine.register({ id: 'btn-close-friend-modal', scopeId: 'contact-action-modal', element: createMockElement('btn-close-friend-modal', { top: 420, left: 50, width: 260, height: 50 }) });

  if (engine.activeFocusId !== 'btn-friend-start-chat') allRepeatsPassed = false;

  engine.unregister('btn-friend-start-chat');
  engine.unregister('btn-friend-start-call');
  engine.unregister('btn-close-friend-modal');
  engine.popFocusScope('contact-action-modal');

  if (engine.activeFocusId !== friendId) allRepeatsPassed = false;
}

console.log('Repeated open/close across Friend A, B, C:', allRepeatsPassed ? '✓ PASS' : '✗ FAIL');

console.log('\n====================================================');
console.log('ALL VERIFICATION SUITE TESTS COMPLETE');
console.log('====================================================');
