// Статический импорт модалки для включения в основной бандл
import ScheduleMeetingModal from './components/schedule_meeting_modal.jsx';
import KonturMeetingDropdown from './components/kontur_meeting_dropdown.jsx';
import { formatErrorMessage } from './utils/helpers.js';
import KonturIcon from './components/kontur_icon.jsx';
import { logger } from './utils/logger.js';

class KonturMeetingPlugin {
  constructor() {
    this.config = null;
    // Экспортировать методы для доступа из компонента
    window.KonturMeetingPlugin = this;
    // Dropdown state (React-based)
    this.isDropdownOpen = false;
    this.dropdownChannel = null;
    this.dropdownContainer = null;
    // Modal state (React-based)
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
    logger.log('Инициализация плагина...');
    
    this.store = store;
    this.registry = registry;
    
    // Load plugin configuration
    try {
      await this.loadConfig();
      logger.log('Конфигурация загружена', this.config);
    } catch (error) {
      logger.error('Ошибка загрузки конфигурации', error);
    }

    // Create icon for channel header button
    let icon;
    try {
      if (window.React && window.React.createElement) {
        icon = window.React.createElement(KonturIcon, { size: 20 });
      } else {
        throw new Error('React not available');
      }
    } catch (error) {
      logger.warn('SVG icon failed, using Font Awesome fallback:', error);
      icon = 'fa fa-video-camera';
    }

    // Register channel header button - opens React dropdown component
    const serviceName = this.config?.ServiceName || 'видеосвязи';
    registry.registerChannelHeaderButtonAction(
      icon,
      (channel, channelMember) => {
        this.openDropdown(channel, channelMember);
      },
      serviceName ? `Создать встречу ${serviceName}` : 'Создать встречу',
      'kontur-meeting-button'
    );

    logger.log('Плагин инициализирован успешно');
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
      if (this.config.service_name) {
        this.config.ServiceName = this.config.service_name;
      } else {
        // Default fallback - use generic term if not configured
        this.config.ServiceName = '';
      }
      
      logger.log('Конфигурация получена от сервера', this.config);
    } catch (error) {
      logger.error('Ошибка загрузки конфигурации', error);
      this.config = { 
        WebhookURL: '',
        OpenInNewTab: true,
        ServiceName: ''
      };
    }
  }

  /**
   * Handle instant call button click
   * @param {Object} channel - Current channel object
   */
  async handleInstantCall(channel) {
    logger.log('Создание мгновенной встречи:', {
      channel: channel.display_name || channel.name,
      channelId: channel.id,
      channelType: channel.type
    });

    try {
      // Check if webhook URL is configured
      if (!this.config || !this.config.WebhookURL) {
        const serviceName = this.config?.ServiceName;
        const serviceText = serviceName ? ` ${serviceName}` : ' видеосвязи';
        alert(`⚠️ URL вебхука${serviceText} не настроен.\n\nОбратитесь к системному администратору для настройки в:\nКонсоль системы → Плагины → Kontur.Talk Meeting → Настройки`);
        return;
      }

      const webhookURL = this.config.WebhookURL;

      // Get current user info from Redux store
      const state = this.store.getState();
      const currentUserId = state.entities.users.currentUserId;
      const currentUser = state.entities.users.profiles[currentUserId];

      if (!currentUser) {
        alert('❌ Не удалось получить информацию о текущем пользователе');
        logger.error('Текущий пользователь не найден в store');
        return;
      }

      logger.log('Текущий пользователь:', {
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

      logger.log('Создание быстрого созвона (instant_call)');
      logger.log('Отправка запроса к вебхуку:', webhookURL);
      logger.log('Payload:', JSON.stringify(webhookPayload, null, 2));

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
      logger.log('Ответ от вебхука:', webhookData);

      // Check if meeting_url or room_url is present in response
      const roomUrl = webhookData.meeting_url || webhookData.room_url;
      
      if (!roomUrl) {
        // Если нет URL, но есть success: true, просто показываем сообщение
        if (webhookData.success) {
          const serviceName = this.config?.ServiceName;
          const serviceText = serviceName ? ` ${serviceName}` : ' видеосвязи';
          alert(`✅ Комната${serviceText} создана!`);
          return;
        }
        logger.warn('Неожиданный ответ от вебхука:', webhookData);
        alert('✅ Запрос отправлен.');
        return;
      }

      // Create post in the channel
      const postPayload = {
        channel_id: channel.id,
        message: `Я создал встречу: ${roomUrl}`
      };

      logger.log('Создание сообщения в канале', postPayload);

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
      logger.log('Сообщение опубликовано успешно', postData);

      // Open meeting room in new tab (default: true)
      const openInNewTab = this.config && this.config.OpenInNewTab !== false;
      if (openInNewTab) {
        logger.log('Открытие встречи в новой вкладке');
        window.open(roomUrl, '_blank');
      }

    } catch (error) {
      logger.error('Ошибка при создании быстрого созвона:', {
        message: error.message,
        stack: error.stack
      });
      
      // Use common error formatter from helpers
      const errorMessage = formatErrorMessage(error, this.config);
      alert(errorMessage);
    }
  }


  /**
   * Open dropdown menu (React-based approach)
   * @param {Object} channel - Current channel object
   * @param {Object} channelMember - Channel member object
   */
  openDropdown(channel, channelMember) {
    logger.log('Opening dropdown menu for channel:', channel.id);
    this.dropdownChannel = channel;
    this.isDropdownOpen = true;
    this.renderDropdown();
  }

  /**
   * Close dropdown menu
   */
  closeDropdown() {
    logger.log('Closing dropdown menu');
    this.isDropdownOpen = false;
    this.dropdownChannel = null;
    this.renderDropdown();
  }

  /**
   * Render dropdown based on isDropdownOpen state
   */
  renderDropdown() {
    const React = window.React;
    const ReactDOM = window.ReactDOM;

    if (!React || !ReactDOM) {
      logger.error('React не доступен для dropdown');
      return;
    }

    // Create dropdown container if it doesn't exist
    if (!this.dropdownContainer) {
      this.dropdownContainer = document.createElement('div');
      this.dropdownContainer.id = 'kontur-meeting-dropdown-container';
      document.body.appendChild(this.dropdownContainer);
    }

    // Render or unmount dropdown based on state
    if (this.isDropdownOpen && this.dropdownChannel) {
      // Use KonturMeetingDropdown component but pass isOpen prop
      // We need to create a wrapper that simulates the button click
      const DropdownMenu = () => {
        const [isOpen, setIsOpen] = React.useState(true);
        const dropdownRef = React.useRef(null);

        React.useEffect(() => {
          const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
              // Check if click is not on the plugin button
              const button = document.querySelector('[data-plugin-id="kontur-meeting-button"]');
              if (!button || !button.contains(event.target)) {
                this.closeDropdown();
              }
            }
          };

          document.addEventListener('mousedown', handleClickOutside);
          return () => {
            document.removeEventListener('mousedown', handleClickOutside);
          };
        }, []);

        const handleInstantCall = () => {
          this.handleInstantCall(this.dropdownChannel);
          this.closeDropdown();
        };

        const handleScheduleMeeting = () => {
          this.handleScheduleMeeting(this.dropdownChannel);
          this.closeDropdown();
        };

        // Find channel header position
        const header = document.querySelector('.channel-header__links') || 
                       document.querySelector('.channel-header');
        const rect = header ? header.getBoundingClientRect() : { bottom: 60, right: 16 };

        return React.createElement(
          'div',
          {
            ref: dropdownRef,
            style: {
              position: 'fixed',
              top: `${rect.bottom + 4}px`,
              right: '16px',
              background: 'var(--center-channel-bg, #fff)',
              border: '1px solid var(--center-channel-color-16, rgba(0,0,0,0.1))',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              zIndex: 10000,
              minWidth: '200px',
              padding: '4px 0'
            }
          },
          [
            // Instant call button
            React.createElement(
              'button',
              {
                key: 'instant',
                onClick: handleInstantCall,
                onMouseEnter: (e) => e.target.style.background = 'var(--center-channel-color-08, rgba(0,0,0,0.05))',
                onMouseLeave: (e) => e.target.style.background = 'transparent',
                style: {
                  width: '100%',
                  padding: '8px 16px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--center-channel-color, #333)',
                  fontSize: '14px'
                }
              },
              '📹 Созвониться сейчас'
            ),
            // Divider
            React.createElement('div', {
              key: 'divider',
              style: {
                height: '1px',
                background: 'var(--center-channel-color-16, rgba(0,0,0,0.1))',
                margin: '4px 0'
              }
            }),
            // Schedule meeting button
            React.createElement(
              'button',
              {
                key: 'schedule',
                onClick: handleScheduleMeeting,
                onMouseEnter: (e) => e.target.style.background = 'var(--center-channel-color-08, rgba(0,0,0,0.05))',
                onMouseLeave: (e) => e.target.style.background = 'transparent',
                style: {
                  width: '100%',
                  padding: '8px 16px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--center-channel-color, #333)',
                  fontSize: '14px'
                }
              },
              '📅 Запланировать встречу'
            )
          ]
        );
      };

      ReactDOM.render(
        React.createElement(DropdownMenu),
        this.dropdownContainer
      );
    } else {
      // Unmount dropdown
      if (this.dropdownContainer && this.dropdownContainer.hasChildNodes()) {
        ReactDOM.unmountComponentAtNode(this.dropdownContainer);
      }
    }
  }

  /**
   * Open schedule meeting modal
   * @param {Object} channel - Current channel object
   */
  openScheduleModal(channel) {
    logger.log('Открытие модального окна планирования встречи:', {
      channel: channel.display_name || channel.name,
      channelId: channel.id,
      channelType: channel.type
    });

    // Check if webhook URL is configured
    if (!this.config || !this.config.WebhookURL) {
      const serviceName = this.config?.ServiceName;
      const serviceText = serviceName ? ` ${serviceName}` : ' видеосвязи';
      alert(`⚠️ URL вебхука${serviceText} не настроен.\n\nОбратитесь к системному администратору для настройки в:\nКонсоль системы → Плагины → Kontur.Talk Meeting → Настройки`);
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
      logger.error('React не доступен. Проверьте версию Mattermost.');
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
            logger.log('Модальное окно закрыто - вызов closeScheduleModal');
            this.closeScheduleModal();
          },
          onSuccess: () => {
            logger.log('Meeting scheduled successfully - вызов closeScheduleModal');
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
          logger.error('Ошибка при размонтировании модалки:', error);
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
