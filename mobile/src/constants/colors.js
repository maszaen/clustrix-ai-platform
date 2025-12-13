/**
 * Centralized color palette for the mobile app
 * Import: import { COLORS, DARK_COLORS, LIGHT_COLORS, getColors } from '../constants/colors';
 */

// Dark theme colors (default)
export const DARK_COLORS = {
  // Backgrounds
  bg: '#000000ff',
  bg90: '#000000e0',
  bg70: '#000000b3',
  bgSecondary: '#282A2C',
  surface: '#1f1f1f',
  inputBg: '#212121',
  hover: '#1a1a1a',
  thinkBg: '#282A2C',
  skeleton: '#232425',
  overlay: 'rgba(0,0,0,0.6)',

  // Foregrounds
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  icon: '#dbdbdbff',

  // Code / Syntax
  codeText: '#8ab4f8',
  codeFence: '#a2a9b0',

  // Borders
  border: '#4a5050',
  borderLight: '#414141',

  // Accents
  accent: '#0e4bae',
  primary: '#D3E3FD',
  primaryLight: '#1f3760',
  link: '#D3E3FD',

  // Status
  danger: '#ef4444',
  dangerLight: '#f87171',
  success: '#22c55e',
  warning: '#f59e0b',

  // Ripple (for android_ripple)
  ripple: 'rgba(255,255,255,0.1)',
  rippleMedium: 'rgba(255,255,255,0.2)',
  rippleStrong: 'rgba(255,255,255,0.3)',
};

// Light theme colors
export const LIGHT_COLORS = {
  // Backgrounds
  bg: '#FFFFFF',
  bg90: '#FFFFFFe6',
  bg70: '#FFFFFFb3',
  bgSecondary: '#F5F5F5',
  surface: '#FAFAFA',
  inputBg: '#F0F0F0',
  hover: '#E8E8E8',
  thinkBg: '#F0F4F8',
  skeleton: '#E0E0E0',
  overlay: 'rgba(0,0,0,0.4)',

  // Foregrounds
  fg: '#1A1A1A',
  fgMuted: '#5F6368',
  icon: '#3C4043',

  // Code / Syntax
  codeText: '#1967D2',
  codeFence: '#5F6368',

  // Borders
  border: '#DADCE0',
  borderLight: '#E8EAED',

  // Accents
  accent: '#1A73E8',
  primary: '#1967D2',
  primaryLight: '#E8F0FE',
  link: '#1967D2',

  // Status
  danger: '#D93025',
  dangerLight: '#EA4335',
  success: '#1E8E3E',
  warning: '#F9AB00',

  // Ripple (for android_ripple)
  ripple: 'rgba(0,0,0,0.08)',
  rippleMedium: 'rgba(0,0,0,0.12)',
  rippleStrong: 'rgba(0,0,0,0.16)',
};

// Get colors based on theme
export const getColors = (theme) => {
  return theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
};

// Default export for backward compatibility (dark theme)
export const COLORS = DARK_COLORS;
