// Статический импорт модалки для включения в основной бандл
import ScheduleMeetingModal from './components/schedule_meeting_modal.jsx';

class KonturMeetingPlugin {
  constructor() {
    this.config = null;
    // Экспортировать методы для доступа из компонента
    window.KonturMeetingPlugin = this;
    this.currentDropdown = null;
    this.dropdownCloseHandler = null;
    this.modalContainer = null;
    this.currentModal = null;
    this.isModalOpen = false;
    this.currentChannel = null;
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

    // Create SVG icon for channel header button
    // React доступен глобально в Mattermost через window.React
    let icon;
    try {
      if (window.React && window.React.createElement) {
        icon = window.React.createElement(
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
            window.React.createElement('path', {
            key: 'path1',
            d: 'M0 0 C0.804375 -0.00128906 1.60875 -0.00257813 2.4375 -0.00390625 C3.283125 -0.00003906 4.12875 0.00382813 5 0.0078125 C6.2684375 0.00201172 6.2684375 0.00201172 7.5625 -0.00390625 C8.366875 -0.00261719 9.17125 -0.00132812 10 0 C10.7425 0.00112793 11.485 0.00225586 12.25 0.00341797 C14 0.1328125 14 0.1328125 15 1.1328125 C15.09909302 3.46441305 15.12970504 5.79911192 15.125 8.1328125 C15.12886719 10.0509375 15.12886719 10.0509375 15.1328125 12.0078125 C15 15.1328125 15 15.1328125 14 16.1328125 C12.66956375 16.2311846 11.33406656 16.26359842 10 16.265625 C9.195625 16.26691406 8.39125 16.26820312 7.5625 16.26953125 C6.716875 16.26566406 5.87125 16.26179688 5 16.2578125 C4.154375 16.26167969 3.30875 16.26554687 2.4375 16.26953125 C1.633125 16.26824219 0.82875 16.26695313 0 16.265625 C-0.7425 16.26449707 -1.485 16.26336914 -2.25 16.26220703 C-4 16.1328125 -4 16.1328125 -5 15.1328125 C-5.09909302 12.80121195 -5.12970504 10.46651308 -5.125 8.1328125 C-5.12757813 6.8540625 -5.13015625 5.5753125 -5.1328125 4.2578125 C-4.94045167 -0.26832466 -4.12700187 0.00626932 0 0 Z',
            fill: 'currentColor',
            transform: 'translate(5,7.8671875)'
          }),
            window.React.createElement('path', {
            key: 'path2',
            d: 'M0 0 C0 4.62 0 9.24 0 14 C-6.625 13.25 -6.625 13.25 -10 11 C-10.64282362 5.93776401 -10.64282362 5.93776401 -10 3 C-6.51174019 -0.18926611 -4.86864834 0 0 0 Z',
            fill: 'currentColor',
            transform: 'translate(32,9)'
          })
        ]
      );
      } else {
        throw new Error('React not available');
      }
    } catch (error) {
      console.warn('[Kontur] SVG icon failed, using Font Awesome fallback:', error);
      icon = 'fa fa-video-camera';
    }

    // Register channel header button - opens dropdown menu
    registry.registerChannelHeaderButtonAction(
      icon,
      (channel, channelMember) => {
        this.showMeetingDropdown(channel);
      },
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
   * Show meeting dropdown menu
   * @param {Object} channel - Current channel object
   */
  showMeetingDropdown(channel) {
    // Закрыть предыдущий dropdown если открыт
    if (this.currentDropdown) {
      this.currentDropdown.remove();
      this.currentDropdown = null;
    }

    // Найти channel header для позиционирования
    const header = document.querySelector('.channel-header__links') || 
                   document.querySelector('.channel-header');
    
    if (!header) {
      console.error('[Kontur] Channel header not found');
      return;
    }

    // Получить позицию header
    const rect = header.getBoundingClientRect();

    // Создать dropdown элемент
    const dropdown = document.createElement('div');
    dropdown.className = 'kontur-meeting-dropdown';
    dropdown.style.cssText = `
      position: fixed;
      background: var(--center-channel-bg, #fff);
      border: 1px solid var(--center-channel-color-16, rgba(0,0,0,0.1));
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 10000;
      min-width: 200px;
      padding: 4px 0;
    `;
    
    // Добавить в DOM
    document.body.appendChild(dropdown);
    
    // Позиционировать относительно channel header
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.right = '16px';

    // Создать кнопку "Созвониться сейчас"
    const instantBtn = document.createElement('button');
    instantBtn.textContent = '📹 Созвониться сейчас';
    instantBtn.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      text-align: left;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--center-channel-color, #333);
      font-size: 14px;
    `;
    instantBtn.onmouseenter = () => {
      instantBtn.style.background = 'var(--center-channel-color-08, rgba(0,0,0,0.05))';
    };
    instantBtn.onmouseleave = () => {
      instantBtn.style.background = 'transparent';
    };
    instantBtn.onclick = () => {
      this.handleInstantCall(channel);
      this.closeDropdown();
    };
    dropdown.appendChild(instantBtn);

    // Создать разделитель
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: var(--center-channel-color-16, rgba(0,0,0,0.1));
      margin: 4px 0;
    `;
    dropdown.appendChild(divider);

    // Создать кнопку "Запланировать встречу"
    const scheduleBtn = document.createElement('button');
    scheduleBtn.textContent = '📅 Запланировать встречу';
    scheduleBtn.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      text-align: left;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--center-channel-color, #333);
      font-size: 14px;
    `;
    scheduleBtn.onmouseenter = () => {
      scheduleBtn.style.background = 'var(--center-channel-color-08, rgba(0,0,0,0.05))';
    };
    scheduleBtn.onmouseleave = () => {
      scheduleBtn.style.background = 'transparent';
    };
    scheduleBtn.onclick = () => {
      this.handleScheduleMeeting(channel);
      this.closeDropdown();
    };
    dropdown.appendChild(scheduleBtn);

    // Dropdown уже добавлен в DOM выше для измерения размера
    this.currentDropdown = dropdown;

    // Закрытие при клике вне dropdown
    const closeDropdown = (e) => {
      if (this.currentDropdown && !this.currentDropdown.contains(e.target)) {
        // Проверить, что клик не по кнопке плагина
        const button = document.querySelector('[data-plugin-id="kontur-meeting-button"]');
        if (!button || !button.contains(e.target)) {
          this.closeDropdown();
        }
      }
    };
    
    // Использовать setTimeout чтобы не сработал сразу клик по кнопке
    setTimeout(() => {
      document.addEventListener('mousedown', closeDropdown);
      this.dropdownCloseHandler = closeDropdown;
    }, 0);
  }

  /**
   * Close dropdown menu
   */
  closeDropdown() {
    if (this.currentDropdown) {
      this.currentDropdown.remove();
      this.currentDropdown = null;
    }
    if (this.dropdownCloseHandler) {
      document.removeEventListener('mousedown', this.dropdownCloseHandler);
      this.dropdownCloseHandler = null;
    }
  }

  /**
   * Open schedule meeting modal
   * @param {Object} channel - Current channel object
   */
  openScheduleModal(channel) {
    console.log('[Kontur] Открытие модального окна планирования встречи:', {
      channel: channel.display_name || channel.name,
      channelId: channel.id,
      channelType: channel.type
    });

    // Check if webhook URL is configured
    if (!this.config || !this.config.WebhookURL) {
      alert('⚠️ URL вебхука Kontur.Talk не настроен.\n\nОбратитесь к системному администратору для настройки в:\nКонсоль системы → Плагины → Kontur.Talk Meeting → Настройки');
      return;
    }

    this.currentChannel = channel;
    this.isModalOpen = true;
    this.renderModal();
  }

  /**
   * Close schedule meeting modal
   */
  closeScheduleModal() {
    this.isModalOpen = false;
    this.currentChannel = null;
    this.renderModal();
  }

  /**
   * Render modal based on isModalOpen state
   */
  renderModal() {
    const React = window.React;
    const ReactDOM = window.ReactDOM;

    if (!React || !ReactDOM) {
      console.error('[Kontur] React не доступен. Проверьте версию Mattermost.');
      return;
    }

    // Создать контейнер для модального окна если его нет
    if (!this.modalContainer) {
      this.modalContainer = document.createElement('div');
      this.modalContainer.id = 'kontur-meeting-modal-container';
      document.body.appendChild(this.modalContainer);
    }

    // Условный рендеринг модалки на основе isModalOpen
    if (this.isModalOpen && this.currentChannel) {
      // Рендерить модальное окно
      this.currentModal = ReactDOM.render(
        React.createElement(ScheduleMeetingModal, {
          channel: this.currentChannel,
          onClose: () => {
            console.log('[Kontur] Модальное окно закрыто - вызов closeScheduleModal');
            this.closeScheduleModal();
          },
          onSuccess: () => {
            console.log('[Kontur] Meeting scheduled successfully - вызов closeScheduleModal');
            this.closeScheduleModal();
          }
        }),
        this.modalContainer
      );
    } else {
      // Размонтировать модалку если она закрыта
      if (this.modalContainer) {
        try {
          // Проверить, есть ли что размонтировать
          const hasChildNodes = this.modalContainer.hasChildNodes();
          if (hasChildNodes || this.currentModal) {
            ReactDOM.unmountComponentAtNode(this.modalContainer);
            // Очистить контейнер
            this.modalContainer.innerHTML = '';
          }
        } catch (error) {
          console.error('[Kontur] Ошибка при размонтировании модалки:', error);
          // Принудительно очистить контейнер
          if (this.modalContainer) {
            this.modalContainer.innerHTML = '';
          }
        }
        this.currentModal = null;
      }
    }
  }

  /**
   * Handle schedule meeting - open custom React modal
   * @param {Object} channel - Current channel object
   */
  handleScheduleMeeting(channel) {
    this.openScheduleModal(channel);
  }


}

// Register the plugin with Mattermost
window.registerPlugin('com.skyeng.kontur-meeting', new KonturMeetingPlugin());
