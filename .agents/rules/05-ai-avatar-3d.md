# LUCKY DREAM – EYEAI: 3D AI Companion Avatar System

> **Scope**: 3D Character Mascot Architecture, Three.js / React Three Fiber Integration, State Machine & Mobile Performance Optimization
> **Mascot Role**: Official 3D AI Companion for Bounded Support, Empathy & Interaction Feedback

---

## 1. Avatar Definition & Identity

The AI Avatar is the **Official Mascot of LUCKY DREAM**. It is a dynamic 3D character companion designed to give patients a comforting, friendly human-like presence.

* **Format**: Interactive 3D Model (`.glb` / `.gltf`).
* **🚫 STRICT BAN**: The Avatar is NOT a static PNG image, NOT a generic 2D chatbot icon, and NOT a standard video loop.
* **Scope Restriction**: Three.js / React Three Fiber is reserved ONLY for the 3D Avatar and essential 3D assets. **Do NOT convert standard HTML/CSS web UI cards into 3D elements.**

---

## 2. Avatar Placement & Screen Hierarchy

```text
┌──────────────────────────────────────────┐  Mobile Portrait Viewport
│ Header: LUCKY DREAM        [ Settings ]  │
├──────────────────────────────────────────┤
│ [ Feature Cards Grid ]                   │
├──────────────────────────────────────────┤
│ [ SOS EMERGENCY CARD ]                   │  Must stay ABOVE Avatar
├──────────────────────────────────────────┤
│                       ┌────────────────┐ │
│                       │  🤖 3D AVATAR  │ │  Anchored Bottom-Right
│                       └────────────────┘ │  z-index: 40
└──────────────────────────────────────────┘
```

### Positioning Rules
* **Home Anchor**: Fixed at the bottom-right corner of the mobile layout.
* **Layer Hierarchy**: `z-index: 40` (Behind modals `z: 100`, Virtual Keyboard `z: 80`, and Header `z: 50`).
* **Obstruction Rule**: The Avatar MUST NEVER obscure interactive touch/eye controls, settings buttons, input fields, or the SOS Emergency bar.

---

## 3. Avatar State Machine Architecture

The 3D Avatar is driven by a centralized State Machine (`AvatarStateMachine`) reflecting current app activities and patient interaction:

```typescript
export type AvatarState = 
  | 'IDLE'        // Standard relaxed state
  | 'LISTENING'   // User is speaking or gesticulating
  | 'THINKING'    // AI Gemini process in progress
  | 'SPEAKING'    // Text-to-Speech audio active
  | 'HAPPY'       // Positive greeting / milestone
  | 'SUCCESS'     // Message sent, friend request accepted
  | 'EYE_MODE'    // Eye control enabled (Low-Motion Mode)
  | 'WARNING';    // SOS triggered / battery low
```

---

## 4. State Behavior & Motion Specifications

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AVATAR STATE BEHAVIORS                          │
├──────────────┬─────────────────────────────────────────────────────────┤
│ State        │ Visual Behavior & Animation Trigger                     │
├──────────────┼─────────────────────────────────────────────────────────┤
│ IDLE         │ Natural breathing loop, realistic blinking (2-4s),      │
│              │ slight body sway, subtle head tilt, occasional wave.     │
│ THINKING     │ Head tilts slightly upward, thinking posture, subtle    │
│              │ orbiting pulse dots around mascot header.               │
│ SUCCESS      │ Gentle nod, warm smile, quick thumbs-up gesture, then   │
│              │ smooth return to IDLE after 1.5 seconds.                │
│ EYE_MODE     │ Brief positive nod, then immediately enters LOW MOTION  │
│              │ MODE (breathing + blinking only; body sway disabled).   │
└──────────────┴─────────────────────────────────────────────────────────┘
```

### Idle Randomization Rules
* Do NOT trigger all idle gestures simultaneously.
* Blinking should occur randomly every `2.5s` to `5.0s`.
* Body sway should be an ultra-smooth sine wave (`duration: 4.0s`).

---

## 5. Low-Motion Eye Control Behavior (`EYE_MODE`)

When `eyeControlEnabled === true`:
1. The Avatar plays a short `0.5s` acknowledgment wave/nod.
2. The Avatar immediately switches to **Low-Motion Mode**.
3. **Retains**: Gentle chest breathing and eye blinking.
4. **Disables**: Arm waving, heavy torso rotations, camera orbit, and surrounding particle lights.
5. **Purpose**: Prevents visual distraction from interfering with MediaPipe eye tracking.

---

## 6. Three.js & Mobile WebGL Performance Safeguards

Because LUCKY DREAM is a mobile web app running on smartphones (and potentially low-spec devices), 3D graphics MUST be aggressively optimized.

### 3D Asset Constraints
* **Polygon Count**: Max `15,000` to `25,000` triangles for the complete character mesh.
* **Model Compression**: Assets MUST be processed using **Draco** or **Meshopt** compression (`.glb`).
* **Textures**: Compressed WebP / KTX2 texture maps, maximum resolution `1024 × 1024 px`.

### Rendering Optimizations
1. **Lighting**: Limit to 1 Ambient Light (`intensity: 0.6`) and 1 Directional Light (`intensity: 0.8`). No dynamic shadow mapping on mobile (`castShadow={false}`).
2. **Post-Processing**: Do NOT enable Bloom, Depth of Field, or Motion Blur post-processing effects.
3. **Pixel Ratio**: Clamp renderer pixel ratio to maximum `Math.min(window.devicePixelRatio, 1.5)`.

```tsx
// React Three Fiber Optimized Canvas Configuration
<Canvas
  gl={{ antialias: true, powerPreference: "high-performance" }}
  dpr={[1, 1.5]}
  camera={{ position: [0, 1.2, 2.5], fov: 45 }}
>
  <ambientLight intensity={0.6} />
  <directionalLight position={[2, 4, 2]} intensity={0.8} />
  <AvatarModel currentState={currentState} />
</Canvas>
```

### Low-Spec Device Fallback
If WebGL context creation fails or FPS drops below 24:
* Automatically fall back to a simplified 2D vector mascot canvas or subtle animated badge without throwing application runtime errors.
