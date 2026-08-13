# LUCKY DREAM – EYEAI: Eye Control UX & Screen Specifications

> **Scope**: Eye Mode Architecture, High-Visibility Focus Design, 5-Action Gesture Handler, Screen-by-Screen Interaction Rules
> **Target System**: Integration with `src/utils/eyeTracker.ts` (MediaPipe FaceMesh EAR & Iris detection)

---

## 1. Eye Control Mode Toggle & Architecture

Eye Control is an essential accessibility layer that can be toggled in **Settings**:
* `Settings → Hỗ trợ sử dụng bằng mắt (Eye Navigation) → ON / OFF`

```typescript
export interface EyeControlSettings {
  eyeControlEnabled: boolean; // Master Eye Mode switch
  dwellTimeMs: number;        // Dwell selection time (e.g. 1500ms)
  calibration EAR: number;     // Eye Aspect Ratio threshold
  soundFeedback: boolean;     // Audio click feedback on SELECT
}
```

### Mode Behaviors
* **OFF (Normal Mode)**: Touch gestures, mouse clicks, and standard physical keyboard work normally.
* **ON (Eye Navigation Active)**: The entire application activates **Eye Focus Traversal** and **Motion Reduction**. 

---

## 2. The 5 Eye Action Handlers

The eye tracker algorithm (`src/utils/eyeTracker.ts`) processes camera frames and emits 5 primary symbolic actions. UI components MUST handle all 5 actions cleanly without modifying the tracking algorithm:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        EYE GESTURE ACTION MAPPING                      │
├───────────────┬──────────────────────────┬─────────────────────────────┤
│ Eye Gesture   │ System Action Triggered  │ UI Traversal Response       │
├───────────────┼──────────────────────────┼─────────────────────────────┤
│ Eye Blink x1  │ SELECT                   │ Activate focused button/card│
│ Eye Blink x2  │ NEXT (RIGHT)             │ Move focus to right element │
│ Eye Blink x3  │ BACK (LEFT)              │ Move focus to left element  │
│ Eye Hold 1.5s │ DOWN                     │ Move focus to element below │
│ Eye Hold >2.5s│ UP                       │ Move focus to element above │
└───────────────┴──────────────────────────┴─────────────────────────────┘
```

---

## 3. High-Visibility Eye Focus Ring Design

When an element receives Eye Focus, it MUST be undeniably prominent. Native browser outlines (`outline: 1px solid blue`) are STRICTLY FORBIDDEN.

```text
┌────────────────────────────────────────────────────────┐
│  [Focused Feature Card / Button]                       │
│  ╭──────────────────────────────────────────────────╮  │
│  │ 👁️  GIẢI TRÍ                                     │  │
│  ╰──────────────────────────────────────────────────╯  │
│  ▲ Outer 4px Translucent Ring (Sky Blue #6AC9F0)       │
│  ▲ Solid 3px Inner Border                              │
│  ▲ Soft Drop Shadow (rgba(106, 201, 240, 0.45))        │
│  ▲ Subtle Scale Boost (~1.02)                          │
└────────────────────────────────────────────────────────┘
```

### CSS / Tailwind Specification for Eye Focus State
```tsx
export const EYE_FOCUS_CLASSES = `
  relative transition-all duration-200 ease-out
  ring-4 ring-[#6AC9F0]/60 ring-offset-2 ring-offset-[#FFF2D6]
  border-3 border-[#6AC9F0]
  shadow-[0_0_24px_rgba(106,201,240,0.50)]
  scale-[1.02] z-20
`;
```

---

## 4. Screen-by-Screen Eye UX Specifications

### A. Home Screen Layout & Structure
* **Header**: Brand title `LUCKY DREAM` on left, `Settings` button on right.
* **2-Column Feature Grid**:
  ```text
  [  Giải trí  ]   [   Vị trí   ]
  [  Liên lạc  ]   [     AI     ]
  ```
* **SOS Emergency Bar**: Full-width card positioned directly BELOW the feature grid.
* **AI 3D Avatar**: Anchored at bottom-right corner.
* **Placement Rule**: SOS button MUST always sit visually ABOVE the 3D Avatar. Avatar must never obscure SOS or Settings.

---

### B. SOS Emergency System Flow
Emergency trigger MUST be bulletproof for distressed patients.

1. **Activation Dwell**: When user focuses on SOS and maintains closed eyes (or eye dwell), a large circular progress ring counts down from **0 to 8 seconds**.
2. **Progress Visual**: Ring fills in bold Coral (`#FF6F61`) with a soft heartbeat pulse.
3. **Emergency Call Selection**: Eye navigation (`UP`, `DOWN`, `SELECT`) navigates emergency contacts row by row.
4. **Custom Confirmation Modal**: Selecting a contact MUST open a custom modal (`Gọi cho [Tên]?` [HỦY] [XÁC NHẬN]).
5. **🚫 ABSOLUTE BAN**: Never use native browser dialogs `alert()`, `confirm()`, or `prompt()`.
6. **Modal Motion**: Opens via backdrop fade, subtle glass blur, scale `0.94 -> 1.0`, and opacity `0 -> 1`.

---

### C. Universal Reusable Virtual Keyboard Component
The **Virtual Keyboard** is a single, core reusable bottom-sheet component used across ALL search and messaging screens.

* **Usage**: Contact Chat, AI Chat, Friend Search, Book Search, Radio Search, Music Search.
* **Opening Motion**: Bottom-sheet slides up smoothly (`translateY 100% -> 0` in `250ms - 300ms`).
* **Key Design**:
  - Keys MUST be large, rounded, high-contrast, and spaced with `gap-3`.
  - Keys MUST be individually eye-focusable.
* **🚫 Keyboard Prohibitions**: Do NOT stagger key animations individually when the keyboard opens (it slows down typing and creates visual noise).

---

### D. Entertainment Screen (Giải trí)
* **3 Primary Buttons**: `Đọc sách` (Books), `Radio` (Radio stations), `Nghe nhạc` (Music).
* **Search & Results**: Selecting a section opens search input + Virtual Keyboard.
* **Custom Result Cards**: YouTube search results MUST NOT copy YouTube's cluttered native UI. Display minimalist result cards containing:
  - High-res thumbnail
  - Clean video/audio title
  - Author / Metadata
  - Prominent Eye-Selectable `PLAY` button.
* **Loading State**: Clean skeleton loader cards with smooth shimmer fade.

---

### E. Contacts & Friend Management (Liên lạc)
* **Friend Grid**: Displayed in a 2-column grid on mobile portrait.
* **Combined Button Layout**: Avatar image and Friend Name MUST be contained inside the SAME large clickable button target.
* **Header Tabs**: `Kết bạn` (Add Friend) and `Lời mời kết bạn` (Friend Requests).
* **Request Actions**:
  - **Accept**: Check icon scales up, success feedback plays, card smoothly collapses, and next card slides upward.
  - **Reject**: Card slides horizontally and fades out gently.

---

### F. Chat & AI Chat System
* **Shared Component Architecture**: Both Human-to-Human Chat and AI Chat MUST share the exact same `MessageBubble` components.
* **AI Chat Specifics**: Recipient is set to `AI Companion`.
* **AI Typing State**: Display 3 animated pulse dots when Gemini AI is thinking.
* **Avatar Reactivity**: The 3D Avatar responds visually to typing, thinking, responding, and completed actions.

---

### G. Location Screen (Vị trí)
* **Map Renderer**: Renders Google Maps view cleanly.
* **🚫 Prohibitions**: Do NOT overlay 3D particles or background visual noise over the map canvas.
* **Own Location Marker**: Concentric soft blue pulse (`#6AC9F0`).
* **Friend Markers**: Avatar-based custom pin markers.
* **Marker Movement**: Smooth location transition without jarring screen refreshes.
