// Logger utility with debug mode support
// Set window.MEETING_DEBUG = true in browser console to enable debug logs

const DEBUG = typeof window !== 'undefined' && (window.MEETING_DEBUG === true || window.KONTUR_DEBUG === true);

export const logger = {
  log: (...args) => {
    if (DEBUG) {
      console.log('[Meeting]', ...args);
    }
  },
  
  error: (...args) => {
    // Errors are always logged
    console.error('[Meeting]', ...args);
  },
  
  warn: (...args) => {
    // Warnings are always logged
    console.warn('[Meeting]', ...args);
  },
  
  info: (...args) => {
    if (DEBUG) {
      console.info('[Meeting]', ...args);
    }
  }
};


