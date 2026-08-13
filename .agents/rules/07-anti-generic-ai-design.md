# LUCKY DREAM – EYEAI: Anti-Generic AI Design & Quality Gate Rules

> **Scope**: Aesthetic Quality Control, Prohibition of Generic AI UI Patterns, Verification Quality Gate
> **Mandatory Goal**: Ensure LUCKY DREAM maintains a unique, healthcare-grade visual identity that is instantly recognizable and never looks like a generic AI prototype.

---

## 1. The Prohibited Aesthetic Patterns (THE DO NOT LIST)

AI code generators frequently produce generic, copy-paste UI designs. Any code pull request or UI component containing the following patterns will be **REJECTED IMMEDIATELY**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   FORBIDDEN GENERIC DESIGN PATTERNS                    │
├────────────────────────────────┬───────────────────────────────────────┤
│ Forbidden Pattern              │ Reason for Prohibition                │
├────────────────────────────────┼───────────────────────────────────────┤
│ ❌ Blue-Purple AI Gradients     │ Cliché SaaS template style; ruins     │
│    (from-indigo-500 to-purple) │ contrast for healthcare users.        │
│ ❌ Neon Cyberpunk Aesthetics   │ Harms patient vision and creates      │
│    (Neon cyan #00ffff / pink)  │ visual distress.                      │
│ ❌ Ubiquitous Glassmorphism    │ Glass blur backdrop renders text      │
│    (backdrop-blur everywhere)  │ unreadable for visually impaired.     │
│ ❌ Admin Dashboard Layouts     │ Mobile patients do not want complex   │
│    (Sidebars, data tables)     │ B2B enterprise dashboards.            │
│ ❌ Default Tailwind Demo Look  │ Plain white card + gray border        │
│    (border-gray-200 + bg-white)│ lacks warmth, brand identity & soul.  │
│ ❌ Generic Hero Section        │ Landing page marketing copy inside    │
│    ("Empower your workflow")   │ an operational patient application.   │
│ ❌ Pointless Particle Emitters │ Drain mobile battery and distract     │
│    (Background floating dots)  │ MediaPipe eye-tracking algorithms.    │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 2. Signature Identification Principles

When a user or physician looks at a screenshot of LUCKY DREAM, they MUST be able to identify it within 1 second based on these signature visual markers:

1. **Warm & Protective Palette**: Seamless combination of Sky Blue (`#6AC9F0`), Coral (`#FF6F61`), Warm Cream (`#FFF2D6`), and Navy (`#14213D`).
2. **Custom Geometry**: Asymmetric corner radii (`24px 28px 24px 24px`) with warm surface highlights.
3. **High-Visibility Eye Focus**: Sky Blue 4px ring + outer glow overlay upon eye focus.
4. **3D Companion Mascot**: The friendly 3D Avatar positioned at the bottom-right.
5. **Healthcare Large-Target Controls**: Generous touch buttons (`56px - 88px` minimum height) designed for accessibility.

---

## 3. Mandatory Quality Gate Checklist

Before declaring ANY UI page or component complete, the developer or AI agent MUST run through this **12-Point Quality Gate**. If any answer is **NO**, the UI is NOT finished.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   12-POINT QUALITY CHECKLIST GATE                      │
├────┬──────────────────────────────────────────────────────────┬────────┤
│ #  │ Inspection Question                                      │ Status │
├────┼──────────────────────────────────────────────────────────┼────────┤
│ 1  │ Does the design look unique and intentionally crafted?   │ [YES]  │
│ 2  │ Does it strictly adhere to the 4 LUCKY DREAM colors?     │ [YES]  │
│ 3  │ Is the layout optimized mobile-first (360px - 430px)?     │ [YES]  │
│ 4  │ Is Vietnamese text crisp, readable & unclipped?          │ [YES]  │
│ 5  │ Are interactive hit targets large enough (56px - 88px)?  │ [YES]  │
│ 6  │ Is the Eye Focus ring hyper-visible (#6AC9F0 + 4px ring)?│ [YES]  │
│ 7  │ Do touch, mouse, and keyboard inputs still work?         │ [YES]  │
│ 8  │ Is motion purposeful (160ms - 220ms Eye Glide)?          │ [YES]  │
│ 9  │ Is visual noise suppressed when Eye Mode is active?      │ [YES]  │
│ 10 │ Does it avoid generic SaaS / AI template aesthetics?     │ [YES]  │
│ 11 │ Does it reuse existing tokens and components?            │ [YES]  │
│ 12 │ Does it achieve high FPS performance on mobile devices?  │ [YES]  │
└────┴──────────────────────────────────────────────────────────┴────────┘
```

---

## 4. Agent Commitment Directive

Future AI coding agents operating on this repository MUST read and enforce all rules within `.agents/rules/` before proposing UI code changes. Code modifications must prioritize **Accessibility, Legibility, Warmth, and Mobile Responsiveness** above all else.
