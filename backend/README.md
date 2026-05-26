# Backend API (Multi-App)

## Start

```bash
cd backend
npm install
npm start
```

## Routes

- `GET /api/apps/:appId/config`
- `POST /api/apps/:appId/chat`
- `GET /api/config` (default app)
- `POST /api/chat` (default app)

## App data location

`data/apps/<appId>/knowledge.base.json`
`data/apps/<appId>/widget.config.json`

## appId rules

- lowercase letters, numbers, `_`, `-`
- examples: `default`, `ecommerce`, `finance-app`

## Default app behavior

`DEFAULT_APP_ID` decides what `/api/config` and `/api/chat` serve.

## Env vars

- `PORT` (default: `4000`)
- `DEFAULT_APP_ID` (default: `default`)
- `APPS_ROOT` (default: `backend/data/apps`)
- `KNOWLEDGE_SOURCE` (optional global source override)
- `WIDGET_CONFIG_SOURCE` (optional global source override)

## Quick test

```bash
curl http://localhost:4000/api/apps/default/config
curl -X POST http://localhost:4000/api/apps/default/chat -H "Content-Type: application/json" -d '{"message":"admission"}'
```