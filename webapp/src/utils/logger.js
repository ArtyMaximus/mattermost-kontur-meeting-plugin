// Logger utility with debug mode support
// Set window.MEETING_DEBUG = true in browser console to enable debug logs

const DEBUG = typeof window !== 'undefined' && (window.MEETING_DEBUG === true || window.KONTUR_DEBUG === true);

export const logger = {
  debug: (...args) => {
    if (DEBUG) {
      console.debug('[Meeting]', ...args);
    }
  },
  
  log: (...args) => {
    // Alias for debug, kept for backward compatibility
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
    // Info logs are only for critical business events
    // Use debug() for technical details
    if (DEBUG) {
      console.info('[Meeting]', ...args);
    }
  }
};


