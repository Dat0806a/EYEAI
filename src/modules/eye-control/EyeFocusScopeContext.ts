import { createContext, useContext } from 'react';

/**
 * Context that provides the current eye focus scope ID (e.g. 'contact-action-modal')
 * to all descendant EyeFocusable elements.
 */
export const EyeFocusScopeContext = createContext<string | null>(null);

export function useEyeFocusScope(): string | null {
  return useContext(EyeFocusScopeContext);
}
