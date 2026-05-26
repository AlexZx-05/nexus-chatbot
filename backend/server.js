import cors from "cors";
import express from "express";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_APP_ID = process.env.DEFAULT_APP_ID || "default";
const APPS_ROOT = process.env.APPS_ROOT || path.join(__dirname, "data", "apps");
const LEGACY_KNOWLEDGE_FILE = path.join(__dirname, "data", "knowledge.base.json");
const LEGACY_CONFIG_FILE = path.join(__dirname, "data", "widget.config.json");
const PROJECT_ROOT = path.join(__dirname, "..");

app.get("/assets/chatbot-widget.js", (req, res) => {
  return res.sendFile(path.join(PROJECT_ROOT, "chatbot-widget.js"));
});

app.get("/assets/chatbot-widget.css", (req, res) => {
  return res.sendFile(path.join(PROJECT_ROOT, "chatbot-widget.css"));
});

app.get("/admin", (req, res) => {
  return res.sendFile(path.join(PROJECT_ROOT, "admin.html"));
});

app.use(
  "/assets/emotions",
  express.static(path.join(PROJECT_ROOT, "assets", "emotions"), {
    maxAge: "1d",
    immutable: false,
  })
);

const defaultKnowledge = {
  appName: "Professional Assistant",
  fallbackReply: "Thanks for your message. Please share more detail so I can assist correctly.",
  fallbackEmotion: "neutral",
  intents: [],
};

const defaultConfig = {
  title: "Professional Assistant",
  subtitle: "Ready to assist",
  placeholder: "Type your question...",
  welcomeMessage: "Hi there! What can I help you with today?",
  useEmotionImages: true,
  hideTranscriptByDefault: true,
  startTranscriptOpen: false,
};

async function readJsonFromFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonToFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function tryReadJson(filePath) {
  try {
    return await readJsonFromFile(filePath);
  } catch (error) {
    return null;
  }
}

async function readJsonFromUrl(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}. Status ${response.status}`);
  }
  return response.json();
}

async function loadDataSource(source, fallbackValue) {
  if (!source) {
    return fallbackValue;
  }
  if (/^https?:\/\//i.test(source)) {
    return readJsonFromUrl(source);
  }
  return readJsonFromFile(source);
}

function normalizeKeywordList(keywords) {
  if (!Array.isArray(keywords)) {
    return [];
  }
  return keywords
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeAppId(appId) {
  const value = String(appId || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(value)) {
    return null;
  }
  return value;
}

function getPublicBaseUrl(req) {
  const forwardedProto = req.get("x-forwarded-proto");
  const forwardedHost = req.get("x-forwarded-host");
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host");
  return `${protocol}://${host}`;
}

function buildEmbedCode(baseUrl, appId) {
  const safeBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  return `<script src="${safeBaseUrl}/assets/chatbot-widget.js" data-app-id="${appId}" data-base-url="${safeBaseUrl}"></script>`;
}

function normalizeIntentList(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item, index) => {
      const keywords = normalizeKeywordList(item && item.keywords);
      const reply = String((item && item.reply) || "").trim();
      if (!keywords.length || !reply) {
        return null;
      }
      return {
        id: String((item && item.id) || `intent_${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
        keywords,
        reply,
        emotion: String((item && item.emotion) || "neutral").toLowerCase(),
      };
    })
    .filter(Boolean);
}

function normalizeEmotionImages(images) {
  const source = images && typeof images === "object" ? images : {};
  const result = {};
  for (const emotion of ["neutral", "welcome", "listening", "thinking", "speaking", "confused", "error"]) {
    const value = String(source[emotion] || "").trim();
    if (value) {
      result[emotion] = value;
    }
  }
  return result;
}

async function ensureAppDirectory(appId) {
  const safeAppId = normalizeAppId(appId);
  if (!safeAppId) {
    throw new Error("Invalid appId. Use lowercase letters, numbers, '_' or '-'.");
  }
  const appDir = path.join(APPS_ROOT, safeAppId);
  await mkdir(appDir, { recursive: true });
  return { safeAppId, appDir };
}

async function listAppIds() {
  try {
    const entries = await readdir(APPS_ROOT, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && normalizeAppId(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return [];
  }
}

async function resolveAppRuntime(appId) {
  const safeAppId = normalizeAppId(appId || DEFAULT_APP_ID);
  if (!safeAppId) {
    throw new Error("Invalid appId. Use lowercase letters, numbers, '_' or '-'.");
  }

  const appDir = path.join(APPS_ROOT, safeAppId);
  const knowledgePath = path.join(appDir, "knowledge.base.json");
  const configPath = path.join(appDir, "widget.config.json");

  const explicitKnowledgeSource = process.env.KNOWLEDGE_SOURCE;
  const explicitConfigSource = process.env.WIDGET_CONFIG_SOURCE;

  let knowledge;
  let config;

  if (explicitKnowledgeSource || explicitConfigSource) {
    knowledge = await loadDataSource(explicitKnowledgeSource || knowledgePath, defaultKnowledge);
    config = await loadDataSource(explicitConfigSource || configPath, defaultConfig);
  } else {
    const appKnowledge = await tryReadJson(knowledgePath);
    const appConfig = await tryReadJson(configPath);
    const legacyKnowledge = await tryReadJson(LEGACY_KNOWLEDGE_FILE);
    const legacyConfig = await tryReadJson(LEGACY_CONFIG_FILE);

    knowledge = appKnowledge || legacyKnowledge || defaultKnowledge;
    config = appConfig || legacyConfig || defaultConfig;
  }

  const chatPath = `/api/apps/${safeAppId}/chat`;
  const finalConfig = {
    ...defaultConfig,
    ...(config || {}),
    apiUrl: (config && config.apiUrl) || chatPath,
  };

  return {
    appId: safeAppId,
    knowledge: { ...defaultKnowledge, ...(knowledge || {}) },
    config: finalConfig,
  };
}

function resolveEmotion(message, failed, matchedEmotion, fallbackEmotion) {
  if (failed) {
    return "error";
  }
  if (matchedEmotion) {
    return matchedEmotion;
  }

  const text = String(message || "").trim().toLowerCase();
  if (!text || text.length < 3 || !/[a-zA-Z]/.test(text)) {
    return "confused";
  }
  if (text.includes("hi") || text.includes("hello") || text.includes("thanks") || text.includes("thank you")) {
    return "welcome";
  }
  return String(fallbackEmotion || "neutral");
}

function matchIntent(message, knowledge) {
  const text = String(message || "").toLowerCase();
  if (!text) {
    return null;
  }

  for (const intent of knowledge.intents || []) {
    const keywords = normalizeKeywordList(intent.keywords);
    if (keywords.some((word) => text.includes(word))) {
      return {
        reply: String(intent.reply || knowledge.fallbackReply),
        emotion: String(intent.emotion || "neutral").toLowerCase(),
      };
    }
  }

  return null;
}

app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  return res.status(204).end();
});

app.get("/api/apps", async (req, res) => {
  try {
    const appIds = await listAppIds();
    const apps = await Promise.all(
      appIds.map(async (appId) => {
        const runtime = await resolveAppRuntime(appId);
        return {
          appId,
          title: runtime.config.title,
          appName: runtime.knowledge.appName,
          intents: Array.isArray(runtime.knowledge.intents) ? runtime.knowledge.intents.length : 0,
          embedCode: buildEmbedCode(getPublicBaseUrl(req), appId),
        };
      })
    );
    return res.json({ apps });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/apps", async (req, res) => {
  try {
    const body = req.body || {};
    const { safeAppId, appDir } = await ensureAppDirectory(body.appId);
    const config = {
      ...defaultConfig,
      title: String(body.title || body.appName || defaultConfig.title).trim(),
      subtitle: String(body.subtitle || "Ready to assist").trim(),
      placeholder: String(body.placeholder || defaultConfig.placeholder).trim(),
      welcomeMessage: String(body.welcomeMessage || defaultConfig.welcomeMessage).trim(),
      returningGreeting: String(body.returningGreeting || "Welcome back. How can I help?").trim(),
      apiUrl: `/api/apps/${safeAppId}/chat`,
      useEmotionImages: body.useEmotionImages !== false,
      hideTranscriptByDefault: body.hideTranscriptByDefault !== false,
      startTranscriptOpen: Boolean(body.startTranscriptOpen),
      emotionImages: normalizeEmotionImages(body.emotionImages),
    };
    const knowledge = {
      ...defaultKnowledge,
      appName: String(body.appName || body.title || defaultKnowledge.appName).trim(),
      fallbackReply: String(body.fallbackReply || defaultKnowledge.fallbackReply).trim(),
      fallbackEmotion: String(body.fallbackEmotion || defaultKnowledge.fallbackEmotion).toLowerCase(),
      sources: Array.isArray(body.sources) ? body.sources.map((item) => String(item || "").trim()).filter(Boolean) : [],
      intents: normalizeIntentList(body.intents),
    };

    await writeJsonToFile(path.join(appDir, "widget.config.json"), config);
    await writeJsonToFile(path.join(appDir, "knowledge.base.json"), knowledge);

    return res.status(201).json({
      appId: safeAppId,
      config,
      knowledge,
      embedCode: buildEmbedCode(getPublicBaseUrl(req), safeAppId),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/apps/:appId", async (req, res) => {
  try {
    const runtime = await resolveAppRuntime(req.params.appId);
    return res.json({
      appId: runtime.appId,
      config: runtime.config,
      knowledge: runtime.knowledge,
      embedCode: buildEmbedCode(getPublicBaseUrl(req), runtime.appId),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put("/api/apps/:appId/config", async (req, res) => {
  try {
    const { safeAppId, appDir } = await ensureAppDirectory(req.params.appId);
    const currentConfig = (await tryReadJson(path.join(appDir, "widget.config.json"))) || defaultConfig;
    const body = req.body || {};
    const nextConfig = {
      ...currentConfig,
      ...body,
      apiUrl: `/api/apps/${safeAppId}/chat`,
      emotionImages: normalizeEmotionImages(body.emotionImages || currentConfig.emotionImages),
    };
    await writeJsonToFile(path.join(appDir, "widget.config.json"), nextConfig);
    return res.json({ appId: safeAppId, config: nextConfig });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put("/api/apps/:appId/knowledge", async (req, res) => {
  try {
    const { safeAppId, appDir } = await ensureAppDirectory(req.params.appId);
    const currentKnowledge = (await tryReadJson(path.join(appDir, "knowledge.base.json"))) || defaultKnowledge;
    const body = req.body || {};
    const nextKnowledge = {
      ...currentKnowledge,
      appName: String(body.appName || currentKnowledge.appName || defaultKnowledge.appName).trim(),
      fallbackReply: String(body.fallbackReply || currentKnowledge.fallbackReply || defaultKnowledge.fallbackReply).trim(),
      fallbackEmotion: String(body.fallbackEmotion || currentKnowledge.fallbackEmotion || "neutral").toLowerCase(),
      sources: Array.isArray(body.sources)
        ? body.sources.map((item) => String(item || "").trim()).filter(Boolean)
        : currentKnowledge.sources || [],
      intents: Array.isArray(body.intents) ? normalizeIntentList(body.intents) : currentKnowledge.intents || [],
    };
    await writeJsonToFile(path.join(appDir, "knowledge.base.json"), nextKnowledge);
    return res.json({ appId: safeAppId, knowledge: nextKnowledge });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/apps/:appId/embed-code", async (req, res) => {
  try {
    const safeAppId = normalizeAppId(req.params.appId);
    if (!safeAppId) {
      throw new Error("Invalid appId. Use lowercase letters, numbers, '_' or '-'.");
    }
    const baseUrl = String(req.query.baseUrl || getPublicBaseUrl(req)).replace(/\/+$/, "");
    return res.json({
      appId: safeAppId,
      baseUrl,
      embedCode: buildEmbedCode(baseUrl, safeAppId),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/apps/:appId/config", async (req, res) => {
  try {
    const runtime = await resolveAppRuntime(req.params.appId);
    return res.json(runtime.config);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/apps/:appId/chat", async (req, res) => {
  const { message } = req.body || {};
  try {
    const runtime = await resolveAppRuntime(req.params.appId);
    const matched = matchIntent(message, runtime.knowledge);
    const reply = matched
      ? matched.reply
      : String(runtime.knowledge.fallbackReply || "I received your message.");
    const emotion = resolveEmotion(
      message,
      false,
      matched ? matched.emotion : null,
      runtime.knowledge.fallbackEmotion
    );
    return res.json({ reply, emotion, appId: runtime.appId });
  } catch (error) {
    return res.status(500).json({
      reply: "Sorry, something went wrong. Please try again.",
      emotion: "error",
    });
  }
});

app.get("/api/config", async (req, res) => {
  try {
    const runtime = await resolveAppRuntime(DEFAULT_APP_ID);
    return res.json(runtime.config);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body || {};
  try {
    const runtime = await resolveAppRuntime(DEFAULT_APP_ID);
    const matched = matchIntent(message, runtime.knowledge);
    const reply = matched
      ? matched.reply
      : String(runtime.knowledge.fallbackReply || "I received your message.");
    const emotion = resolveEmotion(
      message,
      false,
      matched ? matched.emotion : null,
      runtime.knowledge.fallbackEmotion
    );
    return res.json({ reply, emotion, appId: runtime.appId });
  } catch (error) {
    return res.status(500).json({
      reply: "Sorry, something went wrong. Please try again.",
      emotion: "error",
    });
  }
});

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Emotion backend running at http://localhost:${port}`);
  console.log(`Default config endpoint: http://localhost:${port}/api/config`);
  console.log(`Per-app config endpoint: http://localhost:${port}/api/apps/{appId}/config`);
});
