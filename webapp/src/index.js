/**
 * Plugin entry point and initialization
 * @module index
 */

import KonturIcon from './components/kontur_icon.jsx';
import { logger } from './utils/logger.js';
import { PluginCore } from './core/plugin-core.js';
import { DropdownManager } from './managers/dropdown-manager.js';
import { ModalManager } from './managers/modal-manager.js';
import { handleInstantCall } from './handlers/instant-call-handler.js';
import { validatePost, validateChannel } from './utils/validators.js';
import { errorMonitor } from './monitoring.js';
import './styles.css';

/**
 * Main plugin class - orchestrates all managers and handlers
 */
class KonturMeetingPlugin {
  constructor() {
    try {
      // Core plugin functionality
      this.core = new PluginCore();
      
      // Managers
      this.dropdownManager = new DropdownManager(this.core);
      this.modalManager = new ModalManager(this.core);
      
      // Error monitoring
      this.errorMonitor = errorMonitor;
      
      // Expose plugin instance globally for component access
      window.KonturMeetingPlugin = this;
      
      // Legacy compatibility - also expose as MeetingPlugin
      window.MeetingPlugin = this;
    } catch (error) {
      console.error('[Kontur] CRITICAL: Plugin constructor failed:', error);
      errorMonitor.logError({
        message: 'Plugin constructor error',
        error: error?.toString(),
        stack: error?.stack,
        timestamp: new Date().toISOString()
      });
      // Не бросаем ошибку - плагин просто не будет работать
    }
  }

  /**
   * Initialize the plugin
   * @param {Object} registry - Mattermost plugin registry
   * @param {Object} store - Redux store
   */
  async initialize(registry, store) {
    try {
      logger.debug('Инициализация плагина...');
      
      // Валидация входных данных
      if (!registry || typeof registry !== 'object') {
        throw new Error('Invalid registry object');
      }
      
      // Initialize core
      if (!this.core) {
        throw new Error('Core not initialized');
      }
      this.core.initialize(registry, store);
      
      // Load plugin configuration
      try {
        await this.core.loadConfig();
        logger.debug('Конфигурация загружена', this.core.config);
      } catch (error) {
        logger.error('Ошибка загрузки конфигурации', error);
        // Не критично - продолжаем инициализацию
      }

      // Set up dropdown callbacks
      if (this.dropdownManager) {
        this.dropdownManager.setCallbacks(
          (channel) => this.handleInstantCall(channel),
          (channel) => this.handleScheduleMeeting(channel),
          () => this.handleAboutPlugin()
        );
      }

      // Register components
      this.registerChannelHeaderButton(registry);
      this.registerPostAction(registry);

      logger.debug('Плагин инициализирован успешно');
    } catch (error) {
      logger.error('[Kontur] CRITICAL: Plugin initialization failed:', error);
      this.errorMonitor.logError({
        message: 'Plugin initialization error',
        error: error?.toString(),
        stack: error?.stack,
        timestamp: new Date().toISOString()
      });
      
      // Регистрируем индикатор ошибки вместо функциональности
      this.registerErrorIndicator(registry);
    }
  }

  /**
   * Register channel header button with error protection
   * @param {Object} registry - Mattermost plugin registry
   */
  registerChannelHeaderButton(registry) {
    try {
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
      const serviceName = this.core?.getServiceName();
      const tooltipText = serviceName 
        ? `Kontur Meeting Plugin - ${serviceName}` 
        : 'Kontur Meeting Plugin';
      
      registry.registerChannelHeaderButtonAction(
        icon,
        (channel, channelMember) => {
          try {
            if (this.dropdownManager) {
              this.dropdownManager.openDropdown(channel, channelMember);
            }
          } catch (error) {
            logger.error('[Kontur] Error in channel header button action:', error);
            this.showError('Не удалось открыть меню плагина');
          }
        },
        tooltipText,
        'kontur-meeting-button'
      );
    } catch (error) {
      logger.error('[Kontur] Failed to register channel header button:', error);
      // Не падаем - продолжаем
    }
  }

  /**
   * Register Post Action with full error protection
   * @param {Object} registry - Mattermost plugin registry
   */
  registerPostAction(registry) {
    try {
      // Правильный API Mattermost: строка + функция(postId)
      registry.registerPostDropdownMenuAction(
        'Создать встречу',
        (postId) => {
          try {
            logger.debug('[Kontur] Post action triggered for postId:', postId);

            // Проверка что store доступен
            if (!this.core?.store) {
              logger.error('[Kontur] Redux store not available');
              return;
            }

            const state = this.core.store.getState();
            
            // Получаем пост из Redux store
            const post = state.entities?.posts?.posts?.[postId];
            
            if (!post) {
              logger.warn('[Kontur] Post not found in store:', postId);
              // Продолжаем - откроем модалку без контекста треда
            }

            // Получаем канал
            let channel = null;
            if (post?.channel_id) {
              channel = state.entities?.channels?.channels?.[post.channel_id];
            }
            
            // Если канал не найден из поста, используем текущий канал
            if (!channel) {
              channel = this.core?.getChannel();
            }
            
            if (!channel) {
              logger.error('[Kontur] Cannot access channel');
              this.showError('Не удалось получить информацию о канале');
              return;
            }

            // Определяем root_id для треда
            // Если post.root_id существует - пост уже в треде
            // Иначе используем сам post.id как root
            const threadRootId = post?.root_id || post?.id;

            logger.debug('[Kontur] Opening modal with context:', {
              postId: post?.id,
              rootId: threadRootId,
              channelId: channel.id
            });

            // Открываем модалку с контекстом
            if (this.modalManager) {
              this.modalManager.openScheduleModal(channel, {
                postId: post?.id ? String(post.id) : undefined,
                rootId: threadRootId ? String(threadRootId) : undefined
              });
            } else {
              logger.error('[Kontur] ModalManager not available');
              this.showError('Модальное окно недоступно');
            }
          } catch (error) {
            logger.error('[Kontur] Error in post action handler:', error);
            this.errorMonitor.logError({
              message: 'Post action execution error',
              error: error?.toString(),
              stack: error?.stack,
              timestamp: new Date().toISOString()
            });
            this.showError('Не удалось открыть форму создания встречи');
          }
        }
      );
    } catch (registrationError) {
      logger.error('[Kontur] Failed to register post action:', registrationError);
      this.errorMonitor.logError({
        message: 'Post action registration error',
        error: registrationError?.toString(),
        stack: registrationError?.stack,
        timestamp: new Date().toISOString()
      });
      // Не падаем - продолжаем инициализацию
    }
  }

  /**
   * Register error indicator when plugin fails to initialize
   * @param {Object} registry - Mattermost plugin registry
   */
  registerErrorIndicator(registry) {
    try {
      registry.registerChannelHeaderButtonAction(
        () => '⚠️',
        () => {
          alert('Плагин Kontur столкнулся с ошибкой. Обратитесь к администратору.\n\nОшибки залогированы в консоли браузера.');
        },
        'Ошибка плагина Kontur',
        'kontur-meeting-error'
      );
    } catch (e) {
      // Даже это не сработало - ничего не делаем
      console.error('[Kontur] Cannot register error indicator:', e);
    }
  }

  /**
   * Safely show error message to user
   * @param {string} message - Error message
   */
  showError(message) {
    try {
      // Пытаемся использовать Mattermost API для показа ошибок
      if (window.PostUtils?.displayError) {
        window.PostUtils.displayError(message);
      } else if (window.mm?.utils?.displayError) {
        window.mm.utils.displayError(message);
      } else {
        // Fallback на alert
        alert(message);
      }
    } catch (e) {
      console.error('[Kontur] Cannot show error:', e);
      // Последний fallback - просто логируем
      logger.error('Error message:', message);
    }
  }

  /**
   * Handle instant call button click
   * @param {Object} channel - Current channel object
   */
  async handleInstantCall(channel) {
    await handleInstantCall(channel, this.core);
  }

  /**
   * Open dropdown menu (public API)
   * @param {Object} channel - Current channel object
   * @param {Object} channelMember - Channel member object
   */
  openDropdown(channel, channelMember) {
    this.dropdownManager.openDropdown(channel, channelMember);
  }

  /**
   * Close dropdown menu (public API)
   */
  closeDropdown() {
    this.dropdownManager.closeDropdown();
  }

  /**
   * Open schedule meeting modal (public API)
   * @param {Object} channel - Current channel object
   */
  openScheduleModal(channel) {
    this.modalManager.openScheduleModal(channel);
  }

  /**
   * Close schedule meeting modal (public API)
   */
  closeScheduleModal() {
    this.modalManager.closeScheduleModal();
  }

  /**
   * Handle schedule meeting - open custom React modal (public API)
   * @param {Object} channel - Current channel object
   */
  handleScheduleMeeting(channel) {
    this.modalManager.openScheduleModal(channel);
  }

  /**
   * Handle about plugin - open about modal (public API)
   */
  handleAboutPlugin() {
    this.modalManager.openAboutModal();
  }

  /**
   * Open about plugin modal (public API)
   */
  openAboutModal() {
    this.modalManager.openAboutModal();
  }

  /**
   * Close about plugin modal (public API)
   */
  closeAboutModal() {
    this.modalManager.closeAboutModal();
  }

  /**
   * Get plugin configuration (public API)
   * @returns {Object} Configuration object
   */
  get config() {
    return this.core.config;
  }

  /**
   * Get Redux store (public API)
   * @returns {Object} Redux store
   */
  get store() {
    return this.core.store;
  }

  /**
   * Get plugin registry (public API)
   * @returns {Object} Plugin registry
   */
  get registry() {
    return this.core.registry;
  }
}

// Register the plugin with Mattermost
window.registerPlugin('com.skyeng.kontur-meeting', new KonturMeetingPlugin());
