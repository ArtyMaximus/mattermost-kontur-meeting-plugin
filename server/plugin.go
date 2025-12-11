package main

import (
	"encoding/json"
	"fmt"
	"net/http"

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
	// TODO: Consider moving to LogDebug for production
	p.API.LogInfo("Kontur.Talk Meeting plugin activated")
	
	// Check that configuration is valid
	config := p.getConfiguration()
	if config.WebhookURL == "" {
		p.API.LogWarn("WebhookURL is not configured")
	} else {
		// TODO: Consider moving to LogDebug for production
		p.API.LogInfo("Plugin configured", "webhook_url", config.WebhookURL)
	}
	
	return nil
}

// OnDeactivate is called when the plugin is deactivated
func (p *Plugin) OnDeactivate() error {
	// TODO: Consider moving to LogDebug for production
	p.API.LogInfo("Kontur.Talk Meeting plugin deactivated")
	return nil
}

// OnConfigurationChange is called when configuration is updated
func (p *Plugin) OnConfigurationChange() error {
	// Clear configuration cache so it will be reloaded on next request
	p.configuration = nil
	// TODO: Consider moving to LogDebug for production
	p.API.LogInfo("Configuration cache cleared")
	return nil
}

// ServeHTTP handles HTTP requests to the plugin
func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	// Route requests based on path
	switch r.URL.Path {
	case "/config":
		p.handleGetConfig(w, r)
	case "/api/schedule-meeting":
		p.handleScheduleMeeting(w, r)
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

// handleScheduleMeeting handles the schedule meeting endpoint
func (p *Plugin) handleScheduleMeeting(w http.ResponseWriter, r *http.Request) {
	// Recover from panic
	defer func() {
		if rec := recover(); rec != nil {
			if p != nil && p.API != nil {
				p.API.LogError("[Kontur] Panic recovered", "panic", fmt.Sprintf("%v", rec))
			}
			if w.Header().Get("Content-Type") == "" {
				writeErrorResponse(w, http.StatusInternalServerError, "general", 
					fmt.Sprintf("Внутренняя ошибка сервера: %v", rec))
			}
		}
	}()

	// Check initialization
	if p == nil || p.API == nil {
		http.Error(w, "Plugin not initialized", http.StatusInternalServerError)
		return
	}

	// TODO: Consider moving to LogDebug for production
	p.API.LogInfo("[Kontur] schedule-meeting called")

	// Only allow POST requests
	if r.Method != http.MethodPost {
		p.API.LogWarn("[Kontur] Method not allowed", "method", r.Method)
		writeErrorResponse(w, http.StatusMethodNotAllowed, RequestFieldGeneral, "Метод не разрешён. Используйте POST.")
		return
	}

	// Step 1: Validate and parse request
	req, ok := p.validateScheduleRequest(w, r)
	if !ok {
		return
	}

	// Step 2: Parse and validate date/time
	scheduledAt, err := p.parseDateTime(req)
	if err != nil {
		p.API.LogError("[Kontur] Date/time validation failed", "error", err.Error())
		writeErrorResponse(w, http.StatusBadRequest, RequestFieldStartAtLocal, err.Error())
		return
	}

	// Step 3: Get user and channel
	currentUser, channel, err := p.getUserAndChannel(req)
	if err != nil {
		p.API.LogError("[Kontur] Failed to get user/channel", "error", err.Error())
		if currentUser == nil {
			writeErrorResponse(w, http.StatusNotFound, RequestFieldUserID, fmt.Sprintf("Пользователь не найден: %s", req.UserID))
		} else {
			writeErrorResponse(w, http.StatusNotFound, RequestFieldChannelID, fmt.Sprintf("Канал не найден: %s", req.ChannelID))
		}
		return
	}

	// Step 4: Resolve participants
	participants, err := p.resolveParticipants(req, channel)
	if err != nil {
		p.API.LogError("[Kontur] Failed to resolve participants", "error", err.Error())
		writeErrorResponse(w, http.StatusBadRequest, RequestFieldParticipantIDs, err.Error())
		return
	}

	// Step 5: Get configuration and check webhook URL
	config := p.getConfiguration()
	if config == nil || config.WebhookURL == "" {
		p.API.LogError("[Kontur] Webhook URL not configured")
		writeErrorResponse(w, http.StatusBadRequest, RequestFieldGeneral, "Webhook URL не настроен. Обратитесь к администратору.")
		return
	}

	// Step 6: Build and send webhook
	webhookPayload := p.buildWebhookPayload(req, currentUser, channel, participants, scheduledAt)
	webhookData, err := p.sendWebhook(config.WebhookURL, webhookPayload)
	if err != nil {
		p.API.LogError("[Kontur] Webhook request failed", "error", err.Error())
		
		// Detailed error message for webhook failures
		errorMsg := "Не удалось создать встречу.\n\n"
		errorMsg += "🔌 Не удалось подключиться к вебхуку:\n"
		errorMsg += config.WebhookURL
		errorMsg += "\n\nПроверьте:\n"
		errorMsg += "1. n8n запущен и доступен\n"
		errorMsg += "2. Workflow активирован\n"
		errorMsg += "3. URL указан правильно"
		
		writeErrorResponse(w, http.StatusInternalServerError, "general", errorMsg)
		return
	}

	// Step 7: Get room URL from webhook response
	roomURL := ""
	if url, ok := webhookData["room_url"].(string); ok {
		roomURL = url
	} else if url, ok := webhookData["meeting_url"].(string); ok {
		roomURL = url
	}

	// Step 8: Create post in channel
	if err := p.createPost(channel, currentUser, participants, scheduledAt, req.DurationMinutes, roomURL); err != nil {
		// Don't fail the request if post creation fails (meeting is already created)
		p.API.LogWarn("[Kontur] Failed to create post, but meeting was created", "error", err.Error())
	}

	// Step 9: Return success response
	// TODO: Consider moving to LogDebug for production - only business-critical logs should stay at Info
	p.API.LogInfo("[Kontur] Meeting scheduled successfully", "room_url", roomURL)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{
		"status":   "success",
		"message":  "Встреча успешно создана",
		"room_url": roomURL,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		p.API.LogError("[Kontur] Failed to encode success response", "error", err.Error())
	}
}

func main() {
	plugin.ClientMain(&Plugin{})
}
