/**
 * Мониторинг ошибок плагина
 * Перехватывает и логирует ошибки, предотвращая их распространение
 */

export class ErrorMonitor {
  constructor() {
    this.errors = [];
    this.MAX_STORED_ERRORS = 50;
    this.setupGlobalErrorHandling();
  }

  /**
   * Настройка глобального перехвата ошибок
   */
  setupGlobalErrorHandling() {
    // Перехват глобальных ошибок от плагина
    const originalErrorHandler = window.onerror;
    window.onerror = (message, filename, lineno, colno, error) => {
      // Проверяем, относится ли ошибка к нашему плагину
      if (filename?.includes('kontur') || 
          filename?.includes('mattermost-kontur') ||
          message?.includes('Kontur') ||
          message?.includes('kontur')) {
        
        this.logError({
          message: message || 'Unknown error',
          filename,
          lineno,
          colno,
          error: error?.toString(),
          stack: error?.stack,
          timestamp: new Date().toISOString()
        });
        
        // НЕ даём ошибке всплыть выше - предотвращаем краш Mattermost
        return true; // Предотвращаем стандартную обработку ошибки
      }
      
      // Для других ошибок вызываем оригинальный обработчик
      if (originalErrorHandler) {
        return originalErrorHandler(message, filename, lineno, colno, error);
      }
      
      return false;
    };

    // Перехват необработанных промисов
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.stack?.includes('kontur') ||
          event.reason?.message?.includes('Kontur')) {
        this.logError({
          message: 'Unhandled promise rejection',
          error: event.reason?.toString(),
          stack: event.reason?.stack,
          timestamp: new Date().toISOString()
        });
        
        // Предотвращаем вывод в консоль браузера
        event.preventDefault();
      }
    });
  }

  /**
   * Логирование ошибки
   * @param {Object} error - Объект ошибки
   */
  logError(error) {
    this.errors.push(error);
    
    if (this.errors.length > this.MAX_STORED_ERRORS) {
      this.errors.shift();
    }

    console.error('[Kontur Monitor]', error);
    
    // Отправляем в систему логирования (опционально)
    this.sendToBackend(error);
  }

  /**
   * Отправка ошибки на бэкенд для анализа
   * @param {Object} error - Объект ошибки
   */
  sendToBackend(error) {
    // Отправляем в бэкенд для анализа (опционально)
    try {
      fetch('/plugins/com.skyeng.kontur-meeting/api/v1/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
        credentials: 'same-origin'
      }).catch(() => {
        // Игнорируем ошибки отправки - не критично
      });
    } catch (e) {
      // Игнорируем ошибки
    }
  }

  /**
   * Получить все залогированные ошибки
   * @returns {Array}
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Очистить историю ошибок
   */
  clearErrors() {
    this.errors = [];
  }
}

// Глобальный экземпляр
export const errorMonitor = new ErrorMonitor();

