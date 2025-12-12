package main

import "time"

// Webhook response field names
const (
	WebhookFieldRoomURL    = "room_url"
	WebhookFieldMeetingURL = "meeting_url"
)

// Request field names (for error responses)
const (
	RequestFieldChannelID      = "channel_id"
	RequestFieldUserID         = "user_id"
	RequestFieldStartAt        = "start_at"
	RequestFieldStartAtLocal   = "start_at_local"
	RequestFieldParticipantIDs = "participant_ids"
	RequestFieldGeneral        = "general"
)

// Timezone and date format constants
const (
	DefaultTimezone = "Europe/Moscow"
	DateFormatRFC3339 = time.RFC3339
)

// HTTP client timeout
const (
	WebhookTimeout = 2 * time.Minute
)


