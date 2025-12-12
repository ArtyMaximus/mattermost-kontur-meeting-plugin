import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import cardImage from '../../assets/artem-card.png';

/**
 * About Plugin Modal Component
 * Displays information about the plugin author and contact details
 */
const AboutPluginModal = ({ onClose }) => {
  const modalRef = useRef(null);
  const [imageError, setImageError] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Get plugin name from config or use default
  const config = window.KonturMeetingPlugin && window.KonturMeetingPlugin.config;
  const pluginName = config?.ServiceName ? `Meeting ${config.ServiceName}` : 'Meeting';

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
          О плагине {pluginName}
        </h2>

        <div style={{
          marginBottom: '16px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--center-channel-color, #000)'
        }}>
          <p style={{ margin: '0 0 12px 0' }}>
            <strong>Автор:</strong> Artem Azarenkov, AI Automations Engineer.
          </p>
          
          <p style={{ margin: '0 0 12px 0' }}>
            По вопросам, идеям и проблемам с плагином, а также по автоматизации рутины — пишите в канал{' '}
            <a
              href="/skyeng/channels/ai-automation-center"
              style={{
                color: '#1e70bf',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
            >
              ~ai-automation-center
            </a>
            .
          </p>
        </div>

        {/* Image section */}
        <div 
          className="about-plugin-card"
          style={{
            margin: '0 auto',
            marginBottom: '16px',
            maxWidth: '320px'
          }}
        >
          <img 
            src={cardImage} 
            alt="Artem Azarenkov" 
            onError={() => setImageError(true)}
            style={{ 
              maxWidth: '320px',
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }} 
          />
        </div>

        {/* Close button */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid var(--center-channel-color-16, #eee)'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--button-bg, #2389D7)',
              color: 'var(--button-color, #fff)',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

AboutPluginModal.propTypes = {
  onClose: PropTypes.func.isRequired
};

export default AboutPluginModal;

