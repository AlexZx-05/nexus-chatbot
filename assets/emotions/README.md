# Emotion Image Folder

Put your PNG files in `assets/emotions/original/` with these exact names:

- `welcome.png`
- `listening.png` (used while user is typing; if missing, widget uses `thinking.png`)
- `thinking.png`
- `speaking.png`
- `confused.png`
- `error.png`

The widget will auto-switch image by scenario using these keys:

- `neutral` -> uses `welcome.png` (idle and welcome share same image)
- `welcome` -> greeting/positive
- `thinking` -> while processing
- `speaking` -> while typing response
- `confused` -> unclear input / clarification needed
- `error` -> API failure
