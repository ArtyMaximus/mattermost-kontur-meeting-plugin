// Logger utility with debug mode support
// Set window.KONTUR_DEBUG = true in browser console to enable debug logs

const DEBUG = typeof window !== 'undefined' && window.KONTUR_DEBUG === true;

export const logger = {
  log: (...args) => {
    if (DEBUG) {
      console.log('[Kontur]', ...args);
    }
  },
  
  error: (...args) => {
    // Errors are always logged
    console.error('[Kontur]', ...args);
  },
  
  warn: (...args) => {
    // Warnings are always logged
    console.warn('[Kontur]', ...args);
  },
  
  info: (...args) => {
    if (DEBUG) {
      console.info('[Kontur]', ...args);
    }
  }
};


