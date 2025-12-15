/**
 * Dropdown manager - handles dropdown menu in channel header
 * @module managers/dropdown-manager
 */

import { logger } from '../utils/logger.js';
import { renderReactComponent, unmountReactComponent, createElementWithProps, isReactAvailable } from '../renderers/react-renderer.js';

/**
 * Dropdown manager class
 */
export class DropdownManager {
  constructor(pluginCore) {
    this.pluginCore = pluginCore;
    this.isDropdownOpen = false;
    this.dropdownChannel = null;
    this.dropdownContainer = null;
    this.onInstantCall = null;
    this.onScheduleMeeting = null;
    this.onAboutPlugin = null;
  }

  /**
   * Set callbacks for dropdown actions
   * @param {Function} onInstantCall - Callback for instant call
   * @param {Function} onScheduleMeeting - Callback for schedule meeting
   * @param {Function} onAboutPlugin - Callback for about plugin
   */
  setCallbacks(onInstantCall, onScheduleMeeting, onAboutPlugin) {
    this.onInstantCall = onInstantCall;
    this.onScheduleMeeting = onScheduleMeeting;
    this.onAboutPlugin = onAboutPlugin;
  }

  /**
   * Open dropdown menu
   * @param {Object} channel - Current channel object
   * @param {Object} channelMember - Channel member object
   */
  openDropdown(channel, channelMember) {
    logger.debug('Opening dropdown menu for channel:', channel.id);
    this.dropdownChannel = channel;
    this.isDropdownOpen = true;
    this.renderDropdown();
  }

  /**
   * Close dropdown menu
   */
  closeDropdown() {
    logger.debug('Closing dropdown menu');
    this.isDropdownOpen = false;
    this.dropdownChannel = null;
    this.renderDropdown();
  }

  /**
   * Render dropdown based on isDropdownOpen state
   */
  renderDropdown() {
    if (!isReactAvailable()) {
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
      const DropdownMenu = this._createDropdownComponent();
      const React = window.React;
      renderReactComponent(
        React.createElement(DropdownMenu),
        this.dropdownContainer
      );
    } else {
      // Unmount dropdown
      unmountReactComponent(this.dropdownContainer);
    }
  }

  /**
   * Create dropdown menu component
   * @private
   * @returns {Function} React component function
   */
  _createDropdownComponent() {
    const React = window.React;
    const manager = this;

    return function DropdownMenu() {
      const [isOpen, setIsOpen] = React.useState(true);
      const dropdownRef = React.useRef(null);

      React.useEffect(() => {
        const handleClickOutside = (event) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            // Check if click is not on the plugin button
            const button = document.querySelector('[data-plugin-id="kontur-meeting-button"]');
            if (!button || !button.contains(event.target)) {
              manager.closeDropdown();
            }
          }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
          document.removeEventListener('mousedown', handleClickOutside);
        };
      }, []);

      const handleInstantCall = () => {
        if (manager.onInstantCall) {
          manager.onInstantCall(manager.dropdownChannel);
        }
        manager.closeDropdown();
      };

      const handleScheduleMeeting = () => {
        if (manager.onScheduleMeeting) {
          manager.onScheduleMeeting(manager.dropdownChannel);
        }
        manager.closeDropdown();
      };

      const handleAboutPlugin = () => {
        if (manager.onAboutPlugin) {
          manager.onAboutPlugin();
        }
        manager.closeDropdown();
      };

      // Find plugin button position using multiple fallback strategies
      // Primary: search by SVG icon ID
      let button = document.getElementById('kontur-meeting-button-icon')?.closest('button');
      
      // Fallback #1: search by aria-label
      if (!button) {
        button = document.querySelector('button[aria-label*="Kontur Meeting Plugin"]');
      }
      
      // Fallback #2: search by channel header icon class and viewBox
      if (!button) {
        const svg = document.querySelector('.channel-header__icon svg[viewBox="0 0 32 32"]');
        if (svg) {
          button = svg.closest('button');
        }
      }
      
      // Fallback #3: search by data-plugin-id (legacy)
      if (!button) {
        button = document.querySelector('[data-plugin-id="kontur-meeting-button"]');
      }

      if (!button) {
        logger.error('[Kontur Plugin] Channel header button not found');
        // Use fallback position
        const dropdownStyle = {
          position: 'fixed',
          top: '60px',
          right: '16px',
          background: 'var(--center-channel-bg, #fff)',
          border: '1px solid var(--center-channel-color-16, rgba(0,0,0,0.1))',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 10000,
          minWidth: '200px',
          padding: '4px 0'
        };
        return createElementWithProps('div', { ref: dropdownRef, style: dropdownStyle }, []);
      }

      const buttonRect = button.getBoundingClientRect();

      // Calculate dropdown position relative to button
      // Dropdown height is approximately 200px (3 menu items + padding + dividers)
      const dropdownHeight = 200;
      const spacing = 4; // spacing between button and dropdown
      
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      
      let dropdownStyle = {
        position: 'fixed',
        right: '16px',
        background: 'var(--center-channel-bg, #fff)',
        border: '1px solid var(--center-channel-color-16, rgba(0,0,0,0.1))',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 10000,
        minWidth: '200px',
        padding: '4px 0'
      };

      if (spaceBelow >= dropdownHeight) {
        // Enough space below — open downward
        dropdownStyle.top = `${buttonRect.bottom + spacing}px`;
        dropdownStyle.bottom = 'auto';
      } else if (spaceAbove >= dropdownHeight) {
        // Not enough space below, but enough above — open upward
        dropdownStyle.top = `${buttonRect.top - dropdownHeight - spacing}px`;
        dropdownStyle.bottom = 'auto';
      } else {
        // Not enough space in either direction — prefer downward, but adjust if needed
        if (spaceBelow >= spaceAbove) {
          // More space below — open downward (may be partially off-screen)
          dropdownStyle.top = `${buttonRect.bottom + spacing}px`;
          dropdownStyle.bottom = 'auto';
        } else {
          // More space above — open upward (may be partially off-screen)
          dropdownStyle.top = `${buttonRect.top - dropdownHeight - spacing}px`;
          dropdownStyle.bottom = 'auto';
        }
      }

      return createElementWithProps(
        'div',
        {
          ref: dropdownRef,
          style: dropdownStyle
        },
        [
          // Instant call button
          createElementWithProps(
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
          createElementWithProps('div', {
            key: 'divider',
            style: {
              height: '1px',
              background: 'var(--center-channel-color-16, rgba(0,0,0,0.1))',
              margin: '4px 0'
            }
          }),
          // Schedule meeting button
          createElementWithProps(
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
          ),
          // Divider
          createElementWithProps('div', {
            key: 'divider2',
            style: {
              height: '1px',
              background: 'var(--center-channel-color-16, rgba(0,0,0,0.1))',
              margin: '4px 0'
            }
          }),
          // About plugin button
          createElementWithProps(
            'button',
            {
              key: 'about',
              onClick: handleAboutPlugin,
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
            'ℹ️ О плагине'
          )
        ]
      );
    };
  }

  /**
   * Unregister dropdown (cleanup)
   */
  unregister() {
    if (this.dropdownContainer) {
      unmountReactComponent(this.dropdownContainer);
      if (this.dropdownContainer.parentNode) {
        this.dropdownContainer.parentNode.removeChild(this.dropdownContainer);
      }
      this.dropdownContainer = null;
    }
    this.isDropdownOpen = false;
    this.dropdownChannel = null;
  }
}

