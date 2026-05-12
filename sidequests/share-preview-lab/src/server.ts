import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as linkPreviewJs from "link-preview-js";
import { preview as openlinkPreview } from "openlink";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const corpusPath = path.join(rootDir, "data", "url-corpus.json");
const port = Number(process.env.PORT || 4177);
const HTML_MAX_LENGTH = 512_000;

const browserHeaders = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6",
  "User-Agent": "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
};

const runnerDefinitions = [
  {
    id: "intent-only",
    label: "Intent Only",
    description: "Uses only supplied share/intent text and title. No network request.",
  },
  {
    id: "current-style-baseline",
    label: "Current-Style Baseline",
    description: "Standalone approximation of the current app's HTTP + meta parsing fallback.",
  },
  {
    id: "link-preview-js",
    label: "link-preview-js",
    description: "OSS package runner using link-preview-js.",
  },
  {
    id: "openlink",
    label: "OpenLink",
    description: "OSS package runner using openlink.",
  },
];

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function resolveUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractAttrs(tag) {
  const attrs = {};
  const pattern = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attrs;
}

function getMetaContent(html, names) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const attrs = extractAttrs(tag);
    const key = attrs.property || attrs.name || attrs.itemprop;
    if (key && names.includes(key.toLowerCase()) && attrs.content?.trim()) {
      return normalizeWhitespace(decodeEntities(attrs.content));
    }
  }
  return "";
}

function getTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeWhitespace(decodeEntities(match?.[1] || ""));
}

function getFavicon(html, pageUrl) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  const candidates = [];
  for (const tag of linkTags) {
    const attrs = extractAttrs(tag);
    const rel = String(attrs.rel || "").toLowerCase();
    if (!attrs.href) continue;
    if (rel.includes("apple-touch-icon")) candidates.unshift(attrs.href);
    if (rel.includes("icon")) candidates.push(attrs.href);
  }
  const best = candidates.find(Boolean);
  return best ? resolveUrl(best, pageUrl) : resolveUrl("/favicon.ico", pageUrl);
}

function parseGenericHtml(html, pageUrl) {
  const lowerNames = (names) => names.map((name) => name.toLowerCase());
  const title = getMetaContent(html, lowerNames(["og:title", "twitter:title"])) || getTitle(html);
  const description = getMetaContent(html, lowerNames(["og:description", "twitter:description", "description"]));
  const image = resolveUrl(getMetaContent(html, lowerNames(["og:image", "og:image:url", "twitter:image", "twitter:image:src"])), pageUrl);
  const siteName = getMetaContent(html, lowerNames(["og:site_name", "application-name", "application-title"])) || getHostname(pageUrl);
  const favicon = getFavicon(html, pageUrl);
  return { title, description, image, favicon, siteName };
}

function isYouTubeUrl(value) {
  const hostname = getHostname(value);
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
}

function isXUrl(value) {
  const hostname = getHostname(value);
  return hostname === "x.com" || hostname === "twitter.com" || hostname === "mobile.twitter.com";
}

function isInstagramUrl(value) {
  const hostname = getHostname(value);
  return hostname === "instagram.com" || hostname.endsWith(".instagram.com") || hostname === "instagr.am";
}

function isAmazonUrl(value) {
  const hostname = getHostname(value);
  return hostname === "amazon.co.jp" || hostname.endsWith(".amazon.co.jp") || hostname === "amzn.to" || hostname === "amzn.asia";
}

function getInstagramFallback(url) {
  if (!isInstagramUrl(url)) return null;
  let title = "Instagram";
  try {
    const pathName = new URL(url).pathname.toLowerCase();
    if (pathName.startsWith("/reel/") || pathName.startsWith("/reels/")) title = "Instagramリール";
    else if (pathName.startsWith("/p/")) title = "Instagramの投稿";
    else if (pathName.startsWith("/stories/")) title = "Instagramストーリーズ";
    else if (pathName !== "/") title = "Instagramプロフィール";
  } catch {}
  return {
    title,
    description: "Instagramで共有されたリンク",
    siteName: "Instagram",
    favicon: "https://www.instagram.com/favicon.ico",
  };
}

function extractAmazonAsin(value) {
  const patterns = [
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i,
    /(?:[?&]asin=)([A-Z0-9]{10})(?:[&#]|$)/i,
    /"asin"\s*:\s*"([A-Z0-9]{10})"/i,
    /data-asin=["']([A-Z0-9]{10})["']/i,
  ];
  for (const pattern of patterns) {
    const match = String(value || "").match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return "";
}

function getAmazonAsinImageUrl(asin) {
  if (!asin) return "";
  const params = new URLSearchParams({
    _encoding: "UTF8",
    MarketPlace: "JP",
    ASIN: asin,
    ServiceVersion: "20070822",
    ID: "AsinImage",
    WS: "1",
    Format: "_SL500_",
  });
  return `https://ws-fe.amazon-adsystem.com/widgets/q?${params.toString()}`;
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: browserHeaders,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      contentType: response.headers.get("content-type") || "",
      text: text.slice(0, HTML_MAX_LENGTH),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: browserHeaders });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function classifyPreview(normalized) {
  if (!normalized) return "failed";
  if (normalized.title && normalized.image) return "ok";
  if (normalized.title || normalized.image || normalized.favicon) return "partial";
  if (normalized.siteName) return "fallback";
  return "failed";
}

async function runIntentOnly(input) {
  const title = normalizeWhitespace(input.intent?.title || "");
  const text = normalizeWhitespace(input.intent?.text || "");
  const siteName = getHostname(input.url);
  const normalized = {
    finalUrl: input.url,
    title: title || text.replace(input.url, "").trim() || siteName,
    description: text && text !== input.url ? text : "",
    siteName,
    favicon: siteName ? `https://${siteName}/favicon.ico` : "",
  };
  return {
    status: title || text ? classifyPreview(normalized) : "fallback",
    phase: "normalize",
    normalized,
    raw: { intent: input.intent || {}, note: "No network request was made." },
  };
}

async function runCurrentStyleBaseline(input) {
  if (isYouTubeUrl(input.url)) {
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(input.url)}`;
    const data = await fetchJson(oembedUrl, input.timeoutMs);
    if (data?.title || data?.thumbnail_url) {
      const normalized = {
        finalUrl: input.url,
        title: data.title || "",
        description: data.author_name || "",
        image: data.thumbnail_url || "",
        siteName: data.provider_name || "YouTube",
        favicon: "https://www.youtube.com/favicon.ico",
      };
      return { status: classifyPreview(normalized), phase: "parse", normalized, raw: data };
    }
  }

  if (isXUrl(input.url)) {
    const endpoints = [
      `https://publish.x.com/oembed?omit_script=1&url=${encodeURIComponent(input.url)}`,
      `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(input.url)}`,
    ];
    for (const endpoint of endpoints) {
      const data = await fetchJson(endpoint, input.timeoutMs);
      if (data?.html || data?.author_name) {
        const normalized = {
          finalUrl: input.url,
          title: normalizeWhitespace(String(data.html || "").replace(/<[^>]+>/g, " ")) || (data.author_name ? `${data.author_name} on X` : "X post"),
          description: data.author_name || "",
          siteName: data.provider_name || "X",
          favicon: "https://x.com/favicon.ico",
        };
        return { status: classifyPreview(normalized), phase: "parse", normalized, raw: data };
      }
    }
  }

  const response = await fetchText(input.url, input.timeoutMs);
  if (!response.ok) {
    const instagramFallback = getInstagramFallback(input.url);
    if (instagramFallback) {
      return {
        status: "fallback",
        phase: "fetch",
        normalized: { finalUrl: input.url, ...instagramFallback },
        raw: { status: response.status, finalUrl: response.finalUrl },
      };
    }
    throw Object.assign(new Error(`HTTP ${response.status}`), { phase: "fetch", raw: response });
  }

  if (!response.contentType.includes("text/html")) {
    const normalized = {
      finalUrl: response.finalUrl,
      title: path.basename(new URL(response.finalUrl).pathname) || getHostname(response.finalUrl),
      siteName: getHostname(response.finalUrl),
      image: response.contentType.startsWith("image/") ? response.finalUrl : "",
      favicon: `https://${getHostname(response.finalUrl)}/favicon.ico`,
    };
    return { status: classifyPreview(normalized), phase: "parse", normalized, raw: response };
  }

  const generic = parseGenericHtml(response.text, response.finalUrl);
  const asin = extractAmazonAsin(`${input.url}\n${response.text}`);
  const instagramFallback = getInstagramFallback(response.finalUrl) || getInstagramFallback(input.url);
  const normalized = {
    finalUrl: response.finalUrl,
    ...generic,
    title: generic.title || instagramFallback?.title || (isAmazonUrl(input.url) ? "Amazon" : getHostname(response.finalUrl)),
    description: generic.description || instagramFallback?.description || "",
    image: generic.image || (isAmazonUrl(input.url) ? getAmazonAsinImageUrl(asin) : ""),
    siteName: generic.siteName || instagramFallback?.siteName || getHostname(response.finalUrl),
    favicon: generic.favicon || instagramFallback?.favicon || `https://${getHostname(response.finalUrl)}/favicon.ico`,
  };
  return { status: classifyPreview(normalized), phase: "parse", normalized, raw: response };
}

async function runLinkPreviewJs(input) {
  const getPreview = linkPreviewJs.getLinkPreview || linkPreviewJs.default?.getLinkPreview;
  if (!getPreview) {
    throw Object.assign(new Error("link-preview-js did not expose getLinkPreview in this runtime."), { phase: "import" });
  }
  const data = await getPreview(input.url, {
    timeout: input.timeoutMs,
    followRedirects: "follow",
    headers: browserHeaders,
  });
  const normalized = {
    finalUrl: data.url || input.url,
    title: data.title || "",
    description: data.description || "",
    image: Array.isArray(data.images) ? data.images[0] || "" : "",
    favicon: Array.isArray(data.favicons) ? data.favicons[0] || "" : "",
    siteName: data.siteName || getHostname(data.url || input.url),
  };
  return { status: classifyPreview(normalized), phase: "parse", normalized, raw: data };
}

async function runOpenLink(input) {
  const data = await openlinkPreview(input.url, {
    timeout: input.timeoutMs,
    headers: browserHeaders,
  });
  const normalized = {
    finalUrl: data.url || data.finalUrl || input.url,
    title: data.title || "",
    description: data.description || "",
    image: data.image || data.thumbnail || "",
    favicon: data.favicon || "",
    siteName: data.siteName || data.site || getHostname(data.url || input.url),
  };
  return { status: classifyPreview(normalized), phase: "parse", normalized, raw: data };
}

const runners = {
  "intent-only": runIntentOnly,
  "current-style-baseline": runCurrentStyleBaseline,
  "link-preview-js": runLinkPreviewJs,
  openlink: runOpenLink,
};

async function withRunEnvelope(runnerId, input) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  try {
    if (!isSafeHttpUrl(input.url)) {
      return {
        runnerId,
        inputUrl: input.url,
        startedAt,
        durationMs: Math.round(performance.now() - started),
        status: "failed",
        phase: "input",
        error: { name: "InvalidUrl", message: "Only http/https URLs are accepted." },
      };
    }

    const result = await runners[runnerId](input);
    return {
      runnerId,
      inputUrl: input.url,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      status: result.status || classifyPreview(result.normalized),
      phase: result.phase || "unknown",
      normalized: result.normalized,
      raw: result.raw,
    };
  } catch (error) {
    const isTimeout = error?.name === "AbortError" || String(error?.message || "").toLowerCase().includes("timeout");
    return {
      runnerId,
      inputUrl: input.url,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      status: isTimeout ? "timeout" : "failed",
      phase: error?.phase || (isTimeout ? "fetch" : "unknown"),
      raw: error?.raw,
      error: {
        name: error?.name || "Error",
        message: error?.message || String(error),
      },
    };
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value, null, 2));
}

function sendText(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(value);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function serveStatic(requestUrl, response) {
  const url = new URL(requestUrl, `http://localhost:${port}`);
  const rawPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    sendText(response, 404, "Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentTypeFor(filePath) });
  createReadStream(filePath).pipe(response);
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  if (request.method === "GET" && url.pathname === "/api/runners") {
    sendJson(response, 200, { runners: runnerDefinitions });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/corpus") {
    sendJson(response, 200, { items: JSON.parse(await readFile(corpusPath, "utf8")) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/run") {
    const body = await readJsonBody(request);
    const urlToPreview = normalizeWhitespace(body.url || "");
    const runnerIds = Array.isArray(body.runnerIds) && body.runnerIds.length
      ? body.runnerIds.filter((id) => runners[id])
      : runnerDefinitions.map((runner) => runner.id);
    const input = {
      url: urlToPreview,
      intent: body.intent || {},
      timeoutMs: Math.max(1000, Math.min(Number(body.timeoutMs || 10_000), 30_000)),
    };
    const mode = body.mode === "sequential" ? "sequential" : "parallel";
    const results = [];
    if (mode === "sequential") {
      for (const runnerId of runnerIds) results.push(await withRunEnvelope(runnerId, input));
    } else {
      results.push(...await Promise.all(runnerIds.map((runnerId) => withRunEnvelope(runnerId, input))));
    }
    sendJson(response, 200, {
      input: { url: urlToPreview, mode, timeoutMs: input.timeoutMs, runnerIds },
      results,
    });
    return;
  }
  sendText(response, 404, "Unknown API route");
}

async function handleRequest(request, response) {
  try {
    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }
    await serveStatic(request.url || "/", response);
  } catch (error) {
    sendJson(response, 500, {
      status: "harness-error",
      error: {
        name: error?.name || "Error",
        message: error?.message || String(error),
      },
    });
  }
}

async function smoke() {
  const result = await withRunEnvelope("intent-only", {
    url: "https://github.com/",
    timeoutMs: 1000,
    intent: { title: "GitHub", text: "https://github.com/" },
  });
  if (result.status === "failed" || result.status === "harness-error") {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv.includes("--smoke")) {
  await smoke();
} else {
  createServer(handleRequest).listen(port, () => {
    console.log(`Share Preview Lab running at http://localhost:${port}`);
  });
}
