/**
 * Font configuration for Clustrix Mobile
 * Matching Electron desktop app fonts
 * 
 * Font Usage:
 * - FONTS.sans: Default text (body, buttons, labels, inputs)
 * - FONTS.display: Headings, titles, welcome screen
 * - FONTS.displayItalic: Subtitles, timestamps, secondary info
 * - FONTS.ai: AI message body text
 * - FONTS.aiBold: Bold text in AI responses, headings in messages
 * - FONTS.mono: Code blocks, inline code
 */

// Font family names (must match keys in useFonts)
export const FONTS = {
  sans: 'Capricorn-USR-Text',
  display: 'Capricorn-Display',
  displayItalic: 'Capricorn-Display-Italic',
  ai: 'Capricorn-AI-Text',
  aiBold: 'AnthropicSerif-AI-Text-Bold',
  mono: 'ClaudeCode',
};

// Font assets for expo-font useFonts hook
export const fontAssets = {
  'Capricorn-USR-Text': require('../../assets/fonts/Capricorn-USR-Text.otf'),
  'Capricorn-Display': require('../../assets/fonts/Capricorn-Display.otf'),
  'Capricorn-Display-Italic': require('../../assets/fonts/Capricorn-Display-Italic.otf'),
  'Capricorn-AI-Text': require('../../assets/fonts/Capricorn-AI-Text-Bold-2.otf'),
  'AnthropicSerif-AI-Text-Bold': require('../../assets/fonts/AnthropicSerif-AI-Text-Bold.otf'),
  'ClaudeCode': require('../../assets/fonts/ClaudeCode.otf'),
};
