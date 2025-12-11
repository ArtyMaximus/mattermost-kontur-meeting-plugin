import React from 'react';
import PropTypes from 'prop-types';

// Date Picker Section Component
export const DatePickerSection = ({
  selectedDate,
  setShowCalendar,
  showCalendar,
  errors,
  calendarRef,
  handleDateSelect,
  getMinDate,
  getMaxDate
}) => {
  return (
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
          {/* Calendar будет здесь - импортируется в родительском компоненте */}
          {/* Мы передаем handleDateSelect для обработки выбора даты */}
        </div>
      )}
      {errors.meetingDatetime && (
        <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
          {errors.meetingDatetime}
        </div>
      )}
    </div>
  );
};

DatePickerSection.propTypes = {
  selectedDate: PropTypes.object,
  setShowCalendar: PropTypes.func.isRequired,
  showCalendar: PropTypes.bool.isRequired,
  errors: PropTypes.object.isRequired,
  calendarRef: PropTypes.object.isRequired,
  handleDateSelect: PropTypes.func.isRequired,
  getMinDate: PropTypes.func.isRequired,
  getMaxDate: PropTypes.func.isRequired
};

// Time Selector Component
export const TimeSelector = ({
  selectedHour,
  selectedMinute,
  handleTimeChange,
  errors
}) => {
  return (
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
  );
};

TimeSelector.propTypes = {
  selectedHour: PropTypes.string.isRequired,
  selectedMinute: PropTypes.string.isRequired,
  handleTimeChange: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired
};

// Time Presets Component
export const TimePresets = ({ applyTimePreset }) => {
  const presets = [
    { key: '15min', label: 'Через 15 минут' },
    { key: '30min', label: 'Через 30 минут' },
    { key: '1hour', label: 'Через 1 час' },
    { key: '2hours', label: 'Через 2 часа' }
  ];

  return (
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
        {presets.map(preset => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyTimePreset(preset.key)}
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
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};

TimePresets.propTypes = {
  applyTimePreset: PropTypes.func.isRequired
};

// Duration Selector Component
export const DurationSelector = ({ duration, setDuration, errors }) => {
  const durations = [
    { value: '15', label: '15 минут' },
    { value: '30', label: '30 минут' },
    { value: '45', label: '45 минут' },
    { value: '60', label: '1 час' },
    { value: '90', label: '1.5 часа' },
    { value: '120', label: '2 часа' },
    { value: '180', label: '3 часа' },
    { value: '240', label: '4 часа' }
  ];

  return (
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
        {durations.map(d => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
      {errors.duration && (
        <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
          {errors.duration}
        </div>
      )}
    </div>
  );
};

DurationSelector.propTypes = {
  duration: PropTypes.string.isRequired,
  setDuration: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired
};

// Participant Selector Component
export const ParticipantSelector = ({
  isDirectChannel,
  participantSearch,
  setParticipantSearch,
  searchResults,
  addParticipant,
  participants,
  removeParticipant,
  errors,
  searchInputRef
}) => {
  return (
    <div style={{marginBottom: '20px'}}>
      <label style={{
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '600',
        color: 'var(--center-channel-color, #000)'
      }}>
        Участники {!isDirectChannel && <span style={{color: 'red'}}>*</span>}
      </label>
      
      {/* Search input */}
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
        
        {/* Search results */}
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

      {/* Selected participants */}
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
        {isDirectChannel 
          ? 'Собеседник директ-канала будет добавлен автоматически. Вы можете добавить дополнительных участников через поиск.'
          : 'Выберите участников через поиск (можно искать по username, имени, фамилии)'}
      </div>
    </div>
  );
};

ParticipantSelector.propTypes = {
  isDirectChannel: PropTypes.bool.isRequired,
  participantSearch: PropTypes.string.isRequired,
  setParticipantSearch: PropTypes.func.isRequired,
  searchResults: PropTypes.array.isRequired,
  addParticipant: PropTypes.func.isRequired,
  participants: PropTypes.array.isRequired,
  removeParticipant: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired,
  searchInputRef: PropTypes.object.isRequired
};

