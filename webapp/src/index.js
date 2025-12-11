import KonturMeetingDropdown from './components/kontur_meeting_dropdown';

class KonturMeetingPlugin {
  constructor() {
    this.config = null;
    // Экспортировать методы для доступа из компонента
    window.KonturMeetingPlugin = this;
  }

  /**
   * Initialize the plugin
   * @param {Object} registry - Mattermost plugin registry
   * @param {Object} store - Redux store
   */
  async initialize(registry, store) {
    console.log('[Kontur] Инициализация плагина...');
    
    this.store = store;
    this.registry = registry;
    
    // Load plugin configuration
    try {
      await this.loadConfig();
      console.log('[Kontur] Конфигурация загружена', this.config);
    } catch (error) {
      console.error('[Kontur] Ошибка загрузки конфигурации', error);
    }

    // Регистрировать компонент вместо кнопки
    registry.registerChannelHeaderComponent(KonturMeetingDropdown);

    console.log('[Kontur] Плагин инициализирован успешно');
  }

  /**
   * Load plugin configuration from server
   */
  async loadConfig() {
    try {
      const response = await fetch('/plugins/com.skyeng.kontur-meeting/config', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        throw new Error(`Не удалось загрузить конфигурацию: ${response.status} ${response.statusText}`);
      }

      this.config = await response.json();
      
      // Map snake_case keys from server to camelCase for compatibility
      if (this.config.webhook_url) {
        this.config.WebhookURL = this.config.webhook_url;
      }
      if (this.config.open_in_new_tab !== undefined) {
        this.config.OpenInNewTab = this.config.open_in_new_tab;
      }
      
      console.log('[Kontur] Конфигурация получена от сервера', this.config);
    } catch (error) {
      console.error('[Kontur] Ошибка загрузки конфигурации', error);
      this.config = { 
        WebhookURL: '',
        OpenInNewTab: true
      };
    }
  }

  /**
   * Handle instant call button click
   * @param {Object} channel - Current channel object
   */
  async handleInstantCall(channel) {
    console.log('[Kontur] Создание мгновенной встречи:', {
      channel: channel.display_name || channel.name,
      channelId: channel.id,
      channelType: channel.type
    });

    try {
      // Check if webhook URL is configured
      if (!this.config || !this.config.WebhookURL) {
        alert('⚠️ URL вебхука Kontur.Talk не настроен.\n\nОбратитесь к системному администратору для настройки в:\nКонсоль системы → Плагины → Kontur.Talk Meeting → Настройки');
        return;
      }

      const webhookURL = this.config.WebhookURL;

      // Get current user info from Redux store
      const state = this.store.getState();
      const currentUserId = state.entities.users.currentUserId;
      const currentUser = state.entities.users.profiles[currentUserId];

      if (!currentUser) {
        alert('❌ Не удалось получить информацию о текущем пользователе');
        console.error('[Kontur] Текущий пользователь не найден в store');
        return;
      }

      console.log('[Kontur] Текущий пользователь:', {
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
        user_id: currentUserId,
        username: currentUser.username,
        user_email: currentUser.email || null,  // Email может быть не заполнен
        timestamp: new Date().toISOString()
      };

      console.log('[Kontur] Создание быстрого созвона (instant_call)');
      console.log('[Kontur] Отправка запроса к вебхуку:', webhookURL);
      console.log('[Kontur] Payload:', JSON.stringify(webhookPayload, null, 2));

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
      console.log('[Kontur] Ответ от вебхука:', webhookData);

      // Check if meeting_url or room_url is present in response
      const roomUrl = webhookData.meeting_url || webhookData.room_url;
      
      if (!roomUrl) {
        // Если нет URL, но есть success: true, просто показываем сообщение
        if (webhookData.success) {
          alert('✅ Комната Kontur.Talk создана!');
          return;
        }
        console.warn('[Kontur] Неожиданный ответ от вебхука:', webhookData);
        alert('✅ Запрос отправлен.');
        return;
      }

      // Create post in the channel
      const postPayload = {
        channel_id: channel.id,
        message: `Я создал встречу: ${roomUrl}`
      };

      console.log('[Kontur] Создание сообщения в канале', postPayload);

      const postResponse = await fetch('/api/v4/posts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(postPayload)
      });

      if (!postResponse.ok) {
        throw new Error(`Не удалось опубликовать сообщение: ${postResponse.status} ${postResponse.statusText}`);
      }

      const postData = await postResponse.json();
      console.log('[Kontur] Сообщение опубликовано успешно', postData);

      // Open meeting room in new tab (default: true)
      const openInNewTab = this.config && this.config.OpenInNewTab !== false;
      if (openInNewTab) {
        console.log('[Kontur] Открытие встречи в новой вкладке');
        window.open(roomUrl, '_blank');
      }

    } catch (error) {
      console.error('[Kontur] Ошибка при создании быстрого созвона:', {
        message: error.message,
        stack: error.stack
      });
      
      // Show user-friendly error messages
      let errorMessage = '❌ Не удалось создать встречу.\n\n';
      
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage += '🔌 Не удалось подключиться к вебхуку:\n';
        errorMessage += (this.config && this.config.WebhookURL) || 'URL не настроен';
        errorMessage += '\n\nПроверьте:\n';
        errorMessage += '1. n8n запущен и доступен\n';
        errorMessage += '2. Workflow активирован\n';
        errorMessage += '3. URL указан правильно';
      } else if (error.message.includes('Вебхук вернул ошибку')) {
        errorMessage += '⚠️ Вебхук вернул ошибку. Проверьте логи workflow в n8n.';
      } else if (error.message.includes('Отсутствует поле room_url')) {
        errorMessage += '⚠️ Некорректный ответ от вебхука. Отсутствует поле room_url.';
      } else if (error.message.includes('Не удалось опубликовать сообщение')) {
        errorMessage += '⚠️ Не удалось опубликовать сообщение в канале. Проверьте права доступа.';
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
    }
  }

  /**
   * Get the other user in a DM channel
   * @param {Object} channel - Channel object
   * @param {string} currentUserId - Current user ID
   * @returns {Object|null} User object or null
   */
  getDMOtherUser(channel, currentUserId) {
    // DM канал имеет name формата: "user1_id__user2_id"
    if (channel.type !== 'D') {
      return null;
    }
    
    const userIds = channel.name.split('__');
    const otherUserId = userIds.find(id => id !== currentUserId);
    
    if (!otherUserId) {
      return null;
    }
    
    // Получить из Redux store (БЕЗ API запроса)
    const state = this.store.getState();
    const user = state.entities.users.profiles[otherUserId];
    
    if (!user) {
      // Если пользователя нет в store - вернуть null (будет запрошен через API в handleScheduleMeeting)
      return null;
    }
    
    return {
      user_id: user.id,
      username: user.username,
      email: user.email || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null
    };
  }

  /**
   * Get user by ID via API
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(userId) {
    try {
      const response = await fetch(`/api/v4/users/${userId}`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) {
        return null;
      }
      
      const user = await response.json();
      return {
        user_id: user.id,
        username: user.username,
        email: user.email || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null
      };
    } catch (error) {
      console.error('[Kontur] Ошибка получения пользователя:', error);
      return null;
    }
  }

  /**
   * Get help text for participants field
   * @param {string} channelType - Channel type ("D", "O", "P", "G")
   * @param {Object|null} otherUser - Other user in DM (if exists)
   * @returns {string} Help text
   */
  getParticipantsHelpText(channelType, otherUser) {
    if (channelType === 'D' && otherUser) {
      return `Рекомендуем добавить: @${otherUser.username}. Выберите участников через поиск.`;
    } else if (channelType === 'O' || channelType === 'P' || channelType === 'G') {
      return 'Выберите участников через поиск (можно искать по username, имени, фамилии). Обязательное поле.';
    }
    return 'Выберите участников через поиск (можно искать по username, имени, фамилии).';
  }

  /**
   * Parse participants from submission
   * @param {string|Array|null} participants - Participants from submission
   * @param {Object} state - Redux store state
   * @returns {Array} Array of user objects
   */
  parseParticipants(participants, state) {
    // Mattermost может вернуть:
    // 1. Массив: ["user1", "user2"]
    // 2. Строку через запятую: "user1,user2"
    // 3. null или undefined
    
    if (!participants) {
      return [];
    }
    
    // Универсальная обработка
    let participantIds = [];
    
    if (typeof participants === 'string') {
      participantIds = participants.split(',').map(id => id.trim()).filter(Boolean);
    } else if (Array.isArray(participants)) {
      participantIds = participants;
    } else {
      return [];
    }
    
    // Получить информацию о пользователях из Redux store
    const profiles = state.entities.users.profiles;
    const result = [];
    
    for (const userId of participantIds) {
      const user = profiles[userId];
      if (user) {
        result.push({
          user_id: user.id,
          username: user.username,
          email: user.email || null,
          first_name: user.first_name || null,
          last_name: user.last_name || null
        });
      }
    }
    
    return result;
  }

  /**
   * Validate schedule dialog submission
   * @param {Object} submission - Dialog submission data
   * @param {string} channelType - Channel type ("D", "O", "P", "G")
   * @returns {Object} Errors object {field_name: "error message"} or {} if no errors
   */
  validateScheduleDialog(submission, channelType) {
    const errors = {};
    
    // Валидация даты и времени
    if (!submission.meeting_datetime) {
      errors.meeting_datetime = "Дата и время обязательны";
    } else {
      // submission.meeting_datetime - Unix timestamp в СЕКУНДАХ (integer)
      const scheduledAt = new Date(submission.meeting_datetime * 1000); // Умножить на 1000!
      const now = new Date();
      const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней
      
      if (scheduledAt < now) {
        errors.meeting_datetime = "Дата и время не могут быть в прошлом";
      }
      
      if (scheduledAt > maxDate) {
        errors.meeting_datetime = "Дата не может быть более чем через 30 дней";
      }
    }
    
    // Валидация продолжительности
    if (!submission.duration) {
      errors.duration = "Продолжительность обязательна";
    } else {
      const duration = parseInt(submission.duration, 10);
      if (isNaN(duration) || duration < 5) {
        errors.duration = "Продолжительность должна быть не менее 5 минут";
      } else if (duration > 480) {
        errors.duration = "Продолжительность не может превышать 480 минут (8 часов)";
      }
    }
    
    // Валидация названия (если заполнено)
    if (submission.meeting_title && submission.meeting_title.length > 100) {
      errors.meeting_title = "Название не может быть длиннее 100 символов";
    }
    
    // Валидация участников для каналов и Group DM
    if (channelType === 'O' || channelType === 'P' || channelType === 'G') {
      const state = this.store.getState();
      const participants = this.parseParticipants(submission.participants, state);
      if (participants.length === 0) {
        errors.participants = "Выберите хотя бы одного участника";
      }
    }
    
    // Валидация участников для DM
    if (channelType === 'D') {
      const state = this.store.getState();
      const participants = this.parseParticipants(submission.participants, state);
      if (participants.length === 0) {
        errors.participants = "Выберите хотя бы одного участника";
      }
    }
    
    return errors;
  }

  /**
   * Format date and time for display
   * @param {Date} date - Date object
   * @returns {string} Formatted date string
   */
  formatDateTime(date) {
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    return date.toLocaleString('ru-RU', options);
  }

  /**
   * Handle schedule meeting - open Interactive Dialog
   * @param {Object} channel - Current channel object
   */
  async handleScheduleMeeting(channel) {
    console.log('[Kontur] Открытие диалога планирования встречи:', {
      channel: channel.display_name || channel.name,
      channelId: channel.id,
      channelType: channel.type
    });

    try {
      // Check if webhook URL is configured
      if (!this.config || !this.config.WebhookURL) {
        alert('⚠️ URL вебхука Kontur.Talk не настроен.\n\nОбратитесь к системному администратору для настройки в:\nКонсоль системы → Плагины → Kontur.Talk Meeting → Настройки');
        return;
      }

      // Get current user info
      const state = this.store.getState();
      const currentUserId = state.entities.users.currentUserId;
      
      // Get other user for DM channel
      let otherUser = null;
      if (channel.type === 'D') {
        otherUser = this.getDMOtherUser(channel, currentUserId);
        // Если не найден в store, попробуем через API
        if (!otherUser) {
          const userIds = channel.name.split('__');
          const otherUserId = userIds.find(id => id !== currentUserId);
          if (otherUserId) {
            otherUser = await this.getUserById(otherUserId);
          }
        }
      }

      // Build Interactive Dialog structure
      const dialog = {
        title: 'Запланировать встречу Kontur.Talk',
        introduction: 'Заполните форму для создания запланированной встречи',
        elements: [
          {
            display_name: 'Дата и время встречи',
            name: 'meeting_datetime',
            type: 'datetime',
            optional: false
          },
          {
            display_name: 'Продолжительность',
            name: 'duration',
            type: 'select',
            placeholder: 'Выберите продолжительность',
            help_text: 'Обязательное поле. Длительность встречи в минутах.',
            optional: false,
            options: [
              {text: '15 минут', value: '15'},
              {text: '30 минут', value: '30'},
              {text: '45 минут', value: '45'},
              {text: '1 час', value: '60'},
              {text: '1.5 часа', value: '90'},
              {text: '2 часа', value: '120'},
              {text: '3 часа', value: '180'},
              {text: '4 часа', value: '240'}
            ],
            default: '60' // По умолчанию 1 час
          },
          {
            display_name: 'Название встречи',
            name: 'meeting_title',
            type: 'text',
            placeholder: 'Обсуждение проекта',
            help_text: 'Опционально, максимум 100 символов',
            optional: true,
            default: channel.display_name || channel.name
          },
          {
            display_name: 'Участники',
            name: 'participants',
            type: 'select',
            data_source: 'users',
            multiselect: true,
            placeholder: 'Выберите участников',
            help_text: this.getParticipantsHelpText(channel.type, otherUser),
            optional: channel.type === 'D' ? false : false // Всегда обязательно согласно ТЗ
          }
        ],
        submit_label: 'Создать встречу',
        notify_on_cancel: false
      };

      // Open Interactive Dialog
      const dialogData = {
        url: '/plugins/com.skyeng.kontur-meeting/schedule-submit',
        dialog: dialog,
        context: {
          channel_id: channel.id,
          channel_type: channel.type
        }
      };

      console.log('[Kontur] Открытие Interactive Dialog', dialogData);
      
      // Используем Mattermost API для открытия диалога
      // В Mattermost 7.8.0+ используется registry.openInteractiveDialog
      if (this.registry && this.registry.openInteractiveDialog) {
        this.registry.openInteractiveDialog(dialogData);
      } else if (window.mm_openInteractiveDialog) {
        // Fallback для старых версий
        window.mm_openInteractiveDialog(dialogData);
      } else {
        throw new Error('Не удалось открыть Interactive Dialog. Проверьте версию Mattermost (требуется 7.8.0+)');
      }

    } catch (error) {
      console.error('[Kontur] Ошибка при открытии диалога планирования:', {
        message: error.message,
        stack: error.stack
      });
      alert('❌ Не удалось открыть диалог планирования встречи.\n\n' + error.message);
    }
  }

}

// Register the plugin with Mattermost
window.registerPlugin('com.skyeng.kontur-meeting', new KonturMeetingPlugin());
