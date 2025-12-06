/**
 * Platform detection utility for Electron/Capacitor hybrid app
 */

export const isCapacitor = typeof window !== 'undefined' && 
  typeof window.Capacitor !== 'undefined' && 
  window.Capacitor.isNativePlatform?.();

export const isAndroid = isCapacitor && window.Capacitor.getPlatform?.() === 'android';

export const isElectron = typeof window !== 'undefined' && 
  typeof window.api !== 'undefined' && 
  typeof window.api.window !== 'undefined';

export const platform = isAndroid ? 'android' : isElectron ? 'electron' : 'web';
