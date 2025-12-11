import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
// Импортируем только DayPicker для минимизации размера бандла
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

const ScheduleMeetingModal = ({channel, onClose, onSuccess}) => {
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

  // Закрытие при клике вне модального окна (по фону)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Закрывать только если клик по фону (не по содержимому модалки)
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        // Очистить форму при закрытии
        setSelectedDate(null);
        setSelectedHour('');
        setSelectedMinute('');
        setShowCalendar(false);
        setDuration('60');
        setMeetingTitle(channel.display_name || channel.name || '');
        setParticipants([]);
        setErrors({});
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
        // Очистить форму при закрытии
        setSelectedDate(null);
        setSelectedHour('');
        setSelectedMinute('');
        setShowCalendar(false);
        setDuration('60');
        setMeetingTitle(channel.display_name || channel.name || '');
        setParticipants([]);
        setErrors({});
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
        console.error('[Kontur] Ошибка поиска пользователей:', error);
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

    if (participants.length === 0) {
      newErrors.participants = 'Необходимо выбрать хотя бы одного участника';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Получить текущего пользователя и team_id из Redux store
  const getCurrentUserInfo = () => {
    // Получаем доступ к store через window.KonturMeetingPlugin
    if (window.KonturMeetingPlugin && window.KonturMeetingPlugin.store) {
      const state = window.KonturMeetingPlugin.store.getState();
      const currentUserId = state.entities.users.currentUserId;
      const currentUser = state.entities.users.profiles[currentUserId];
      const currentTeamId = state.entities.teams.currentTeamId;
      
      return {
        user_id: currentUserId,
        team_id: currentTeamId || channel.team_id || ''
      };
    }
    
    // Fallback: попробовать получить из channel
    return {
      user_id: '',
      team_id: channel.team_id || ''
    };
  };

  // Отправка формы
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Получить информацию о текущем пользователе
      const userInfo = getCurrentUserInfo();
      
      // Формируем даты используя общую функцию
      const { startAtUTC, startAtLocal } = buildDateTimeStrings(selectedDate, selectedHour, selectedMinute);

      // Подготовить данные для отправки в новом формате
      const requestBody = {
        channel_id: channel.id,
        team_id: userInfo.team_id,
        user_id: userInfo.user_id,
        start_at: startAtUTC, // Для обратной совместимости
        start_at_local: startAtLocal, // Локальное время MSK
        timezone: 'Europe/Moscow', // Часовой пояс (строка в одинарных кавычках - это корректно для JS)
        duration_minutes: parseInt(duration, 10),
        title: meetingTitle.trim() || null,
        participant_ids: participants.map(p => p.id)
      };

      console.log('[Kontur] Отправка запроса на создание встречи:', requestBody);

      const response = await fetch('/plugins/com.skyeng.kontur-meeting/api/schedule-meeting', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(requestBody)
      });

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

      if (!response.ok) {
        console.error('[Kontur] Ошибка от сервера:', {
          status: response.status,
          statusText: response.statusText,
          result: result
        });
        
        // Обработка ошибок валидации
        if (result.errors && Array.isArray(result.errors)) {
          const validationErrors = {};
          let generalError = null;
          
          result.errors.forEach(error => {
            if (error.field) {
              // Маппинг полей для отображения ошибок
              const fieldMap = {
                'start_at': 'meetingDatetime',
                'start_at_local': 'meetingDatetime',
                'duration_minutes': 'duration',
                'title': 'meetingTitle',
                'participant_ids': 'participants',
                'general': 'general'
              };
              const mappedField = fieldMap[error.field] || error.field;
              
              if (mappedField === 'general') {
                generalError = error.message;
              } else {
                validationErrors[mappedField] = error.message;
              }
            }
          });
          
          // Если есть ошибки валидации полей, показываем их
          if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
          }
          
          // Если только общая ошибка, показываем её
          if (generalError) {
            throw new Error(generalError);
          }
        }
        
        // Если есть message в result, используем его
        if (result.message) {
          throw new Error(result.message);
        }
        
        // Иначе формируем сообщение из статуса
        throw new Error(`Не удалось создать встречу (статус ${response.status})`);
      }

      // Успех - закрыть модалку и очистить форму
      console.log('[Kontur] Meeting scheduled successfully');
      
      // Очистить форму
      setSelectedDate(null);
      setSelectedHour('');
      setSelectedMinute('');
      setShowCalendar(false);
      setDuration('60');
      setMeetingTitle(channel.display_name || channel.name || '');
      setParticipants([]);
      setErrors({});
      
      if (onSuccess) {
        onSuccess();
      }
      
      // Закрыть модалку
      onClose();

    } catch (error) {
      console.error('[Kontur] Ошибка при создании встречи:', error);
      
      // Формируем детальное сообщение об ошибке, аналогично handleInstantCall
      const errorText = error.message || '';
      let errorMessage;
      
      // Проверяем, содержит ли ошибка детальное сообщение от сервера о проблеме с вебхуком
      if (errorText.includes('🔌 Не удалось подключиться к вебхуку')) {
        // Сервер уже вернул детальное сообщение, используем его полностью
        errorMessage = errorText;
      } else if (errorText.includes('Не удалось подключиться к вебхуку') || 
                 errorText.includes('Failed to fetch') || 
                 errorText.includes('ERR_CONNECTION_REFUSED')) {
        // Формируем детальное сообщение сами
        errorMessage = '❌ Не удалось создать встречу.\n\n';
        errorMessage += '🔌 Не удалось подключиться к вебхуку:\n';
        // Пытаемся получить URL из конфигурации
        const webhookURL = (window.KonturMeetingPlugin && window.KonturMeetingPlugin.config && window.KonturMeetingPlugin.config.WebhookURL) || 'URL не настроен';
        errorMessage += webhookURL;
        errorMessage += '\n\nПроверьте:\n';
        errorMessage += '1. n8n запущен и доступен\n';
        errorMessage += '2. Workflow активирован\n';
        errorMessage += '3. URL указан правильно';
      } else if (errorText.includes('Вебхук вернул ошибку')) {
        errorMessage = '❌ Не удалось создать встречу.\n\n';
        errorMessage += '⚠️ Вебхук вернул ошибку. Проверьте логи workflow в n8n.';
      } else {
        errorMessage = '❌ Не удалось создать встречу.\n\n' + errorText;
      }
      
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

            {/* Селекты времени: часы и минуты */}
            <div style={{marginBottom: '12px'}}>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                <select
                  value={selectedHour}
                  onChange={(e) => handleTimeChange(e.target.value, selectedMinute)}
                  required
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: `1px solid ${errors.meetingTime ? 'red' : 'var(--center-channel-color-16, #ccc)'}`,
                    borderRadius: '4px',
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    color: 'var(--center-channel-color, #000)'
                  }}
                >
                  <option value="">Час</option>
                  {Array.from({length: 24}, (_, i) => {
                    const hour = String(i).padStart(2, '0');
                    return <option key={hour} value={hour}>{hour}</option>;
                  })}
                </select>
                <span style={{color: 'var(--center-channel-color, #000)', fontSize: '14px'}}>:</span>
                <select
                  value={selectedMinute}
                  onChange={(e) => handleTimeChange(selectedHour, e.target.value)}
                  required
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '14px',
                    border: `1px solid ${errors.meetingTime ? 'red' : 'var(--center-channel-color-16, #ccc)'}`,
                    borderRadius: '4px',
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    color: 'var(--center-channel-color, #000)'
                  }}
                >
                  <option value="">Мин</option>
                  <option value="00">00</option>
                  <option value="15">15</option>
                  <option value="30">30</option>
                  <option value="45">45</option>
                </select>
              </div>
              {errors.meetingTime && (
                <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
                  {errors.meetingTime}
                </div>
              )}
            </div>

            {/* Пресеты времени */}
            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: 'var(--center-channel-color-08, #f5f5f5)',
              borderRadius: '4px',
              border: '1px solid var(--center-channel-color-16, #e0e0e0)'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--center-channel-color-64, #666)',
                marginBottom: '8px'
              }}>
                Быстрый выбор
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px'
              }}>
                <button
                  type="button"
                  onClick={() => applyTimePreset('15min')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    border: '1px solid var(--center-channel-color-16, #ccc)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    color: 'var(--center-channel-color, #000)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Через 15 минут
                </button>
                <button
                  type="button"
                  onClick={() => applyTimePreset('30min')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    border: '1px solid var(--center-channel-color-16, #ccc)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    color: 'var(--center-channel-color, #000)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Через 30 минут
                </button>
                <button
                  type="button"
                  onClick={() => applyTimePreset('1hour')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    border: '1px solid var(--center-channel-color-16, #ccc)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    color: 'var(--center-channel-color, #000)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Через 1 час
                </button>
                <button
                  type="button"
                  onClick={() => applyTimePreset('2hours')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    border: '1px solid var(--center-channel-color-16, #ccc)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--center-channel-bg, #fff)',
                    color: 'var(--center-channel-color, #000)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Через 2 часа
                </button>
              </div>
            </div>
          </div>

          {/* Продолжительность */}
          <div style={{marginBottom: '20px'}}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--center-channel-color, #000)'
            }}>
              Продолжительность <span style={{color: 'red'}}>*</span>
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: `1px solid ${errors.duration ? 'red' : 'var(--center-channel-color-16, #ccc)'}`,
                borderRadius: '4px',
                backgroundColor: 'var(--center-channel-bg, #fff)',
                color: 'var(--center-channel-color, #000)'
              }}
            >
              <option value="15">15 минут</option>
              <option value="30">30 минут</option>
              <option value="45">45 минут</option>
              <option value="60">1 час</option>
              <option value="90">1.5 часа</option>
              <option value="120">2 часа</option>
              <option value="180">3 часа</option>
              <option value="240">4 часа</option>
            </select>
            {errors.duration && (
              <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
                {errors.duration}
              </div>
            )}
          </div>

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
          <div style={{marginBottom: '20px'}}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--center-channel-color, #000)'
            }}>
              Участники <span style={{color: 'red'}}>*</span>
            </label>
            
            {/* Поиск участников */}
            <div style={{position: 'relative', marginBottom: '8px'}}>
              <input
                ref={searchInputRef}
                type="text"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                placeholder="Начните вводить имя пользователя..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  border: `1px solid ${errors.participants ? 'red' : 'var(--center-channel-color-16, #ccc)'}`,
                  borderRadius: '4px',
                  backgroundColor: 'var(--center-channel-bg, #fff)',
                  color: 'var(--center-channel-color, #000)'
                }}
              />
              
              {/* Результаты поиска */}
              {searchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: 'var(--center-channel-bg, #fff)',
                  border: '1px solid var(--center-channel-color-16, #ccc)',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  maxHeight: '200px',
                  overflow: 'auto',
                  zIndex: 1000
                }}>
                  {searchResults.map(user => (
                    <div
                      key={user.id}
                      onClick={() => addParticipant(user)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--center-channel-color-16, #eee)',
                        color: 'var(--center-channel-color, #000)'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--center-channel-color-08, #f0f0f0)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      {user.username} {user.first_name && user.last_name && `(${user.first_name} ${user.last_name})`}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Выбранные участники */}
            {participants.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginTop: '8px'
              }}>
                {participants.map(participant => (
                  <div
                    key={participant.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      backgroundColor: 'var(--center-channel-color-08, #f0f0f0)',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <span>{participant.username}</span>
                    <button
                      type="button"
                      onClick={() => removeParticipant(participant.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--center-channel-color, #000)',
                        fontSize: '16px',
                        padding: 0,
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {errors.participants && (
              <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
                {errors.participants}
              </div>
            )}
            <div style={{color: 'var(--center-channel-color-64, #666)', fontSize: '12px', marginTop: '4px'}}>
              Выберите участников через поиск (можно искать по username, имени, фамилии)
            </div>
          </div>

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
                // Очистить форму при отмене
                setSelectedDate(null);
                setSelectedHour('');
                setSelectedMinute('');
                setShowCalendar(false);
                setDuration('60');
                setMeetingTitle(channel.display_name || channel.name || '');
                setParticipants([]);
                setErrors({});
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

