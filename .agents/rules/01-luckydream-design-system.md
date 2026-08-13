# LUCKY DREAM – EYEAI: Design System & Visual Identity Rules

> **Scope**: Central Design Tokens, Brand Aesthetics, Color System, Custom Geometry & Visual Identity
> **Applies to**: All UI components, pages, layout styles, and visual assets in LUCKY DREAM – EYEAI

---

## 1. Product Brand Context

**LUCKY DREAM – EYEAI** is a mobile-first web application designed specifically for patients (e.g., ALS, stroke, paralyzed patients) and elderly individuals with severe motor or speech impairments. The core interface must balance **Healthcare Accessibility** with a **Warm, Premium, and Modern Human-Centered Aesthetic**.

### The 5 Core Product Features
The primary navigation of LUCKY DREAM revolves around 5 main pillars:
1. **Entertainment (Giải trí)**: Books, Radio, Music with accessible search & media playback.
2. **Location (Vị trí)**: Real-time map & location sharing for caregiver reassurance.
3. **Contacts (Liên lạc)**: Large-target friend grid, emergency quick-calling, and friend management.
4. **AI Assistant (AI)**: Compassionate, concise AI chat companion powered by Gemini.
5. **SOS Emergency (SOS)**: Urgent help trigger with 8-second eye confirmation ring and direct contacts call.

---

## 2. Brand Color Tokens & Palette Rules

All UI components MUST exclusively derive their color tokens from the official 4-color palette below. Arbitrary hex colors outside this design system are STRICTLY FORBIDDEN.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        OFFICIAL BRAND PALETTE                          │
├──────────────┬──────────┬─────────────────────────┬────────────────────┤
│ Color Name   │ Hex Code │ Role & Usage Context    │ Tailwind CSS Var   │
├──────────────┼──────────┼─────────────────────────┼────────────────────┤
│ Sky Blue     │ #6AC9F0  │ Primary / Focus / Active│ bg-[#6AC9F0] / ... │
│ Coral        │ #FF6F61  │ SOS / Urgent / CTA      │ bg-[#FF6F61] / ... │
│ Warm Cream   │ #FFF2D6  │ Soft Surface / Canvas   │ bg-[#FFF2D6] / ... │
│ Navy         │ #14213D  │ Primary Text / Contrast │ text-[#14213D] /...│
└──────────────┴──────────┴─────────────────────────┴────────────────────┘
```

### Derived Semantic Tokens
Tints and shades MUST be calculated based on alpha-channel transparency or HSL variations of the 4 core colors:

```typescript
export const BRAND_TOKENS = {
  colors: {
    primary: '#6AC9F0',       // Sky Blue - Focus Ring, Active States, Highlight
    primarySoft: 'rgba(106, 201, 240, 0.15)', // Subtle backdrop glow
    primaryFocusGlow: 'rgba(106, 201, 240, 0.40)', // 4px Eye Focus Outer Glow
    
    accent: '#FF6F61',        // Coral - SOS, Primary Action Buttons, Alerts
    accentSoft: 'rgba(255, 111, 97, 0.12)',   // Soft danger / SOS container
    accentGlow: 'rgba(255, 111, 97, 0.35)',   // SOS progress pulse
    
    surface: '#FFF2D6',       // Warm Cream - Main App Background
    surfaceCard: '#FFFFFF',   // Pure White Card Surface over Warm Cream
    surfaceElevated: '#FFFDF9', // Elevated card / Modal background
    
    textPrimary: '#14213D',   // Navy - High-contrast readable typography
    textSecondary: '#3B4B68', // Muted Navy - Secondary descriptions
    textMuted: '#6B7A99',     // De-emphasized text / metadata
    
    borderLight: 'rgba(20, 33, 61, 0.10)',
    borderFocus: '#6AC9F0',
  }
} as const;
```

### ❌ STRICT COLOR PROHIBITIONS
- **NO Generic SaaS Gradients**: Never use blue-purple (`from-indigo-500 to-purple-600`) AI gradients.
- **NO Neon Cyberpunk Colors**: Cyberpunk neon cyan `#00ffff` or electric pink `#ff00ff` are forbidden.
- **NO Cold Dark Mode Overrides**: Do not convert surfaces to pitch-black `#000000` or cold slate gray. Warmth must be preserved.

---

## 3. Brand Identity & Visual Language

LUCKY DREAM must be instantly recognizable from a single screenshot.

### Aesthetic Tone
* **Premium & Warm**: Comforting pastel surfaces with solid, protective framing.
* **Healthcare-Friendly**: High legibility, zero clutter, therapeutic color harmony.
* **Accessibility-First**: Unmistakable interaction boundaries, massive target areas.
* **Expressive & Human**: Subtle micro-motions, non-robotic feel.

---

## 4. Unique Custom Card Geometry

Generic rounded rectangles (`rounded-lg` or `rounded-2xl`) are NOT SUFFICIENT for LUCKY DREAM. Cards must feature a signature visual identity while keeping the collision/hit area perfectly rectangular for eye control safety.

```text
┌────────────────────────────────────────────────────────┐
│ [Eye Motif Accent]                                      │
│  ╭──────────────────────────────────────────────────╮  │
│  │ 👁️  FEATURE NAME                                 │  │
│  │     Description line with high contrast text.    │  │
│  ╰──────────────────────────────────────────────────╯  │
│                                                        │
│  * Visual Shape: Custom asymmetric top-right curve     │
│  * Interactive Hit Area: Stable 100% outer rect bounds │
└────────────────────────────────────────────────────────┘
```

### Geometry Guidelines
1. **Asymmetric Corner Radius Tokens**:
   - `radius-card-standard`: `24px 28px 24px 24px` (Asymmetric top-right soft flare).
   - `radius-sos`: `28px` (Full rounded capsule feel for high urgency).
   - `radius-button`: `18px 22px 18px 18px`.
2. **Subtle Layered Surface Accent**:
   - A soft 3px top border highlight tinted with `Sky Blue` (`#6AC9F0`) or `Warm Cream` depth layer to create tactile dimension without noisy drop shadows.
3. **Eye Control Hit Area Rule**:
   - The visual decorative geometry (notches, accents) MUST stay inside the bounding box.
   - The underlying `<button>` or `<div role="button">` bounding box MUST remain a clean, predictable rectangle (e.g. `min-h-[72px]`) to ensure eye-tracking raycasting or grid selection hit-testing never misses.

---

## 5. Signature Eye Motif

The **Eye Motif** is an iconic brand graphic element inspired by the human eye, iris, orbital rings, and soft focal energy.

### Where to Apply the Eye Motif
* **Eye Focus Indicator**: Outer translucent ring simulating an iris aperture around the focused card.
* **Loading / Calibration Spinner**: Concentric orbital rings contracting and expanding smoothly.
* **AI Mascot & Status Badges**: Micro orbital ring behind AI state indicators.
* **SOS Progress Indicator**: Circular eye-concentric countdown ring.

### Application Rules
* **Be Subtle**: Do NOT spam literal eye icons (`<Eye />`) on every button.
* **Use Orbital Shapes**: Prefer abstract concentric circles, soft glowing rings, and smooth radial focal lines over cartoonish eye graphics.

---

## 6. Centralized Design Tokens (Code Reference)

```typescript
export const DESIGN_TOKENS = {
  radius: {
    card: '26px',
    cardAsymmetric: '24px 28px 24px 24px',
    button: '20px',
    badge: '9999px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    touchGap: '16px', // Minimum gap between interactive targets
  },
  shadows: {
    soft: '0 8px 24px -4px rgba(20, 33, 61, 0.08)',
    focus: '0 0 0 4px rgba(106, 201, 240, 0.45), 0 12px 32px -6px rgba(106, 201, 240, 0.30)',
    sos: '0 12px 36px -4px rgba(255, 111, 97, 0.40)',
  },
  zIndex: {
    base: 0,
    card: 10,
    header: 50,
    virtualKeyboard: 80,
    modalBackdrop: 90,
    modalContent: 100,
    eyeFocusOverlay: 110,
    sosEmergency: 120,
    avatarCompanion: 40,
  }
} as const;
```
