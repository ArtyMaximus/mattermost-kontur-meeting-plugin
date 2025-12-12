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

/**
 * Main plugin class - orchestrates all managers and handlers
 */
class KonturMeetingPlugin {
  constructor() {
    // Core plugin functionality
    this.core = new PluginCore();
    
    // Managers
    this.dropdownManager = new DropdownManager(this.core);
    this.modalManager = new ModalManager(this.core);
    
    // Expose plugin instance globally for component access
    window.KonturMeetingPlugin = this;
    
    // Legacy compatibility - also expose as MeetingPlugin
    window.MeetingPlugin = this;
  }

  /**
   * Initialize the plugin
   * @param {Object} registry - Mattermost plugin registry
   * @param {Object} store - Redux store
   */
  async initialize(registry, store) {
    logger.debug('Инициализация плагина...');
    
    // Initialize core
    this.core.initialize(registry, store);
    
    // Load plugin configuration
    try {
      await this.core.loadConfig();
      logger.debug('Конфигурация загружена', this.core.config);
    } catch (error) {
      logger.error('Ошибка загрузки конфигурации', error);
    }

    // Set up dropdown callbacks
    this.dropdownManager.setCallbacks(
      (channel) => this.handleInstantCall(channel),
      (channel) => this.handleScheduleMeeting(channel)
    );

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
    const serviceName = this.core.getServiceName();
    registry.registerChannelHeaderButtonAction(
      icon,
      (channel, channelMember) => {
        this.dropdownManager.openDropdown(channel, channelMember);
      },
      serviceName ? `Создать встречу ${serviceName}` : 'Создать встречу',
      'kontur-meeting-button'
    );

    logger.debug('Плагин инициализирован успешно');
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
