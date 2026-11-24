'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';
import { MotionConfig } from 'motion/react';
import { getStoredTheme, setStoredTheme } from './storage';
import type { ThemePreference } from './types';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function applyThemeToDocument(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const isDark =
    pref === 'dark'
      ? true
      : pref === 'light'
        ? false
        : window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.documentElement.classList.toggle('dark', isDark);
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = () => callback();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): ThemePreference {
  return getStoredTheme();
}

function getServerSnapshot(): ThemePreference {
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyThemeToDocument(theme);
    if (theme !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => applyThemeToDocument('system');
    mql.addEventListener('change', onSystemChange);
    return () => mql.removeEventListener('change', onSystemChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setStoredTheme(next);
    applyThemeToDocument(next);
    notifyListeners();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
