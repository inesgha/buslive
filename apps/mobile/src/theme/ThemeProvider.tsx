import * as SystemUI from 'expo-system-ui';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '@/storage/preferences';

import { darkColors, lightColors, type ThemeColors } from './tokens';

interface ThemeContextValue {
  colors: ThemeColors;
  /** Mode effectivement affiché. */
  scheme: 'light' | 'dark';
  /** Choix de l'utilisateur : suivre le téléphone, ou forcer clair / sombre. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void loadThemePreference().then(setPreferenceState);
  }, []);

  const scheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  // Couleur de fond native (visible pendant les transitions) alignée sur le thème.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      scheme,
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        void saveThemePreference(next);
      },
    }),
    [colors, scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme doit être utilisé dans <ThemeProvider>.');
  return context;
}
