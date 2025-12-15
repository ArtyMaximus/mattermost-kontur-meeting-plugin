import React from 'react';
import PropTypes from 'prop-types';

/**
 * Kontur.Talk SVG icon component - Message video icon
 * Material Design Icons: message-video
 * Optimized for 20x20px display in Mattermost channel header
 * Simple outline style with currentColor for theme adaptation
 * Unified icon used across the plugin to avoid duplication
 */
const KonturIcon = ({ size = 20, color = 'currentColor', style = {} }) => {
  return (
    <svg
      id="kontur-meeting-button-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill={color}
      ariaHidden="true"
      style={style}
    >
      <path d="M18,14L14,10.8V14H6V6H14V9.2L18,6M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4C22,2.89 21.1,2 20,2Z" />
    </svg>
  );
};

KonturIcon.propTypes = {
  size: PropTypes.number,
  color: PropTypes.string,
  style: PropTypes.object
};

export default KonturIcon;
