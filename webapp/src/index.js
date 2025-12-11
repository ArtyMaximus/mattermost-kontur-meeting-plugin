class KonturMeetingPlugin {
  constructor() {
    this.config = null;
  }

  /**
   * Initialize the plugin
   * @param {Object} registry - Mattermost plugin registry
   * @param {Object} store - Redux store
   */
  async initialize(registry, store) {
    console.log('[Kontur] Инициализация плагина...');
    
    this.store = store;
    
    // Load plugin configuration
    try {
      await this.loadConfig();
      console.log('[Kontur] Конфигурация загружена', this.config);
    } catch (error) {
      console.error('[Kontur] Ошибка загрузки конфигурации', error);
    }

    // Create SVG icon for channel header button
    // Using inline SVG as React element (Mattermost 7.8.0 supports ReactResolvable)
    let icon;
    try {
      icon = React.createElement(
        'svg',
        {
          width: 20,
          height: 20,
          viewBox: '0 0 32 32',
          xmlns: 'http://www.w3.org/2000/svg',
          fill: 'currentColor',
          style: { display: 'block' }
        },
        [
          React.createElement('path', {
            key: 'path1',
            d: 'M0 0 C0.804375 -0.00128906 1.60875 -0.00257813 2.4375 -0.00390625 C3.283125 -0.00003906 4.12875 0.00382813 5 0.0078125 C6.2684375 0.00201172 6.2684375 0.00201172 7.5625 -0.00390625 C8.366875 -0.00261719 9.17125 -0.00132812 10 0 C10.7425 0.00112793 11.485 0.00225586 12.25 0.00341797 C14 0.1328125 14 0.1328125 15 1.1328125 C15.09909302 3.46441305 15.12970504 5.79911192 15.125 8.1328125 C15.12886719 10.0509375 15.12886719 10.0509375 15.1328125 12.0078125 C15 15.1328125 15 15.1328125 14 16.1328125 C12.66956375 16.2311846 11.33406656 16.26359842 10 16.265625 C9.195625 16.26691406 8.39125 16.26820312 7.5625 16.26953125 C6.716875 16.26566406 5.87125 16.26179688 5 16.2578125 C4.154375 16.26167969 3.30875 16.26554687 2.4375 16.26953125 C1.633125 16.26824219 0.82875 16.26695313 0 16.265625 C-0.7425 16.26449707 -1.485 16.26336914 -2.25 16.26220703 C-4 16.1328125 -4 16.1328125 -5 15.1328125 C-5.09909302 12.80121195 -5.12970504 10.46651308 -5.125 8.1328125 C-5.12757813 6.8540625 -5.13015625 5.5753125 -5.1328125 4.2578125 C-4.94045167 -0.26832466 -4.12700187 0.00626932 0 0 Z',
            fill: 'currentColor',
            transform: 'translate(5,7.8671875)'
          }),
          React.createElement('path', {
            key: 'path2',
            d: 'M0 0 C0 4.62 0 9.24 0 14 C-6.625 13.25 -6.625 13.25 -10 11 C-10.64282362 5.93776401 -10.64282362 5.93776401 -10 3 C-6.51174019 -0.18926611 -4.86864834 0 0 0 Z',
            fill: 'currentColor',
            transform: 'translate(32,9)'
          })
        ]
      );
    } catch (error) {
      console.warn('[Kontur] SVG icon failed, using Font Awesome fallback:', error);
      // Fallback to Font Awesome icon
      icon = 'fa fa-video-camera';
    }

    // Register channel header button with SVG icon
    registry.registerChannelHeaderButtonAction(
      icon,
      this.handleCreateMeeting.bind(this),
      'Создать встречу Kontur.Talk',
      'kontur-meeting-button'
    );

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
   * Handle create meeting button click
   * @param {Object} channel - Current channel object
   */
  async handleCreateMeeting(channel) {
    console.log('[Kontur] Создание встречи для канала', channel);

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

      console.log('[Kontur] Текущий пользователь:', currentUser);

      // Prepare webhook payload
      const webhookPayload = {
        channel_id: channel.id,
        channel_name: channel.display_name,
        channel_type: channel.type,
        user_id: currentUserId,
        username: currentUser.username
      };

      console.log('[Kontur] Отправка запроса к вебхуку:', webhookURL);
      console.log('[Kontur] Данные запроса:', webhookPayload);

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

      // Check if room_url is present in response
      if (!webhookData.room_url) {
        throw new Error('Некорректный ответ от вебхука. Отсутствует поле room_url.');
      }

      const roomUrl = webhookData.room_url;

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
      console.error('[Kontur] Ошибка при создании встречи', error);
      
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
}

// Register the plugin with Mattermost
window.registerPlugin('com.skyeng.kontur-meeting', new KonturMeetingPlugin());

