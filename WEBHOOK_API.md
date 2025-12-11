# Webhook API требования для Kontur.Talk плагина

## Обзор

Плагин отправляет POST запрос на настроенный webhook при нажатии кнопки "Start Kontur Meeting". Webhook должен создать комнату Kontur.Talk и вернуть ссылку на неё.

---

## 📤 Запрос от плагина

### Метод
```
POST {WebhookURL}
```

### Headers
```
Content-Type: application/json
```

### Тело запроса (JSON)

```json
{
  "channel_id": "abc123xyz789",
  "channel_name": "Town Square",
  "channel_type": "O",
  "user_id": "user123456",
  "username": "john.doe"
}
```

### Описание полей запроса

| Поле | Тип | Описание | Пример |
|------|-----|----------|--------|
| `channel_id` | string | Уникальный ID канала Mattermost | `"abc123xyz789"` |
| `channel_name` | string | Отображаемое имя канала | `"Town Square"`, `"Разработка"` |
| `channel_type` | string | Тип канала: `"O"` (открытый), `"P"` (приватный), `"D"` (личка), `"G"` (группа) | `"O"` |
| `user_id` | string | ID пользователя, создающего встречу | `"user123456"` |
| `username` | string | Username пользователя | `"john.doe"` |

---

## 📥 Ожидаемый ответ от webhook

### Status Code
```
200 OK
```

### Headers
```
Content-Type: application/json
```

### Тело ответа (JSON)

#### ✅ Минимальный обязательный ответ:

```json
{
  "room_url": "https://space.ktalk.ru/room/abc123"
}
```

#### ✅ Расширенный ответ (опционально):

```json
{
  "room_url": "https://space.ktalk.ru/room/abc123",
  "room_id": "abc123",
  "room_name": "Meeting - Town Square",
  "created_at": "2024-12-11T10:30:00Z",
  "status": "success"
}
```

### Описание полей ответа

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `room_url` | string | **✅ Да** | Полная URL ссылка на созданную комнату Kontur.Talk |
| `room_id` | string | Нет | ID комнаты (для логирования) |
| `room_name` | string | Нет | Имя комнаты |
| `created_at` | string | Нет | ISO timestamp создания |
| `status` | string | Нет | Статус ("success", "created") |

---

## ⚠️ Обработка ошибок

### Webhook недоступен

Если webhook не отвечает или возвращает ошибку HTTP (4xx, 5xx), плагин:
1. Показывает alert: `"Failed to create meeting. Check that the n8n webhook is running and accessible."`
2. Логирует ошибку в консоль браузера
3. НЕ создаёт сообщение в канале

### Неправильный формат ответа

Если в ответе отсутствует поле `room_url`:
```json
{
  "status": "ok"
  // ❌ room_url отсутствует!
}
```

Плагин:
1. Показывает alert: `"Invalid response from webhook. Missing room_url."`
2. НЕ создаёт сообщение в канале

### Примеры правильных ответов с ошибкой

Если webhook не смог создать комнату, он должен вернуть:

```
HTTP 500 Internal Server Error
или
HTTP 503 Service Unavailable
```

НЕ возвращайте `200 OK` с ошибкой в теле!

---

## 🔄 Полный flow взаимодействия

```
1. Пользователь → Нажимает кнопку 🎥 в канале
2. Плагин → POST {webhook_url} с данными канала/пользователя
3. Webhook → Создаёт комнату в Kontur.Talk
4. Webhook → Возвращает {room_url: "https://..."}
5. Плагин → Создаёт сообщение в канале: "I have started a meeting: {room_url}"
6. Плагин → Открывает room_url в новой вкладке (если настройка включена)
```

---

## 🧪 Тестовый webhook (для разработки)

### Mock в n8n

Создайте workflow:

**1. Webhook Node (Trigger)**
- Method: POST
- Path: `kontur-create`
- Response Mode: `Respond to Webhook`

**2. Function Node (опционально)**
```javascript
// Можете логировать данные или добавить логику
const channelName = $input.item.json.channel_name;
const username = $input.item.json.username;

return {
  json: {
    room_url: `https://meet.google.com/test-${$input.item.json.channel_id}`,
    room_id: $input.item.json.channel_id,
    room_name: `Meeting - ${channelName}`,
    created_by: username,
    status: "success",
    created_at: new Date().toISOString()
  }
};
```

**3. Respond to Webhook Node**
- Response Body: `{{ $json }}`

### Примеры тестовых ответов

**Google Meet (для теста):**
```json
{
  "room_url": "https://meet.google.com/abc-defg-hij"
}
```

**Zoom (для теста):**
```json
{
  "room_url": "https://zoom.us/j/1234567890"
}
```

**Kontur.Talk (реальный):**
```json
{
  "room_url": "https://space.ktalk.ru/room/abcd1234efgh"
}
```

---

## 🔐 Безопасность (рекомендации)

### 1. Аутентификация (опционально)

Вы можете добавить токен в URL:
```
http://host.docker.internal:5678/webhook/kontur-create?token=secret_token_here
```

В n8n проверяйте токен:
```javascript
const token = $json.query.token;
if (token !== 'expected_secret_token') {
  throw new Error('Unauthorized');
}
```

### 2. CORS (если webhook на другом домене)

Webhook должен возвращать CORS headers:
```
Access-Control-Allow-Origin: https://your-mattermost-domain.com
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### 3. Rate Limiting

Рекомендуется ограничить количество запросов от одного пользователя (например, 1 встреча в минуту).

---

## 📊 Логирование

Webhook должен логировать:
- Входящие запросы (channel_id, user_id, timestamp)
- Созданные комнаты (room_id, room_url)
- Ошибки (если не удалось создать комнату)

---

## 🐛 Отладка

### Проверка работы webhook

**Через curl (PowerShell):**
```powershell
$body = @{
    channel_id = "test123"
    channel_name = "Test Channel"
    channel_type = "O"
    user_id = "user123"
    username = "test.user"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://host.docker.internal:5678/webhook/kontur-create" `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

**Через curl (bash):**
```bash
curl -X POST http://host.docker.internal:5678/webhook/kontur-create \
  -H "Content-Type: application/json" \
  -d '{
    "channel_id": "test123",
    "channel_name": "Test Channel",
    "channel_type": "O",
    "user_id": "user123",
    "username": "test.user"
  }'
```

**Ожидаемый ответ:**
```json
{
  "room_url": "https://space.ktalk.ru/room/xyz789"
}
```

### Логи плагина в браузере

Откройте консоль браузера (F12) и фильтруйте по `Kontur Meeting Plugin`:
```
Kontur Meeting Plugin: Create meeting clicked {id: "abc123", ...}
Kontur Meeting Plugin: Current user: {id: "user123", username: "john.doe"}
Kontur Meeting Plugin: Sending webhook request {channel_id: "abc123", ...}
Kontur Meeting Plugin: Webhook response {room_url: "https://..."}
Kontur Meeting Plugin: Post created successfully
```

---

## ✅ Чеклист для webhook разработчика

```
□ Webhook принимает POST запросы
□ Webhook парсит JSON тело с полями: channel_id, channel_name, channel_type, user_id, username
□ Webhook создаёт комнату в Kontur.Talk (или другом сервисе)
□ Webhook возвращает 200 OK с JSON: {"room_url": "https://..."}
□ Webhook возвращает ошибку 5xx если не может создать комнату
□ room_url - это валидная HTTPS ссылка
□ Webhook отвечает быстро (< 5 секунд)
□ Webhook логирует запросы и ошибки
□ Протестировано через curl/Postman
□ Протестировано из Mattermost плагина
```

---

## 🔗 Интеграция с реальным Kontur.Talk API

Когда у вас будет доступ к API Kontur.Talk, webhook должен:

1. Получить запрос от плагина
2. Вызвать API Kontur.Talk для создания комнаты:
   ```
   POST https://api.ktalk.ru/v1/rooms
   Authorization: Bearer YOUR_API_TOKEN
   Content-Type: application/json
   
   {
     "name": "Meeting - Town Square",
     "type": "instant",
     "creator_id": "user123"
   }
   ```
3. Получить ответ с room_id
4. Сформировать room_url: `https://space.ktalk.ru/room/{room_id}`
5. Вернуть плагину: `{"room_url": "https://space.ktalk.ru/room/{room_id}"}`

---

## 💡 Примеры использования

### Использование channel_name в названии комнаты

```javascript
// n8n Function Node
const roomName = `Meeting - ${$json.channel_name} - ${new Date().toLocaleString()}`;

return {
  json: {
    room_url: `https://space.ktalk.ru/room/${generateRoomId()}`,
    room_name: roomName
  }
};
```

### Добавление пользователя в комнату автоматически

```javascript
// n8n: после создания комнаты добавить user_id как участника
const userId = $json.user_id;
// Вызов API: POST /rooms/{room_id}/participants
// Body: { user_id: userId, role: "moderator" }
```

### Сохранение истории встреч

```javascript
// n8n: сохранить в БД для аналитики
INSERT INTO meeting_history (
  channel_id,
  channel_name,
  user_id,
  username,
  room_url,
  created_at
) VALUES (...)
```

---

## 📞 Поддержка

Если webhook работает неправильно, проверьте:
1. Webhook URL доступен из браузера (curl test)
2. Webhook возвращает Content-Type: application/json
3. Webhook возвращает поле room_url в ответе
4. Консоль браузера (F12) для ошибок плагина
5. Логи n8n для ошибок webhook



