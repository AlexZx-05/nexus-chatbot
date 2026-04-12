(function () {
  "use strict";

  const FALLBACK_GREETING = "Hi there! What can I help you with today?";
  const FALLBACK_RETURNING_GREETING = "I see you've come back. Welcome again!";
  const VALID_EMOTIONS = new Set([
    "neutral",
    "welcome",
    "listening",
    "thinking",
    "speaking",
    "confused",
    "error",
  ]);

  function defaultResponder(message) {
    const text = String(message || "").toLowerCase();
    if (text.includes("admission")) {
      return "I can help you with admissions. Please provide more details about your specific requirement, and I'll assist you step by step.";
    }
    if (text.includes("time table") || text.includes("timetable") || text.includes("schedule")) {
      return "I can help you with your schedule. Please share your specific needs, and I'll provide the information you require.";
    }
    if (text.includes("fees") || text.includes("payment")) {
      return "I can help you with fee information. Please let me know your specific question, and I'll provide accurate details.";
    }
    if (text.includes("hostel")) {
      return "I can assist with hostel-related inquiries. Please share your specific question, and I'll help you promptly.";
    }
    return "Thank you for your inquiry. Please let me know how I can assist you further, and I'll respond professionally and promptly.";
  }

  function typeWriter(target, text, speedMs, mirrorTarget) {
    return new Promise((resolve) => {
      const safeText = String(text || "");
      let i = 0;
      target.textContent = "";
      if (mirrorTarget) {
        mirrorTarget.textContent = "";
      }
      const timer = setInterval(() => {
        target.textContent += safeText.charAt(i);
        if (mirrorTarget) {
          mirrorTarget.textContent = target.textContent;
        }
        i += 1;
        if (i >= safeText.length) {
          clearInterval(timer);
          resolve();
        }
      }, speedMs);
    });
  }

  function createRow(text, role) {
    const row = document.createElement("div");
    row.className = `cb-row ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "cb-bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    return { row, bubble };
  }

  function normalizeEmotion(emotion) {
    const value = String(emotion || "").toLowerCase().trim();
    if (value === "idle") {
      return "neutral";
    }
    if (value === "happy") {
      return "welcome";
    }
    if (value === "listen") {
      return "listening";
    }
    if (value === "sorry") {
      return "error";
    }
    if (VALID_EMOTIONS.has(value)) {
      return value;
    }
    return "neutral";
  }

  function isConfusedInput(message) {
    const text = String(message || "").trim();
    if (!text) {
      return true;
    }
    if (text.length < 3) {
      return true;
    }
    const hasLetter = /[a-zA-Z]/.test(text);
    if (!hasLetter) {
      return true;
    }
    return false;
  }

  function isConfusedReply(reply) {
    const text = String(reply || "").toLowerCase();
    return (
      text.includes("please provide more details") ||
      text.includes("please share your specific") ||
      text.includes("could you clarify")
    );
  }

  function isPositiveMessage(message) {
    const text = String(message || "").toLowerCase();
    return (
      text.includes("hi") ||
      text.includes("hello") ||
      text.includes("thanks") ||
      text.includes("thank you") ||
      text.includes("great")
    );
  }

  function isNegativeMessage(message) {
    const text = String(message || "").toLowerCase();
    return (
      text.includes("sad") ||
      text.includes("upset") ||
      text.includes("depressed") ||
      text.includes("angry") ||
      text.includes("frustrated") ||
      text.includes("not happy") ||
      text.includes("bad") ||
      text.includes("problem") ||
      text.includes("issue") ||
      text.includes("stress")
    );
  }

  function isErrorLikeReply(reply) {
    const text = String(reply || "").toLowerCase();
    return (
      text.includes("sorry") ||
      text.includes("could not process") ||
      text.includes("try again") ||
      text.includes("went wrong")
    );
  }

  function buildWidgetShell(config) {
    const wrapper = document.createElement("section");
    wrapper.className = "cb-widget cb-avatar-only";
    wrapper.dataset.state = "idle";
    wrapper.dataset.emotion = "neutral";
    wrapper.dataset.avatarMode = config.useEmotionImages ? "image" : "robot";
    wrapper.dataset.minimized = String(Boolean(config.startMinimized));
    wrapper.dataset.transcriptOpen = String(
      config.hideTranscriptByDefault ? Boolean(config.startTranscriptOpen) : true
    );

    wrapper.innerHTML = `
      <header class="cb-header">
        <div class="cb-avatar" aria-hidden="true">
          <div class="cb-avatar-media">
            <img class="cb-avatar-image" alt="Assistant avatar" src="${config.emotionImages.neutral}" />
          </div>
          <div class="cb-avatar-robot">
            <div class="cb-head">
              <div class="cb-faceplate">
                <div class="cb-eye cb-eye-left"><span class="cb-pupil"></span></div>
                <div class="cb-eye cb-eye-right"><span class="cb-pupil"></span></div>
              </div>
              <div class="cb-mouth"></div>
            </div>
            <div class="cb-neck"></div>
            <div class="cb-torso"></div>
            <div class="cb-hip"></div>
            <div class="cb-arm cb-arm-left">
              <div class="cb-forearm"></div>
              <div class="cb-hand"></div>
            </div>
            <div class="cb-arm cb-arm-right">
              <div class="cb-forearm"></div>
              <div class="cb-hand"></div>
            </div>
            <div class="cb-leg cb-leg-left">
              <div class="cb-knee"></div>
              <div class="cb-shin"></div>
              <div class="cb-foot"></div>
            </div>
            <div class="cb-leg cb-leg-right">
              <div class="cb-knee"></div>
              <div class="cb-shin"></div>
              <div class="cb-foot"></div>
            </div>
          </div>
        </div>
        <div class="cb-comic-wrap">
          <div class="cb-comic-bubble" aria-live="polite"></div>
        </div>
        <button class="cb-toggle" type="button" aria-label="Close transcript">×</button>
      </header>
      <div class="cb-controls-row">
        <button class="cb-transcript-toggle" type="button" aria-label="Show chat">
          <span class="cb-chat-label">Chat</span>
        </button>
      </div>
      <div class="cb-body" role="log" aria-live="polite"></div>
      <div class="cb-status"></div>
      <div class="cb-controls-row cb-controls-row-composer">
        <form class="cb-input-row">
          <input class="cb-input" type="text" placeholder="${config.placeholder}" />
          <button class="cb-send" type="submit">Send</button>
        </form>
      </div>
    `;
    return wrapper;
  }

  function resolveContainer(container) {
    if (container instanceof HTMLElement) {
      return container;
    }
    if (typeof container === "string") {
      return document.querySelector(container);
    }
    return document.body;
  }

  function normalizeConfig(options) {
    const opts = options || {};
    const emotionImages = Object.assign(
      {
        neutral: "./assets/emotions/original/welcome.png",
        welcome: "./assets/emotions/original/welcome.png",
        listening: "./assets/emotions/original/listening.png",
        thinking: "./assets/emotions/original/thinking.png",
        speaking: "./assets/emotions/original/speaking.png",
        confused: "./assets/emotions/original/confused.png",
        error: "./assets/emotions/original/error.png",
      },
      opts.emotionImages || {}
    );
    return {
      container: opts.container || "body",
      title: opts.title || "Professional Assistant",
      subtitle: opts.subtitle || "Ready to assist",
      placeholder: opts.placeholder || "Type your question...",
      welcomeMessage: opts.welcomeMessage || FALLBACK_GREETING,
      returningGreeting: opts.returningGreeting || FALLBACK_RETURNING_GREETING,
      enableReturnGreeting: opts.enableReturnGreeting !== false,
      visitorStorageKey: opts.visitorStorageKey || "cb-widget-visited",
      useEmotionImages: opts.useEmotionImages !== false,
      emotionImages,
      startMinimized: Boolean(opts.startMinimized),
      startTranscriptOpen: Boolean(opts.startTranscriptOpen),
      hideTranscriptByDefault: opts.hideTranscriptByDefault !== false,
      typingSpeed: Number(opts.typingSpeed || 18),
      thinkingDelayMs: Number(opts.thinkingDelayMs || 700),
      onSend: typeof opts.onSend === "function" ? opts.onSend : null,
      apiUrl: typeof opts.apiUrl === "string" && opts.apiUrl.trim() ? opts.apiUrl.trim() : null,
    };
  }

  async function fetchApiResponse(apiUrl, message, history) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, history }),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    return {
      reply: data.reply || data.message || "I received your message.",
      emotion: data.emotion || data.mood || null,
    };
  }

  function mountChatbot(options) {
    const config = normalizeConfig(options);
    const container = resolveContainer(config.container);
    if (!container) {
      throw new Error("Chatbot container not found.");
    }

    const widget = buildWidgetShell(config);
    const body = widget.querySelector(".cb-body");
    const status = widget.querySelector(".cb-status");
    const form = widget.querySelector(".cb-input-row");
    const input = widget.querySelector(".cb-input");
    const sendBtn = widget.querySelector(".cb-send");
    const toggleBtn = widget.querySelector(".cb-toggle");
    const transcriptToggleBtn = widget.querySelector(".cb-transcript-toggle");
    const avatarImage = widget.querySelector(".cb-avatar-image");
    const comicBubble = widget.querySelector(".cb-comic-bubble");

    const history = [];
    let busy = false;
    let welcomeTimer = null;

    function scrollToBottom() {
      body.scrollTop = body.scrollHeight;
    }

    function setComicText(text) {
      if (comicBubble) {
        comicBubble.textContent = String(text || "");
        comicBubble.classList.remove("cb-comic-bubble-hidden");
      }
    }

    function resolveInitialGreeting() {
      if (!config.enableReturnGreeting) {
        return config.welcomeMessage;
      }
      try {
        const hasVisited = window.localStorage.getItem(config.visitorStorageKey) === "1";
        window.localStorage.setItem(config.visitorStorageKey, "1");
        return hasVisited ? config.returningGreeting : config.welcomeMessage;
      } catch (error) {
        return config.welcomeMessage;
      }
    }

    function syncTranscriptToggle() {
      if (!transcriptToggleBtn) {
        return;
      }
      const isOpen = widget.dataset.transcriptOpen === "true";
      transcriptToggleBtn.setAttribute("aria-label", isOpen ? "Hide chat" : "Show chat");
      transcriptToggleBtn.setAttribute("title", isOpen ? "Hide chat" : "Show chat");
    }

    function setEmotion(nextEmotion) {
      const emotion = normalizeEmotion(nextEmotion);
      widget.dataset.emotion = emotion;
      if (config.useEmotionImages && avatarImage) {
        const imageEmotion = emotion === "neutral" ? "welcome" : emotion;
        const nextImage =
          config.emotionImages[imageEmotion] ||
          (emotion === "listening" ? config.emotionImages.thinking : null) ||
          config.emotionImages.welcome;
        if (nextImage) {
          avatarImage.src = nextImage;
          widget.dataset.avatarMode = "image";
        }
      }
    }

    function setListeningMode(active) {
      if (busy) {
        return;
      }
      if (active) {
        setEmotion("listening");
        status.textContent = "Listening...";
        setComicText("I'm listening...");
        return;
      }
      if (widget.dataset.state === "idle") {
        if (status.textContent === "Listening...") {
          status.textContent = "Ready";
        }
        if (widget.dataset.emotion === "thinking" || widget.dataset.emotion === "listening") {
          setEmotion("neutral");
        }
      }
    }

    function setState(nextState, statusText, emotion) {
      widget.dataset.state = nextState;
      if (emotion) {
        setEmotion(emotion);
      } else if (nextState === "thinking") {
        setEmotion("thinking");
      } else if (nextState === "talking") {
        setEmotion("speaking");
      }
      status.textContent = statusText || "";
      if (nextState === "thinking") {
        setComicText("Let me think...");
      }
    }

    function pushMessage(text, role) {
      const value = String(text || "");
      const { row, bubble } = createRow(value, role);
      body.appendChild(row);
      history.push({ role, text: value });
      scrollToBottom();
      if (role === "bot" && value) {
        setComicText(value);
      }
      return bubble;
    }

    async function runResponder(message) {
      let result;
      if (config.onSend) {
        result = await config.onSend(message, history.slice());
      } else if (config.apiUrl) {
        result = await fetchApiResponse(config.apiUrl, message, history.slice());
      } else {
        result = await new Promise((resolve) => {
          setTimeout(() => resolve(defaultResponder(message)), 700);
        });
      }
      if (typeof result === "string") {
        return { reply: result, emotion: null };
      }
      return {
        reply: String((result && (result.reply || result.message)) || ""),
        emotion: result && result.emotion ? result.emotion : null,
      };
    }

    async function handleSubmit(event) {
      event.preventDefault();
      if (busy) {
        return;
      }
      const message = input.value.trim();
      if (!message) {
        return;
      }
      if (welcomeTimer) {
        clearTimeout(welcomeTimer);
        welcomeTimer = null;
      }
      if (isConfusedInput(message)) {
        pushMessage(message, "user");
        input.value = "";
        setState("idle", "Need clarification", "confused");
        pushMessage("Could you please rephrase your question with a little more detail?", "bot");
        input.focus();
        return;
      }

      busy = true;
      sendBtn.disabled = true;
      pushMessage(message, "user");
      input.value = "";

      const thinkingTimer = setTimeout(() => {
        if (!busy) {
          return;
        }
        setState("thinking", "Thinking...", "thinking");
      }, config.thinkingDelayMs);

      let reply;
      let backendEmotion = null;
      let hasError = false;
      const userIsNegative = isNegativeMessage(message);
      try {
        const response = await runResponder(message);
        reply = response.reply;
        backendEmotion = normalizeEmotion(response.emotion);
        if (userIsNegative && backendEmotion === "welcome") {
          backendEmotion = "neutral";
        }
      } catch (error) {
        hasError = true;
        reply = "Sorry, I could not process that right now. Please try again.";
      } finally {
        clearTimeout(thinkingTimer);
      }

      setState("talking", "Responding...", "speaking");
      const bubble = pushMessage("", "bot");
      await typeWriter(bubble, String(reply || ""), config.typingSpeed, comicBubble);

      if (hasError) {
        setState("idle", "Service issue", "error");
      } else if (isErrorLikeReply(reply)) {
        setState("idle", "Issue detected", "error");
      } else if (userIsNegative && backendEmotion !== "error" && backendEmotion !== "confused") {
        setState("idle", "Ready", "neutral");
      } else if (backendEmotion && backendEmotion !== "neutral") {
        setState("idle", "Ready", backendEmotion);
      } else if (isConfusedReply(reply)) {
        setState("idle", "Need clarification", "confused");
      } else if (isPositiveMessage(message)) {
        setState("idle", "Ready", "welcome");
      } else {
        setState("idle", "Ready", "neutral");
      }

      sendBtn.disabled = false;
      busy = false;
      input.focus();
    }

    toggleBtn.addEventListener("click", () => {
      widget.dataset.minimized = "false";
      widget.dataset.transcriptOpen = "false";
      syncTranscriptToggle();
    });

    transcriptToggleBtn.addEventListener("click", () => {
      const isOpen = widget.dataset.transcriptOpen === "true";
      widget.dataset.transcriptOpen = String(!isOpen);
      syncTranscriptToggle();
    });

    input.addEventListener("focus", () => {
      setListeningMode(input.value.trim().length > 0);
    });

    input.addEventListener("input", () => {
      setListeningMode(input.value.trim().length > 0);
    });

    input.addEventListener("blur", () => {
      if (!input.value.trim()) {
        setListeningMode(false);
      }
    });

    if (avatarImage) {
      avatarImage.addEventListener("error", () => {
        widget.dataset.avatarMode = "robot";
      });
    }

    form.addEventListener("submit", handleSubmit);
    container.appendChild(widget);
    syncTranscriptToggle();
    const initialGreeting = resolveInitialGreeting();
    pushMessage(initialGreeting, "bot");
    setState("idle", "Ready", "welcome");
    setComicText(initialGreeting);
    welcomeTimer = setTimeout(() => {
      if (!busy) {
        setEmotion("neutral");
      }
    }, 1800);

    return {
      unmount() {
        if (welcomeTimer) {
          clearTimeout(welcomeTimer);
        }
        widget.remove();
      },
      setState,
      setEmotion,
      send(text) {
        input.value = text;
        form.dispatchEvent(new Event("submit", { cancelable: true }));
      },
    };
  }

  window.ChatbotWidget = { mount: mountChatbot };
})();
