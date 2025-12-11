package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

// Plugin implements the interface expected by the Mattermost server
type Plugin struct {
	plugin.MattermostPlugin
	configuration *Configuration
}

// Configuration contains the plugin settings
type Configuration struct {
	WebhookURL   string
	OpenInNewTab bool
}

// OnActivate is called when the plugin is activated
func (p *Plugin) OnActivate() error {
	p.API.LogInfo("Kontur.Talk Meeting plugin activated")
	
	// Check that configuration is valid
	config := p.getConfiguration()
	if config.WebhookURL == "" {
		p.API.LogWarn("WebhookURL is not configured")
	} else {
		p.API.LogInfo("Plugin configured", "webhook_url", config.WebhookURL)
	}
	
	return nil
}

// OnDeactivate is called when the plugin is deactivated
func (p *Plugin) OnDeactivate() error {
	p.API.LogInfo("Kontur.Talk Meeting plugin deactivated")
	return nil
}

// OnConfigurationChange is called when configuration is updated
func (p *Plugin) OnConfigurationChange() error {
	// Clear configuration cache so it will be reloaded on next request
	p.configuration = nil
	p.API.LogInfo("Configuration cache cleared")
	return nil
}

// ServeHTTP handles HTTP requests to the plugin
func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	// Route requests based on path
	switch r.URL.Path {
	case "/config":
		p.handleGetConfig(w, r)
	case "/schedule-submit":
		p.handleScheduleSubmit(w, r)
	default:
		http.NotFound(w, r)
	}
}

// handleGetConfig returns the plugin configuration as JSON
func (p *Plugin) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get cached configuration
	config := p.getConfiguration()

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	
	// Return configuration as JSON with snake_case keys
	response := map[string]interface{}{
		"webhook_url":     config.WebhookURL,
		"open_in_new_tab": config.OpenInNewTab,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		p.API.LogError("Failed to encode response", "error", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// getConfiguration returns the cached configuration or loads it
func (p *Plugin) getConfiguration() *Configuration {
	// Return cached configuration if available
	if p.configuration != nil {
		return p.configuration
	}

	// Load configuration using official API
	var configuration Configuration
	if err := p.API.LoadPluginConfiguration(&configuration); err != nil {
		p.API.LogError("Failed to load configuration", "error", err.Error())
		// Return default configuration on error
		return &Configuration{
			WebhookURL:   "",
			OpenInNewTab: true,
		}
	}

	p.configuration = &configuration
	return p.configuration
}

// ScheduleSubmitRequest represents the Interactive Dialog submit request
type ScheduleSubmitRequest struct {
	ChannelID string                 `json:"channel_id"`
	UserID    string                 `json:"user_id"`
	Submission map[string]interface{} `json:"submission"`
	Context   map[string]interface{}   `json:"context"`
}

// handleScheduleSubmit handles Interactive Dialog submit for scheduled meetings
func (p *Plugin) handleScheduleSubmit(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req ScheduleSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		p.API.LogError("Kontur: Failed to parse request", "error", err.Error())
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	errors := []map[string]string{}

	// Validate meeting_datetime
	meetingDatetimeRaw, ok := req.Submission["meeting_datetime"]
	if !ok {
		errors = append(errors, map[string]string{
			"field":   "meeting_datetime",
			"message": "Дата и время обязательны",
		})
	} else {
		// Parse Unix timestamp (seconds)
		var scheduledAtUnix int64
		switch v := meetingDatetimeRaw.(type) {
		case float64:
			scheduledAtUnix = int64(v)
		case int64:
			scheduledAtUnix = v
		case int:
			scheduledAtUnix = int64(v)
		default:
			errors = append(errors, map[string]string{
				"field":   "meeting_datetime",
				"message": "Неверный формат даты и времени",
			})
		}

		if scheduledAtUnix > 0 {
			scheduledAt := time.Unix(scheduledAtUnix, 0)
			now := time.Now()
			maxDate := now.Add(30 * 24 * time.Hour) // +30 дней

			if scheduledAt.Before(now) {
				errors = append(errors, map[string]string{
					"field":   "meeting_datetime",
					"message": "Дата и время не могут быть в прошлом",
				})
			}
			if scheduledAt.After(maxDate) {
				errors = append(errors, map[string]string{
					"field":   "meeting_datetime",
					"message": "Дата не может быть более чем через 30 дней",
				})
			}
		}
	}

	// Validate duration
	durationRaw, ok := req.Submission["duration"]
	if !ok {
		errors = append(errors, map[string]string{
			"field":   "duration",
			"message": "Продолжительность обязательна",
		})
	} else {
		durationStr := fmt.Sprintf("%v", durationRaw)
		durationMinutes, err := strconv.Atoi(durationStr)
		if err != nil || durationMinutes < 5 {
			errors = append(errors, map[string]string{
				"field":   "duration",
				"message": "Продолжительность должна быть не менее 5 минут",
			})
		} else if durationMinutes > 480 {
			errors = append(errors, map[string]string{
				"field":   "duration",
				"message": "Продолжительность не может превышать 480 минут (8 часов)",
			})
		}
	}

	// Validate meeting_title (if provided)
	if titleRaw, ok := req.Submission["meeting_title"]; ok {
		if title, ok := titleRaw.(string); ok && len(title) > 100 {
			errors = append(errors, map[string]string{
				"field":   "meeting_title",
				"message": "Название не может быть длиннее 100 символов",
			})
		}
	}

	// Validate participants
	participantsRaw, ok := req.Submission["participants"]
	if !ok {
		errors = append(errors, map[string]string{
			"field":   "participants",
			"message": "Выберите хотя бы одного участника",
		})
	} else {
		participantIDs := p.parseParticipantIDs(participantsRaw)
		if len(participantIDs) == 0 {
			errors = append(errors, map[string]string{
				"field":   "participants",
				"message": "Выберите хотя бы одного участника",
			})
		}
	}

	// If there are validation errors, return them
	if len(errors) > 0 {
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"errors": errors,
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Parse datetime and duration
	meetingDatetimeRaw = req.Submission["meeting_datetime"]
	var scheduledAtUnix int64
	switch v := meetingDatetimeRaw.(type) {
	case float64:
		scheduledAtUnix = int64(v)
	case int64:
		scheduledAtUnix = v
	case int:
		scheduledAtUnix = int64(v)
	}
	scheduledAt := time.Unix(scheduledAtUnix, 0)

	durationStr := fmt.Sprintf("%v", req.Submission["duration"])
	durationMinutes, _ := strconv.Atoi(durationStr)
	endTime := scheduledAt.Add(time.Duration(durationMinutes) * time.Minute)

	// Format for n8n
	scheduledAtISO := scheduledAt.Format(time.RFC3339)
	endTimeISO := endTime.Format(time.RFC3339)

	// Parse participants
	participantIDs := p.parseParticipantIDs(req.Submission["participants"])
	participants := make([]map[string]interface{}, 0)
	for _, userId := range participantIDs {
		user, err := p.API.GetUser(userId)
		if err != nil {
			p.API.LogError("Kontur: Failed to get user", "user_id", userId, "error", err.Error())
			continue
		}

		participants = append(participants, map[string]interface{}{
			"user_id":    user.Id,
			"username":   user.Username,
			"email":      user.Email,
			"first_name": user.FirstName,
			"last_name":  user.LastName,
		})
	}

	if len(participants) == 0 {
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "participants",
				"message": "Не удалось получить информацию об участниках",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Get current user
	currentUser, err := p.API.GetUser(req.UserID)
	if err != nil {
		p.API.LogError("Kontur: Failed to get current user", "user_id", req.UserID, "error", err.Error())
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Get channel
	channel, err := p.API.GetChannel(req.ChannelID)
	if err != nil {
		p.API.LogError("Kontur: Failed to get channel", "channel_id", req.ChannelID, "error", err.Error())
		http.Error(w, "Channel not found", http.StatusNotFound)
		return
	}

	// Get channel type from context or channel
	channelType := channel.Type
	if ctxType, ok := req.Context["channel_type"].(string); ok {
		channelType = ctxType
	}

	// Get meeting title
	meetingTitle := ""
	if titleRaw, ok := req.Submission["meeting_title"]; ok {
		if title, ok := titleRaw.(string); ok {
			meetingTitle = title
		}
	}

	// Get webhook URL from configuration
	config := p.getConfiguration()
	if config.WebhookURL == "" {
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Webhook URL не настроен. Обратитесь к администратору.",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Prepare webhook payload
	webhookPayload := map[string]interface{}{
		"operation_type":  "scheduled_meeting",
		"scheduled_at":     scheduledAtISO,
		"end_time":         endTimeISO,
		"duration_minutes": durationMinutes,
		"title":            meetingTitle,
		"description":      nil,
		"channel_id":       channel.Id,
		"channel_name":     channel.Name,
		"channel_type":     channelType,
		"user_id":          currentUser.Id,
		"username":         currentUser.Username,
		"user_email":       currentUser.Email,
		"participants":     participants,
		"auto_detected":    false,
		"source":           "user_selection",
		"timestamp":        time.Now().Format(time.RFC3339),
	}

	// Send request to n8n webhook
	payloadJSON, err := json.Marshal(webhookPayload)
	if err != nil {
		p.API.LogError("Kontur: Failed to marshal webhook payload", "error", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	p.API.LogInfo("Kontur: Sending request to webhook", "url", config.WebhookURL)
	webhookResp, err := http.Post(config.WebhookURL, "application/json", bytes.NewBuffer(payloadJSON))
	if err != nil {
		p.API.LogError("Kontur: Failed to send webhook request", "error", err.Error())
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Не удалось отправить запрос на создание встречи",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	defer webhookResp.Body.Close()

	// Parse webhook response
	var webhookData map[string]interface{}
	if err := json.NewDecoder(webhookResp.Body).Decode(&webhookData); err != nil {
		p.API.LogError("Kontur: Failed to parse webhook response", "error", err.Error())
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Неверный ответ от вебхука",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Check if webhook returned error
	if webhookResp.StatusCode != http.StatusOK || (webhookData["success"] != nil && !webhookData["success"].(bool)) {
		errorMsg := "Не удалось создать встречу"
		if msg, ok := webhookData["message"].(string); ok {
			errorMsg = msg
		}
		p.API.LogError("Kontur: Webhook returned error", "message", errorMsg)
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": errorMsg,
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Success - create message in channel
	roomURL := ""
	if url, ok := webhookData["room_url"].(string); ok {
		roomURL = url
	} else if url, ok := webhookData["meeting_url"].(string); ok {
		roomURL = url
	}

	// Format participants list
	participantsList := ""
	for i, p := range participants {
		if i > 0 {
			participantsList += ", "
		}
		if username, ok := p["username"].(string); ok {
			participantsList += "@" + username
		}
	}

	// Format date and time (Russian format)
	// Go date format: Mon Jan 2 15:04:05 MST 2006
	scheduledAtFormatted := scheduledAt.Format("2 января 2006, 15:04")

	// Create post message
	postMessage := fmt.Sprintf("📅 @%s запланировал встречу на %s\n\n", currentUser.Username, scheduledAtFormatted)
	postMessage += fmt.Sprintf("Участники: %s\n\n", participantsList)
	postMessage += fmt.Sprintf("Продолжительность: %d минут\n\n", durationMinutes)
	if roomURL != "" {
		postMessage += fmt.Sprintf("[Присоединиться к встрече](%s)", roomURL)
	}

	// Create post in channel
	post := &model.Post{
		ChannelId: channel.Id,
		Message:   postMessage,
		UserId:    currentUser.Id,
	}

	if _, err := p.API.CreatePost(post); err != nil {
		p.API.LogError("Kontur: Failed to create post", "error", err.Error())
		// Не возвращаем ошибку, т.к. встреча уже создана
	} else {
		p.API.LogInfo("Kontur: Post created successfully")
	}

	// Success - return success response
	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"errors": nil,
		"data": map[string]interface{}{
			"status": "success",
		},
	}
	json.NewEncoder(w).Encode(response)
}

// parseParticipantIDs parses participants from submission (can be string or array)
func (p *Plugin) parseParticipantIDs(participantsRaw interface{}) []string {
	var participantIDs []string

	switch v := participantsRaw.(type) {
	case string:
		// If string - split by comma
		participantIDs = strings.Split(v, ",")
		for i := range participantIDs {
			participantIDs[i] = strings.TrimSpace(participantIDs[i])
		}
	case []interface{}:
		// If array of interface{}
		for _, id := range v {
			if str, ok := id.(string); ok {
				participantIDs = append(participantIDs, str)
			}
		}
	case []string:
		// If already array of strings
		participantIDs = v
	}

	// Filter empty strings
	result := []string{}
	for _, id := range participantIDs {
		if id != "" {
			result = append(result, id)
		}
	}

	return result
}

func main() {
	plugin.ClientMain(&Plugin{})
}
