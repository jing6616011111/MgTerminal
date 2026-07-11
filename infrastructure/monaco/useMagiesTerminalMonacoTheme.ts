import type { Monaco } from '@monaco-editor/react';
import { useEffect, useState } from 'react';
import {
  buildMagiesTerminalMonacoThemeColors,
  getMagiesTerminalEditorColors,
  getMagiesTerminalMonacoThemeName,
  getMagiesTerminalThemeSignal,
  MAGIES_TERMINAL_MONACO_THEME_DARK,
  MAGIES_TERMINAL_MONACO_THEME_LIGHT,
} from './magiesTerminalMonacoTheme';

export const useMagiesTerminalMonacoTheme = (
  monaco: Monaco | null | undefined,
): string => {
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const [themeSignal, setThemeSignal] = useState(() => getMagiesTerminalThemeSignal());
  const themeName = getMagiesTerminalMonacoThemeName(isDarkTheme);

  useEffect(() => {
    if (!monaco) return;

    const colors = getMagiesTerminalEditorColors(isDarkTheme);
    const themeColors = buildMagiesTerminalMonacoThemeColors(colors);

    monaco.editor.defineTheme(MAGIES_TERMINAL_MONACO_THEME_DARK, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: themeColors,
    });

    monaco.editor.defineTheme(MAGIES_TERMINAL_MONACO_THEME_LIGHT, {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: themeColors,
    });

    monaco.editor.setTheme(themeName);
  }, [monaco, isDarkTheme, themeSignal, themeName]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const root = document.documentElement;
    const updateTheme = () => {
      setIsDarkTheme(root.classList.contains('dark'));
      setThemeSignal(getMagiesTerminalThemeSignal());
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-active-chrome-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return themeName;
};
