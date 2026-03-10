import { createContext, useContext, useState, ReactNode } from 'react';

export type FontFamily = 'sans' | 'serif' | 'mono';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';
export type LineHeight = 'tight' | 'normal' | 'relaxed' | 'loose';

interface TypographyState {
  fontFamily: FontFamily;
  fontSize: FontSize;
  lineHeight: LineHeight;
}

interface TypographyContextType {
  typography: TypographyState;
  setTypography: (settings: Partial<TypographyState>) => void;
}

const defaultState: TypographyState = {
  fontFamily: 'sans',
  fontSize: 'base',
  lineHeight: 'relaxed',
};

const TypographyContext = createContext<TypographyContextType | undefined>(undefined);

export function TypographyProvider({ children }: { children: ReactNode }) {
  const [typography, setTypographyState] = useState<TypographyState>(defaultState);

  const setTypography = (settings: Partial<TypographyState>) => {
    setTypographyState((prev) => ({ ...prev, ...settings }));
  };

  return (
    <TypographyContext.Provider value={{ typography, setTypography }}>
      {children}
    </TypographyContext.Provider>
  );
}

export function useTypography() {
  const context = useContext(TypographyContext);
  if (context === undefined) {
    throw new Error('useTypography must be used within a TypographyProvider');
  }
  return context;
}
