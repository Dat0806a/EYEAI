// LUCKY DREAM – EYEAI Design Tokens & Visual Identity System

export const BRAND_TOKENS = {
  colors: {
    primary: '#6AC9F0',          // Sky Blue - Focus Ring, Active States, Highlight
    primarySoft: 'rgba(106, 201, 240, 0.15)', // Subtle backdrop glow
    primaryFocusGlow: 'rgba(106, 201, 240, 0.45)', // 4px Eye Focus Outer Glow
    
    accent: '#FF6F61',           // Coral - SOS, Primary Action Buttons, Alerts
    accentSoft: 'rgba(255, 111, 97, 0.12)',   // Soft danger / SOS container
    accentGlow: 'rgba(255, 111, 97, 0.35)',   // SOS progress pulse
    
    surface: '#FFF2D6',          // Warm Cream - Main App Background
    surfaceCard: '#FFFFFF',      // Pure White Card Surface over Warm Cream
    surfaceElevated: '#FFFDF9',  // Elevated card / Modal background
    
    textPrimary: '#14213D',      // Navy - High-contrast readable typography
    textSecondary: '#3B4B68',    // Muted Navy - Secondary descriptions
    textMuted: '#6B7A99',        // De-emphasized text / metadata
    
    borderLight: 'rgba(20, 33, 61, 0.10)',
    borderFocus: '#6AC9F0',
  }
} as const;

export const DESIGN_TOKENS = {
  radius: {
    card: '26px',
    cardAsymmetric: '24px 28px 24px 24px',
    cardSm: '14px 18px 14px 14px',
    button: '20px',
    sos: '28px',
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

export const MOTION_TOKENS = {
  duration: {
    instant: 0.1,  // 100ms
    fast: 0.18,    // 180ms - Eye Glide
    normal: 0.25,  // 250ms - Modals & Buttons
    slow: 0.4,     // 400ms - Page Transitions
  },
  easing: {
    eyeGlide: [0.16, 1, 0.3, 1] as const,
    softConfirm: [0.34, 1.56, 0.64, 1] as const,
    pageEnter: [0.22, 1, 0.36, 1] as const,
  }
} as const;
