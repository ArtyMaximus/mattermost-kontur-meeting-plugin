import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import KonturIcon from './kontur_icon.jsx';

const KonturMeetingDropdown = ({channel, channelMember, theme}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  // Закрытие при клике вне
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  const handleInstantCall = () => {
    setIsOpen(false);
    // Вызвать handleInstantCall из плагина
    if (window.KonturMeetingPlugin && window.KonturMeetingPlugin.handleInstantCall) {
      window.KonturMeetingPlugin.handleInstantCall(channel);
    }
  };
  
  const handleScheduleMeeting = () => {
    setIsOpen(false);
    // Вызвать handleScheduleMeeting из плагина
    if (window.KonturMeetingPlugin && window.KonturMeetingPlugin.handleScheduleMeeting) {
      window.KonturMeetingPlugin.handleScheduleMeeting(channel);
    }
  };
  
  return (
    <div ref={dropdownRef} style={{position: 'relative', display: 'inline-block'}}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 8px',
          color: 'var(--center-channel-color)'
        }}
        title="Создать встречу Kontur.Talk"
      >
        <KonturIcon size={20} />
      </button>
      
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            background: 'var(--center-channel-bg)',
            border: '1px solid var(--center-channel-color-16)',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 1000,
            minWidth: '200px'
          }}
        >
          <button
            onClick={handleInstantCall}
            style={{
              width: '100%',
              padding: '8px 16px',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--center-channel-color)'
            }}
            onMouseEnter={(e) => e.target.style.background = 'var(--center-channel-color-08)'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            📹 Созвониться сейчас
          </button>
          <button
            onClick={handleScheduleMeeting}
            style={{
              width: '100%',
              padding: '8px 16px',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--center-channel-color)',
              borderTop: '1px solid var(--center-channel-color-16)'
            }}
            onMouseEnter={(e) => e.target.style.background = 'var(--center-channel-color-08)'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            📅 Запланировать встречу
          </button>
        </div>
      )}
    </div>
  );
};

KonturMeetingDropdown.propTypes = {
  channel: PropTypes.object.isRequired,
  channelMember: PropTypes.object,
  theme: PropTypes.object
};

export default KonturMeetingDropdown;

