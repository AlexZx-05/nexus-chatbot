# Drop-In Animated Chatbot (Level 2)

This project gives you a professional, integration-ready chatbot widget for an existing website with:

- `idle` animation state
- `thinking` animation state
- `talking` animation state
- smooth UI transitions
- easy backend integration

## Files

- `chatbot-widget.css`
- `chatbot-widget.js`
- `index.html` (demo host website)

## Quick Integration Into Any Existing Website

1. Copy `chatbot-widget.css` and `chatbot-widget.js` into your website assets.
2. Add these in your website HTML:

```html
<link rel="stylesheet" href="/assets/chatbot-widget.css" />
<script src="/assets/chatbot-widget.js"></script>
```

3. Mount the chatbot near the end of your page:

```html
<script>
  ChatbotWidget.mount({
    container: "body",
    title: "Campus Assistant",
    subtitle: "Online now",
    welcomeMessage: "Hi! Ask me anything about college support.",
    placeholder: "Ask your question...",
  });
</script>
```

## Connect To Your Real Chatbot API

If your backend already exists, pass `apiUrl`:

```html
<script>
  ChatbotWidget.mount({
    apiUrl: "https://your-domain.com/api/chat",
  });
</script>
```

The widget sends:

```json
{
  "message": "user input",
  "history": [
    { "role": "bot", "text": "..." },
    { "role": "user", "text": "..." }
  ]
}
```

Expected backend response:

```json
{
  "reply": "assistant response"
}
```

## Custom Behavior Function (Without `apiUrl`)

You can supply `onSend` for custom logic:

```html
<script>
  ChatbotWidget.mount({
    onSend: async (message, history) => {
      return "Custom response for: " + message;
    }
  });
</script>
```

## Run Demo Locally

Open `index.html` in browser.

## Emotion PNG Setup (Frontend + Backend)

Put your emotion PNG images in:

- `assets/emotions/original/neutral.png`
- `assets/emotions/original/welcome.png`
- `assets/emotions/original/listening.png`
- `assets/emotions/original/thinking.png`
- `assets/emotions/original/speaking.png`
- `assets/emotions/original/confused.png`
- `assets/emotions/original/error.png`

The widget is already configured to load these names and switch by scenario.

### Backend integration

Sample backend is available in `backend/`.

Run:

```bash
cd backend
npm install
npm start
```

Backend endpoint:

- `POST http://localhost:4000/api/chat`

Backend should return:

```json
{
  "reply": "text response",
  "emotion": "welcome"
}
```

---

# Level 3 Roadmap (Advanced: 3D + Eye Tracking)

This is the next upgrade after the current Level 2 widget.

## What You Get

- Eyes follow cursor (`raycast` + target tracking) 👀
- Head movement (yaw/pitch with smoothing)
- Fully dynamic character states (`idle`, `thinking`, `talking`, `listening`)
- Real 3D scene with lighting/shadows

## Estimated Time

- Total: `2-3 weeks`

## Breakdown

1. Learn Three.js fundamentals: `3-5 days`
2. Build or import 3D model (`.glb/.gltf`): `3-4 days`
3. Interaction logic (eye/head tracking + chat state sync): `4-5 days`
4. Debugging and polish (performance, mobile, edge cases): `3-5 days`

## Suggested Stack

- `three` (core 3D engine)
- `@react-three/fiber` (if using React)
- `@react-three/drei` helpers (orbit controls, loaders, utilities)
- `gsap` or spring-based animation for smooth motion
- `gltfjsx` / Blender for model pipeline

## Architecture Plan

1. `scene/`:
   - camera, renderer, lights, environment
2. `character/`:
   - load model + named bones/meshes (`head`, `eye_L`, `eye_R`, `arm_L`, `arm_R`)
3. `logic/trackCursor`:
   - convert mouse to normalized device coords
   - map to look-target object
4. `logic/states`:
   - map chatbot state to animation clips or procedural transforms
5. `ui-bridge`:
   - connect current chat events to 3D character controller

## Milestone Definition

- Week 1 end:
  - model loads, camera setup, lights, idle animation
- Week 2 mid:
  - eyes track cursor, head follows naturally, state transitions wired
- Week 2 end or Week 3:
  - arms/hand gestures polished, FPS stable, mobile fallback complete

## Quality Targets

- `>= 45 FPS` on mid-tier laptops
- Smooth eye/head interpolation (no jitter)
- Interaction latency under `120ms` for visible response
- Graceful fallback to Level 2 widget when WebGL is unavailable

This level is startup-grade and strong for portfolio/demo value.
