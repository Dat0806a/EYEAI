import React, { createContext, useContext, useState, ReactNode } from 'react';

interface TutorialContextType {
  isTutorialOpen: boolean;
  openTutorial: () => void;
  closeTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);

  const openTutorial = () => setIsTutorialOpen(true);
  const closeTutorial = () => setIsTutorialOpen(false);

  return (
    <TutorialContext.Provider value={{ isTutorialOpen, openTutorial, closeTutorial }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    return {
      isTutorialOpen: false,
      openTutorial: () => {},
      closeTutorial: () => {},
    };
  }
  return context;
}
