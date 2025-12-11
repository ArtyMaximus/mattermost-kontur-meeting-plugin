package main

import (
	"encoding/json"
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

func main() {
	plugin.ClientMain(&Plugin{})
}
