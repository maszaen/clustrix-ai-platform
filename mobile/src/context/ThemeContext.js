import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DARK_COLORS, LIGHT_COLORS } from '../constants/colors';

const ThemeContext = createContext({
  colors: DARK_COLORS,
  theme: 'dark',
  isDark: true,
});

/**
 * ThemeProvider - Provides theme colors based on app settings
 * @param {string} themeSetting - 'dark', 'light', or 'system'
 */
export function ThemeProvider({ themeSetting = 'dark', children }) {
  const systemColorScheme = useColorScheme();
  
  const { colors, theme, isDark } = useMemo(() => {
    let resolvedTheme = themeSetting;
    
    // If system default, use device color scheme
    if (themeSetting === 'system') {
      resolvedTheme = systemColorScheme === 'light' ? 'light' : 'dark';
    }
    
    const isDarkMode = resolvedTheme !== 'light';
    
    return {
      colors: isDarkMode ? DARK_COLORS : LIGHT_COLORS,
      theme: resolvedTheme,
      isDark: isDarkMode,
    };
  }, [themeSetting, systemColorScheme]);

  return (
    <ThemeContext.Provider value={{ colors, theme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme hook - Access current theme colors
 * @returns {{ colors: object, theme: string, isDark: boolean }}
 */
export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
