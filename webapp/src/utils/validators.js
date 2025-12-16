/**
 * Утилиты для валидации данных
 * Защита от некорректных данных, которые могут вызвать краш
 */

/**
 * Валидация объекта поста
 * @param {Object} post - Объект поста
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePost(post) {
  // Проверка на null/undefined
  if (!post) {
    return { valid: false, error: 'Post is null or undefined' };
  }

  // Проверка что это объект, а не массив или другой тип
  if (typeof post !== 'object') {
    return { valid: false, error: `Post is not an object, got: ${typeof post}` };
  }

  // Проверка что это не массив
  if (Array.isArray(post)) {
    return { valid: false, error: 'Post is an array, expected object' };
  }

  // Проверка что объект не пустой
  const keys = Object.keys(post);
  if (keys.length === 0) {
    return { valid: false, error: 'Post object is empty' };
  }

  // Mattermost может использовать разные поля для ID
  // Проверяем все возможные варианты
  const postId = post.id || post.post_id || post.postId;
  if (!postId) {
    // Логируем для отладки
    console.debug('[Kontur] Post ID not found, post keys:', keys, 'post:', post);
    return { valid: false, error: 'Post ID missing or invalid' };
  }

  // Проверяем что ID - строка или число (Mattermost может передавать число)
  if (typeof postId !== 'string' && typeof postId !== 'number') {
    console.debug('[Kontur] Post ID has invalid type:', typeof postId, postId);
    return { valid: false, error: 'Post ID has invalid type' };
  }

  // Channel ID тоже может быть в разных полях
  const channelId = post.channel_id || post.channelId;
  if (!channelId) {
    console.debug('[Kontur] Channel ID not found in post');
    // Не критично - можем получить из текущего канала
    return { valid: true, warning: 'Channel ID not in post, will use current channel' };
  }

  return { valid: true };
}

/**
 * Валидация объекта канала
 * @param {Object} channel - Объект канала
 * @returns {{valid: boolean, error?: string}}
 */
export function validateChannel(channel) {
  if (!channel || typeof channel !== 'object') {
    return { valid: false, error: 'Invalid channel object' };
  }

  if (!channel.id || typeof channel.id !== 'string') {
    return { valid: false, error: 'Channel ID missing or invalid' };
  }

  return { valid: true };
}

/**
 * Безопасная фильтрация массива
 * Защита от ошибки ".filter is not a function"
 * @param {*} arr - Массив или что-то другое
 * @param {Function} filterFn - Функция фильтрации
 * @returns {Array}
 */
export function safeArrayFilter(arr, filterFn) {
  if (!Array.isArray(arr)) {
    console.error('[Kontur] Expected array, got:', typeof arr, arr);
    return [];
  }

  try {
    return arr.filter(filterFn);
  } catch (error) {
    console.error('[Kontur] Error filtering array:', error);
    return [];
  }
}

/**
 * Безопасное получение свойства объекта
 * @param {Object} obj - Объект
 * @param {string} path - Путь к свойству (например, 'user.id')
 * @param {*} defaultValue - Значение по умолчанию
 * @returns {*}
 */
export function safeGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  try {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result == null || typeof result !== 'object') {
        return defaultValue;
      }
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  } catch (error) {
    console.error('[Kontur] Error getting property:', path, error);
    return defaultValue;
  }
}

