# Backend Emotion API

## Start backend

```bash
cd backend
npm install
npm start
```

Runs at `http://localhost:4000`.

## API response format

`POST /api/chat`

Request body:

```json
{
  "message": "hello"
}
```

Response body:

```json
{
  "reply": "I can help you...",
  "emotion": "welcome"
}
```

Allowed emotions:

- `neutral`
- `welcome`
- `thinking`
- `speaking`
- `confused`
- `error`
