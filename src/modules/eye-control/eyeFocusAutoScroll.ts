import { EyeFocusNode } from './types';

export interface EnsureVisibleOptions {
  smooth?: boolean;
  force?: boolean;
  topOffset?: number;
  bottomOffset?: number;
}

/**
 * Calculates the top occupied height in the viewport (such as fixed/sticky headers,
 * top Camera HUD bar, etc.).
 */
export function getTopOccupiedHeight(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;

  let topOccupied = 0;

  // 1. Check <header> element
  const headerEl = document.querySelector('header');
  if (headerEl) {
    const rect = headerEl.getBoundingClientRect();
    if (rect.top <= 12 && rect.bottom > 0) {
      topOccupied = Math.max(topOccupied, rect.bottom);
    }
  }

  // 2. Check sticky/fixed header wrappers (e.g., .sticky.top-0)
  const stickyTopElements = document.querySelectorAll('.sticky.top-0, [class*="sticky top-0"], [class*="fixed top-0"]');
  stickyTopElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top <= 12 && rect.bottom > 0) {
      topOccupied = Math.max(topOccupied, rect.bottom);
    }
  });

  // 3. Check Camera HUD horizontal bar (#keyboard-eye-hud-bar)
  const hudBar = document.getElementById('keyboard-eye-hud-bar');
  if (hudBar) {
    const rect = hudBar.getBoundingClientRect();
    if (rect.top <= topOccupied + 12 && rect.bottom > 0) {
      topOccupied = Math.max(topOccupied, rect.bottom);
    }
  }

  return topOccupied;
}

/**
 * Calculates the bottom occupied height in the viewport (such as smartphone virtual keyboard,
 * fixed bottom composer bars, etc.).
 */
export function getBottomOccupiedHeight(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;

  let bottomOccupied = 0;
  const viewportHeight = window.innerHeight;

  // 1. Check Virtual Keyboard (#smartphone-virtual-keyboard)
  const keyboardEl = document.getElementById('smartphone-virtual-keyboard');
  if (keyboardEl) {
    const rect = keyboardEl.getBoundingClientRect();
    if (rect.height > 0 && rect.top < viewportHeight) {
      bottomOccupied = Math.max(bottomOccupied, viewportHeight - rect.top);
    }
  }

  // 2. Fallback check for CSS variable --virtual-keyboard-height
  const cssKbHeight = parseFloat(
    document.documentElement.style.getPropertyValue('--virtual-keyboard-height') || '0'
  );
  if (cssKbHeight > 0) {
    bottomOccupied = Math.max(bottomOccupied, cssKbHeight);
  }

  // 3. Check bottom fixed bars (like composer bar when keyboard is closed)
  const fixedBottomBars = document.querySelectorAll('[class*="fixed bottom-0"]');
  fixedBottomBars.forEach(el => {
    if (el.id !== 'smartphone-virtual-keyboard') {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && rect.top < viewportHeight && rect.top > viewportHeight * 0.5) {
        bottomOccupied = Math.max(bottomOccupied, viewportHeight - rect.top);
      }
    }
  });

  return bottomOccupied;
}

/**
 * Finds the nearest truly scrollable ancestor container (overflow auto/scroll with scrollable content).
 * Returns null if the element scrolls within the main window/document.
 */
export function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;

  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;

    const isScrollableY =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight + 4;

    const isScrollableX =
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      current.scrollWidth > current.clientWidth + 4;

    if (isScrollableY || isScrollableX) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

/**
 * Core function to ensure that the currently focused EyeFocusable element
 * is comfortably and safely visible in the viewport.
 * 
 * Rules:
 * - If element is inside VirtualKeyboard -> NO window scroll.
 * - If element is already safely visible -> NO scroll (no unnecessary jitter).
 * - If element is obscured or near viewport edges -> smooth scroll to bring into safe zone.
 * - Respects sticky headers, Camera HUD, Virtual Keyboard height, and nested scroll containers.
 */
export function ensureEyeFocusVisible(
  focusId: string | null,
  nodesMap?: Map<string, EyeFocusNode>,
  options?: EnsureVisibleOptions
): void {
  if (!focusId || typeof window === 'undefined') return;

  // 1. Resolve DOM Element
  let element: HTMLElement | null = null;
  let node: EyeFocusNode | undefined;

  if (nodesMap) {
    node = nodesMap.get(focusId);
    if (node?.element && node.element.isConnected) {
      element = node.element;
    }
  }

  if (!element) {
    element = document.getElementById(`eye-focusable-${focusId}`);
  }

  if (!element || !element.isConnected) return;

  // Check if element is currently visible in DOM layout
  const elemRect = element.getBoundingClientRect();
  if (elemRect.width === 0 && elemRect.height === 0) return;

  // 2. VIRTUAL KEYBOARD RULE:
  // Keys within the virtual keyboard are fixed to the bottom of the screen and
  // are already in their dedicated visible region. Never scroll page for keyboard key focus!
  const isVirtualKeyboardKey =
    node?.groupId === 'virtual-keyboard' ||
    Boolean(element.closest('#smartphone-virtual-keyboard'));

  if (isVirtualKeyboardKey) {
    return;
  }

  // 3. Motion Preference
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const behavior: ScrollBehavior =
    options?.smooth === false || prefersReducedMotion ? 'auto' : 'smooth';

  // 4. Safe Viewport Geometry Calculation
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const topOccupied = getTopOccupiedHeight();
  const bottomOccupied = getBottomOccupiedHeight();

  // Margins around element to guarantee full focus ring, glowing badges, and breathing room
  const FOCUS_RING_BUFFER = 18;
  const SAFE_MARGIN_TOP = Math.max(topOccupied + 20, 24);
  const SAFE_MARGIN_BOTTOM = Math.max(viewportHeight - bottomOccupied - 20, SAFE_MARGIN_TOP + 60);
  const SAFE_MARGIN_LEFT = 16;
  const SAFE_MARGIN_RIGHT = viewportWidth - 16;

  // Effective element bounds with focus ring buffer
  const effectiveTop = elemRect.top - FOCUS_RING_BUFFER;
  const effectiveBottom = elemRect.bottom + FOCUS_RING_BUFFER;
  const effectiveLeft = elemRect.left - FOCUS_RING_BUFFER;
  const effectiveRight = elemRect.right + FOCUS_RING_BUFFER;

  // 5. Check for Nested Scrollable Ancestor
  const scrollContainer = findScrollContainer(element);

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const relTop = elemRect.top - containerRect.top;
    const relBottom = elemRect.bottom - containerRect.top;
    const relLeft = elemRect.left - containerRect.left;
    const relRight = elemRect.right - containerRect.left;

    const padTop = 14;
    const padBottom = scrollContainer.clientHeight - 14;
    const padLeft = 14;
    const padRight = scrollContainer.clientWidth - 14;

    let containerDeltaY = 0;
    let containerDeltaX = 0;

    // Nested Vertical Scroll Calculation
    if (relTop - FOCUS_RING_BUFFER < padTop) {
      // Element is above visible area inside container
      containerDeltaY = (relTop - FOCUS_RING_BUFFER) - padTop;
    } else if (relBottom + FOCUS_RING_BUFFER > padBottom) {
      // Element is below visible area inside container
      if (elemRect.height > padBottom - padTop) {
        // Large element: align top
        containerDeltaY = (relTop - FOCUS_RING_BUFFER) - padTop;
      } else {
        containerDeltaY = (relBottom + FOCUS_RING_BUFFER) - padBottom;
      }
    }

    // Nested Horizontal Scroll Calculation
    if (relLeft - FOCUS_RING_BUFFER < padLeft) {
      containerDeltaX = (relLeft - FOCUS_RING_BUFFER) - padLeft;
    } else if (relRight + FOCUS_RING_BUFFER > padRight) {
      containerDeltaX = (relRight + FOCUS_RING_BUFFER) - padRight;
    }

    if (containerDeltaY !== 0 || containerDeltaX !== 0) {
      scrollContainer.scrollBy({
        top: containerDeltaY,
        left: containerDeltaX,
        behavior,
      });
    }
  }

  // 6. Main Window Scroll Calculation
  let windowDeltaY = 0;
  let windowDeltaX = 0;

  // Check Vertical
  if (effectiveTop < SAFE_MARGIN_TOP) {
    // Obscured by top header / HUD / above top boundary -> Scroll UP
    windowDeltaY = effectiveTop - SAFE_MARGIN_TOP;
  } else if (effectiveBottom > SAFE_MARGIN_BOTTOM) {
    // Obscured by keyboard / bottom / below safe boundary -> Scroll DOWN
    if (elemRect.height > (SAFE_MARGIN_BOTTOM - SAFE_MARGIN_TOP)) {
      // Very tall element: align top with safe top margin
      windowDeltaY = effectiveTop - (SAFE_MARGIN_TOP + 4);
    } else {
      windowDeltaY = effectiveBottom - SAFE_MARGIN_BOTTOM;
    }
  }

  // Check Horizontal
  if (effectiveLeft < SAFE_MARGIN_LEFT) {
    windowDeltaX = effectiveLeft - SAFE_MARGIN_LEFT;
  } else if (effectiveRight > SAFE_MARGIN_RIGHT) {
    windowDeltaX = effectiveRight - SAFE_MARGIN_RIGHT;
  }

  // ONLY scroll if there is an actual delta needed (avoids jitter/unnecessary scrolls)
  if (Math.abs(windowDeltaY) > 2 || Math.abs(windowDeltaX) > 2) {
    window.scrollBy({
      top: windowDeltaY,
      left: windowDeltaX,
      behavior,
    });
  }
}
