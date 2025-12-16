/**
 * Instant call handler - creates instant meetings without modal
 * @module handlers/instant-call-handler
 */

import { logger } from '../utils/logger.js';
import { formatErrorMessage } from '../utils/helpers.js';

/**
 * Convert UTC time to Moscow timezone (MSK) in RFC3339 format
 * @param {Date} date - Date object (defaults to current time)
 * @returns {string} Time in MSK timezone (RFC3339 format)
 */
function convertToMSK(date = new Date()) {
  // Get time components in Moscow timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const hours = parts.find(p => p.type === 'hour').value;
  const minutes = parts.find(p => p.type === 'minute').value;
  const seconds = parts.find(p => p.type === 'second').value;
  
  // Format as RFC3339 with +03:00 offset (MSK is always UTC+3)
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+03:00`;
}

/**
 * Handle instant call creation
 * @param {Object} channel - Current channel object
 * @param {Object} pluginCore - PluginCore instance
 * @param {Object} context - Optional context with postId and rootId for thread replies
 * @param {string} context.postId - ID of the post where action was triggered
 * @param {string} context.rootId - ID of the root post in thread
 * @returns {Promise<void>}
 */
export async function handleInstantCall(channel, pluginCore, context = {}) {
  const { postId, rootId } = context;
  
  logger.debug('Создание мгновенной встречи:', {
    channel: channel.display_name || channel.name,
    channelId: channel.id,
    channelType: channel.type,
    postId,
    rootId
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

    // Get current time
    const now = new Date();
    
    // Prepare webhook payload
    const webhookPayload = {
      operation_type: 'instant_call',  // Тип операции: быстрый созвон
      channel_id: channel.id,
      channel_name: channel.display_name || channel.name,
      channel_type: channel.type,
      user_id: currentUser.id,
      username: currentUser.username,
      user_email: currentUser.email || null,  // Email может быть не заполнен
      start_time_utc: now.toISOString(),  // UTC time in RFC3339 format
      start_time_msk: convertToMSK(now),   // MSK time in RFC3339 format
      timestamp: now.toISOString(),
      root_id: rootId || '',  // ID родительского поста (root сообщения треда)
      is_thread_reply: !!rootId  // Флаг что встреча создана в треде
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

    // Safely parse response - handle empty body
    let webhookData = null;
    const responseText = await webhookResponse.text();
    
    if (responseText) {
      try {
        webhookData = JSON.parse(responseText);
        logger.debug('Ответ от вебхука:', webhookData);
      } catch (e) {
        logger.error('[Meeting] Не удалось распарсить JSON ответа вебхука', {
          error: e.message,
          responseText: responseText.substring(0, 200) // Log first 200 chars
        });
        alert('❌ Вебхук вернул некорректный ответ. Обратитесь в ~ai-automation-center.');
        return;
      }
    } else {
      // Empty response - this is an error
      logger.error('[Meeting] Пустой ответ от вебхука при создании быстрого созвона');
      alert('❌ Вебхук не вернул данные для встречи. Обратитесь в ~ai-automation-center.');
      return;
    }

    // Check if meeting_url or room_url is present in response
    const roomUrl = webhookData?.meeting_url || webhookData?.room_url;
    
    if (!roomUrl) {
      // Если нет URL, но есть success: true, просто показываем сообщение
      if (webhookData?.success) {
        const serviceName = pluginCore.getServiceName();
        const serviceText = serviceName ? ` ${serviceName}` : ' видеосвязи';
        alert(`✅ Комната${serviceText} создана!`);
        return;
      }
      logger.warn('Неожиданный ответ от вебхука:', webhookData);
      alert('❌ Вебхук не вернул ссылку на комнату. Обратитесь в ~ai-automation-center.');
      return;
    }

    // Create post in the channel or thread
    const postMessage = `📞 Я создал встречу: ${roomUrl}`;
    await pluginCore.createPost(channel.id, postMessage, rootId || null);

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

