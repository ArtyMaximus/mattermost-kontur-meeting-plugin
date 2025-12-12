/**
 * Core plugin functionality: API requests, configuration, utilities
 * @module core/plugin-core
 */

import { logger } from '../utils/logger.js';

/**
 * Plugin core class - handles API requests, configuration, and utility methods
 */
export class PluginCore {
  constructor() {
    this.config = null;
    this.store = null;
    this.registry = null;
  }

  /**
   * Initialize core with registry and store
   * @param {Object} registry - Mattermost plugin registry
   * @param {Object} store - Redux store
   */
  initialize(registry, store) {
    this.store = store;
    this.registry = registry;
  }

  /**
   * Load plugin configuration from server
   * @returns {Promise<Object>} Configuration object
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
      return this.config;
    } catch (error) {
      logger.error('Ошибка загрузки конфигурации', error);
      this.config = { 
        WebhookURL: '',
        OpenInNewTab: true,
        ServiceName: ''
      };
      return this.config;
    }
  }

  /**
   * Get current user from Redux store
   * @returns {Object|null} Current user object or null
   */
  getUser() {
    if (!this.store) {
      logger.warn('Store не инициализирован');
      return null;
    }

    const state = this.store.getState();
    const currentUserId = state.entities.users.currentUserId;
    const currentUser = state.entities.users.profiles[currentUserId];
    
    if (!currentUser) {
      logger.warn('Текущий пользователь не найден в store');
      return null;
    }

    return currentUser;
  }

  /**
   * Get current channel from Redux store
   * @returns {Object|null} Current channel object or null
   */
  getChannel() {
    if (!this.store) {
      logger.warn('Store не инициализирован');
      return null;
    }

    const state = this.store.getState();
    const currentChannelId = state.entities.channels.currentChannelId;
    const channel = state.entities.channels.channels[currentChannelId];
    
    return channel || null;
  }

  /**
   * Get current team from Redux store
   * @returns {Object|null} Current team object or null
   */
  getTeam() {
    if (!this.store) {
      logger.warn('Store не инициализирован');
      return null;
    }

    const state = this.store.getState();
    const currentTeamId = state.entities.teams.currentTeamId;
    const team = state.entities.teams.teams[currentTeamId];
    
    return team || null;
  }

  /**
   * Create a post in the channel
   * @param {string} channelId - Channel ID
   * @param {string} message - Message text
   * @returns {Promise<Object>} Created post data
   */
  async createPost(channelId, message) {
    const postPayload = {
      channel_id: channelId,
      message: message
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
    return postData;
  }

  /**
   * Show notification to user
   * @param {string} message - Notification message
   * @param {string} type - Notification type ('success', 'error', 'info')
   */
  showNotification(message, type = 'info') {
    // Use Mattermost notification system if available
    if (this.registry && this.registry.registerPostTypeComponent) {
      // Mattermost notification API would go here
      logger.log('Notification:', message, type);
    } else {
      // Fallback to alert
      alert(message);
    }
  }

  /**
   * Check if plugin is initialized
   * @returns {boolean} True if initialized
   */
  isPluginInitialized() {
    return !!(this.store && this.registry && this.config);
  }

  /**
   * Get service name from configuration
   * @returns {string} Service name or empty string for generic terms
   */
  getServiceName() {
    return this.config?.ServiceName || '';
  }

  /**
   * Get webhook URL from configuration
   * @returns {string} Webhook URL or empty string
   */
  getWebhookURL() {
    return this.config?.WebhookURL || '';
  }

  /**
   * Check if webhook URL is configured
   * @returns {boolean} True if webhook URL is set
   */
  isWebhookConfigured() {
    return !!(this.config && this.config.WebhookURL);
  }

  /**
   * Get open in new tab setting
   * @returns {boolean} True if should open in new tab (default: true)
   */
  shouldOpenInNewTab() {
    return this.config && this.config.OpenInNewTab !== false;
  }
}

