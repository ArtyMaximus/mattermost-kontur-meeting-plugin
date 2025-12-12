/**
 * Instant call handler - creates instant meetings without modal
 * @module handlers/instant-call-handler
 */

import { logger } from '../utils/logger.js';
import { formatErrorMessage } from '../utils/helpers.js';

/**
 * Handle instant call creation
 * @param {Object} channel - Current channel object
 * @param {Object} pluginCore - PluginCore instance
 * @returns {Promise<void>}
 */
export async function handleInstantCall(channel, pluginCore) {
  logger.debug('Создание мгновенной встречи:', {
    channel: channel.display_name || channel.name,
    channelId: channel.id,
    channelType: channel.type
  });

  try {
    // Check if webhook URL is configured
    if (!pluginCore.isWebhookConfigured()) {
      const serviceName = pluginCore.getServiceName();
      const serviceText = serviceName ? ` ${serviceName}` : ' видеосвязи';
      alert(`⚠️ URL вебхука${serviceText} не настроен.\n\nОбратитесь к системному администратору для настройки в:\nКонсоль системы → Плагины → Kontur.Talk Meeting → Настройки`);
      return;
    }

    const webhookURL = pluginCore.getWebhookURL();

    // Get current user info from Redux store
    const currentUser = pluginCore.getUser();

    if (!currentUser) {
      alert('❌ Не удалось получить информацию о текущем пользователе');
      logger.error('Текущий пользователь не найден в store');
      return;
    }

    logger.debug('Текущий пользователь:', {
      id: currentUser.id,
      username: currentUser.username,
      email: currentUser.email || '(не указан)'
    });

    // Prepare webhook payload
    const webhookPayload = {
      operation_type: 'instant_call',  // Тип операции: быстрый созвон
      channel_id: channel.id,
      channel_name: channel.display_name || channel.name,
      channel_type: channel.type,
      user_id: currentUser.id,
      username: currentUser.username,
      user_email: currentUser.email || null,  // Email может быть не заполнен
      timestamp: new Date().toISOString()
    };

    logger.debug('Создание быстрого созвона (instant_call)');
    logger.debug('Отправка запроса к вебхуку:', webhookURL);
    logger.debug('Payload:', JSON.stringify(webhookPayload, null, 2));

    // Send request to webhook to create meeting
    const webhookResponse = await fetch(webhookURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!webhookResponse.ok) {
      throw new Error(`Вебхук вернул ошибку: ${webhookResponse.status} ${webhookResponse.statusText}`);
    }

    const webhookData = await webhookResponse.json();
    logger.debug('Ответ от вебхука:', webhookData);

    // Check if meeting_url or room_url is present in response
    const roomUrl = webhookData.meeting_url || webhookData.room_url;
    
    if (!roomUrl) {
      // Если нет URL, но есть success: true, просто показываем сообщение
      if (webhookData.success) {
        const serviceName = pluginCore.getServiceName();
        const serviceText = serviceName ? ` ${serviceName}` : ' видеосвязи';
        alert(`✅ Комната${serviceText} создана!`);
        return;
      }
      logger.warn('Неожиданный ответ от вебхука:', webhookData);
      alert('✅ Запрос отправлен.');
      return;
    }

    // Create post in the channel
    await pluginCore.createPost(channel.id, `📞 Я создал встречу: ${roomUrl}`);

    // Open meeting room in new tab (default: true)
    const openInNewTab = pluginCore.shouldOpenInNewTab();
    if (openInNewTab) {
      logger.debug('Открытие встречи в новой вкладке');
      window.open(roomUrl, '_blank');
    }

  } catch (error) {
    logger.error('Ошибка при создании быстрого созвона:', {
      message: error.message,
      stack: error.stack
    });
    
    // Use common error formatter from helpers
    const errorMessage = formatErrorMessage(error, pluginCore.config);
    alert(errorMessage);
  }
}

