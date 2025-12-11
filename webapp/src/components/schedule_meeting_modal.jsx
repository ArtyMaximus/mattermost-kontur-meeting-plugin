import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
// Импортируем только DayPicker для минимизации размера бандла
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { formatErrorMessage, getCurrentUserInfo } from '../utils/helpers.js';
import { DEFAULT_TIMEZONE, REQUEST_FIELDS, ERROR_FIELD_MAP } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { 
  DurationSelector, 
  ParticipantSelector,
  TimeSelector,
  TimePresets
} from './modal_components.jsx';

const ScheduleMeetingModal = ({channel, onClose, onSuccess}) => {
  // Определяем, является ли канал директом (DM)
  const isDirectChannel = channel && channel.type === 'D';
  
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
  
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const calendarRef = useRef(null);

  // Helper function to reset form state
  const resetForm = () => {
    setSelectedDate(null);
    setSelectedHour('');
    setSelectedMinute('');
    setShowCalendar(false);
    setDuration('60');
    setMeetingTitle(channel.display_name || channel.name || '');
    setParticipants([]);
    setErrors({});
  };

  // Закрытие при клике вне модального окна (по фону)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Закрывать только если клик по фону (не по содержимому модалки)
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        resetForm();
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, channel]);

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

  // Поиск пользователей
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (participantSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
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
      } catch (error) {
        logger.error('Ошибка поиска пользователей:', error);
        setSearchResults([]);
      } finally {
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

  // Функция для формирования дат (start_at и start_at_local)
  const buildDateTimeStrings = (date, hour, minute) => {
    if (!date || hour === '' || minute === '') {
      return { startAtUTC: null, startAtLocal: null };
    }

    const hours = parseInt(hour, 10);
    const minutes = parseInt(minute, 10);
    const startAtDate = new Date(date);
    startAtDate.setHours(hours, minutes, 0, 0);
    
    // Формируем строку в формате YYYY-MM-DDTHH:mm:ss+03:00 без перевода в UTC
    // MSK = UTC+3, поэтому используем +03:00
    const year = startAtDate.getFullYear();
    const month = String(startAtDate.getMonth() + 1).padStart(2, '0');
    const day = String(startAtDate.getDate()).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    
    // Локальное время в формате MSK (+03:00)
    const startAtLocal = `${year}-${month}-${day}T${hoursStr}:${minutesStr}:00+03:00`;
    
    // Также отправляем UTC для обратной совместимости
    const startAtUTC = startAtDate.toISOString();
    
    return { startAtUTC, startAtLocal };
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
    const { startAtUTC, startAtLocal } = buildDateTimeStrings(selectedDate, selectedHour, selectedMinute);

    return {
      [REQUEST_FIELDS.CHANNEL_ID]: channel.id,
      [REQUEST_FIELDS.TEAM_ID]: userInfo.team_id,
      [REQUEST_FIELDS.USER_ID]: userInfo.user_id,
      [REQUEST_FIELDS.START_AT]: startAtUTC,
      [REQUEST_FIELDS.START_AT_LOCAL]: startAtLocal,
      [REQUEST_FIELDS.TIMEZONE]: DEFAULT_TIMEZONE,
      [REQUEST_FIELDS.DURATION_MINUTES]: parseInt(duration, 10),
      [REQUEST_FIELDS.TITLE]: meetingTitle.trim() || null,
      [REQUEST_FIELDS.PARTICIPANT_IDS]: participants.map(p => p.id)
    };
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

    try {
      const requestBody = buildScheduleRequest();

      logger.log('Отправка запроса на создание встречи:', requestBody);

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
        return;
      }

      // Success
      logger.log('Meeting scheduled successfully');
      
      resetForm();
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();

    } catch (error) {
      logger.error('Ошибка при создании встречи:', error);
      
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

  // Обработчик изменения времени через селекты
  const handleTimeChange = (hour, minute) => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    // Очистить ошибку времени при выборе
    if (errors.meetingTime) {
      const newErrors = {...errors};
      delete newErrors.meetingTime;
      setErrors(newErrors);
    }
  };

  // Обработчики пресетов времени
  const applyTimePreset = (presetType) => {
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
        // Время всегда берем из "текущее + 15 минут", округленное до 15 минут
        targetHour = String(in15Min.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in15Min.getMinutes() / 15) * 15).padStart(2, '0');
        break;
      }
      case '30min': {
        // Через 30 минут: добавляем 30 минут к текущему времени
        const in30Min = new Date(now.getTime() + 30 * 60 * 1000);
        if (!selectedDate) {
          targetDate = new Date(in30Min.getFullYear(), in30Min.getMonth(), in30Min.getDate());
        }
        targetHour = String(in30Min.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in30Min.getMinutes() / 15) * 15).padStart(2, '0');
        break;
      }
      case '1hour': {
        // Через 1 час: добавляем 1 час к текущему времени
        const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
        if (!selectedDate) {
          targetDate = new Date(in1Hour.getFullYear(), in1Hour.getMonth(), in1Hour.getDate());
        }
        targetHour = String(in1Hour.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in1Hour.getMinutes() / 15) * 15).padStart(2, '0');
        break;
      }
      case '2hours': {
        // Через 2 часа: добавляем 2 часа к текущему времени
        const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        if (!selectedDate) {
          targetDate = new Date(in2Hours.getFullYear(), in2Hours.getMonth(), in2Hours.getDate());
        }
        targetHour = String(in2Hours.getHours()).padStart(2, '0');
        targetMinute = String(Math.floor(in2Hours.getMinutes() / 15) * 15).padStart(2, '0');
        break;
      }
      default:
        return;
    }

    // Обновляем состояние
    if (targetDate && !selectedDate) {
      setSelectedDate(targetDate);
    }
    setSelectedHour(targetHour);
    setSelectedMinute(targetMinute);
    
    // Очистить ошибки
    if (errors.meetingTime) {
      const newErrors = {...errors};
      delete newErrors.meetingTime;
      setErrors(newErrors);
    }
    if (errors.meetingDatetime && targetDate) {
      const newErrors = {...errors};
      delete newErrors.meetingDatetime;
      setErrors(newErrors);
    }
  };

  // Обработчик выбора даты
  const handleDateSelect = (date) => {
    if (date) {
      setSelectedDate(date);
      setShowCalendar(false);
      // Очистить ошибку даты при выборе
      if (errors.meetingDatetime) {
        const newErrors = {...errors};
        delete newErrors.meetingDatetime;
        setErrors(newErrors);
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

  return (
    <div
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
    >
      <div
        ref={modalRef}
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
          Запланировать встречу Kontur.Talk
        </h2>

        <p style={{
          margin: '0 0 24px 0',
          fontSize: '14px',
          color: 'var(--center-channel-color-64, #666)'
        }}>
          Заполните форму для создания запланированной встречи
        </p>

        <form onSubmit={handleSubmit}>
          {/* Дата и время */}
          <div style={{marginBottom: '20px'}}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--center-channel-color, #000)'
            }}>
              Дата и время встречи <span style={{color: 'red'}}>*</span>
            </label>
            
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
                <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
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

            <TimePresets applyTimePreset={applyTimePreset} />
          </div>

          {/* Продолжительность */}
          <DurationSelector 
            duration={duration}
            setDuration={setDuration}
            errors={errors}
          />

          {/* Название встречи */}
          <div style={{marginBottom: '20px'}}>
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
              <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
                {errors.meetingTitle}
              </div>
            )}
            <div style={{color: 'var(--center-channel-color-64, #666)', fontSize: '12px', marginTop: '4px'}}>
              Опционально, максимум 100 символов
            </div>
          </div>

          {/* Участники */}
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

          {/* Кнопки */}
          <div style={{
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
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: isSubmitting ? 'var(--center-channel-color-32, #999)' : 'var(--button-bg, #2389D7)',
                color: 'var(--button-color, #fff)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: '600'
              }}
            >
              {isSubmitting ? 'Создание...' : 'Создать встречу'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

ScheduleMeetingModal.propTypes = {
  channel: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func
};

export default ScheduleMeetingModal;

