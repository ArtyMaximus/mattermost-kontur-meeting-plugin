import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
// Импортируем только DayPicker для минимизации размера бандла
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { formatErrorMessage, getCurrentUserInfo } from '../utils/helpers.js';
import { DEFAULT_TIMEZONE, REQUEST_FIELDS, ERROR_FIELD_MAP } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import ErrorBoundary from './error_boundary.jsx';
import {
  DurationSelector,
  ParticipantSelector,
  TimeSelector,
  TimePresets
} from './modal_components.jsx';
import './schedule-meeting-modal.css';

const ScheduleMeetingModal = ({channel, postId, rootId, onClose, onSuccess}) => {
  // Определяем, является ли канал директом (DM)
  const isDirectChannel = channel && channel.type === 'D';

  // Определяем источник открытия модалки (Post Action vs кнопка в шапке)
  const isFromThread = Boolean(rootId || postId);

  // Состояние для ленивой загрузки секций
  const [isReady, setIsReady] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Разделяем дату и время на отдельные состояния
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState('');
  const [selectedMinute, setSelectedMinute] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [duration, setDuration] = useState('60');
  const [meetingTitle, setMeetingTitle] = useState(channel.display_name || channel.name || '');
  const [participants, setParticipants] = useState([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedQuick, setSelectedQuick] = useState(null);
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [mouseDownOutside, setMouseDownOutside] = useState(false);

  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const calendarRef = useRef(null);

  // Helper function to reset form state (оптимизировано - один setState)
  const resetForm = () => {
    // Используем один setState для всех полей формы
    setSelectedDate(null);
    setSelectedHour('');
    setSelectedMinute('');
    setShowCalendar(false);
    setDuration('60');
    setMeetingTitle(channel.display_name || channel.name || '');
    setParticipants([]);
    setErrors({});
    setIsLoading(false);
    setIsSuccess(false);
    setSelectedQuick(null);
    setNotifyParticipants(true);
    setShowAdvanced(false);
    setIsReady(false);
  };

  // Обработчики кликов по фону модального окна (backdrop)
  const handleBackdropMouseDown = (e) => {
    // Считаем клик "вне модалки" только если событие произошло на самом backdrop
    if (e.target === e.currentTarget) {
      setMouseDownOutside(true);
    } else {
      setMouseDownOutside(false);
    }
  };

  const handleBackdropMouseUp = (e) => {
    // Закрываем модалку только если и mousedown, и mouseup были на backdrop
    if (e.target === e.currentTarget && mouseDownOutside) {
      resetForm();
      onClose();
    }
    // В любом случае сбрасываем флаг
    setMouseDownOutside(false);
  };

  const handleBackdropMouseLeave = () => {
    // Если мышь ушла с backdrop с зажатой кнопкой — не считаем это кликом по фону
    setMouseDownOutside(false);
  };

  // Оптимизация: отложенная инициализация для быстрого открытия модалки
  useEffect(() => {
    // Показываем модалку сразу, загружаем остальное асинхронно
    requestAnimationFrame(() => {
      setIsReady(true);
      // Включаем анимации секций после монтирования
      if (modalRef.current) {
        modalRef.current.classList.add('loaded');
      }

      // Показываем продвинутые секции через небольшую задержку
      setTimeout(() => {
        setShowAdvanced(true);
      }, 50);
    });
  }, []);


  // Закрытие по Escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        resetForm();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, channel]);

  // Поиск пользователей (оптимизировано - отложенный поиск для десктопа)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (participantSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    // Увеличиваем debounce для десктопного приложения
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Асинхронная функция поиска
        const performSearch = async () => {
          const response = await fetch(`/api/v4/users/search`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
              term: participantSearch,
              team_id: channel.team_id || ''
            })
          });

          if (response.ok) {
            const users = await response.json();
            // Исключить уже выбранных участников
            const filtered = users.filter(user =>
              !participants.some(p => p.id === user.id)
            );
            setSearchResults(filtered);
          } else {
            setSearchResults([]);
          }
        };

        // Для Electron используем requestIdleCallback, если доступен
        if (window.requestIdleCallback) {
          requestIdleCallback(async () => {
            await performSearch();
            setIsSearching(false);
          }, { timeout: 500 });
        } else {
          // Fallback для браузеров
          requestAnimationFrame(async () => {
            await performSearch();
            setIsSearching(false);
          });
        }
      } catch (error) {
        logger.error('Ошибка поиска пользователей:', error);
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [participantSearch, participants, channel.team_id]);

  // Добавить участника
  const addParticipant = (user) => {
    if (!participants.some(p => p.id === user.id)) {
      setParticipants([...participants, {
        id: user.id,
        username: user.username,
        email: user.email || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null
      }]);
      setParticipantSearch('');
      setSearchResults([]);
    }
  };

  // Удалить участника
  const removeParticipant = (userId) => {
    setParticipants(participants.filter(p => p.id !== userId));
  };

  // Новая функция: единый источник правды для времени с учетом таймзоны пользователя
  const buildDateTimeInfo = (date, hour, minute, durationMinutes) => {
    if (!date || hour === '' || minute === '') {
      return {
        startAtUTC: null,
        startAtLocal: null,
        start_time_client: null,
        end_time_client: null,
        start_time_utc: null,
        end_time_utc: null,
        start_time_msk: null,
        end_time_msk: null,
        timezone: null
      };
    }

    const hours = parseInt(hour, 10);
    const minutes = parseInt(minute, 10);
    const duration = parseInt(durationMinutes, 10) || 60;

    // 1. Локальное время пользователя (Date в его таймзоне)
    const localStart = new Date(date);
    localStart.setHours(hours, minutes, 0, 0);

    const localEnd = new Date(localStart.getTime() + duration * 60 * 1000);

    // 2. Таймзона пользователя (IANA)
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Вспомогательная функция для формирования строки с офсетом клиента
    const formatWithClientOffset = (d) => {
      const tzOffsetMin = d.getTimezoneOffset(); // в минутах, для +05:00 будет -300
      const offsetAbs = Math.abs(tzOffsetMin);
      const offsetSign = tzOffsetMin <= 0 ? '+' : '-';
      const offsetHours = String(Math.floor(offsetAbs / 60)).padStart(2, '0');
      const offsetMinutes = String(offsetAbs % 60).padStart(2, '0');
      const offsetStr = `${offsetSign}${offsetHours}:${offsetMinutes}`;

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');

      return {
        iso: `${y}-${m}-${dd}T${hh}:${mm}:00${offsetStr}`,
        offsetStr,
        tzOffsetMin,
      };
    };

    const startClient = formatWithClientOffset(localStart);
    const endClient = formatWithClientOffset(localEnd);

    // 3. UTC время
    const startUtcISO = localStart.toISOString(); // 2025-12-17T14:30:00.000Z
    const endUtcISO = localEnd.toISOString();

    // 4. Время в МСК (Europe/Moscow) - правильная конвертация через Intl API
    const formatMsk = (utcDateStr) => {
      const utcDate = new Date(utcDateStr);
      // Используем Intl.DateTimeFormat для правильной конвертации в МСК
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(utcDate);
      const year = parts.find(p => p.type === 'year').value;
      const month = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      const hours = parts.find(p => p.type === 'hour').value;
      const minutes = parts.find(p => p.type === 'minute').value;

      // МСК всегда UTC+3 (с 2014 года)
      return `${year}-${month}-${day}T${hours}:${minutes}:00+03:00`;
    };

    const startMsk = formatMsk(startUtcISO);
    const endMsk = formatMsk(endUtcISO);

    logger.debug('[Kontur] Time calculation', {
      clientTimeZone,
      start_time_client: startClient.iso,
      end_time_client: endClient.iso,
      start_time_utc: startUtcISO,
      end_time_utc: endUtcISO,
      start_time_msk: startMsk,
      end_time_msk: endMsk,
    });

    // Для обратной совместимости сохраняем старые поля
    const year = localStart.getFullYear();
    const month = String(localStart.getMonth() + 1).padStart(2, '0');
    const day = String(localStart.getDate()).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const startAtLocal = `${year}-${month}-${day}T${hoursStr}:${minutesStr}:00+03:00`;

    return {
      // Новые поля
      start_time_client: startClient.iso,
      end_time_client: endClient.iso,
      start_time_utc: startUtcISO,
      end_time_utc: endUtcISO,
      start_time_msk: startMsk,
      end_time_msk: endMsk,
      timezone: clientTimeZone,
      // Старые поля для обратной совместимости
      startAtUTC: startUtcISO,
      startAtLocal: startAtLocal,
    };
  };

  // Валидация формы
  const validate = () => {
    const newErrors = {};

    if (!selectedDate) {
      newErrors.meetingDatetime = 'Дата обязательна';
    } else {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const selectedDateOnly = new Date(selectedDate);
      selectedDateOnly.setHours(0, 0, 0, 0);

      if (selectedDateOnly < now) {
        newErrors.meetingDatetime = 'Дата не может быть в прошлом';
      }
      const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней
      if (selectedDateOnly > maxDate) {
        newErrors.meetingDatetime = 'Дата не может быть более чем через 30 дней';
      }
    }

    if (selectedHour === '' || selectedMinute === '') {
      newErrors.meetingTime = 'Время обязательно';
    } else if (selectedDate) {
      // Проверка, что выбранное время не в прошлом, если дата сегодня
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const selectedDateOnly = new Date(selectedDate);
      selectedDateOnly.setHours(0, 0, 0, 0);

      if (selectedDateOnly.getTime() === today.getTime()) {
        const hours = parseInt(selectedHour, 10);
        const minutes = parseInt(selectedMinute, 10);
        const selectedDateTime = new Date(selectedDate);
        selectedDateTime.setHours(hours, minutes, 0, 0);

        if (selectedDateTime < now) {
          newErrors.meetingTime = 'Время не может быть в прошлом';
        }
      }
    }

    if (!duration) {
      newErrors.duration = 'Продолжительность обязательна';
    }

    if (meetingTitle && meetingTitle.length > 100) {
      newErrors.meetingTitle = 'Название не может быть длиннее 100 символов';
    }

    // Для DM каналов участники необязательны (собеседник добавляется автоматически на сервере)
    if (!isDirectChannel && participants.length === 0) {
      newErrors.participants = 'Необходимо выбрать хотя бы одного участника';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Получить текущего пользователя и team_id из Redux store
  const getUserInfo = () => {
    return getCurrentUserInfo(channel);
  };

  // Helper function to build request payload
  const buildScheduleRequest = () => {
    const userInfo = getUserInfo();
    const timeInfo = buildDateTimeInfo(selectedDate, selectedHour, selectedMinute, duration);

    // Get service name from config
    const config = window.KonturMeetingPlugin && window.KonturMeetingPlugin.config;
    const serviceName = config?.ServiceName || '';

    const requestBody = {
      [REQUEST_FIELDS.CHANNEL_ID]: channel.id,
      [REQUEST_FIELDS.TEAM_ID]: userInfo.team_id,
      [REQUEST_FIELDS.USER_ID]: userInfo.user_id,
      // Новые поля с правильной обработкой таймзон
      start_time_client: timeInfo.start_time_client,
      end_time_client: timeInfo.end_time_client,
      start_time_utc: timeInfo.start_time_utc,
      end_time_utc: timeInfo.end_time_utc,
      start_time_msk: timeInfo.start_time_msk,
      end_time_msk: timeInfo.end_time_msk,
      timezone: timeInfo.timezone,
      // Старые поля для обратной совместимости
      [REQUEST_FIELDS.START_AT]: timeInfo.startAtUTC,
      [REQUEST_FIELDS.START_AT_LOCAL]: timeInfo.startAtLocal,
      [REQUEST_FIELDS.TIMEZONE]: timeInfo.timezone || DEFAULT_TIMEZONE,
      [REQUEST_FIELDS.DURATION_MINUTES]: parseInt(duration, 10),
      [REQUEST_FIELDS.TITLE]: meetingTitle.trim() || null,
      [REQUEST_FIELDS.PARTICIPANT_IDS]: participants.map(p => p.id),
      notify_participants: notifyParticipants,
      create_google_calendar_event: true,
      service_name: serviceName
    };

    // Добавляем root_id если модалка открыта из Post Action (тред)
    if (rootId) {
      requestBody.root_id = rootId;
      logger.debug('Добавлен root_id в запрос', { rootId, postId });
    }

    return requestBody;
  };

  // Helper function to handle API errors
  const handleApiError = async (response) => {
    let result;
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('Пустой ответ от сервера');
      }
      result = JSON.parse(text);
    } catch (parseError) {
      console.error('[Kontur] Ошибка парсинга ответа:', parseError);
      throw new Error(`Неверный ответ от сервера (статус ${response.status}): ${parseError.message}`);
    }

    // Handle validation errors
    if (result.errors && Array.isArray(result.errors)) {
      const validationErrors = {};
      let generalError = null;

          result.errors.forEach(error => {
            if (error.field) {
              const mappedField = ERROR_FIELD_MAP[error.field] || error.field;

          if (mappedField === 'general') {
            generalError = error.message;
          } else {
            validationErrors[mappedField] = error.message;
          }
        }
      });

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      if (generalError) {
        throw new Error(generalError);
      }
    }

    if (result.message) {
      throw new Error(result.message);
    }

    throw new Error(`Не удалось создать встречу (статус ${response.status})`);
  };

  // Отправка формы
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setIsLoading(true);

    try {
      const requestBody = buildScheduleRequest();

      logger.debug('Отправка запроса на создание встречи:', requestBody);

      const response = await fetch('/plugins/com.skyeng.kontur-meeting/api/schedule-meeting', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('[Kontur] Ошибка от сервера:', {
          status: response.status,
          statusText: response.statusText
        });

        await handleApiError(response);
        setIsLoading(false);
        return;
      }

      // Success
      logger.debug('Meeting scheduled successfully');

      setIsLoading(false);
      setIsSuccess(true);

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        resetForm();
        onClose();
      }, 1000);

    } catch (error) {
      logger.error('Ошибка при создании встречи:', error);

      setIsLoading(false);
      const config = window.KonturMeetingPlugin && window.KonturMeetingPlugin.config;
      const errorMessage = formatErrorMessage(error, config);
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Получить минимальную дату (сегодня)
  const getMinDate = () => {
    return new Date();
  };

  // Получить максимальную дату (+30 дней)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate;
  };

  // Обработчик изменения времени через селекты (оптимизировано)
  const handleTimeChange = (hour, minute) => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    // Очистить ошибку времени при выборе
    if (errors.meetingTime) {
      setErrors(prevErrors => {
        const newErrors = {...prevErrors};
        delete newErrors.meetingTime;
        return newErrors;
      });
    }
  };

  // Обработчики пресетов времени
  const applyTimePreset = (presetType) => {
    setSelectedQuick(presetType);
    const now = new Date();
    let targetDate = selectedDate;
    let targetHour = '';
    let targetMinute = '';

    switch (presetType) {
      case '15min': {
        // Через 15 минут: добавляем 15 минут к текущему времени
        const in15Min = new Date(now.getTime() + 15 * 60 * 1000);
        // Если дата не выбрана, используем дату из "через 15 минут"
        if (!selectedDate) {
          targetDate = new Date(in15Min.getFullYear(), in15Min.getMonth(), in15Min.getDate());
        }
        // Время всегда берем из "текущее + 15 минут", округленное до 5 минут
        targetHour = String(in15Min.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in15Min.getMinutes() / 5) * 5).padStart(2, '0');
        break;
      }
      case '30min': {
        // Через 30 минут: добавляем 30 минут к текущему времени
        const in30Min = new Date(now.getTime() + 30 * 60 * 1000);
        if (!selectedDate) {
          targetDate = new Date(in30Min.getFullYear(), in30Min.getMonth(), in30Min.getDate());
        }
        targetHour = String(in30Min.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in30Min.getMinutes() / 5) * 5).padStart(2, '0');
        break;
      }
      case '1hour': {
        // Через 1 час: добавляем 1 час к текущему времени
        const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
        if (!selectedDate) {
          targetDate = new Date(in1Hour.getFullYear(), in1Hour.getMonth(), in1Hour.getDate());
        }
        targetHour = String(in1Hour.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in1Hour.getMinutes() / 5) * 5).padStart(2, '0');
        break;
      }
      case '2hours': {
        // Через 2 часа: добавляем 2 часа к текущему времени
        const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        if (!selectedDate) {
          targetDate = new Date(in2Hours.getFullYear(), in2Hours.getMonth(), in2Hours.getDate());
        }
        targetHour = String(in2Hours.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in2Hours.getMinutes() / 5) * 5).padStart(2, '0');
        break;
      }
      default:
        return;
    }

    // Обновляем состояние - оптимизировано (минимизируем количество setState)
    if (targetDate && !selectedDate) {
      setSelectedDate(targetDate);
    }
    // Объединяем обновления времени в один setState через функцию
    setSelectedHour(targetHour);
    setSelectedMinute(targetMinute);

    // Очистить ошибки - оптимизировано (один setState)
    if (errors.meetingTime || (errors.meetingDatetime && targetDate)) {
      const newErrors = {...errors};
      if (errors.meetingTime) delete newErrors.meetingTime;
      if (errors.meetingDatetime && targetDate) delete newErrors.meetingDatetime;
      setErrors(newErrors);
    }
  };

  // Обработчик выбора даты (оптимизировано)
  const handleDateSelect = (date) => {
    if (date) {
      setSelectedDate(date);
      setShowCalendar(false);
      // Очистить ошибку даты при выборе
      if (errors.meetingDatetime) {
        setErrors(prevErrors => {
          const newErrors = {...prevErrors};
          delete newErrors.meetingDatetime;
          return newErrors;
        });
      }
    }
  };

  // Закрытие календаря при клике вне
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendar]);

  // Get service name from config
  const config = window.KonturMeetingPlugin && window.KonturMeetingPlugin.config;
  const serviceName = config?.ServiceName || '';

  // Получаем информацию о таймзоне пользователя
  const getTimezoneInfo = () => {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const offsetMinutes = now.getTimezoneOffset(); // отрицательное для UTC+
      const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
      const offsetMins = Math.abs(offsetMinutes % 60);
      const offsetSign = offsetMinutes <= 0 ? '+' : '-';
      const offsetStr = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
      return {
        timeZone,
        offsetStr
      };
    } catch (error) {
      logger.error('Failed to get timezone info', error);
      return {
        timeZone: 'Unknown',
        offsetStr: 'UTC+00:00'
      };
    }
  };

  const timezoneInfo = getTimezoneInfo();

  return (
    <ErrorBoundary>
      <div
        className="schedule-meeting-modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--center-channel-color-64, rgba(0, 0, 0, 0.5))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      onMouseLeave={handleBackdropMouseLeave}
    >
      <div
        ref={modalRef}
        className={`schedule-meeting-modal ${isReady ? 'loaded' : ''}`}
        style={{
          backgroundColor: 'var(--center-channel-bg, #fff)',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{
          margin: '0 0 16px 0',
          fontSize: '20px',
          fontWeight: '600',
          color: 'var(--center-channel-color, #000)'
        }}>
          {serviceName ? `Запланировать встречу ${serviceName}` : 'Запланировать встречу'}
        </h2>

        <p style={{
          margin: '0 0 24px 0',
          fontSize: '14px',
          color: 'var(--center-channel-color-64, #666)'
        }}>
          Заполните форму для создания запланированной встречи
        </p>

        {/* Индикатор контекста - показывает куда будет отправлено сообщение */}
        <div className="meeting-context-info">
          {isFromThread ? (
            <>
              <span className="context-icon">💬</span>
              <span className="context-text">
                Сообщение будет отправлено в тред, где было выбрано действие
              </span>
            </>
          ) : (
            <>
              <span className="context-icon">📢</span>
              <span className="context-text">
                Сообщение будет создано в {isDirectChannel ? 'директе' : 'канале'} новым сообщением
              </span>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Дата и время */}
          <div className="form-section date-time" style={{marginBottom: '20px'}}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--center-channel-color, #000)'
            }}>
              Дата и время встречи <span style={{color: 'red'}}>*</span>
            </label>
            <div style={{
              fontSize: '12px',
              color: 'var(--center-channel-color-64, #999)',
              marginBottom: '8px'
            }}>
              Время указывается в вашем локальном времени (браузера).
            </div>

            {/* Поле выбора даты */}
            <div style={{marginBottom: '12px', position: 'relative'}}>
              <input
                type="text"
                value={selectedDate ? selectedDate.toLocaleDateString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }) : ''}
                onClick={() => setShowCalendar(!showCalendar)}
                readOnly
                placeholder="Выберите дату"
                className={errors.meetingDatetime ? 'error' : ''}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: `1px solid ${errors.meetingDatetime ? 'red' : 'var(--center-channel-color-16, #ccc)'}`,
                  borderRadius: '4px',
                  backgroundColor: 'var(--center-channel-bg, #fff)',
                  color: 'var(--center-channel-color, #000)',
                  cursor: 'pointer'
                }}
              />
              {showCalendar && (
                <div
                  ref={calendarRef}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    zIndex: 1000,
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    border: '1px solid var(--center-channel-color-16, #ccc)',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    padding: '8px'
                  }}
                >
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const maxDate = new Date(today);
                      maxDate.setDate(maxDate.getDate() + 30);
                      const dateOnly = new Date(date);
                      dateOnly.setHours(0, 0, 0, 0);
                      return dateOnly < today || dateOnly > maxDate;
                    }}
                    fromDate={getMinDate()}
                    toDate={getMaxDate()}
                    numberOfMonths={1}
                    styles={{
                      root: {
                        fontSize: '14px',
                        color: 'var(--center-channel-color, #000)'
                      },
                      day: {
                        color: 'var(--center-channel-color, #000)'
                      },
                      day_selected: {
                        backgroundColor: 'var(--button-bg, #2389D7)',
                        color: 'var(--button-color, #fff)'
                      },
                      day_disabled: {
                        color: 'var(--center-channel-color-32, #999)',
                        opacity: 0.5
                      }
                    }}
                  />
                </div>
              )}
              {errors.meetingDatetime && (
                <div className="error-message">
                  {errors.meetingDatetime}
                </div>
              )}
            </div>

            {/* Селекты времени и пресеты */}
            <TimeSelector
              selectedHour={selectedHour}
              selectedMinute={selectedMinute}
              handleTimeChange={handleTimeChange}
              errors={errors}
            />

            <TimePresets applyTimePreset={applyTimePreset} selectedQuick={selectedQuick} />

            {/* Информация о таймзоне пользователя */}
            <div style={{
              fontSize: '12px',
              color: 'var(--center-channel-color-64, #999)',
              marginTop: '8px',
              fontStyle: 'italic'
            }}>
              Ваш часовой пояс (по данным браузера): {timezoneInfo.timeZone} ({timezoneInfo.offsetStr})
            </div>
          </div>

          {/* Продолжительность */}
          <div className="form-section duration">
            <DurationSelector
              duration={duration}
              setDuration={setDuration}
              errors={errors}
            />
          </div>

          {/* Название встречи */}
          <div className="form-section meeting-name" style={{marginBottom: '20px'}}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--center-channel-color, #000)'
            }}>
              Название встречи
            </label>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Обсуждение проекта"
              maxLength={100}
              className={errors.meetingTitle ? 'error' : ''}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: `1px solid ${errors.meetingTitle ? 'red' : 'var(--center-channel-color-16, #ccc)'}`,
                borderRadius: '4px',
                backgroundColor: 'var(--center-channel-bg, #fff)',
                color: 'var(--center-channel-color, #000)'
              }}
            />
            {errors.meetingTitle && (
              <div className="error-message">
                {errors.meetingTitle}
              </div>
            )}
            <div className="field-hint">
              Опционально, максимум 100 символов
            </div>
          </div>

          {/* Участники - ленивая загрузка */}
          {showAdvanced && (
            <div className="form-section participants">
              <ParticipantSelector
              isDirectChannel={isDirectChannel}
              participantSearch={participantSearch}
              setParticipantSearch={setParticipantSearch}
              searchResults={searchResults}
              addParticipant={addParticipant}
              participants={participants}
              removeParticipant={removeParticipant}
              errors={errors}
              searchInputRef={searchInputRef}
            />
            </div>
          )}

          {/* Чекбокс уведомлений - ленивая загрузка */}
          {showAdvanced && (
            <div className="form-section notification-checkbox">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={notifyParticipants}
                  onChange={(e) => setNotifyParticipants(e.target.checked)}
                />
                <span className="checkbox-icon">🔔</span>
                <span>Уведомить участников в Time</span>
              </label>
              <div className="field-hint">
                Участники получат уведомление о запланированной встрече
              </div>
            </div>
          )}

          {/* Информация о Google Calendar - ленивая загрузка */}
          {showAdvanced && (
            <div className="form-section google-calendar-info" style={{
              marginTop: '12px',
              padding: '10px 12px',
              backgroundColor: 'var(--center-channel-color-04, #f8f9fa)',
              borderRadius: '4px',
              fontSize: '13px',
              color: 'var(--center-channel-color-72, #555)',
              lineHeight: '1.4'
            }}>
              <span style={{marginRight: '6px'}}>📅</span>
              <span>В Google Calendar: участники получат событие автоматически через приглашение на почту, организатору добавится через n8n.</span>
            </div>
          )}

          {/* Кнопки */}
          <div className="modal-actions" style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid var(--center-channel-color-16, #eee)'
          }}>
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid var(--center-channel-color-16, #ccc)',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: 'var(--center-channel-color, #000)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              className={`create-button ${isLoading ? 'loading' : ''} ${isSuccess ? 'success' : ''}`}
              disabled={isSubmitting || isLoading || isSuccess}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: isSubmitting || isLoading ? 'var(--center-channel-color-32, #999)' : 'var(--button-bg, #2389D7)',
                color: 'var(--button-color, #fff)',
                cursor: (isSubmitting || isLoading || isSuccess) ? 'not-allowed' : 'pointer',
                fontWeight: '600'
              }}
            >
              {isSuccess ? '' : (isLoading ? 'Создание...' : 'Создать встречу')}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ErrorBoundary>
  );
};

ScheduleMeetingModal.propTypes = {
  channel: PropTypes.object.isRequired,
  postId: PropTypes.string,
  rootId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func
};

export default ScheduleMeetingModal;
