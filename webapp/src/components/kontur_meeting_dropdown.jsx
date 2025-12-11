import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';

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
  
  // SVG иконка видеокамеры
  const videoIcon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      style={{display: 'block'}}
    >
      <path
        d="M0 0 C0.804375 -0.00128906 1.60875 -0.00257813 2.4375 -0.00390625 C3.283125 -0.00003906 4.12875 0.00382813 5 0.0078125 C6.2684375 0.00201172 6.2684375 0.00201172 7.5625 -0.00390625 C8.366875 -0.00261719 9.17125 -0.00132812 10 0 C10.7425 0.00112793 11.485 0.00225586 12.25 0.00341797 C14 0.1328125 14 0.1328125 15 1.1328125 C15.09909302 3.46441305 15.12970504 5.79911192 15.125 8.1328125 C15.12886719 10.0509375 15.12886719 10.0509375 15.1328125 12.0078125 C15 15.1328125 15 15.1328125 14 16.1328125 C12.66956375 16.2311846 11.33406656 16.26359842 10 16.265625 C9.195625 16.26691406 8.39125 16.26820312 7.5625 16.26953125 C6.716875 16.26566406 5.87125 16.26179688 5 16.2578125 C4.154375 16.26167969 3.30875 16.26554687 2.4375 16.26953125 C1.633125 16.26824219 0.82875 16.26695313 0 16.265625 C-0.7425 16.26449707 -1.485 16.26336914 -2.25 16.26220703 C-4 16.1328125 -4 16.1328125 -5 15.1328125 C-5.09909302 12.80121195 -5.12970504 10.46651308 -5.125 8.1328125 C-5.12757813 6.8540625 -5.13015625 5.5753125 -5.1328125 4.2578125 C-4.94045167 -0.26832466 -4.12700187 0.00626932 0 0 Z"
        fill="currentColor"
        transform="translate(5,7.8671875)"
      />
      <path
        d="M0 0 C0 4.62 0 9.24 0 14 C-6.625 13.25 -6.625 13.25 -10 11 C-10.64282362 5.93776401 -10.64282362 5.93776401 -10 3 C-6.51174019 -0.18926611 -4.86864834 0 0 0 Z"
        fill="currentColor"
        transform="translate(32,9)"
      />
    </svg>
  );
  
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
        {videoIcon}
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

