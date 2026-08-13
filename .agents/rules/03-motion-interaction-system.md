# LUCKY DREAM – EYEAI: Motion & Interaction System

> **Scope**: Motion Architecture, Animation Stack, Signature Interaction Language, Motion Tokens & Eye Mode Motion Reduction
> **Technology**: `motion` (Framer Motion v12) + CSS Keyframes

---

## 1. Motion Tech Stack & Principles

Animations in LUCKY DREAM are designed to feel **Organic, Reassuring, Purposeful, and Calm**. Motion must NEVER be used as empty visual flair that causes dizziness or misguides eye tracking.

* **Primary Animation Library**: `motion` (Framer Motion v12 package).
* **CSS Animations**: Used exclusively for continuous pulse, eye focus ring shimmer, loading skeletons, and subtle keyframe loops.
* **Prohibited Dependencies**: Do NOT install GSAP, Anime.js, Lottie, or heavy external motion libraries when `motion` and CSS keyframes satisfy the requirements.

---

## 2. LUCKY DREAM Signature Interaction Language

The application defines 5 signature motion patterns that form the core interaction identity:

```text
┌────────────────────────────────────────────────────────────────────────┐
│               LUCKY DREAM SIGNATURE MOTION PATTERNS                    │
├───────────────────┬───────────────────────────────┬────────────────────┤
│ Interaction Name  │ Visual Behavior               │ Timing / Specs     │
├───────────────────┼───────────────────────────────┼────────────────────┤
│ 1. Eye Glide      │ Smooth focus flight between   │ 160ms - 220ms      │
│                   │ cards with direction awareness│ easeOut / spring   │
│ 2. Soft Confirm   │ Scale 0.96 + brief flash      │ 150ms - 200ms      │
│                   │ on SELECT / Eye Blink         │ easeInOut          │
│ 3. Warm Pulse     │ Rhythmic soft expansion of    │ 2000ms loop        │
│                   │ status, SOS ring, GPS active  │ cubic-bezier       │
│ 4. Living Cards   │ Subtle micro float in Normal  │ 3000ms loop        │
│                   │ mode (Disabled in Eye Mode)   │ gentle sine wave   │
│ 5. Companion      │ 3D Avatar state reaction      │ Variable state     │
│    Motion         │ (Idle, Thinking, Happy, etc.) │ animation          │
└───────────────────┴───────────────────────────────┴────────────────────┘
```

---

## 3. Detailed Specifications of Signature Patterns

### Pattern 1: Eye Glide
Used when eye focus moves between interactive elements (UP, DOWN, LEFT, RIGHT).
* **Behavior**: Focus border and soft sky blue glow (`#6AC9F0`) do NOT teleport abruptly. They glide smoothly from the origin element to the destination element.
* **Duration**: `160ms` to `220ms`.
* **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (Smooth arrival curve).

```tsx
// Example Framer Motion / Motion Layout Transition
<motion.div
  layoutId="eye-focus-ring"
  transition={{
    type: "spring",
    stiffness: 400,
    damping: 32,
    mass: 0.8,
  }}
  className="absolute inset-0 rounded-[26px] border-4 border-[#6AC9F0] shadow-[0_0_24px_rgba(106,201,240,0.45)] pointer-events-none z-10"
/>
```

### Pattern 2: Soft Confirm
Used when an element is activated via Eye Blink SELECT or Touch Tap.
* **Behavior**: Target button scales down smoothly from `1.0` to `0.96`, flashes a subtle white/sky-blue inner highlight (`opacity 0.25 -> 0`), and springs back to `1.0`.
* **User Psychology**: Delivers immediate tactile visual confirmation that the system recognized the blink action.

```typescript
export const softConfirmVariants = {
  initial: { scale: 1, filter: 'brightness(1)' },
  select: {
    scale: 0.96,
    filter: 'brightness(1.15)',
    transition: { duration: 0.12, ease: 'easeOut' }
  },
  release: {
    scale: 1,
    filter: 'brightness(1)',
    transition: { type: 'spring', stiffness: 500, damping: 25 }
  }
};
```

### Pattern 3: Warm Pulse
Used for live background status: GPS Signal Acquired, SOS 8-second countdown ring, active Eye Mode indicator badge.
* **Behavior**: Expands outer translucent ring from `scale 1.0` to `scale 1.15` while fading opacity from `0.4` to `0`.
* **Feeling**: Therapeutic, reassuring heartbeat pulse.

```css
@keyframes warmPulse {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.2;
  }
  100% {
    transform: scale(1.15);
    opacity: 0;
  }
}
```

---

## 4. Eye Mode Motion Reduction (`eyeControlEnabled === true`)

> ⚠️ **CRITICAL ACCESSIBILITY RULE**: When Eye Navigation Mode is turned ON (`eyeControlEnabled === true`), visual noise can cause severe eye tracking jitter or user disorientation.

### Automatic Suppressions in Eye Mode
When Eye Mode is active, the app MUST automatically:
* ❌ **DISABLE** Living Cards floating micro-animations.
* ❌ **DISABLE** background floating visual blobs, particle effects, or tilt cards.
* ❌ **DISABLE** non-essential continuous loops.
* ❌ **REDUCE** 3D Avatar body movement to minimal Low-Motion Idle (breathing/blinking only).

### Preserved Functional Feedback in Eye Mode
The following MUST remain active even in Eye Mode:
* ✅ **Eye Glide**: Smooth focus indicator movement.
* ✅ **Eye Focus Ring**: Solid, clear high-contrast focus state.
* ✅ **Soft Confirm**: Instant feedback upon SELECT.
* ✅ **SOS Progress Countdown**: Active 8-second visual ring.
* ✅ **Essential Skeleton / Loading States**.

---

## 5. Page Transitions & Home Entrance Sequences

### Page Transitions
* **Push Navigation**: Old page slides slightly left (`x: 0 -> -12px, opacity 1 -> 0`). New page enters from right (`x: 12px -> 0, opacity 0 -> 1`).
* **Duration**: `180ms` – `300ms`.

### Home Screen Entrance Sequence
When the Home screen loads:
1. **Header (`LUCKY DREAM`)**: `opacity 0 -> 1`, `y: -6px -> 0px` (Duration: `200ms`).
2. **Feature Cards Grid**: Staggered fade-up (`y: 12px -> 0px`) with `40ms` – `60ms` delay between cards.
3. **SOS Emergency Bar**: Fades in immediately after feature cards.
4. **AI 3D Avatar**: Enters with a gentle upward scale (`scale: 0.9 -> 1.0`).

---

## 6. Motion Tokens Reference

```typescript
export const MOTION_TOKENS = {
  duration: {
    instant: 0.1,  // 100ms
    fast: 0.18,    // 180ms - Eye Glide
    normal: 0.25,  // 250ms - Modals & Buttons
    slow: 0.4,     // 400ms - Page Transitions
  },
  easing: {
    eyeGlide: [0.16, 1, 0.3, 1],
    softConfirm: [0.34, 1.56, 0.64, 1],
    pageEnter: [0.22, 1, 0.36, 1],
  }
} as const;
```
