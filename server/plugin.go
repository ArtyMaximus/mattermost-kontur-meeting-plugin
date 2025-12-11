package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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


// ScheduleMeetingRequest represents the new schedule meeting request format
type ScheduleMeetingRequest struct {
	ChannelID      string   `json:"channel_id"`
	TeamID         string   `json:"team_id"`
	UserID         string   `json:"user_id"`
	StartAt        string   `json:"start_at"`        // ISO string (UTC) - для обратной совместимости
	StartAtLocal   string   `json:"start_at_local"`  // Локальное время в формате YYYY-MM-DDTHH:mm:ss+03:00
	Timezone       string   `json:"timezone"`       // Часовой пояс (например, "Europe/Moscow")
	DurationMinutes int     `json:"duration_minutes"`
	Title          *string  `json:"title"`          // Optional
	ParticipantIDs []string `json:"participant_ids"`
}

// handleScheduleMeeting handles the new schedule meeting endpoint
func (p *Plugin) handleScheduleMeeting(w http.ResponseWriter, r *http.Request) {
	// Recover from panic
	defer func() {
		if rec := recover(); rec != nil {
			// Безопасно логируем панику - проверяем p.API на nil
			if p != nil && p.API != nil {
				p.API.LogError("[Kontur] schedule-meeting error: Panic recovered", "panic", fmt.Sprintf("%v", rec))
			}
			// Убеждаемся, что заголовки ещё не были отправлены
			if w.Header().Get("Content-Type") == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				response := map[string]interface{}{
					"errors": []map[string]string{{
						"field":   "general",
						"message": fmt.Sprintf("Внутренняя ошибка сервера: %v", rec),
					}},
				}
				if encodeErr := json.NewEncoder(w).Encode(response); encodeErr != nil {
					if p != nil && p.API != nil {
						p.API.LogError("[Kontur] schedule-meeting error: Failed to encode panic response", "error", encodeErr.Error())
					}
				}
			}
		}
	}()

	// Проверка на nil для p и p.API в самом начале
	if p == nil {
		http.Error(w, "Plugin not initialized", http.StatusInternalServerError)
		return
	}
	
	if p.API == nil {
		http.Error(w, "API not initialized", http.StatusInternalServerError)
		return
	}

	// Log that handler was called
	p.API.LogInfo("[Kontur] schedule-meeting called")

	// Only allow POST requests
	if r.Method != http.MethodPost {
		p.API.LogWarn("[Kontur] schedule-meeting: Method not allowed", "method", r.Method)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Метод не разрешён. Используйте POST.",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Read request body for logging
	bodyBytes := make([]byte, 0)
	if r.Body != nil {
		var readErr error
		bodyBytes, readErr = io.ReadAll(r.Body)
		if readErr != nil {
			p.API.LogError("[Kontur] schedule-meeting error: Failed to read request body", "error", readErr.Error())
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{
				"errors": []map[string]string{{
					"field":   "general",
					"message": "Не удалось прочитать запрос",
				}},
			}
			json.NewEncoder(w).Encode(response)
			return
		}
		// Restore body for decoding
		r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	}

	// Log incoming request with full body
	p.API.LogInfo("[Kontur] schedule-meeting: Incoming request", "body", string(bodyBytes))

	// Parse request body
	var req ScheduleMeetingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		p.API.LogError("[Kontur] schedule-meeting error: Failed to parse JSON", "error", err.Error(), "body", string(bodyBytes))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Неверный формат JSON: " + err.Error(),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Log parsed request fields
	p.API.LogInfo("[Kontur] schedule-meeting: Parsed request",
		"channel_id", req.ChannelID,
		"team_id", req.TeamID,
		"user_id", req.UserID,
		"start_at", req.StartAt,
		"start_at_local", req.StartAtLocal,
		"timezone", req.Timezone,
		"duration_minutes", req.DurationMinutes,
		"title", func() string {
			if req.Title != nil {
				return *req.Title
			}
			return "<nil>"
		}(),
		"participant_ids", req.ParticipantIDs,
	)
	
	// КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: проверяем user_id сразу после декодирования
	p.API.LogInfo("[Kontur] schedule-meeting user check", 
		"user_id_from_request", req.UserID,
		"user_id_is_empty", req.UserID == "",
		"user_id_length", len(req.UserID),
		"raw_body_contains_user_id", bytes.Contains(bodyBytes, []byte("user_id")))

	// Validate required fields
	errors := []map[string]string{}

	// Validate channel_id
	if req.ChannelID == "" {
		errors = append(errors, map[string]string{
			"field":   "channel_id",
			"message": "channel_id обязателен",
		})
	}

	// Validate user_id - с детальным логированием
	p.API.LogInfo("[Kontur] schedule-meeting: Validating user_id", 
		"user_id", req.UserID,
		"user_id_empty", req.UserID == "",
		"user_id_length", len(req.UserID))
	if req.UserID == "" {
		p.API.LogError("[Kontur] schedule-meeting error: user_id is empty after JSON decode")
		errors = append(errors, map[string]string{
			"field":   "user_id",
			"message": "user_id обязателен",
		})
	}

	// Validate start_at_local (приоритетное поле) или start_at (для обратной совместимости)
	var scheduledAt time.Time
	var scheduledAtLocal time.Time
	var err error
	
	if req.StartAtLocal != "" {
		// Парсим локальное время с часовым поясом
		// Пробуем разные форматы: RFC3339, с плюсом, с минусом, без секунд
		formats := []string{
			time.RFC3339,                    // 2006-01-02T15:04:05Z07:00
			"2006-01-02T15:04:05-07:00",     // с минусом
			"2006-01-02T15:04:05+07:00",     // с плюсом
			"2006-01-02T15:04:05Z",          // UTC
			"2006-01-02T15:04-07:00",        // без секунд, с минусом
			"2006-01-02T15:04+07:00",        // без секунд, с плюсом
		}
		
		parsed := false
		for _, format := range formats {
			scheduledAtLocal, err = time.Parse(format, req.StartAtLocal)
			if err == nil {
				parsed = true
				p.API.LogInfo("[Kontur] schedule-meeting: Parsed start_at_local", 
					"input", req.StartAtLocal, 
					"format", format,
					"parsed", scheduledAtLocal.Format(time.RFC3339))
				break
			}
		}
		
		if !parsed {
			p.API.LogError("[Kontur] schedule-meeting error: Failed to parse start_at_local", 
				"start_at_local", req.StartAtLocal, 
				"error", err.Error())
			errors = append(errors, map[string]string{
				"field":   "start_at_local",
				"message": fmt.Sprintf("Неверный формат локального времени: %s (ожидается YYYY-MM-DDTHH:mm:ss+03:00)", req.StartAtLocal),
			})
		} else {
			// Используем локальное время для валидации
			scheduledAt = scheduledAtLocal
		}
	} else if req.StartAt != "" {
		// Fallback на UTC для обратной совместимости
		// Пробуем разные форматы: RFC3339, с миллисекундами, с наносекундами
		formats := []string{
			time.RFC3339,                    // 2006-01-02T15:04:05Z07:00
			time.RFC3339Nano,                // 2006-01-02T15:04:05.999999999Z07:00
			"2006-01-02T15:04:05.000Z",      // с миллисекундами и Z
			"2006-01-02T15:04:05Z",          // без секунд, с Z
		}
		
		parsed := false
		for _, format := range formats {
			scheduledAt, err = time.Parse(format, req.StartAt)
			if err == nil {
				parsed = true
				p.API.LogInfo("[Kontur] schedule-meeting: Parsed start_at", 
					"input", req.StartAt, 
					"format", format,
					"parsed", scheduledAt.Format(time.RFC3339))
				break
			}
		}
		
		if !parsed {
			p.API.LogError("[Kontur] schedule-meeting error: Failed to parse start_at", 
				"start_at", req.StartAt, 
				"error", err.Error())
			errors = append(errors, map[string]string{
				"field":   "start_at",
				"message": fmt.Sprintf("Неверный формат даты и времени: %s (ожидается ISO 8601)", req.StartAt),
			})
		}
	} else {
		p.API.LogError("[Kontur] schedule-meeting error: Missing start_at_local and start_at")
		errors = append(errors, map[string]string{
			"field":   "start_at_local",
			"message": "Дата и время обязательны (укажите start_at_local или start_at)",
		})
	}
	
	// Валидация даты и времени
	if !scheduledAt.IsZero() {
		now := time.Now()
		maxDate := now.Add(30 * 24 * time.Hour)
		if scheduledAt.Before(now) {
			p.API.LogError("[Kontur] schedule-meeting error: Scheduled time in the past", 
				"scheduled_at", scheduledAt.Format(time.RFC3339),
				"now", now.Format(time.RFC3339))
			errors = append(errors, map[string]string{
				"field":   "start_at_local",
				"message": "Дата и время не могут быть в прошлом",
			})
		}
		if scheduledAt.After(maxDate) {
			p.API.LogError("[Kontur] schedule-meeting error: Scheduled time too far in future", 
				"scheduled_at", scheduledAt.Format(time.RFC3339),
				"max_date", maxDate.Format(time.RFC3339))
			errors = append(errors, map[string]string{
				"field":   "start_at_local",
				"message": "Дата не может быть более чем через 30 дней",
			})
		}
	}

	// Validate duration_minutes
	if req.DurationMinutes < 5 {
		p.API.LogError("[Kontur] schedule-meeting error: Duration too short", "duration_minutes", req.DurationMinutes)
		errors = append(errors, map[string]string{
			"field":   "duration_minutes",
			"message": "Продолжительность должна быть не менее 5 минут",
		})
	} else if req.DurationMinutes > 480 {
		p.API.LogError("[Kontur] schedule-meeting error: Duration too long", "duration_minutes", req.DurationMinutes)
		errors = append(errors, map[string]string{
			"field":   "duration_minutes",
			"message": "Продолжительность не может превышать 480 минут (8 часов)",
		})
	}

	// Validate title (if provided)
	if req.Title != nil && len(*req.Title) > 100 {
		errors = append(errors, map[string]string{
			"field":   "title",
			"message": "Название не может быть длиннее 100 символов",
		})
	}

	// Валидация участников будет выполнена после получения канала,
	// т.к. для DM каналов участник добавляется автоматически
	// Пока что пропускаем эту валидацию

	// If there are validation errors (кроме участников), return them
	if len(errors) > 0 {
		p.API.LogError("[Kontur] schedule-meeting error: Validation failed", "error_count", len(errors), "errors", errors)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		response := map[string]interface{}{
			"errors": errors,
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	// Переменные scheduledAt, scheduledAtLocal и err уже объявлены и заполнены в блоке валидации выше
	// Если валидация прошла успешно, но scheduledAt все еще нулевой (не должно быть), используем fallback
	if scheduledAt.IsZero() {
		// Это не должно произойти, так как валидация уже проверила наличие времени
		// Но на всякий случай используем UTC fallback
		p.API.LogWarn("[Kontur] schedule-meeting: scheduledAt is zero, trying fallback")
		if req.StartAt != "" {
			var parseErr error
			scheduledAt, parseErr = time.Parse(time.RFC3339, req.StartAt)
			if parseErr != nil {
				p.API.LogError("[Kontur] schedule-meeting error: Failed to parse fallback start_at", "error", parseErr.Error())
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				response := map[string]interface{}{
					"errors": []map[string]string{{
						"field":   "start_at",
						"message": "Не удалось распарсить дату и время",
					}},
				}
				json.NewEncoder(w).Encode(response)
				return
			}
		} else {
			// Если нет ни start_at, ни start_at_local, это ошибка
			p.API.LogError("[Kontur] schedule-meeting error: scheduledAt is zero and no fallback available")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{
				"errors": []map[string]string{{
					"field":   "start_at_local",
					"message": "Не удалось определить дату и время встречи",
				}},
			}
			json.NewEncoder(w).Encode(response)
			return
		}
	}
	
	// Вычисляем время окончания
	// Безопасно проверяем, что scheduledAt не нулевой
	if scheduledAt.IsZero() {
		p.API.LogError("[Kontur] schedule-meeting error: scheduledAt is still zero after fallback")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "start_at_local",
				"message": "Не удалось определить дату и время встречи",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	endTime := scheduledAt.Add(time.Duration(req.DurationMinutes) * time.Minute)
	
	// Форматируем время для вебхука
	var scheduledAtISO string
	var scheduledAtLocalISO string
	var endTimeISO string
	var endTimeLocalISO string
	
	if req.StartAtLocal != "" && !scheduledAtLocal.IsZero() {
		// Используем локальное время из запроса
		scheduledAtLocalISO = req.StartAtLocal
		
		// Безопасно получаем offset и location из scheduledAtLocal
		// Проверяем, что scheduledAtLocal действительно валидный
		if scheduledAtLocal.IsZero() {
			p.API.LogError("[Kontur] schedule-meeting error: scheduledAtLocal is zero when trying to get zone")
			// Fallback на UTC
			scheduledAtISO = scheduledAt.Format(time.RFC3339)
			endTimeISO = endTime.Format(time.RFC3339)
			scheduledAtLocalISO = scheduledAtISO
			endTimeLocalISO = endTimeISO
		} else {
			// Безопасно получаем offset из scheduledAtLocal
			_, offset := scheduledAtLocal.Zone()
			offsetHours := offset / 3600
			offsetMinutes := (offset % 3600) / 60
			offsetStr := fmt.Sprintf("%+03d:%02d", offsetHours, offsetMinutes)
			
			// Безопасно получаем location из scheduledAtLocal
			loc := scheduledAtLocal.Location()
			if loc == nil {
				p.API.LogWarn("[Kontur] schedule-meeting: scheduledAtLocal.Location() returned nil, using UTC")
				loc = time.UTC
			}
			
			// Вычисляем endTime в том же часовом поясе, что и scheduledAtLocal
			endTimeLocal := endTime.In(loc)
			year, month, day := endTimeLocal.Date()
			hour, min, sec := endTimeLocal.Clock()
			endTimeLocalISO = fmt.Sprintf("%04d-%02d-%02dT%02d:%02d:%02d%s", 
				year, int(month), day, hour, min, sec, offsetStr)
			
			// Также сохраняем UTC для обратной совместимости
			scheduledAtISO = scheduledAt.Format(time.RFC3339)
			endTimeISO = endTime.Format(time.RFC3339)
		}
	} else {
		// Fallback на UTC
		scheduledAtISO = scheduledAt.Format(time.RFC3339)
		endTimeISO = endTime.Format(time.RFC3339)
		scheduledAtLocalISO = scheduledAtISO
		endTimeLocalISO = endTimeISO
	}

	// Get current user - КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ перед вызовом GetUser
	p.API.LogInfo("[Kontur] schedule-meeting: Getting current user", 
		"user_id", req.UserID,
		"user_id_length", len(req.UserID),
		"user_id_empty", req.UserID == "")
	p.API.LogInfo("[Kontur] schedule-meeting: About to call GetUser", 
		"user_id", req.UserID,
		"user_id_type", fmt.Sprintf("%T", req.UserID))
	currentUser, err := p.API.GetUser(req.UserID)
	
	// Безопасно логируем результат GetUser
	errIsNil := false
	currentUserIsNil := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				p.API.LogError("[Kontur] schedule-meeting error: Panic checking GetUser result", "panic", fmt.Sprintf("%v", r))
			}
		}()
		errIsNil = (err == nil)
		currentUserIsNil = (currentUser == nil)
	}()
	p.API.LogInfo("[Kontur] schedule-meeting: GetUser returned", "user_id", req.UserID, "err_is_nil", errIsNil, "currentUser_is_nil", currentUserIsNil)
	
	// В Mattermost API GetUser может вернуть и ошибку, и пользователя одновременно
	// Если пользователь получен, игнорируем ошибку и продолжаем
	if currentUser != nil {
		p.API.LogInfo("[Kontur] schedule-meeting: Current user obtained successfully", 
			"user_id", req.UserID,
			"has_error", err != nil,
			"ignoring_error", err != nil)
		// Продолжаем работу, даже если есть ошибка
	} else if err != nil {
		// Только если пользователь не получен И есть ошибка - обрабатываем ошибку
		p.API.LogInfo("[Kontur] schedule-meeting: About to check err != nil")
		p.API.LogInfo("[Kontur] schedule-meeting: err != nil is true, about to get error message")
		// Безопасно получаем текст ошибки
		// Проверяем, что err не является nil-указателем на *model.AppError
		errorMsg := "unknown error"
		
		// Сначала пробуем type assertion для *model.AppError
		// В Go интерфейс error может быть не nil, но значение внутри nil
		appErr, isAppError := err.(*model.AppError)
		if isAppError {
			// Проверяем, что указатель не nil
			if appErr != nil {
				// Это model.AppError - безопасно получаем сообщение
				// Защищаем каждое обращение к полю
				func() {
					defer func() {
						if r := recover(); r != nil {
							p.API.LogError("[Kontur] schedule-meeting error: Panic accessing AppError fields", "panic", fmt.Sprintf("%v", r))
							errorMsg = "AppError (panic accessing fields)"
						}
					}()
					if appErr.Message != "" {
						errorMsg = appErr.Message
					} else if appErr.DetailedError != "" {
						errorMsg = appErr.DetailedError
					} else if appErr.Id != "" {
						errorMsg = fmt.Sprintf("AppError (id: %s)", appErr.Id)
					} else {
						errorMsg = "AppError (no message)"
					}
				}()
			} else {
				// AppError указатель nil - это странно, но обрабатываем
				// В Go интерфейс error может быть не nil, но значение внутри nil
				errorMsg = "AppError is nil pointer (interface error is not nil but value is nil)"
				p.API.LogError("[Kontur] schedule-meeting error: AppError pointer is nil", "user_id", req.UserID)
			}
		} else {
			// Другой тип ошибки - безопасно вызываем Error()
			// Но сначала проверяем, что err действительно не nil
			func() {
				defer func() {
					if r := recover(); r != nil {
						p.API.LogError("[Kontur] schedule-meeting error: Panic getting error message", "panic", fmt.Sprintf("%v", r))
						// Используем fmt.Sprintf для безопасного получения типа
						errorMsg = fmt.Sprintf("error type: %T", err)
					}
				}()
				// Проверяем, что err не nil и не является nil указателем
				if err != nil {
					// Пробуем получить строковое представление ошибки
					errorMsg = err.Error()
				} else {
					errorMsg = "error is nil"
				}
			}()
		}
		p.API.LogError("[Kontur] schedule-meeting error: Failed to get current user", "user_id", req.UserID, "error", errorMsg)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "user_id",
				"message": fmt.Sprintf("Пользователь не найден: %s", req.UserID),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	if currentUser == nil {
		p.API.LogError("[Kontur] schedule-meeting error: GetUser returned nil for current user", "user_id", req.UserID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "user_id",
				"message": fmt.Sprintf("Пользователь не найден: %s", req.UserID),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	p.API.LogInfo("[Kontur] schedule-meeting: currentUser is not nil, safely accessing Username")
	// Безопасно логируем username - используем recover для защиты от паники
	usernameForLog := "<unknown>"
	func() {
		defer func() {
			if r := recover(); r != nil {
				p.API.LogError("[Kontur] schedule-meeting error: Panic accessing currentUser.Username", "panic", fmt.Sprintf("%v", r))
				usernameForLog = "<panic>"
			}
		}()
		if currentUser.Username != "" {
			usernameForLog = currentUser.Username
		}
	}()
	p.API.LogInfo("[Kontur] schedule-meeting: Current user loaded", "user_id", req.UserID, "username", usernameForLog)

	// Get channel
	p.API.LogInfo("[Kontur] schedule-meeting: Getting channel", "channel_id", req.ChannelID)
	p.API.LogInfo("[Kontur] schedule-meeting: About to call GetChannel", "channel_id", req.ChannelID)
	channel, err := p.API.GetChannel(req.ChannelID)
	p.API.LogInfo("[Kontur] schedule-meeting: GetChannel returned", "channel_id", req.ChannelID, "err_is_nil", err == nil, "channel_is_nil", channel == nil)
	
	// В Mattermost API GetChannel может вернуть и ошибку, и канал одновременно
	// Если канал получен, игнорируем ошибку и продолжаем
	if channel != nil {
		p.API.LogInfo("[Kontur] schedule-meeting: Channel obtained successfully", 
			"channel_id", req.ChannelID,
			"has_error", err != nil,
			"ignoring_error", err != nil)
		// Продолжаем работу, даже если есть ошибка
	} else if err != nil {
		// Только если канал не получен И есть ошибка - обрабатываем ошибку
		// Безопасно получаем текст ошибки
		errorMsg := "unknown error"
		appErr, isAppError := err.(*model.AppError)
		if isAppError && appErr != nil {
			if appErr.Message != "" {
				errorMsg = appErr.Message
			} else if appErr.DetailedError != "" {
				errorMsg = appErr.DetailedError
			} else {
				errorMsg = "AppError (no message)"
			}
		} else {
			func() {
				defer func() {
					if r := recover(); r != nil {
						errorMsg = fmt.Sprintf("error type: %T", err)
					}
				}()
				if err != nil {
					errorMsg = err.Error()
				}
			}()
		}
		p.API.LogError("[Kontur] schedule-meeting error: Failed to get channel", "channel_id", req.ChannelID, "error", errorMsg)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "channel_id",
				"message": fmt.Sprintf("Канал не найден: %s", req.ChannelID),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	} else {
		// Канал не получен, но ошибки нет
		p.API.LogError("[Kontur] schedule-meeting error: GetChannel returned nil", "channel_id", req.ChannelID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "channel_id",
				"message": fmt.Sprintf("Канал не найден: %s", req.ChannelID),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	// Безопасно логируем channel name
	channelNameForLog := "<nil>"
	if channel != nil && channel.Name != "" {
		channelNameForLog = channel.Name
	}
	p.API.LogInfo("[Kontur] schedule-meeting: Channel loaded", "channel_id", req.ChannelID, "channel_name", channelNameForLog)

	// Проверяем, является ли канал директом (DM), и автоматически добавляем собеседника
	// ВАЖНО: Делаем это ДО валидации участников
	if channel != nil && channel.Type == model.ChannelTypeDirect {
		p.API.LogInfo("[Kontur] schedule-meeting: Channel is DM, getting other user", 
			"channel_id", channel.Id,
			"current_user_id", req.UserID)
		
		// Используем метод канала для получения ID другого пользователя
		// В Mattermost v6+ есть метод GetOtherUserIdForDM на объекте Channel
		otherUserId := channel.GetOtherUserIdForDM(req.UserID)
		p.API.LogInfo("[Kontur] schedule-meeting: GetOtherUserIdForDM result",
			"other_user_id", otherUserId,
			"other_user_id_empty", otherUserId == "",
			"other_user_id_length", len(otherUserId),
			"channel_id", channel.Id,
			"current_user_id", req.UserID)
		
		if otherUserId != "" {
			p.API.LogInfo("[Kontur] schedule-meeting: Found other user in DM", "other_user_id", otherUserId)
			// Если список участников пустой, автоматически добавляем собеседника
			if len(req.ParticipantIDs) == 0 {
				p.API.LogInfo("[Kontur] schedule-meeting: Participant list is empty, auto-adding other user")
				req.ParticipantIDs = []string{otherUserId}
			} else {
				// Проверяем, есть ли уже этот пользователь в списке
				found := false
				for _, pid := range req.ParticipantIDs {
					if pid == otherUserId {
						found = true
						break
					}
				}
				// Если его нет, добавляем
				if !found {
					p.API.LogInfo("[Kontur] schedule-meeting: Other user not in list, adding")
					req.ParticipantIDs = append(req.ParticipantIDs, otherUserId)
				}
			}
		} else {
			p.API.LogWarn("[Kontur] schedule-meeting: Could not get other user ID from DM channel",
				"channel_id", channel.Id,
				"channel_type", channel.Type,
				"current_user_id", req.UserID)
		}
	}

	// Логируем участников перед валидацией
	p.API.LogInfo("[Kontur] Before validate participants",
		"channel_type", func() string {
			if channel != nil {
				return string(channel.Type)
			}
			return "unknown"
		}(),
		"user_id", req.UserID,
		"participant_ids", req.ParticipantIDs,
		"participant_ids_count", len(req.ParticipantIDs),
		"participant_ids_detail", fmt.Sprintf("%+v", req.ParticipantIDs))

	// Validate participants (после получения канала и возможного добавления для DM)
	// Для DM каналов участник уже добавлен автоматически выше
	if len(req.ParticipantIDs) == 0 {
		// Проверяем тип канала - если это не DM, то участники обязательны
		if channel == nil || channel.Type != model.ChannelTypeDirect {
			validationError := map[string]interface{}{
				"errors": []map[string]string{{
					"field":   "participant_ids",
					"message": "Выберите хотя бы одного участника",
				}},
			}
			p.API.LogError("[Kontur] schedule-meeting validation error: No participants (non-DM)",
				"errors", fmt.Sprintf("%+v", validationError),
				"channel_type", func() string {
					if channel != nil {
						return string(channel.Type)
					}
					return "nil"
				}())
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(validationError)
			return
		} else {
			// Для DM каналов это не должно произойти, т.к. мы уже добавили otherUserId выше
			// Но на всякий случай логируем предупреждение
			validationError := map[string]interface{}{
				"errors": []map[string]string{{
					"field":   "participant_ids",
					"message": "Не удалось определить участника директ-канала",
				}},
			}
			p.API.LogError("[Kontur] schedule-meeting validation error: DM channel but no participants after auto-add",
				"errors", fmt.Sprintf("%+v", validationError),
				"channel_id", channel.Id,
				"channel_type", string(channel.Type),
				"current_user_id", req.UserID)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(validationError)
			return
		}
	}

	// Get participants info (ПОСЛЕ автодобавления для DM и валидации)
	p.API.LogInfo("[Kontur] schedule-meeting: Getting participants",
		"count", len(req.ParticipantIDs),
		"participant_ids", fmt.Sprintf("%+v", req.ParticipantIDs))
	participants := make([]map[string]interface{}, 0)
	failedUserIDs := make([]string, 0)
	for _, userId := range req.ParticipantIDs {
		p.API.LogInfo("[Kontur] schedule-meeting: Getting user", "user_id", userId)
		user, err := p.API.GetUser(userId)
		if err != nil || user == nil {
			if err != nil {
				p.API.LogError("[Kontur] schedule-meeting error: Failed to get user", "user_id", userId, "error", err.Error())
			} else {
				p.API.LogError("[Kontur] schedule-meeting error: GetUser returned nil", "user_id", userId)
			}
			failedUserIDs = append(failedUserIDs, userId)
			continue
		}

		participants = append(participants, map[string]interface{}{
			"user_id":    user.Id,
			"username":   user.Username,
			"email":      user.Email,
			"first_name": user.FirstName,
			"last_name":  user.LastName,
		})
		p.API.LogInfo("[Kontur] schedule-meeting: Got user info", "user_id", userId, "username", user.Username)
	}

	if len(participants) == 0 {
		validationError := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "participant_ids",
				"message": fmt.Sprintf("Не удалось получить информацию об участниках (запрошено: %d, найдено: 0)", len(req.ParticipantIDs)),
			}},
		}
		p.API.LogError("[Kontur] schedule-meeting validation error: No valid participants found",
			"errors", fmt.Sprintf("%+v", validationError),
			"requested_count", len(req.ParticipantIDs),
			"requested_participant_ids", fmt.Sprintf("%+v", req.ParticipantIDs),
			"failed_user_ids", failedUserIDs)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(validationError)
		return
	}
	
	p.API.LogInfo("[Kontur] schedule-meeting: Participants loaded", 
		"requested_count", len(req.ParticipantIDs),
		"loaded_count", len(participants),
		"failed_count", len(failedUserIDs))

	// Get meeting title
	meetingTitle := ""
	if req.Title != nil {
		meetingTitle = *req.Title
	}

	// Get webhook URL from configuration
	p.API.LogInfo("[Kontur] schedule-meeting: Getting configuration")
	config := p.getConfiguration()
	if config == nil {
		p.API.LogError("[Kontur] schedule-meeting error: getConfiguration returned nil")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Ошибка конфигурации плагина",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	if config.WebhookURL == "" {
		p.API.LogError("[Kontur] schedule-meeting error: Webhook URL not configured")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Webhook URL не настроен. Обратитесь к администратору.",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	p.API.LogInfo("[Kontur] schedule-meeting: Webhook URL configured", "webhook_url", config.WebhookURL)

	// Определяем часовой пояс (по умолчанию MSK)
	timezone := req.Timezone
	if timezone == "" {
		timezone = "Europe/Moscow"
	}
	
	// Prepare webhook payload
	// Безопасно получаем значения полей
	channelID := ""
	channelName := ""
	channelType := ""
	if channel != nil {
		channelID = channel.Id
		channelName = channel.Name
		channelType = string(channel.Type)
	}
	
	userID := ""
	username := ""
	userEmail := ""
	if currentUser != nil {
		userID = currentUser.Id
		username = currentUser.Username
		userEmail = currentUser.Email
	}
	
	webhookPayload := map[string]interface{}{
		"operation_type":    "scheduled_meeting",
		"scheduled_at":      scheduledAtISO,        // UTC для обратной совместимости
		"scheduled_at_local": scheduledAtLocalISO, // Локальное время MSK
		"end_time":          endTimeISO,            // UTC для обратной совместимости
		"end_time_local":    endTimeLocalISO,       // Локальное время окончания MSK
		"timezone":          timezone,               // Часовой пояс
		"duration_minutes":  req.DurationMinutes,
		"title":             meetingTitle,
		"description":       nil,
		"channel_id":        channelID,
		"channel_name":      channelName,
		"channel_type":      channelType,
		"user_id":           userID,
		"username":          username,
		"user_email":        userEmail,
		"participants":      participants,
		"auto_detected":     false,
		"source":            "user_selection",
		"timestamp":         time.Now().Format(time.RFC3339),
	}

	// Send request to n8n webhook
	payloadJSON, marshalErr := json.Marshal(webhookPayload)
	if marshalErr != nil {
		p.API.LogError("[Kontur] schedule-meeting error: Failed to marshal webhook payload", "error", marshalErr.Error())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Ошибка при подготовке данных для отправки: " + marshalErr.Error(),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	p.API.LogInfo("[Kontur] schedule-meeting: Sending request to webhook", 
		"url", config.WebhookURL,
		"payload_size", len(payloadJSON))
	
	webhookResp, postErr := http.Post(config.WebhookURL, "application/json", bytes.NewBuffer(payloadJSON))
	if postErr != nil {
		p.API.LogError("[Kontur] schedule-meeting error: Failed to send webhook request", 
			"url", config.WebhookURL,
			"error", postErr.Error())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		
		// Формируем детальное сообщение об ошибке подключения к вебхуку
		errorMsg := "Не удалось создать встречу.\n\n"
		errorMsg += "🔌 Не удалось подключиться к вебхуку:\n"
		errorMsg += config.WebhookURL
		errorMsg += "\n\nПроверьте:\n"
		errorMsg += "1. n8n запущен и доступен\n"
		errorMsg += "2. Workflow активирован\n"
		errorMsg += "3. URL указан правильно"
		
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": errorMsg,
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Закрываем body только если запрос успешен
	if webhookResp == nil {
		p.API.LogError("[Kontur] schedule-meeting error: Webhook response is nil")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Вебхук не вернул ответ",
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	defer webhookResp.Body.Close()
	
	p.API.LogInfo("[Kontur] schedule-meeting: Webhook response received", 
		"status_code", webhookResp.StatusCode,
		"status", webhookResp.Status)

	// Read webhook response body for logging
	webhookBodyBytes, readErr := io.ReadAll(webhookResp.Body)
	if readErr != nil {
		p.API.LogError("[Kontur] schedule-meeting error: Failed to read webhook response body", "error", readErr.Error())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": "Не удалось прочитать ответ от вебхука: " + readErr.Error(),
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	responseBodyStr := string(webhookBodyBytes)
	p.API.LogInfo("[Kontur] schedule-meeting: Webhook response body", 
		"body", responseBodyStr,
		"body_length", len(webhookBodyBytes))

	// Parse webhook response
	var webhookData map[string]interface{}
	
	// Если тело пустое, создаём пустой объект
	if len(webhookBodyBytes) == 0 {
		p.API.LogWarn("[Kontur] schedule-meeting: Webhook returned empty body")
		webhookData = make(map[string]interface{})
	} else {
		if decodeErr := json.NewDecoder(bytes.NewBuffer(webhookBodyBytes)).Decode(&webhookData); decodeErr != nil {
			p.API.LogError("[Kontur] schedule-meeting error: Failed to parse webhook response JSON", 
				"error", decodeErr.Error(),
				"response_body", responseBodyStr,
				"status_code", webhookResp.StatusCode)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			response := map[string]interface{}{
				"errors": []map[string]string{{
					"field":   "general",
					"message": fmt.Sprintf("Неверный формат ответа от вебхука (статус %d): %s. Ответ: %s", webhookResp.StatusCode, decodeErr.Error(), responseBodyStr),
				}},
			}
			json.NewEncoder(w).Encode(response)
			return
		}
	}
	
	p.API.LogInfo("[Kontur] schedule-meeting: Webhook response parsed", "data", webhookData)

	// Check if webhook returned error
	if webhookResp.StatusCode != http.StatusOK {
		errorMsg := fmt.Sprintf("Вебхук вернул ошибку (статус %d)", webhookResp.StatusCode)
		if msg, ok := webhookData["message"].(string); ok && msg != "" {
			errorMsg = msg
		} else if errMsg, ok := webhookData["error"].(string); ok && errMsg != "" {
			errorMsg = errMsg
		}
		p.API.LogError("[Kontur] schedule-meeting error: Webhook returned error status", 
			"status_code", webhookResp.StatusCode,
			"status", webhookResp.Status,
			"message", errorMsg,
			"response_data", webhookData)
		w.Header().Set("Content-Type", "application/json")
		// Используем статус код от вебхука, но не выше 500
		statusCode := webhookResp.StatusCode
		if statusCode > 500 {
			statusCode = 500
		}
		w.WriteHeader(statusCode)
		response := map[string]interface{}{
			"errors": []map[string]string{{
				"field":   "general",
				"message": errorMsg,
			}},
		}
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Check success flag if present (only if status is OK)
	if webhookResp.StatusCode == http.StatusOK {
		if successVal, ok := webhookData["success"]; ok {
			// Проверяем разные типы для success
			var success bool
			switch v := successVal.(type) {
			case bool:
				success = v
			case string:
				success = (v == "true" || v == "1" || v == "yes")
			case float64:
				success = (v != 0)
			default:
				// Если тип неизвестен, считаем успехом
				success = true
			}
			
			if !success {
				errorMsg := "Не удалось создать встречу"
				if msg, ok := webhookData["message"].(string); ok && msg != "" {
					errorMsg = msg
				} else if errMsg, ok := webhookData["error"].(string); ok && errMsg != "" {
					errorMsg = errMsg
				}
				p.API.LogError("[Kontur] schedule-meeting error: Webhook returned success=false", 
					"message", errorMsg,
					"response_data", webhookData)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				response := map[string]interface{}{
					"errors": []map[string]string{{
						"field":   "general",
						"message": errorMsg,
					}},
				}
				json.NewEncoder(w).Encode(response)
				return
			}
		}
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

	// Форматируем локальное время для сообщения
	// Используем локальное время из запроса, если оно есть
	var scheduledAtFormatted string
	if req.StartAtLocal != "" && !scheduledAtLocal.IsZero() {
		// Безопасно форматируем локальное время
		// Используем простой формат без русских названий месяцев для избежания проблем с локализацией
		scheduledAtFormatted = scheduledAtLocal.Format("02.01.2006, 15:04") + " (по МСК)"
	} else if !scheduledAt.IsZero() {
		// Fallback на UTC
		scheduledAtFormatted = scheduledAt.Format("02.01.2006, 15:04") + " (UTC)"
	} else {
		// Если оба времени нулевые, используем исходную строку
		if req.StartAtLocal != "" {
			scheduledAtFormatted = req.StartAtLocal + " (по МСК)"
		} else if req.StartAt != "" {
			scheduledAtFormatted = req.StartAt + " (UTC)"
		} else {
			scheduledAtFormatted = "не указано"
		}
	}

	// Create post message
	// Безопасно получаем username
	postUsername := "пользователь"
	if currentUser != nil && currentUser.Username != "" {
		postUsername = currentUser.Username
	}
	
	postMessage := fmt.Sprintf("📅 @%s запланировал встречу на %s\n\n", postUsername, scheduledAtFormatted)
	postMessage += fmt.Sprintf("Участники: %s\n\n", participantsList)
	postMessage += fmt.Sprintf("Продолжительность: %d минут\n\n", req.DurationMinutes)
	if roomURL != "" {
		postMessage += fmt.Sprintf("[Присоединиться к встрече](%s)", roomURL)
	}

	// Create post in channel
	// Безопасно получаем ID канала и пользователя
	postChannelID := ""
	postUserID := ""
	if channel != nil {
		postChannelID = channel.Id
	}
	if currentUser != nil {
		postUserID = currentUser.Id
	}
	
	post := &model.Post{
		ChannelId: postChannelID,
		Message:   postMessage,
		UserId:    postUserID,
	}

	if _, err := p.API.CreatePost(post); err != nil {
		p.API.LogError("[Kontur] schedule-meeting error: Failed to create post", "error", err.Error())
		// Не возвращаем ошибку, т.к. встреча уже создана
	} else {
		p.API.LogInfo("[Kontur] schedule-meeting: Post created successfully")
	}

	// Success - return success response
	p.API.LogInfo("[Kontur] schedule-meeting: Success", 
		"room_url", roomURL,
		"scheduled_at", scheduledAtFormatted)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{
		"status":  "success",
		"message": "Встреча успешно создана",
		"room_url": roomURL,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		p.API.LogError("[Kontur] schedule-meeting error: Failed to encode success response", "error", err.Error())
		// Не возвращаем ошибку, т.к. встреча уже создана
	}
}

func main() {
	plugin.ClientMain(&Plugin{})
}
