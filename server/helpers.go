package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/mattermost/mattermost-server/v6/model"
)

// getUserSafely safely retrieves a user by ID with proper error handling
func (p *Plugin) getUserSafely(userID string) (*model.User, error) {
	if userID == "" {
		return nil, fmt.Errorf("user ID is empty")
	}

	// TODO: Consider moving to LogDebug for production - successful API calls create log noise
	p.API.LogInfo("[Kontur] Getting user", "user_id", userID)
	user, appErr := p.API.GetUser(userID)

	// In Mattermost API, GetUser can return both error and user
	// If user is retrieved, continue even if there's an error
	if user != nil {
		// TODO: Consider moving to LogDebug for production - successful API calls create log noise
		p.API.LogInfo("[Kontur] User obtained successfully", 
			"user_id", userID,
			"username", user.Username)
		return user, nil
	}

	// Only process error if user is nil
	if appErr != nil {
		errorMsg := "unknown error"
		if appErr.Message != "" {
			errorMsg = appErr.Message
		} else if appErr.DetailedError != "" {
			errorMsg = appErr.DetailedError
		} else if appErr.Id != "" {
			errorMsg = fmt.Sprintf("AppError (id: %s)", appErr.Id)
		}
		p.API.LogError("[Kontur] Failed to get user", "user_id", userID, "error", errorMsg)
		return nil, fmt.Errorf("user not found: %s", userID)
	}

	// User is nil but no error
	p.API.LogError("[Kontur] GetUser returned nil without error", "user_id", userID)
	return nil, fmt.Errorf("user not found: %s", userID)
}

// getChannelSafely safely retrieves a channel by ID with proper error handling
func (p *Plugin) getChannelSafely(channelID string) (*model.Channel, error) {
	if channelID == "" {
		return nil, fmt.Errorf("channel ID is empty")
	}

	// TODO: Consider moving to LogDebug for production - successful API calls create log noise
	p.API.LogInfo("[Kontur] Getting channel", "channel_id", channelID)
	channel, appErr := p.API.GetChannel(channelID)

	// In Mattermost API, GetChannel can return both error and channel
	// If channel is retrieved, continue even if there's an error
	if channel != nil {
		channelName := channel.Name
		if channelName == "" {
			channelName = "<unnamed>"
		}
		// TODO: Consider moving to LogDebug for production - successful API calls create log noise
		p.API.LogInfo("[Kontur] Channel obtained successfully", 
			"channel_id", channelID,
			"channel_name", channelName)
		return channel, nil
	}

	// Only process error if channel is nil
	if appErr != nil {
		errorMsg := "unknown error"
		if appErr.Message != "" {
			errorMsg = appErr.Message
		} else if appErr.DetailedError != "" {
			errorMsg = appErr.DetailedError
		}
		p.API.LogError("[Kontur] Failed to get channel", "channel_id", channelID, "error", errorMsg)
		return nil, fmt.Errorf("channel not found: %s", channelID)
	}

	// Channel is nil but no error
	p.API.LogError("[Kontur] GetChannel returned nil without error", "channel_id", channelID)
	return nil, fmt.Errorf("channel not found: %s", channelID)
}

// writeErrorResponse writes a standardized error response
func writeErrorResponse(w http.ResponseWriter, status int, field, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	response := map[string]interface{}{
		"errors": []map[string]string{{
			"field":   field,
			"message": message,
		}},
	}
	json.NewEncoder(w).Encode(response)
}

