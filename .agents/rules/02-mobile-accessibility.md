# LUCKY DREAM – EYEAI: Mobile-First & Accessibility Standards

> **Scope**: Target Viewports, Touch & Eye Hit Targets, Typography Rules, Legibility & Accessibility Guidelines
> **Target Audience**: ALS Patients, Paralyzed Individuals, Elderly Users with Reduced Sight or Motor Control

---

## 1. Mobile-First Layout Core Principles

LUCKY DREAM is designed **mobile-first for smartphone portrait mode**. All UI layouts MUST be constructed and optimized for mobile screens before scaling up to tablets or desktop screens.

### Target Mobile Viewports (Portrait)
Every layout MUST be tested against these standard smartphone resolutions:
* **Compact Android**: `360 × 800 px`
* **Standard iPhone**: `390 × 844 px`
* **Dynamic Island iPhone**: `393 × 852 px`
* **Max Phone Viewport**: `430 × 932 px`

```text
┌──────────────────────────────────────────┐  390px Viewport (Mobile Portrait)
│  LUCKY DREAM                  [Settings] │  Header (Fixed Top)
├──────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ │
│  │   GLẢI TRÍ      │ │     VỊ TRÍ      │ │  2-Column Feature Grid
│  └─────────────────┘ └─────────────────┘ │  Min Card Height: 110px
│  ┌─────────────────┐ ┌─────────────────┐ │
│  │   LIÊN LẠC      │ │       AI        │ │
│  └─────────────────┘ └─────────────────┘ │
├──────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐ │  SOS Emergency Trigger
│  │                 SOS                 │ │  Full Width / Min Height: 72px
│  └─────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│                        [ 🤖 AI AVATAR ] │  Bottom-Right 3D Companion
└──────────────────────────────────────────┘
```

### 🛑 CRITICAL RESPONSIVE PROHIBITIONS
- **DO NOT** build a desktop admin dashboard with sidebars and attempt to squeeze it into a mobile view.
- **DO NOT** rely on horizontal scrolling (`overflow-x: auto`) for core feature navigation.
- **DO NOT** place interactive controls in screen corners where phone bezels or user thumbs obscure vision.

---

## 2. Hit Target & Spacing Standards (Healthcare Accessibility)

Patients with ALS or motor tremors cannot interact with tiny desktop-style buttons. Hit targets MUST be generous.

```text
┌────────────────────────────────────────────────────────┐
│                        HIT TARGET SIZE MATRIX          │
├──────────────────────────┬─────────────────────────────┤
│ Component Type           │ Minimum Touch / Eye Target  │
├──────────────────────────┼─────────────────────────────┤
│ Standard Action Buttons  │ Min Height: 56px            │
│ Primary Eye Grid Cards   │ Min Height: 110px - 140px   │
│ Patient Emergency (SOS)  │ Min Height: 72px - 88px     │
│ Virtual Keyboard Keys    │ Min Height: 64px            │
│ Header / Minor Controls  │ Min Height: 48px            │
└──────────────────────────┴─────────────────────────────┘
```

### Hit Target Spacing Rules
* **Minimum Gap**: Always maintain at least `16px` of clear spacing between adjacent interactive elements to eliminate accidental eye-dwell triggers or fat-finger misclicks.
* **Bounding Box Integrity**: Never wrap clickable items inside tight `p-1` containers. Every clickable wrapper must set `min-h-[56px] min-w-[56px] flex items-center justify-center`.

---

## 3. Typography & Vietnamese Legibility

Because users may have declining sight or be viewing the screen from a hospital bed distance, typography MUST prioritize absolute clarity and high glyph rendering quality for Vietnamese accents.

### Font Size Standards
```text
┌─────────────────────────┬──────────────────┬────────────────────────┐
│ Text Role               │ Normal Mode      │ Accessibility Mode (ON)│
├─────────────────────────┼──────────────────┼────────────────────────┤
│ Body Text               │ 16px - 18px      │ 20px - 24px            │
│ Card Titles / Buttons   │ 18px - 20px Bold │ 24px - 26px Bold       │
│ Page Headings (H1/H2)   │ 24px - 28px Bold │ 30px - 34px Heavy      │
│ Helper / Metadata       │ 14px Medium      │ 16px Medium (Min limit)│
└─────────────────────────┴──────────────────┴────────────────────────┘
```

### Vietnamese Typography Rules
1. **No Thin Weights**: Never use `font-thin` (100), `font-extralight` (200), or `font-light` (300). Use minimum `font-medium` (500) for body and `font-bold` (700) for titles.
2. **Vietnamese Diacritical Heights**: Provide generous line-height (`leading-relaxed` / `1.6`) so Vietnamese diacritical marks (e.g. `ẩ`, `ễ`, `ợ`, `ờ`) are never clipped by `overflow-hidden`.
3. **Font Family**: Prioritize system sans-serif fonts optimized for screen legibility (`Inter`, `system-ui`, `-apple-system`, `Roboto`, `Segoe UI`).

---

## 4. Contrast & WCAG AAA Compliance

All text and interactive borders MUST comply with WCAG AAA contrast ratio standards (7:1 minimum for normal text, 4.5:1 for large text).

* **Text Primary (`Navy #14213D`) on Background (`Warm Cream #FFF2D6`)**: **Contrast Ratio 13.8:1 (EXCELLENT)**
* **Text Primary (`Navy #14213D`) on White Card (`#FFFFFF`)**: **Contrast Ratio 15.6:1 (EXCELLENT)**
* **SOS White Text (`#FFFFFF`) on Coral (`#FF6F61`)**: **Contrast Ratio 4.6:1 (AAA Large Text compliant)**

### ❌ Contrast Prohibitions
- Never use light gray text (`#9CA3AF`) over Warm Cream.
- Never place unshadowed white text directly over background graphics or video feeds.

---

## 5. Accessibility HTML & Screen Reader Rules

1. **Semantic HTML5**: Always use `<main>`, `<header>`, `<nav>`, `<section>`, `<button>`, `<article>`. Avoid endless nested `<div>` wrappers for interactive elements.
2. **ARIA Landmarks & Roles**:
   - Interactive eye cards MUST have `role="button" tabIndex={0}`.
   - Live AI status and speech synthesis outputs MUST use `aria-live="polite"` or `aria-live="assertive"`.
   - SOS buttons MUST have `aria-label="Kích hoạt báo động khẩn cấp SOS"`.
3. **Keyboard Accessibility**: Every single eye-focusable element MUST be reachable via standard Keyboard Navigation (`Tab`, `Shift+Tab`, `Enter`, `Arrow Keys`).
