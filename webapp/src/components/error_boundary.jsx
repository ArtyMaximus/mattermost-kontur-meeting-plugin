import React from 'react';

/**
 * Error Boundary для защиты от ошибок в React компонентах плагина
 * Предотвращает краш всего Mattermost при ошибках в плагине
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Kontur Plugin] Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Можно отправить в систему мониторинга
    if (window.KonturMeetingPlugin?.errorMonitor) {
      window.KonturMeetingPlugin.errorMonitor.logError({
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
        timestamp: new Date().toISOString()
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          border: '1px solid #ef5350',
          borderRadius: '4px',
          margin: '10px'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>⚠️ Ошибка в плагине Kontur</h3>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            Плагин временно недоступен. Перезагрузите страницу.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '12px' }}>Технические детали</summary>
              <pre style={{ 
                fontSize: '11px', 
                overflow: 'auto', 
                marginTop: '8px',
                padding: '8px',
                backgroundColor: '#fff',
                borderRadius: '4px'
              }}>
                {this.state.error?.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {'\n\nComponent Stack:'}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

