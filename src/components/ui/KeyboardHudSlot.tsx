import React, { memo } from 'react';
import { GlobalEyeHUD } from './GlobalEyeHUD';

interface KeyboardHudSlotProps {
  currentRoute?: string;
}

/**
 * KeyboardHudSlot is placed directly below a page or modal header.
 * On Chat routes ('chat', 'ai') OR when virtual keyboard is open,
 * it renders the long horizontal Camera HUD Bar directly below the header.
 */
export const KeyboardHudSlot = memo(function KeyboardHudSlot({ currentRoute }: KeyboardHudSlotProps) {
  return <GlobalEyeHUD variant="keyboard-bar" currentRoute={currentRoute} />;
});


