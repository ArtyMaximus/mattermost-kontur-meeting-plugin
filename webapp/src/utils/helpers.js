// Helper functions for error handling

/**
 * Format error message for webhook connection failures
 */
export const formatWebhookError = (config) => {
  let errorMessage = '❌ Не удалось создать встречу.\n\n';
  errorMessage += '🔌 Не удалось подключиться к вебхуку:\n';
  errorMessage += (config && config.WebhookURL) || 'URL не настроен';
  errorMessage += '\n\nПроверьте:\n';
  errorMessage += '1. n8n запущен и доступен\n';
  errorMessage += '2. Workflow активирован\n';
  errorMessage += '3. URL указан правильно';
  return errorMessage;
};

/**
 * Format error message based on error type
 */
export const formatErrorMessage = (error, config) => {
  const errorText = error.message || '';
  
  // Check for detailed webhook error from server
  if (errorText.includes('🔌 Не удалось подключиться к вебхуку')) {
    return errorText;
  }
  
  // Check for connection errors
  if (errorText.includes('Не удалось подключиться к вебхуку') || 
      errorText.includes('Failed to fetch') || 
      errorText.includes('ERR_CONNECTION_REFUSED')) {
    return formatWebhookError(config);
  }
  
  // Check for webhook errors
  if (errorText.includes('Вебхук вернул ошибку')) {
    return '❌ Не удалось создать встречу.\n\n⚠️ Вебхук вернул ошибку. Проверьте логи workflow в n8n.';
  }
  
  // Default error message
  return '❌ Не удалось создать встречу.\n\n' + errorText;
};

/**
 * Get current user info from Redux store
 */
export const getCurrentUserInfo = (channel) => {
  if (window.KonturMeetingPlugin && window.KonturMeetingPlugin.store) {
    const state = window.KonturMeetingPlugin.store.getState();
    const currentUserId = state.entities.users.currentUserId;
    const currentTeamId = state.entities.teams.currentTeamId;
    
    return {
      user_id: currentUserId,
      team_id: currentTeamId || channel.team_id || ''
    };
  }
  
  // Fallback
  return {
    user_id: '',
    team_id: channel.team_id || ''
  };
};


