# LUCKY DREAM – EYEAI: Component Design & Reusability Rules

> **Scope**: Component Architecture, Design Token Consumption, Reusable UI Inventory, Icon Wrappers & Fallback States
> **Framework**: React 19 + TypeScript + TailwindCSS v4

---

## 1. Centralized Component Architecture

To maintain a clean codebase, every piece of UI MUST be built from reusable, single-responsibility components. Hardcoding identical layouts across multiple screen files is STRICTLY FORBIDDEN.

### Standard Component Inventory

```text
src/components/ui/
├── FeatureCard.tsx        # Large 2-column home feature card with custom geometry
├── AppButton.tsx          # Accessible button with Soft Confirm & Eye Focus
├── EyeFocusable.tsx       # Wrapper providing eye tracking focus registration
├── EyeFocusRing.tsx       # Shared animated focus ring (Sky Blue #6AC9F0)
├── VirtualKeyboard.tsx    # Core bottom-sheet Vietnamese Telex virtual keyboard
├── EyeTextComposer.tsx    # Text display + TTS voice playback bar
├── Avatar3D.tsx           # R3F Three.js mascot companion wrapper
├── ContactCard.tsx        # Combined avatar + friend name large row/card
├── MessageBubble.tsx      # Shared bubble for both User-to-User & AI chat
├── PageHeader.tsx         # Top bar with LUCKY DREAM logo & Settings toggle
├── Modal.tsx              # Custom confirmation modal (SOS / Call action)
├── LoadingState.tsx       # Skeleton loader with soft shimmer keyframes
├── EmptyState.tsx         # Designed empty view for missing data/messages
├── StatusBadge.tsx        # Warm pulse status badge (GPS, Eye Mode, Online)
└── SearchComposer.tsx     # Generic search bar launcher triggering Virtual Keyboard
```

---

## 2. Reusability & Anti-Duplication Rules

### Rule 1: Shared Chat Message Bubbles
Do NOT write separate chat message components for Human Chat and AI Chat.
* Use a single `<MessageBubble message={msg} isAI={msg.sender === 'AI'} />`.
* Styling differences (AI avatar badge, response speed, typing indicator) are handled via props.

### Rule 2: Shared Virtual Keyboard Bottom-Sheet
Do NOT build separate custom keyboards for Entertainment Search, Friend Search, and AI Chat.
* Inject `<VirtualKeyboard isOpen={isKeyboardOpen} onKeyPress={handleKeyPress} />` at the top-level app wrapper as a single reusable bottom sheet.

---

## 3. Icon Presentation & Custom Visual Wrappers

While `lucide-react` is used for utility icons, major feature icons (Home Screen cards: Entertainment, Location, Contacts, AI, SOS) MUST NOT appear as plain, unstyled icons dropped onto a white square.

```text
┌────────────────────────────────────────────────────────┐
│  FEATURE ICON VISUAL WRAPPER                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ╭─────────────────╮                              │  │
│  │ │   [ 🎨 ICON ]   │ <-- Custom Asymmetric Layer  │  │
│  │ ╰─────────────────╯     Sky Blue / Soft Glow      │  │
│  │   FEATURE TITLE                                  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Icon Wrapper Rules
* Wrap major icons in a custom surface container with:
  - Background: Soft Sky Blue tinted surface (`rgba(106, 201, 240, 0.15)`).
  - Size: `56px × 56px` minimum container.
  - Border radius: Asymmetric `radius-card-sm` (`14px 18px 14px 14px`).
  - Icon stroke: `2.5px` heavy weight for high visibility.

---

## 4. Designed Empty States & Loading Systems

Blank white screens or raw unstyled text fallbacks during loading/empty states are STRICTLY PROHIBITED.

### A. Designed Empty States
Every screen MUST handle missing data with a designed `<EmptyState />` component:

```tsx
<EmptyState
  icon={<UserX className="w-12 h-12 text-[#14213D]/40" />}
  title="Chưa có lời mời kết bạn"
  description="Danh sách lời mời kết bạn mới sẽ hiển thị tại đây."
  actionLabel="Tìm bạn mới"
  onAction={openFriendSearch}
/>
```

Required empty state contexts:
- No friends added yet.
- No friend requests pending.
- No chat messages history.
- No video/music search results found.
- GPS location signal unavailable.

### B. Designed Skeleton Loading
During data fetch or AI prompt execution:
* Render matching `<LoadingState type="card" count={4} />` skeletons.
* Skeletons MUST match the exact dimensions and custom geometry of the actual cards they replace.

---

## 5. Strict Code Quality & Token Consumption

1. **No Hardcoded Hex Colors**:
   - ❌ WRONG: `className="bg-[#123456] text-[#ffffff]"`
   - ✅ CORRECT: `className="bg-brand-navy text-brand-cream"` or referencing `BRAND_TOKENS.colors.textPrimary`.
2. **TypeScript Interfaces**: All props MUST be fully typed with strict TypeScript interfaces.
3. **Clean Code**: Components must remain pure, accessible, and testable.
