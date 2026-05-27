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
  schemaVersion: "2.0.0",
  appName: "Professional Assistant",
  fallbackReply: "Thanks for your message. Please share more detail so I can assist correctly.",
  fallbackEmotion: "neutral",
  updatedAt: null,
  retrieval: {
    enabled: true,
    minScore: 3,
    maxContextChunks: 2,
  },
  intents: [],
  sources: [],
  webIndex: {
    generatedAt: null,
    pages: [],
    chunks: [],
  },
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

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function editDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[left.length][right.length];
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
        priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 100,
        source: String(item?.source || "manual"),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority);
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

function stripHtml(html) {
  const raw = String(html || "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html, pageUrl) {
  const results = new Set();
  const source = String(html || "");
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match = re.exec(source);
  while (match) {
    const href = String(match[1] || "").trim();
    if (href) {
      try {
        const absolute = new URL(href, pageUrl);
        if (absolute.protocol === "http:" || absolute.protocol === "https:") {
          results.add(absolute.toString());
        }
      } catch (error) {}
    }
    match = re.exec(source);
  }
  return Array.from(results);
}

function splitIntoChunks(text, maxLen = 650) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current + " " + sentence).trim().length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((item) => item.length >= 60);
}

function extractTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 120) : "";
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.endsWith("/") && u.pathname !== "/") {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch (error) {
    return String(url || "").trim();
  }
}

function isLikelyUsefulText(text) {
  const clean = String(text || "").trim();
  if (clean.length < 120) return false;
  const noiseSignals = ["cookie", "copyright", "privacy policy", "all rights reserved"];
  const lower = clean.toLowerCase();
  const penalty = noiseSignals.reduce((sum, item) => sum + (lower.includes(item) ? 1 : 0), 0);
  return penalty < 3;
}

function sameHost(urlA, urlB) {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.host === b.host;
  } catch (error) {
    return false;
  }
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "ChatbotPlatformCrawler/1.0",
        Accept: "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function crawlAndIndexSources(sources) {
  const seeds = Array.from(
    new Set(
      (Array.isArray(sources) ? sources : [])
        .map((item) => String(item || "").trim())
        .filter((item) => /^https?:\/\//i.test(item))
    )
  );

  if (!seeds.length) {
    return { generatedAt: new Date().toISOString(), pages: [], chunks: [] };
  }

  const queue = seeds.map((url) => ({ url: normalizeUrl(url), depth: 0 }));
  const visited = new Set();
  const pages = [];
  const chunks = [];
  const maxPages = 80;
  const maxDepth = 2;
  const allowedHosts = new Set(seeds.map((url) => new URL(url).host));

  while (queue.length && pages.length < maxPages) {
    const current = queue.shift();
    const url = normalizeUrl(current?.url);
    const depth = current?.depth || 0;
    if (!url || visited.has(url)) continue;
    visited.add(url);

    try {
      const start = Date.now();
      const response = await fetchWithTimeout(url);
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("text/plain"))) {
        pages.push({
          url,
          ok: false,
          status: response.status,
          contentType,
          textChars: 0,
          durationMs: Date.now() - start,
        });
        continue;
      }

      const html = await response.text();
      const text = stripHtml(html);
      const title = extractTitle(html);
      pages.push({
        url,
        ok: true,
        status: response.status,
        contentType,
        title,
        textChars: text.length,
        durationMs: Date.now() - start,
      });

      for (const piece of splitIntoChunks(text)) {
        if (!isLikelyUsefulText(piece)) continue;
        chunks.push({
          url,
          title,
          text: piece,
          tokens: tokenize(piece),
        });
      }

      if (depth < maxDepth) {
        const links = extractLinks(html, url).filter((link) => {
          try {
            const host = new URL(link).host;
            return allowedHosts.has(host) && sameHost(link, url);
          } catch (error) {
            return false;
          }
        });
        for (const link of links) {
          const next = normalizeUrl(link);
          if (!visited.has(next)) queue.push({ url: next, depth: depth + 1 });
        }
      }
    } catch (error) {
      pages.push({
        url,
        ok: false,
        status: 0,
        contentType: "",
        textChars: 0,
        durationMs: 0,
        error: error.message,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    pages,
    chunks: chunks.slice(0, 2000),
  };
}

function retrieveFromWebIndex(question, webIndex) {
  const sourceChunks = Array.isArray(webIndex?.chunks) ? webIndex.chunks : [];
  if (!sourceChunks.length) return null;
  const qTokens = new Set(tokenize(question).filter((item) => item.length >= 3));
  if (!qTokens.size) return null;

  const tokenDocFreq = new Map();
  for (const chunk of sourceChunks) {
    const uniq = new Set(Array.isArray(chunk.tokens) ? chunk.tokens : tokenize(chunk.text));
    for (const token of uniq) {
      tokenDocFreq.set(token, (tokenDocFreq.get(token) || 0) + 1);
    }
  }

  const scored = sourceChunks
    .map((chunk) => {
      const chunkTokens = Array.isArray(chunk.tokens) ? chunk.tokens : tokenize(chunk.text);
      let score = 0;
      for (const token of qTokens) {
        const df = tokenDocFreq.get(token) || 1;
        const idf = Math.log(1 + sourceChunks.length / df);
        if (chunkTokens.includes(token)) score += 2 * idf;
        else if (token.length >= 6 && chunkTokens.some((item) => Math.abs(item.length - token.length) <= 1 && editDistance(item, token) <= 1)) score += 1 * idf;
      }
      if (String(chunk.url || "").includes("/about") || String(chunk.url || "").includes("/administration")) {
        if (qTokens.has("director") || qTokens.has("faculty")) score += 1.2;
      }
      if (String(chunk.url || "").includes("/admission") && (qTokens.has("admission") || qTokens.has("eligibility"))) {
        score += 1.2;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (!scored.length) return null;
  const top = scored.slice(0, 2).map((item) => item.chunk);
  const sources = Array.from(new Set(top.map((item) => item.url))).slice(0, 2);
  const sentences = [];
  for (const chunk of top) {
    const parts = String(chunk.text || "").split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const p = part.trim();
      if (!p || p.length < 45 || p.length > 240) continue;
      const tokens = tokenize(p);
      let overlap = 0;
      for (const token of qTokens) {
        if (tokens.includes(token)) overlap += 1;
      }
      if (overlap > 0) sentences.push({ p, overlap });
    }
  }
  const summary = (sentences.length ? sentences.sort((a, b) => b.overlap - a.overlap).slice(0, 3).map((x) => x.p) : top
    .map((item) => item.text.slice(0, 220)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!summary || summary.length < 60) {
    return null;
  }
  const reply = `${summary}\n\nSources:\n- ${sources.join("\n- ")}`;
  return { reply, emotion: "thinking", score: scored[0].score };
}

function toProfessionalKnowledge(rawKnowledge) {
  const source = rawKnowledge && typeof rawKnowledge === "object" ? rawKnowledge : {};
  const intents = normalizeIntentList(source.intents);
  const sources = Array.isArray(source.sources) ? source.sources.map((item) => String(item || "").trim()).filter(Boolean) : [];
  return {
    schemaVersion: "2.0.0",
    appName: String(source.appName || defaultKnowledge.appName).trim(),
    fallbackReply: String(source.fallbackReply || defaultKnowledge.fallbackReply).trim(),
    fallbackEmotion: String(source.fallbackEmotion || defaultKnowledge.fallbackEmotion).toLowerCase(),
    updatedAt: source.updatedAt || new Date().toISOString(),
    retrieval: {
      enabled: source.retrieval?.enabled !== false,
      minScore: Number.isFinite(Number(source.retrieval?.minScore)) ? Number(source.retrieval.minScore) : defaultKnowledge.retrieval.minScore,
      maxContextChunks: Number.isFinite(Number(source.retrieval?.maxContextChunks))
        ? Number(source.retrieval.maxContextChunks)
        : defaultKnowledge.retrieval.maxContextChunks,
    },
    intents,
    sources,
    webIndex: source.webIndex && typeof source.webIndex === "object"
      ? source.webIndex
      : { generatedAt: null, pages: [], chunks: [] },
  };
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
    knowledge: toProfessionalKnowledge({ ...defaultKnowledge, ...(knowledge || {}) }),
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
  const text = String(message || "").toLowerCase().trim();
  if (!text) {
    return null;
  }
  const words = tokenize(text);

  const sortedIntents = Array.isArray(knowledge.intents)
    ? [...knowledge.intents].sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100))
    : [];
  for (const intent of sortedIntents) {
    const keywords = normalizeKeywordList(intent.keywords);
    const matched = keywords.some((keyword) => {
      if (text.includes(keyword)) {
        return true;
      }
      if (keyword.length >= 5) {
        return words.some((word) => {
          if (word === keyword) {
            return true;
          }
          if (Math.abs(word.length - keyword.length) > 1) {
            return false;
          }
          return editDistance(word, keyword) <= 1;
        });
      }
      return false;
    });

    if (matched) {
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
      ...toProfessionalKnowledge(defaultKnowledge),
      appName: String(body.appName || body.title || defaultKnowledge.appName).trim(),
      fallbackReply: String(body.fallbackReply || defaultKnowledge.fallbackReply).trim(),
      fallbackEmotion: String(body.fallbackEmotion || defaultKnowledge.fallbackEmotion).toLowerCase(),
      updatedAt: new Date().toISOString(),
      sources: Array.isArray(body.sources) ? body.sources.map((item) => String(item || "").trim()).filter(Boolean) : [],
      intents: normalizeIntentList(body.intents),
    };
    knowledge.webIndex = await crawlAndIndexSources(knowledge.sources);

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

app.post("/api/apps/:appId/reindex", async (req, res) => {
  try {
    const { safeAppId, appDir } = await ensureAppDirectory(req.params.appId);
    const currentKnowledge = (await tryReadJson(path.join(appDir, "knowledge.base.json"))) || defaultKnowledge;
    const nextKnowledge = toProfessionalKnowledge(currentKnowledge);
    nextKnowledge.updatedAt = new Date().toISOString();
    nextKnowledge.webIndex = await crawlAndIndexSources(nextKnowledge.sources || []);
    await writeJsonToFile(path.join(appDir, "knowledge.base.json"), nextKnowledge);
    return res.json({
      appId: safeAppId,
      indexedPages: nextKnowledge.webIndex.pages.length,
      indexedChunks: nextKnowledge.webIndex.chunks.length,
      generatedAt: nextKnowledge.webIndex.generatedAt,
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
      ...toProfessionalKnowledge(currentKnowledge),
      appName: String(body.appName || currentKnowledge.appName || defaultKnowledge.appName).trim(),
      fallbackReply: String(body.fallbackReply || currentKnowledge.fallbackReply || defaultKnowledge.fallbackReply).trim(),
      fallbackEmotion: String(body.fallbackEmotion || currentKnowledge.fallbackEmotion || "neutral").toLowerCase(),
      updatedAt: new Date().toISOString(),
      sources: Array.isArray(body.sources)
        ? body.sources.map((item) => String(item || "").trim()).filter(Boolean)
        : currentKnowledge.sources || [],
      intents: Array.isArray(body.intents) ? normalizeIntentList(body.intents) : currentKnowledge.intents || [],
    };
    if (Array.isArray(body.sources)) {
      nextKnowledge.webIndex = await crawlAndIndexSources(nextKnowledge.sources);
    } else {
      nextKnowledge.webIndex = currentKnowledge.webIndex || defaultKnowledge.webIndex;
    }
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
    const fromWeb = matched || runtime.knowledge.retrieval?.enabled === false
      ? null
      : retrieveFromWebIndex(message, runtime.knowledge.webIndex);
    const canUseWeb = fromWeb && fromWeb.score >= Number(runtime.knowledge.retrieval?.minScore || 2);
    const reply = matched
      ? matched.reply
      : (canUseWeb && fromWeb.reply) || String(runtime.knowledge.fallbackReply || "I received your message.");
    const emotion = resolveEmotion(
      message,
      false,
      matched ? matched.emotion : (canUseWeb ? fromWeb.emotion : null),
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
    const fromWeb = matched || runtime.knowledge.retrieval?.enabled === false
      ? null
      : retrieveFromWebIndex(message, runtime.knowledge.webIndex);
    const canUseWeb = fromWeb && fromWeb.score >= Number(runtime.knowledge.retrieval?.minScore || 2);
    const reply = matched
      ? matched.reply
      : (canUseWeb && fromWeb.reply) || String(runtime.knowledge.fallbackReply || "I received your message.");
    const emotion = resolveEmotion(
      message,
      false,
      matched ? matched.emotion : (canUseWeb ? fromWeb.emotion : null),
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
