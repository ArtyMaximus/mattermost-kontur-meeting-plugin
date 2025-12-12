package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
)

// WebhookError represents a structured error response from n8n webhook
type WebhookError struct {
	Message     string
	ExecutionID string
	StatusCode  int
}

// Error implements the error interface
func (e *WebhookError) Error() string {
	return e.Message
}

// IsWebhookError checks if an error is a WebhookError
func IsWebhookError(err error) (*WebhookError, bool) {
	webhookErr, ok := err.(*WebhookError)
	return webhookErr, ok
}

// ScheduleRequest represents the schedule meeting request
type ScheduleRequest struct {
	ChannelID       string   `json:"channel_id"`
	TeamID          string   `json:"team_id"`
	UserID          string   `json:"user_id"`
	StartAt         string   `json:"start_at"`
	StartAtLocal    string   `json:"start_at_local"`
	Timezone        string   `json:"timezone"`
	DurationMinutes int      `json:"duration_minutes"`
	Title           *string  `json:"title"`
	ParticipantIDs  []string `json:"participant_ids"`
}

// validateScheduleRequest validates and parses the incoming request
func (p *Plugin) validateScheduleRequest(w http.ResponseWriter, r *http.Request) (*ScheduleRequest, bool) {
	// Read request body
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		p.API.LogError("[Kontur] Failed to read request body", "error", err.Error())
		writeErrorResponse(w, http.StatusBadRequest, "general", "Не удалось прочитать запрос")
		return nil, false
	}
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	// Parse JSON
	var req ScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		p.API.LogError("[Kontur] Failed to parse JSON", "error", err.Error())
		writeErrorResponse(w, http.StatusBadRequest, "general", "Неверный формат JSON: "+err.Error())
		return nil, false
	}

	// Log only safe metadata (no PII: emails, names, participant details)
	p.API.LogInfo("[Kontur] Schedule request received",
		RequestFieldChannelID, req.ChannelID,
		RequestFieldUserID, req.UserID,
		RequestFieldStartAtLocal, req.StartAtLocal,
		"duration_minutes", req.DurationMinutes,
		"participant_count", len(req.ParticipantIDs))

	// Validate required fields
	errors := []map[string]string{}

	if req.ChannelID == "" {
		errors = append(errors, map[string]string{
			"field":   RequestFieldChannelID,
			"message": "channel_id обязателен",
		})
	}

	if req.UserID == "" {
		p.API.LogError("[Kontur] user_id is empty")
		errors = append(errors, map[string]string{
			"field":   RequestFieldUserID,
			"message": "user_id обязателен",
		})
	}

	// Validate duration
	if req.DurationMinutes < 5 {
		errors = append(errors, map[string]string{
			"field":   "duration_minutes",
			"message": "Продолжительность должна быть не менее 5 минут",
		})
	} else if req.DurationMinutes > 480 {
		errors = append(errors, map[string]string{
			"field":   "duration_minutes",
			"message": "Продолжительность не может превышать 480 минут (8 часов)",
		})
	}

	// Validate title length
	if req.Title != nil && len(*req.Title) > 100 {
		errors = append(errors, map[string]string{
			"field":   "title",
			"message": "Название не может быть длиннее 100 символов",
		})
	}

	if len(errors) > 0 {
		p.API.LogError("[Kontur] Validation failed", "error_count", len(errors))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		response := map[string]interface{}{"errors": errors}
		json.NewEncoder(w).Encode(response)
		return nil, false
	}

	return &req, true
}

// parseDateTime parses and validates date/time from request
func (p *Plugin) parseDateTime(req *ScheduleRequest) (time.Time, error) {
	var scheduledAt time.Time
	var err error

	// Try start_at_local first (priority)
	if req.StartAtLocal != "" {
		formats := []string{
			time.RFC3339,
			"2006-01-02T15:04:05-07:00",
			"2006-01-02T15:04:05+07:00",
			"2006-01-02T15:04:05Z",
			"2006-01-02T15:04-07:00",
			"2006-01-02T15:04+07:00",
		}

		for _, format := range formats {
			scheduledAt, err = time.Parse(format, req.StartAtLocal)
			if err == nil {
				p.API.LogDebug("[Kontur] Parsed start_at_local", "input", req.StartAtLocal, "format", format)
				break
			}
		}

		if err != nil {
			return time.Time{}, fmt.Errorf("неверный формат локального времени: %s", req.StartAtLocal)
		}
	} else if req.StartAt != "" {
		// Fallback to UTC
		formats := []string{
			time.RFC3339,
			time.RFC3339Nano,
			"2006-01-02T15:04:05.000Z",
			"2006-01-02T15:04:05Z",
		}

		for _, format := range formats {
			scheduledAt, err = time.Parse(format, req.StartAt)
			if err == nil {
				p.API.LogDebug("[Kontur] Parsed start_at", "input", req.StartAt, "format", format)
				break
			}
		}

		if err != nil {
			return time.Time{}, fmt.Errorf("неверный формат даты и времени: %s", req.StartAt)
		}
	} else {
		return time.Time{}, fmt.Errorf("дата и время обязательны")
	}

	// Validate time range
	now := time.Now()
	maxDate := now.Add(30 * 24 * time.Hour)

	if scheduledAt.Before(now) {
		return time.Time{}, fmt.Errorf("дата и время не могут быть в прошлом")
	}
	if scheduledAt.After(maxDate) {
		return time.Time{}, fmt.Errorf("дата не может быть более чем через 30 дней")
	}

	return scheduledAt, nil
}

// getUserAndChannel retrieves and validates user and channel
func (p *Plugin) getUserAndChannel(req *ScheduleRequest) (*model.User, *model.Channel, error) {
	// Get current user
	currentUser, err := p.getUserSafely(req.UserID)
	if err != nil {
		return nil, nil, err
	}

	// Get channel
	channel, err := p.getChannelSafely(req.ChannelID)
	if err != nil {
		return nil, nil, err
	}

	return currentUser, channel, nil
}

// resolveParticipants resolves participant IDs to user objects
func (p *Plugin) resolveParticipants(req *ScheduleRequest, channel *model.Channel) ([]*model.User, error) {
	// Auto-add other user for DM channels
	if channel.Type == model.ChannelTypeDirect {
		otherUserId := channel.GetOtherUserIdForDM(req.UserID)
		if otherUserId != "" {
			p.API.LogDebug("[Kontur] DM channel, auto-adding other user", "other_user_id", otherUserId)
			if len(req.ParticipantIDs) == 0 {
				req.ParticipantIDs = []string{otherUserId}
			} else {
				// Check if already in list
				found := false
				for _, pid := range req.ParticipantIDs {
					if pid == otherUserId {
						found = true
						break
					}
				}
				if !found {
					req.ParticipantIDs = append(req.ParticipantIDs, otherUserId)
				}
			}
		}
	}

	// Validate participants
	if len(req.ParticipantIDs) == 0 && channel.Type != model.ChannelTypeDirect {
		return nil, fmt.Errorf("необходимо выбрать хотя бы одного участника")
	}

	// Get participant info
	participants := make([]*model.User, 0)
	for _, userId := range req.ParticipantIDs {
		user, err := p.getUserSafely(userId)
		if err != nil {
			p.API.LogWarn("[Kontur] Failed to get participant", "user_id", userId)
			continue
		}
		participants = append(participants, user)
	}

	if len(participants) == 0 {
		return nil, fmt.Errorf("не удалось получить информацию об участниках")
	}

	p.API.LogDebug("[Kontur] Participants loaded", "count", len(participants))
	return participants, nil
}

// buildWebhookPayload creates the webhook payload
func (p *Plugin) buildWebhookPayload(req *ScheduleRequest, currentUser *model.User, channel *model.Channel, participants []*model.User, scheduledAt time.Time) map[string]interface{} {
	// Calculate end time
	endTime := scheduledAt.Add(time.Duration(req.DurationMinutes) * time.Minute)

	// Format times
	timezone := req.Timezone
	if timezone == "" {
		timezone = DefaultTimezone
	}

	// Get meeting title
	meetingTitle := ""
	if req.Title != nil {
		meetingTitle = *req.Title
	}

	// Convert participants to map format
	participantMaps := make([]map[string]interface{}, len(participants))
	for i, p := range participants {
		participantMaps[i] = map[string]interface{}{
			"user_id":    p.Id,
			"username":   p.Username,
			"email":      p.Email,
			"first_name": p.FirstName,
			"last_name":  p.LastName,
		}
	}

	payload := map[string]interface{}{
		"operation_type":     "scheduled_meeting",
		"scheduled_at":       scheduledAt.Format(time.RFC3339),
		"scheduled_at_local": req.StartAtLocal,
		"end_time":           endTime.Format(time.RFC3339),
		"end_time_local":     "", // Calculated on server if needed
		"timezone":           timezone,
		"duration_minutes":   req.DurationMinutes,
		"title":              meetingTitle,
		"description":        nil,
		"channel_id":         channel.Id,
		"channel_name":       channel.Name,
		"channel_type":       string(channel.Type),
		"user_id":            currentUser.Id,
		"username":           currentUser.Username,
		"user_email":         currentUser.Email,
		"participants":       participantMaps,
		"auto_detected":      false,
		"source":             "user_selection",
		"timestamp":          time.Now().Format(time.RFC3339),
	}

	return payload
}

// sendWebhook sends the webhook request
func (p *Plugin) sendWebhook(webhookURL string, payload map[string]interface{}) (map[string]interface{}, error) {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	p.API.LogDebug("[Kontur] Sending webhook", "url", webhookURL, "payload_size", len(payloadJSON))

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: WebhookTimeout,
	}

	resp, err := client.Post(webhookURL, "application/json", bytes.NewBuffer(payloadJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	p.API.LogDebug("[Kontur] Webhook response", "status", resp.StatusCode, "body", string(bodyBytes))

	// Parse response
	var webhookData map[string]interface{}
	if len(bodyBytes) > 0 {
		if err := json.Unmarshal(bodyBytes, &webhookData); err != nil {
			return nil, fmt.Errorf("failed to parse response (status %d): %w", resp.StatusCode, err)
		}
	} else {
		webhookData = make(map[string]interface{})
	}

	// Check status code
	if resp.StatusCode != http.StatusOK {
		// Try to parse structured n8n error response
		if statusVal, ok := webhookData["status"].(string); ok && statusVal == "error" {
			webhookErr := &WebhookError{
				StatusCode: resp.StatusCode,
			}
			
			// Extract message
			if msg, ok := webhookData["message"].(string); ok && msg != "" {
				webhookErr.Message = msg
			} else {
				webhookErr.Message = fmt.Sprintf("Ошибка при создании встречи (статус %d)", resp.StatusCode)
			}
			
			// Extract execution_id
			if execID, ok := webhookData["execution_id"].(string); ok && execID != "" {
				webhookErr.ExecutionID = execID
			}
			
			return nil, webhookErr
		}
		
		// Fallback to legacy error format
		errorMsg := fmt.Sprintf("webhook returned error (status %d)", resp.StatusCode)
		if msg, ok := webhookData["message"].(string); ok && msg != "" {
			errorMsg = msg
		} else if errMsg, ok := webhookData["error"].(string); ok && errMsg != "" {
			errorMsg = errMsg
		}
		return nil, fmt.Errorf("%s", errorMsg)
	}

	// Check success flag
	if successVal, ok := webhookData["success"]; ok {
		success := false
		switch v := successVal.(type) {
		case bool:
			success = v
		case string:
			success = (v == "true" || v == "1" || v == "yes")
		case float64:
			success = (v != 0)
		default:
			success = true
		}

		if !success {
			errorMsg := "Не удалось создать встречу"
			if msg, ok := webhookData["message"].(string); ok && msg != "" {
				errorMsg = msg
			}
			return nil, fmt.Errorf("%s", errorMsg)
		}
	}

	return webhookData, nil
}

// createPost creates a post in the channel
func (p *Plugin) createPost(channel *model.Channel, currentUser *model.User, participants []*model.User, scheduledAt time.Time, duration int, roomURL string) error {
	// Format participants list
	participantsList := ""
	for i, user := range participants {
		if i > 0 {
			participantsList += ", "
		}
		participantsList += "@" + user.Username
	}

	// Format scheduled time
	scheduledAtFormatted := scheduledAt.Format("02.01.2006, 15:04") + " (по МСК)"

	// Create message
	postMessage := fmt.Sprintf("📅 @%s запланировал встречу на %s\n\n", currentUser.Username, scheduledAtFormatted)
	postMessage += fmt.Sprintf("👥 Участники: %s\n\n", participantsList)
	postMessage += fmt.Sprintf("⏱ Длительность: %d минут\n\n", duration)
	if roomURL != "" {
		postMessage += fmt.Sprintf("[🔗 Присоединиться к встрече](%s)", roomURL)
	}

	post := &model.Post{
		ChannelId: channel.Id,
		Message:   postMessage,
		UserId:    currentUser.Id,
	}

	if _, err := p.API.CreatePost(post); err != nil {
		p.API.LogError("[Kontur] Failed to create post", "error", err.Error())
		return err
	}

	p.API.LogDebug("[Kontur] Post created successfully")
	return nil
}

