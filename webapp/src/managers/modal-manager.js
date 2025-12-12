/**
 * Modal manager - handles schedule meeting modal
 * @module managers/modal-manager
 */

import ScheduleMeetingModal from '../components/schedule_meeting_modal.jsx';
import { logger } from '../utils/logger.js';
import { renderReactComponent, unmountReactComponent, createElementWithProps, isReactAvailable } from '../renderers/react-renderer.js';

/**
 * Modal manager class
 */
export class ModalManager {
  constructor(pluginCore) {
    this.pluginCore = pluginCore;
    this.modalContainer = null;
    this.currentModal = null;
    this.isModalOpen = false;
    this.currentChannel = null;
  }

  /**
   * Open schedule meeting modal
   * @param {Object} channel - Current channel object
   */
  openScheduleModal(channel) {
    logger.debug('Открытие модального окна планирования встречи:', {
      channel: channel.display_name || channel.name,
      channelId: channel.id,
      channelType: channel.type
    });

    // Check if webhook URL is configured
    if (!this.pluginCore.isWebhookConfigured()) {
      const serviceName = this.pluginCore.getServiceName();
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
    if (!isReactAvailable()) {
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
      this.currentModal = renderReactComponent(
        createElementWithProps(ScheduleMeetingModal, {
          channel: this.currentChannel,
          onClose: () => {
            logger.debug('Модальное окно закрыто - вызов closeScheduleModal');
            this.closeScheduleModal();
          },
          onSuccess: () => {
            logger.debug('Meeting scheduled successfully - вызов closeScheduleModal');
            this.closeScheduleModal();
          }
        }),
        this.modalContainer
      );
    } else {
      // Размонтировать модалку если она закрыта
      unmountReactComponent(this.modalContainer);
      this.currentModal = null;
    }
  }

  /**
   * Unregister modal (cleanup)
   */
  unregister() {
    if (this.modalContainer) {
      unmountReactComponent(this.modalContainer);
      if (this.modalContainer.parentNode) {
        this.modalContainer.parentNode.removeChild(this.modalContainer);
      }
      this.modalContainer = null;
    }
    this.currentModal = null;
    this.isModalOpen = false;
    this.currentChannel = null;
  }
}

