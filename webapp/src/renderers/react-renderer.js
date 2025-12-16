/**
 * React rendering utilities
 * @module renderers/react-renderer
 */

import { logger } from '../utils/logger.js';

/**
 * Render React component to container
 * @param {Object} component - React component or element
 * @param {HTMLElement} container - DOM container element
 * @returns {Object|null} Rendered component instance or null
 */
export function renderReactComponent(component, container) {
  const React = window.React;
  const ReactDOM = window.ReactDOM;

  if (!React || !ReactDOM) {
    logger.error('React не доступен для рендеринга');
    return null;
  }

  if (!container) {
    logger.error('Контейнер не предоставлен');
    return null;
  }

  try {
    return ReactDOM.render(component, container);
  } catch (error) {
    logger.error('Ошибка при рендеринге React компонента:', error);
    return null;
  }
}

/**
 * Unmount React component from container
 * @param {HTMLElement} container - DOM container element
 * @returns {boolean} True if unmounted successfully
 */
export function unmountReactComponent(container) {
  const ReactDOM = window.ReactDOM;

  if (!ReactDOM) {
    logger.error('ReactDOM не доступен для размонтирования');
    return false;
  }

  if (!container) {
    logger.error('Контейнер не предоставлен');
    return false;
  }

  try {
    if (container.hasChildNodes() || container.innerHTML) {
      ReactDOM.unmountComponentAtNode(container);
      container.innerHTML = '';
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Ошибка при размонтировании React компонента:', error);
    // Force cleanup
    if (container) {
      container.innerHTML = '';
    }
    return false;
  }
}

/**
 * Create React element with props
 * @param {Function|string} type - Component type or HTML tag
 * @param {Object} props - Component props
 * @param {...any} children - Child elements
 * @returns {Object} React element
 */
export function createElementWithProps(type, props, ...children) {
  const React = window.React;

  if (!React || !React.createElement) {
    logger.error('React не доступен для создания элементов');
    return null;
  }

  try {
    return React.createElement(type, props, ...children);
  } catch (error) {
    logger.error('Ошибка при создании React элемента:', error);
    return null;
  }
}

/**
 * Check if React is available
 * @returns {boolean} True if React is available
 */
export function isReactAvailable() {
  return !!(window.React && window.React.createElement && window.ReactDOM);
}




