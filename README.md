# Multi-App Chatbot Platform (Implementation-Ready, 2026)

This setup is production-style for reuse across many applications.

You only do 2 things for each new application:

1. Create app data files (`knowledge.base.json` + `widget.config.json`)
2. Mount widget with appId (or config URL)

No widget code changes per app.

## Core idea

- One shared widget (`chatbot-widget.js` / `chatbot-widget.css`)
- One backend
- Multiple app tenants via `appId`
- App-specific responses from app-specific data files

## Folder structure (per app)

`backend/data/apps/<appId>/knowledge.base.json`
`backend/data/apps/<appId>/widget.config.json`

Examples included:

- `backend/data/apps/default/`
- `backend/data/apps/ecommerce/`

## API routes

- `GET /api/apps/:appId/config`
- `POST /api/apps/:appId/chat`

Backward-compatible default routes:

- `GET /api/config` -> uses `DEFAULT_APP_ID` (default: `default`)
- `POST /api/chat` -> uses `DEFAULT_APP_ID`

## Professional integration (recommended)

Add assets:

```html
<link rel="stylesheet" href="/assets/chatbot-widget.css" />
<script src="/assets/chatbot-widget.js"></script>
```

Mount by appId:

```html
<script>
  ChatbotWidget.mountForApp({
    baseUrl: "https://chat-api.yourcompany.com",
    appId: "ecommerce"
  });
</script>
```

Mount by direct config URL:

```html
<script>
  ChatbotWidget.mountFromConfigUrl("https://chat-api.yourcompany.com/api/apps/ecommerce/config");
</script>
```

## One-line embed (any website)

Use this on any external website where you want the bot:

```html
<script src="https://chat-api.yourcompany.com/assets/chatbot-widget.js" data-app-id="ecommerce" data-base-url="https://chat-api.yourcompany.com"></script>
```

That single line auto-loads the widget, fetches the app config/data, and mounts the bot.

Optional attributes:

- `data-app-id="your-app-id"` (required for app-based mounting)
- `data-base-url="https://chat-api.yourcompany.com"` (recommended)
- `data-config-url="https://chat-api.yourcompany.com/api/apps/ecommerce/config"` (alternative to `data-app-id`)
- `data-auto-mount="false"` (disable auto mount if you want manual JS mounting)

## Admin dashboard MVP

Run the backend, then open:

```text
http://localhost:4000/admin
```

From there you can:

- Create a new chatbot app
- Add FAQ/keyword knowledge
- Add website source URLs for tracking client data sources
- Customize widget title, welcome text, placeholder, and fallback reply
- Add custom image URLs for each chatbot emotion
- Copy the final one-line embed code for the client website

## Create a new application chatbot

1. Create folder:

`backend/data/apps/finance-app/`

2. Add `knowledge.base.json`:

```json
{
  "appName": "Finance Assistant",
  "fallbackReply": "I can help with statements, transfers, and card support.",
  "fallbackEmotion": "neutral",
  "intents": [
    {
      "id": "card_block",
      "keywords": ["block card", "lost card", "stolen card"],
      "reply": "For urgent card block, verify last 4 digits and registered mobile.",
      "emotion": "error"
    }
  ]
}
```

3. Add `widget.config.json`:

```json
{
  "title": "Finance Help",
  "subtitle": "Secure Support",
  "placeholder": "Ask about cards, transfers, statements...",
  "welcomeMessage": "Hi. I can help with your banking support requests.",
  "apiUrl": "/api/apps/finance-app/chat",
  "useEmotionImages": true,
  "hideTranscriptByDefault": true,
  "startTranscriptOpen": false
}
```

4. In that application website:

```html
<script>
  ChatbotWidget.mountForApp({
    baseUrl: "https://chat-api.yourcompany.com",
    appId: "finance-app"
  });
</script>
```

## Run locally

Backend:

```bash
cd backend
npm install
npm start
```

Frontend demo:

```bash
cd ..
python -m http.server 3000
```

Open:

- `http://localhost:3000`

## Environment variables

- `PORT` (default `4000`)
- `DEFAULT_APP_ID` (default `default`)
- `APPS_ROOT` (default `backend/data/apps`)
- `KNOWLEDGE_SOURCE` (optional global override path/url)
- `WIDGET_CONFIG_SOURCE` (optional global override path/url)

## Response contract

Request:

```json
{
  "message": "Where is my order?",
  "history": [
    { "role": "bot", "text": "..." },
    { "role": "user", "text": "..." }
  ]
}
```

Response:

```json
{
  "reply": "To track your order, share your order ID...",
  "emotion": "thinking",
  "appId": "ecommerce"
}
```
