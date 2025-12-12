# Техническое задание: Запланированные встречи Kontur.Talk (ФИНАЛЬНАЯ ВЕРСИЯ)

## ⚠️ ВАЖНО: Критические исправления учтены

Все замечания из review учтены в этом документе.

---

## 1. Общее описание

### 1.1 Цель
Расширить плагин Kontur.Talk Meeting для поддержки:
- Мгновенных встреч (instant_call) — текущая функциональность
- Запланированных встреч (scheduled_meeting) — новая функциональность

### 1.2 Пользовательский сценарий
1. Пользователь нажимает кнопку в header канала
2. Открывается кастомное React-модальное окно для планирования встречи
3. Пользователь заполняет форму (дата/время, длительность, название, участники)
4. При отправке формы — данные отправляются на серверный endpoint плагина
5. Серверный endpoint обрабатывает данные, отправляет запрос в n8n и создает сообщение в канале

---

## 2. Структура файлов проекта

```
plugin/
├── plugin.json
├── assets/
│   └── icon.svg
├── server/
│   ├── plugin.go
│   └── dist/
│       └── plugin-linux-amd64
└── webapp/
    ├── package.json
    ├── webpack.config.js
    └── src/
        ├── index.js
        └── components/
            └── kontur_meeting_dropdown.jsx  ← НОВЫЙ ФАЙЛ
```

---

## 3. UI/UX требования

### 3.1 Кнопка в channel header

**Текущее состояние:**
- Кнопка в channel header с иконкой видеокамеры
- При клике открывается кастомное React-модальное окно для планирования встречи

**Реализация:** 
Использовать `registry.registerChannelHeaderButtonAction()` для регистрации кнопки.

**Технические детали:**
1. Кнопка регистрируется в `webapp/src/index.js` через `registerChannelHeaderButtonAction`
2. При клике вызывается `handleScheduleMeeting(channel)`, который открывает React-модалку
3. Модалка рендерится через `ReactDOM.render` в отдельный контейнер
4. Использовать Mattermost CSS переменные для стилизации

**CSS переменные Mattermost:**
- `var(--center-channel-bg)` - фон
- `var(--center-channel-color)` - текст
- `var(--center-channel-color-08)` - hover фон
- `var(--center-channel-color-16)` - borders
- `var(--center-channel-color-64)` - вторичный текст
- `var(--button-bg)` - фон кнопки
- `var(--button-color)` - цвет текста кнопки

### 3.2 Кастомное React-модальное окно для планирования

**Триггер:** Клик по кнопке в channel header

**Поля модального окна:**

| Поле | Тип | Обязательность | Описание |
|------|-----|----------------|----------|
| Дата и время встречи | datetime-local | ✅ Обязательно | HTML5 input типа datetime-local для выбора даты и времени |
| Продолжительность | select | ✅ Обязательно | Длительность встречи. Опции: "15 минут" (value: "15"), "30 минут" (value: "30"), "45 минут" (value: "45"), "1 час" (value: "60"), "1.5 часа" (value: "90"), "2 часа" (value: "120"), "3 часа" (value: "180"), "4 часа" (value: "240"). В API отправляется value в минутах. |
| Название встречи | text | ❌ Опционально | Текстовое поле для названия встречи (максимум 100 символов) |
| Участники | search + multi-select | ✅ Обязательно | Поиск пользователей через Mattermost API (`/api/v4/users/search`) с отображением результатов и возможностью выбора нескольких участников |

**Валидация полей:**
- Дата и время: обязательны, не может быть в прошлом, максимум +30 дней
- Продолжительность: обязательно, минимум 5 минут, максимум 480 минут (8 часов)
- Название: опционально, максимум 100 символов
- Участники: обязательно, минимум 1 участник

**Поведение модального окна:**
- Открывается при клике на header-кнопку
- Закрывается по кнопке "Отмена", по клавише Esc или при клике вне модалки
- При отправке формы данные валидируются на клиенте, затем отправляются POST-запросом на `/plugins/com.skyeng.kontur-meeting/api/schedule-meeting`
- При успехе модалка закрывается, при ошибке показывается сообщение об ошибке

**Кнопки модального окна:**
- "Создать встречу" (submit) - отправляет форму
- "Отмена" (cancel) - закрывает модалку без сохранения

---

## 4. Логика определения участников по типам каналов

### 4.1 DM канал (channel_type: "D")

**Поведение:**
1. Автоматически определять второго участника DM через `channel.name.split('__')`
2. Показать подсказку с рекомендуемым участником
3. Позволить пользователю выбрать участников через multi-select
4. Если пользователь не выбрал никого → ошибка (поле обязательно)

**Валидация:**
- Если автоматическое определение не удалось → показывать ошибку и делать поле обязательным
- Если поле пустое после submit → ошибка: "Выберите хотя бы одного участника"

**UX:**
- Подсказка: "Рекомендуем добавить: @username"
- Поле опционально, но рекомендуется выбрать участника
- Пользователь может выбрать любого участника через multi-select

**ВНИМАНИЕ:** Предзаполнение `default` для `data_source: "users"` + `multiselect: true` не документировано и может не работать в Mattermost 7.8.0. Использовать подсказку вместо предзаполнения.

### 4.2 Групповой канал (channel_type: "O" или "P")

**Поведение:**
1. Поле "Участники" пустое по умолчанию
2. Поле обязательно для заполнения
3. Пользователь должен выбрать минимум 1 участника через multi-select

**Валидация:**
- Если поле пустое при submit → ошибка: "Выберите хотя бы одного участника"
- Минимум 1 участник обязателен

**UX:**
- Подсказка: "Выберите участников через поиск (можно искать по username, имени, фамилии). Обязательное поле."
- Поле отмечено как обязательное (*)
- Multi-select с автодополнением по username, имени, фамилии

### 4.3 Групповое DM (channel_type: "G")

**Поведение:**
- Идентично групповому каналу
- Поле "Участники" обязательно
- Минимум 1 участник обязателен

**UX:**
- Подсказка: "Выберите участников через поиск (можно искать по username, имени, фамилии). Обязательное поле."
- Поле отмечено как обязательное (*)
- Multi-select с автодополнением по username, имени, фамилии

---

## 5. Технические требования: клиентская часть

### 5.1 Установка зависимостей

```bash
cd webapp
npm install react@17.0.2 react-dom@17.0.2 prop-types
npm install --save-dev @babel/preset-react
```

**Обновить webpack.config.js для поддержки JSX:**
```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  }
};
```

### 5.2 Новый компонент: schedule_meeting_modal.jsx

**Описание:** React компонент для модального окна планирования встречи

**Файл:** `webapp/src/components/schedule_meeting_modal.jsx`

**Структура:**
- React-компонент с использованием хуков (useState, useEffect, useRef)
- Форма с полями: дата/время, длительность, название, участники
- Поиск участников через Mattermost API
- Валидация на клиенте перед отправкой
- Отправка данных на серверный endpoint `/api/schedule-meeting`
- Обработка ошибок и отображение сообщений пользователю

**Основные функции компонента:**
- `handleSubmit` - обработка отправки формы
- `validate` - валидация полей формы
- `addParticipant` / `removeParticipant` - управление списком участников
- Поиск пользователей через debounced API-запросы

**Пропсы:**
- `channel` - объект канала (обязательно)
- `onClose` - функция закрытия модалки (обязательно)
- `onSuccess` - функция успешного создания встречи (опционально)

### 5.3 Модификация index.js

**Регистрация кнопки:**
```javascript
class KonturMeetingPlugin {
  constructor() {
    this.config = null;
    // Экспортировать методы для доступа из компонента
    window.KonturMeetingPlugin = this;
    this.modalContainer = null;
    this.currentModal = null;
  }

  async initialize(registry, store) {
    this.store = store;
    this.registry = registry;
    
    // Загрузить конфигурацию
    await this.loadConfig();
    
    // Регистрировать кнопку в channel header
    registry.registerChannelHeaderButtonAction(
      icon,
      (channel, channelMember) => {
        this.handleScheduleMeeting(channel);
      },
      'Запланировать встречу Kontur.Talk',
      'kontur-meeting-button'
    );
    
    console.log('[Kontur] Плагин инициализирован успешно');
  }
  
  // ... остальные методы
}
```

### 5.4 Новая функция: handleInstantCall

**Описание:** Создает мгновенную встречу (текущая логика)

**Параметры:**
- `channel` — объект канала

**Логика:**
- Получить текущего пользователя из Redux store
- Подготовить payload с `operation_type: "instant_call"`
- Отправить POST запрос на webhook URL
- Обработать ответ и создать сообщение в канале
- Открыть встречу в новой вкладке (если настройка включена)

### 5.5 Новая функция: handleScheduleMeeting

**Описание:** Открывает кастомное React-модальное окно для планирования встречи

**Параметры:**
- `channel` — объект канала

**Логика:**
1. Проверить наличие конфигурации webhook URL
2. Закрыть предыдущее модальное окно, если открыто
3. Создать контейнер для модального окна в DOM
4. Динамически импортировать компонент `ScheduleMeetingModal`
5. Отрендерить модальное окно через `ReactDOM.render`
6. Передать пропсы: `channel`, `onClose`, `onSuccess`

### 5.6 Новая функция: getDMOtherUser

**Описание:** Получает второго участника DM канала

**Параметры:**
- `channel` — объект канала
- `currentUserId` — ID текущего пользователя

**Возвращает:**
- Объект пользователя: `{user_id, username, email, first_name, last_name}` или `null`

**Реализация:**
```javascript
getDMOtherUser(channel, currentUserId) {
  // DM канал имеет name формата: "user1_id__user2_id"
  if (channel.type !== 'D') {
    return null;
  }
  
  const userIds = channel.name.split('__');
  const otherUserId = userIds.find(id => id !== currentUserId);
  
  if (!otherUserId) {
    return null;
  }
  
  // Получить из Redux store (БЕЗ API запроса)
  const state = this.store.getState();
  const user = state.entities.users.profiles[otherUserId];
  
  if (!user) {
    // Если пользователя нет в store - запросить через API
    return this.getUserById(otherUserId);
  }
  
  return {
    user_id: user.id,
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name
  };
}

async getUserById(userId) {
  const response = await fetch(`/api/v4/users/${userId}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  
  if (!response.ok) {
    return null;
  }
  
  const user = await response.json();
  return {
    user_id: user.id,
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name
  };
}
```

**ВАЖНО:** Удалить функцию `getChannelMembers` - она не нужна!

### 5.7 Новая функция: getParticipantsHelpText

**Описание:** Возвращает подсказку для поля участников

**Параметры:**
- `channelType` — тип канала ("D", "O", "P", "G")
- `otherUser` — объект второго участника DM (если есть)

**Возвращает:**
- Строка с подсказкой

**Реализация:**
```javascript
getParticipantsHelpText(channelType, otherUser) {
  if (channelType === 'D' && otherUser) {
    return `Рекомендуем добавить: @${otherUser.username}. Выберите участников через поиск.`;
  } else if (channelType === 'O' || channelType === 'P' || channelType === 'G') {
    return 'Выберите участников через поиск (можно искать по username, имени, фамилии). Обязательное поле.';
  }
  return 'Выберите участников через поиск (можно искать по username, имени, фамилии).';
}
```

### 5.8 Валидация формы в модальном окне

**Описание:** Валидация полей формы выполняется на клиенте перед отправкой

**Параметры:**
- `submission` — объект с данными формы
- `channelType` — тип канала ("D", "O", "P", "G")

**Возвращает:**
- Объект с ошибками: `{field_name: "error message"}` или `{}` если нет ошибок

**Логика валидации:**
```javascript
validateScheduleDialog(submission, channelType) {
  const errors = {};
  
  // Валидация даты и времени
  if (!submission.meeting_datetime) {
    errors.meeting_datetime = "Дата и время обязательны";
  } else {
    // submission.meeting_datetime - Unix timestamp в СЕКУНДАХ (integer)
    const scheduledAt = new Date(submission.meeting_datetime * 1000); // Умножить на 1000!
    const now = new Date();
    const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней
    
    if (scheduledAt < now) {
      errors.meeting_datetime = "Дата и время не могут быть в прошлом";
    }
    
    if (scheduledAt > maxDate) {
      errors.meeting_datetime = "Дата не может быть более чем через 30 дней";
    }
  }
  
  // Валидация продолжительности
  if (!submission.duration) {
    errors.duration = "Продолжительность обязательна";
  } else {
    const duration = parseInt(submission.duration, 10);
    if (isNaN(duration) || duration < 5) {
      errors.duration = "Продолжительность должна быть не менее 5 минут";
    } else if (duration > 480) {
      errors.duration = "Продолжительность не может превышать 480 минут (8 часов)";
    }
  }
  
  // Валидация названия (если заполнено)
  if (submission.meeting_title && submission.meeting_title.length > 100) {
    errors.meeting_title = "Название не может быть длиннее 100 символов";
  }
  
  // Валидация участников для каналов и Group DM
  if (channelType === 'O' || channelType === 'P' || channelType === 'G') {
    const participants = this.parseParticipants(submission.participants);
    if (participants.length === 0) {
      errors.participants = "Выберите хотя бы одного участника";
    }
  }
  
  // Валидация участников для DM
  if (channelType === 'D') {
    const participants = this.parseParticipants(submission.participants);
    if (participants.length === 0) {
      errors.participants = "Выберите хотя бы одного участника";
    }
  }
  
  return errors;
}
```

### 5.9 Новая функция: parseParticipants

**Описание:** Парсит участников из submission (может быть строка или массив)

**Параметры:**
- `participants` — строка, массив или null
- `state` — Redux store state

**Возвращает:**
- Массив объектов: `[{user_id, username, email, ...}]`

**Реализация:**
```javascript
parseParticipants(participants, state) {
  // Mattermost может вернуть:
  // 1. Массив: ["user1", "user2"]
  // 2. Строку через запятую: "user1,user2"
  // 3. null или undefined
  
  if (!participants) {
    return [];
  }
  
  // Универсальная обработка
  let participantIds = [];
  
  if (typeof participants === 'string') {
    participantIds = participants.split(',').map(id => id.trim()).filter(Boolean);
  } else if (Array.isArray(participants)) {
    participantIds = participants;
  } else {
    return [];
  }
  
  // Получить информацию о пользователях из Redux store
  const profiles = state.entities.users.profiles;
  const result = [];
  
  for (const userId of participantIds) {
    const user = profiles[userId];
    if (user) {
      result.push({
        user_id: user.id,
        username: user.username,
        email: user.email || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null
      });
    }
  }
  
  return result;
}
```

### 5.10 Новая функция: handleScheduleDialogSubmit

**Описание:** Обработка отправки формы в модальном окне

**Логика (в компоненте ScheduleMeetingModal):**
1. Валидировать данные на клиенте через функцию `validate()`
2. Если есть ошибки → показать их в форме, не отправлять запрос
3. Получить `user_id` и `team_id` из Redux store через `window.KonturMeetingPlugin.store`
4. Преобразовать дату в ISO 8601 строку
5. Отправить POST запрос на `/plugins/com.skyeng.kontur-meeting/api/schedule-meeting`
6. При успехе закрыть модалку, при ошибке показать сообщение

**Обработка datetime:**
```javascript
// meetingDatetime - значение из input[type="datetime-local"]
const startAt = new Date(meetingDatetime).toISOString(); // ISO 8601 строка

// duration - значение из select (строка: "15", "30", "45", "60", "90", "120", "180", "240")
const durationMinutes = parseInt(duration, 10);
```

**Обработка участников:**
```javascript
// participants - массив объектов {id, username, email, first_name, last_name}
const participantIds = participants.map(p => p.id);
```

**Формат запроса:**
```javascript
const requestBody = {
  channel_id: channel.id,
  team_id: userInfo.team_id,
  user_id: userInfo.user_id,
  start_at: startAt,
  duration_minutes: durationMinutes,
  title: meetingTitle.trim() || null,
  participant_ids: participantIds
};

const response = await fetch('/plugins/com.skyeng.kontur-meeting/api/schedule-meeting', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  },
  body: JSON.stringify(requestBody)
});
```

### 5.11 Архитектура модального окна

**Поток данных:**
1. Пользователь кликает на header-кнопку → вызывается `handleScheduleMeeting(channel)`
2. Создается контейнер в DOM и рендерится React-компонент `ScheduleMeetingModal`
3. Пользователь заполняет форму в модальном окне
4. При submit данные валидируются на клиенте
5. Валидные данные отправляются POST-запросом на `/plugins/com.skyeng.kontur-meeting/api/schedule-meeting`
6. Серверный endpoint обрабатывает запрос, отправляет данные в n8n и создает сообщение в канале
7. При успехе модалка закрывается, при ошибке показывается сообщение

**Формат данных для отправки:**
```javascript
{
  channel_id: channel.id,
  team_id: teamId,
  user_id: currentUserId,
  start_at: "2024-01-15T14:00:00Z",  // ISO 8601 строка
  duration_minutes: 60,               // число
  title: "Обсуждение проекта",        // строка или null
  participant_ids: ["user1", "user2"] // массив строк
}
```

---

## 6. Технические требования: серверная часть

### 6.1 Новый endpoint: /api/schedule-meeting

**Метод:** POST

**Описание:** Обрабатывает запрос на создание запланированной встречи из кастомной React-модалки

**Путь:** `/plugins/com.skyeng.kontur-meeting/api/schedule-meeting`

**Request Body:**
```json
{
  "channel_id": "abc123",
  "team_id": "team123",
  "user_id": "user123",
  "start_at": "2024-01-15T14:00:00Z",
  "duration_minutes": 60,
  "title": "Обсуждение проекта",
  "participant_ids": ["user456", "user789"]
}
```

**ВАЖНО:** 
- `start_at` - ISO 8601 строка (RFC3339 формат), НЕ Unix timestamp
- `duration_minutes` - число (integer), НЕ строка
- `title` - строка или null (опционально)
- `participant_ids` - массив строк с ID пользователей

**Response (успех):**
```json
{
  "status": "success",
  "message": "Встреча успешно создана"
}
```

**Response (ошибка валидации):**
```json
{
  "errors": [
    {
      "field": "start_at",
      "message": "Дата и время обязательны"
    },
    {
      "field": "duration_minutes",
      "message": "Продолжительность должна быть не менее 5 минут"
    },
    {
      "field": "participant_ids",
      "message": "Выберите хотя бы одного участника"
    }
  ]
}
```

### 6.2 Модификация ServeHTTP

**Добавить новый route:**
```go
case "/api/schedule-meeting":
    p.handleScheduleMeeting(w, r)
```

### 6.3 Новая функция: handleScheduleMeeting

**Описание:** Обрабатывает запрос на создание запланированной встречи

**Логика:**
1. Парсить JSON из request body
2. Валидировать обязательные поля
3. Получить информацию о пользователях через Mattermost API по их ID
4. Парсить datetime из ISO 8601 строки и вычислить end_time
5. Сформировать payload для n8n
6. Отправить запрос на n8n webhook
7. Создать сообщение в канале при успехе
8. Вернуть результат в формате JSON

**Обработка datetime:**
```go
// req.StartAt - ISO 8601 строка (RFC3339 формат)
scheduledAt, err := time.Parse(time.RFC3339, req.StartAt)
if err != nil {
    // Обработка ошибки
}

// Вычислить время окончания
endTime := scheduledAt.Add(time.Duration(req.DurationMinutes) * time.Minute)

// Форматировать для n8n
scheduledAtISO := scheduledAt.Format(time.RFC3339)
endTimeISO := endTime.Format(time.RFC3339)
```

**Обработка participants:**
```go
// req.ParticipantIDs - уже массив строк
participants := make([]map[string]interface{}, 0)
for _, userId := range req.ParticipantIDs {
    user, err := p.API.GetUser(userId)
    if err != nil {
        p.API.LogError("Failed to get user", "user_id", userId, "error", err.Error())
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
```

---

## 7. API требования для n8n webhook

### 7.1 Payload для instant_call (без изменений)

**Текущий формат:**
```json
{
  "operation_type": "instant_call",
  "channel_id": "abc123",
  "channel_name": "Town Square",
  "channel_type": "O",
  "user_id": "user123",
  "username": "john.doe",
  "user_email": "john@example.com",
  "timestamp": "2024-12-20T10:30:00Z"
}
```

### 7.2 Payload для scheduled_meeting (новый)

**Формат:**
```json
{
  "operation_type": "scheduled_meeting",
  "scheduled_at": "2024-12-20T14:00:00Z",
  "end_time": "2024-12-20T15:00:00Z",
  "duration_minutes": 60,
  "title": "Обсуждение проекта",
  "description": null,
  "channel_id": "abc123",
  "channel_name": "john.doe",
  "channel_type": "D",
  "user_id": "user123",
  "username": "alice",
  "user_email": "alice@example.com",
  "participants": [
    {
      "user_id": "user456",
      "username": "john.doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe"
    }
  ],
  "auto_detected": false,
  "source": "user_selection",
  "timestamp": "2024-12-20T10:30:00Z"
}
```

**Описание полей:**

| Поле | Тип | Обязательность | Описание |
|------|-----|----------------|----------|
| `operation_type` | string | ✅ | Всегда `"scheduled_meeting"` |
| `scheduled_at` | string (ISO 8601) | ✅ | Дата и время начала встречи в UTC |
| `end_time` | string (ISO 8601) | ✅ | Дата и время окончания встречи в UTC |
| `duration_minutes` | integer | ✅ | Продолжительность встречи в минутах |
| `title` | string | ❌ | Название встречи |
| `description` | string | ❌ | Описание встречи |
| `channel_id` | string | ✅ | ID канала Mattermost |
| `channel_name` | string | ✅ | Имя канала |
| `channel_type` | string | ✅ | Тип канала: "D", "O", "P", "G" |
| `user_id` | string | ✅ | ID создателя встречи |
| `username` | string | ✅ | Username создателя |
| `user_email` | string | ❌ | Email создателя |
| `participants` | array | ✅ | Массив участников (минимум 1) |
| `participants[].user_id` | string | ✅ | ID участника |
| `participants[].username` | string | ✅ | Username участника |
| `participants[].email` | string | ❌ | Email участника |
| `participants[].first_name` | string | ❌ | Имя участника |
| `participants[].last_name` | string | ❌ | Фамилия участника |
| `auto_detected` | boolean | ✅ | Участники определены автоматически |
| `source` | string | ✅ | Источник: "dm_auto_detection", "user_selection" |
| `timestamp` | string (ISO 8601) | ✅ | Время создания запроса |

### 7.3 Ответ от n8n webhook

**Успех (HTTP 200):**
```json
{
  "success": true,
  "room_url": "https://space.ktalk.ru/room/abc123",
  "room_id": "abc123",
  "scheduled_at": "2024-12-20T14:00:00Z",
  "end_time": "2024-12-20T15:00:00Z",
  "duration_minutes": 60,
  "calendar_event_id": "google_cal_event_123",
  "calendar_link": "https://calendar.google.com/event?eid=...",
  "status": "scheduled"
}
```

**Ошибка валидации (HTTP 400):**
```json
{
  "success": false,
  "error": "validation_error",
  "message": "Продолжительность превышает лимит",
  "details": {
    "field": "duration_minutes",
    "max_value": 240
  }
}
```

**Ошибка Kontur.Talk API (HTTP 500):**
```json
{
  "success": false,
  "error": "kontur_api_error",
  "message": "Kontur.Talk API недоступен",
  "details": {
    "status_code": 503
  }
}
```

**Обработка в плагине:**
```javascript
const response = await fetch(webhookURL, {...});
const data = await response.json();

if (!response.ok || !data.success) {
  // Показать конкретную ошибку пользователю
  const errorMsg = data.message || 'Не удалось создать встречу';
  alert(`❌ ${errorMsg}`);
  return;
}

// Успех
if (data.room_url) {
  // Создать сообщение в канале
  // Открыть встречу в новой вкладке (если настройка включена)
  window.open(data.room_url, '_blank');
}
```

---

## 8. Обработка ошибок

### 8.1 Ошибки на клиенте

**Ошибка: Не удалось определить участника DM**
- Сообщение: "Не удалось определить участника DM. Пожалуйста, выберите участника вручную."
- Действие: Открыть диалог с пустым полем участников, сделать поле обязательным

**Ошибка: Валидация диалога**
- Сообщение: Показывать ошибки рядом с полями в диалоге
- Действие: Не закрывать диалог, подсветить поля с ошибками

**Ошибка: Webhook недоступен**
- Сообщение: "Не удалось создать встречу. Проверьте, что n8n webhook доступен."
- Действие: Закрыть диалог, показать alert

**Ошибка: Webhook вернул ошибку**
- Сообщение: Показать конкретное сообщение об ошибке из `data.message`
- Действие: Закрыть диалог, показать alert с деталями ошибки

### 8.2 Ошибки на сервере

**Ошибка: Неверный формат запроса**
- HTTP статус: 400 Bad Request
- Response: `{"errors": [{"field": "...", "message": "..."}]}`

**Ошибка: Пользователь не найден**
- HTTP статус: 404 Not Found
- Response: `{"error": "User not found"}`

**Ошибка: Внутренняя ошибка**
- HTTP статус: 500 Internal Server Error
- Response: `{"error": "Internal server error"}`

### 8.3 Формат логирования

**Все логи должны иметь префикс `[Kontur]`:**

**JavaScript:**
```javascript
console.log('[Kontur] Opening schedule dialog');
console.error('[Kontur] Error creating meeting:', error);
console.warn('[Kontur] User not found in store:', userId);
```

**Go:**
```go
p.API.LogInfo("Kontur: Opening schedule dialog")
p.API.LogError("Kontur: Error creating meeting", "error", err.Error())
p.API.LogWarn("Kontur: User not found", "user_id", userId)
```

**Уровни логирования:**
- `console.log` / `LogInfo` - информационные сообщения
- `console.warn` / `LogWarn` - предупреждения (не критичные)
- `console.error` / `LogError` - ошибки (требуют внимания)

---

## 9. Примеры использования

### 9.1 Пример 1: DM канал

**Сценарий:**
- Пользователь Alice в DM с пользователем John
- Нажимает кнопку → выбирает "Запланировать встречу"
- Диалог открывается с подсказкой: "Рекомендуем добавить: @john.doe"
- Пользователь выбирает дату и время: 2024-12-20 14:00
- Продолжительность: 60 минут (1 час)
- Участники: выбирает @john.doe через multi-select
- Нажимает "Создать встречу"

**Payload в n8n:**
```json
{
  "operation_type": "scheduled_meeting",
  "scheduled_at": "2024-12-20T14:00:00Z",
  "end_time": "2024-12-20T15:00:00Z",
  "duration_minutes": 60,
  "title": null,
  "channel_id": "dm_channel_123",
  "channel_name": "john.doe",
  "channel_type": "D",
  "user_id": "alice_id",
  "username": "alice",
  "user_email": "alice@example.com",
  "participants": [
    {
      "user_id": "john_id",
      "username": "john.doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe"
    }
  ],
  "auto_detected": false,
  "source": "user_selection",
  "timestamp": "2024-12-20T10:30:00Z"
}
```

### 9.2 Пример 2: Групповой канал

**Сценарий:**
- Пользователь в публичном канале "Разработка"
- Нажимает кнопку → выбирает "Запланировать встречу"
- Диалог открывается с пустым полем участников (обязательное)
- Пользователь выбирает дату и время: 2024-12-21 15:00
- Продолжительность: 90 минут (1.5 часа)
- Название: "Планирование спринта"
- Участники: выбирает @john.doe и @jane.smith через multi-select с автодополнением
- Нажимает "Создать встречу"

**Payload в n8n:**
```json
{
  "operation_type": "scheduled_meeting",
  "scheduled_at": "2024-12-21T15:00:00Z",
  "end_time": "2024-12-21T16:30:00Z",
  "duration_minutes": 90,
  "title": "Планирование спринта",
  "channel_id": "dev_channel_123",
  "channel_name": "Разработка",
  "channel_type": "O",
  "user_id": "alice_id",
  "username": "alice",
  "user_email": "alice@example.com",
  "participants": [
    {
      "user_id": "john_id",
      "username": "john.doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    {
      "user_id": "jane_id",
      "username": "jane.smith",
      "email": "jane@example.com",
      "first_name": "Jane",
      "last_name": "Smith"
    }
  ],
  "auto_detected": false,
  "source": "user_selection",
  "timestamp": "2024-12-20T10:30:00Z"
}
```

### 9.3 Пример 3: Ошибка валидации

**Сценарий:**
- Пользователь в групповом канале
- Открывает диалог планирования
- Не выбирает участников
- Не указывает продолжительность
- Нажимает "Создать встречу"

**Результат:**
- Диалог не закрывается
- Поля "Участники" и "Продолжительность" подсвечиваются красным
- Под полями показываются ошибки:
  - "Выберите хотя бы одного участника"
  - "Продолжительность обязательна"

---

## 10. Чеклист реализации

### 10.1 Клиентская часть
- [ ] Установить зависимости: `react`, `react-dom`, `prop-types`, `@babel/preset-react`
- [ ] Обновить `webpack.config.js` для поддержки JSX
- [ ] Создать компонент `kontur_meeting_dropdown.jsx`
- [ ] Модифицировать `index.js` для использования `registerChannelHeaderComponent`
- [ ] Реализовать `handleInstantCall` (вынести текущую логику)
- [ ] Реализовать `handleScheduleMeeting` для открытия диалога
- [ ] Создать React-компонент `ScheduleMeetingModal` с формой
- [ ] Реализовать поиск участников через Mattermost API (`/api/v4/users/search`)
- [ ] Реализовать валидацию формы на клиенте
- [ ] Реализовать отправку данных на `/api/schedule-meeting`
- [ ] Реализовать обработку ошибок и отображение сообщений
- [ ] Протестировать модальное окно в light и dark темах
- [ ] Протестировать закрытие модалки по Esc и клику вне

### 10.2 Серверная часть
- [ ] Добавить endpoint `/api/schedule-meeting` в `ServeHTTP`
- [ ] Реализовать `handleScheduleMeeting` для обработки запроса
- [ ] Реализовать валидацию на сервере (включая ISO 8601 datetime и duration_minutes)
- [ ] Реализовать получение информации о пользователях через Mattermost API по их ID
- [ ] Реализовать парсинг datetime из ISO 8601 строки и вычисление end_time
- [ ] Реализовать отправку запроса на n8n webhook с полями `scheduled_at`, `end_time`, `duration_minutes`
- [ ] Реализовать создание сообщения в канале при успехе
- [ ] Обработать все типы ошибок

### 10.3 Тестирование
- [ ] Протестировать формат отправки datetime (ISO 8601 строка)
- [ ] Протестировать обработку datetime на сервере
- [ ] Протестировать валидацию всех полей формы
- [ ] Протестировать поиск участников
- [ ] Протестировать создание сообщения в канале
- [ ] Протестировать обработку ошибок от n8n
- [ ] Протестировать поле duration (выбор продолжительности)
- [ ] Протестировать вычисление end_time на основе scheduled_at и duration
- [ ] Протестировать автодополнение в поле участников (поиск по username, имени, фамилии)
- [ ] Протестировать multi-select для выбора нескольких участников
- [ ] Протестировать универсальную обработку participants (строка и массив)
- [ ] Протестировать валидацию всех полей
- [ ] Протестировать обработку ошибок от n8n
- [ ] Протестировать dropdown в light и dark темах
- [ ] Протестировать все типы каналов (D, O, P, G)
- [ ] Протестировать интеграцию с n8n webhook

---

## 11. Дополнительные замечания

### 11.1 Производительность
- Кэшировать информацию о пользователях в Redux store
- Использовать встроенный поиск Mattermost в поле `select` с `data_source: "users"`
- Не нужно получать список всех пользователей вручную - Mattermost делает это автоматически
- Для DM канала использовать `channel.name.split('__')` вместо API запроса

### 11.2 Безопасность
- Валидировать все входные данные на клиенте и сервере
- Проверять права доступа пользователя к каналу
- Санитизировать данные перед отправкой в n8n
- Валидировать продолжительность (минимум 5 минут, максимум 480 минут)
- Валидировать datetime (не в прошлом, максимум +30 дней)

### 11.3 UX улучшения
- Показывать подсказку для DM канала с рекомендуемым участником
- Предзаполнять продолжительность значением по умолчанию (60 минут)
- Показывать подсказки для каждого поля
- Использовать встроенный поиск Mattermost для автодополнения участников
- Создавать информативное сообщение в канале после успешного создания
- Обрабатывать все типы ошибок с понятными сообщениями

---

## 12. Критические замечания (уже учтены)

✅ **ИСПРАВЛЕНО:** Тип поля datetime - используется `type: 'datetime'` (НЕ `type: 'text', subtype: 'datetime'`)

✅ **ИСПРАВЛЕНО:** Формат возврата datetime - Unix timestamp в секундах, умножается на 1000

✅ **ИСПРАВЛЕНО:** Dropdown меню - используется `registerChannelHeaderComponent` с кастомным React компонентом

✅ **ИСПРАВЛЕНО:** Получение участника DM - упрощено через `channel.name.split('__')`

✅ **ИСПРАВЛЕНО:** Параметры datetime - убраны недокументированные параметры

✅ **ИСПРАВЛЕНО:** Обработка participants - универсальная обработка (строка/массив)

✅ **ИСПРАВЛЕНО:** Обработка ошибок от n8n - добавлена детальная обработка

✅ **ИСПРАВЛЕНО:** Сообщение в канале - добавлен формат сообщения после создания

✅ **ИСПРАВЛЕНО:** Структура файлов - добавлена структура проекта

✅ **ИСПРАВЛЕНО:** Зависимости - указаны необходимые зависимости

✅ **ИСПРАВЛЕНО:** Логирование - стандартизирован формат логирования

---

**Конец технического задания.**

