// Constants for Kontur.Talk Meeting plugin

// Timezone
export const DEFAULT_TIMEZONE = 'Europe/Moscow';

// Request field names (for API requests and error mapping)
export const REQUEST_FIELDS = {
  CHANNEL_ID: 'channel_id',
  USER_ID: 'user_id',
  TEAM_ID: 'team_id',
  START_AT: 'start_at',
  START_AT_LOCAL: 'start_at_local',
  TIMEZONE: 'timezone',
  DURATION_MINUTES: 'duration_minutes',
  TITLE: 'title',
  PARTICIPANT_IDS: 'participant_ids',
  GENERAL: 'general'
};

// Webhook response field names
export const WEBHOOK_FIELDS = {
  ROOM_URL: 'room_url',
  MEETING_URL: 'meeting_url',
  SUCCESS: 'success',
  MESSAGE: 'message',
  ERROR: 'error'
};

// Field mapping for error display (server field -> form field)
export const ERROR_FIELD_MAP = {
  'start_at': 'meetingDatetime',
  'start_at_local': 'meetingDatetime',
  'duration_minutes': 'duration',
  'title': 'meetingTitle',
  'participant_ids': 'participants',
  'general': 'general'
};

// Date format
export const DATE_FORMAT_RFC3339 = 'YYYY-MM-DDTHH:mm:ssZ';


