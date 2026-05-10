import type { OgpPreview } from "@/types/post";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const OGP_API_BASE_URL = process.env.NEXT_PUBLIC_OGP_API_BASE_URL?.replace(/\/$/, "");
const OGP_HTML_MAX_LENGTH = 512_000;

type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
};

type XOEmbed = {
  author_name?: string;
  html?: string;
  provider_name?: string;
  url?: string;
};

function getMetaContent(document: Document, names: string[]) {
  for (const name of names) {
    const element = document.querySelector<HTMLMetaElement>(
      `meta[property="${name}"], meta[name="${name}"]`,
    );
    const content = element?.content.trim();
    if (content) return content;
  }
  return "";
}

function resolveUrl(value: string, baseUrl: string) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function decodeHtml(value: string) {
  if (!value) return "";
  const parser = new DOMParser();
  const document = parser.parseFromString(value, "text/html");
  return document.documentElement.textContent?.trim() ?? value;
}

function parseOgpHtml(html: string, pageUrl: string): OgpPreview | null {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const title = getMetaContent(document, ["og:title", "twitter:title"]) || document.title.trim();
  const description = getMetaContent(document, ["og:description", "twitter:description", "description"]);
  const siteName = getMetaContent(document, ["og:site_name", "application-name"]);
  const image = resolveUrl(getMetaContent(document, ["og:image", "og:image:url", "twitter:image"]), pageUrl);

  return title || image
    ? { title, description, siteName, image }
    : null;
}

function isXUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "x.com" || hostname === "twitter.com" || hostname === "mobile.twitter.com";
  } catch {
    return false;
  }
}

function isYouTubeUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
  } catch {
    return false;
  }
}

function extractLinksFromHtml(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((anchor) => anchor.href)
    .filter(Boolean);
}

function isExternalTweetLink(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (hostname === "t.co") return true;
    if (hostname === "pic.twitter.com") return false;
    return hostname !== "x.com"
      && hostname !== "twitter.com"
      && hostname !== "mobile.twitter.com";
  } catch {
    return false;
  }
}

function toYouTubeOgp(data: YouTubeOEmbed): OgpPreview | null {
  if (!data.title && !data.thumbnail_url) return null;
  return {
    title: data.title,
    description: data.author_name,
    siteName: data.provider_name || "YouTube",
    image: data.thumbnail_url,
  };
}

function toXOgp(data: XOEmbed): OgpPreview | null {
  const tweetText = data.html ? decodeHtml(data.html).replace(/\s+/g, " ") : "";
  const title = tweetText || (data.author_name ? `${data.author_name} on X` : "X post");
  return {
    title,
    description: data.author_name,
    siteName: data.provider_name || "X",
  };
}

async function fetchYouTubeOgp(url: string) {
  if (!isYouTubeUrl(url)) return null;

  const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url: oembedUrl, responseType: "json" });
    if (response.status < 200 || response.status >= 400) return null;
    const data = typeof response.data === "string"
      ? JSON.parse(response.data) as YouTubeOEmbed
      : response.data as YouTubeOEmbed;
    return toYouTubeOgp(data);
  }

  const response = await fetch(oembedUrl);
  if (!response.ok) return null;
  return toYouTubeOgp(await response.json() as YouTubeOEmbed);
}

async function fetchXOEmbed(url: string) {
  if (!isXUrl(url)) return null;

  const endpoint = `https://publish.x.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`;
  const fallbackEndpoint = `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`;
  const fetchJson = async (requestUrl: string) => {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({ url: requestUrl, responseType: "json" });
      if (response.status < 200 || response.status >= 400) return null;
      return typeof response.data === "string"
        ? JSON.parse(response.data) as XOEmbed
        : response.data as XOEmbed;
    }

    const response = await fetch(requestUrl);
    if (!response.ok) return null;
    return await response.json() as XOEmbed;
  };

  return await fetchJson(endpoint) ?? await fetchJson(fallbackEndpoint);
}

async function fetchXOgp(url: string) {
  const data = await fetchXOEmbed(url);
  if (!data) return null;

  const externalUrl = data.html
    ? extractLinksFromHtml(data.html).find(isExternalTweetLink)
    : undefined;
  const externalOgp = externalUrl
    ? await fetchOgpViaNativeHttp(externalUrl) ?? await fetchOgpViaApi(externalUrl)
    : null;

  return externalOgp ?? toXOgp(data);
}

async function fetchOgpViaNativeHttp(url: string) {
  if (!Capacitor.isNativePlatform()) return null;

  const response = await CapacitorHttp.get({
    url,
    responseType: "text",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 BocchiSNS/1.0",
    },
  });
  if (response.status < 200 || response.status >= 400 || typeof response.data !== "string") {
    return null;
  }

  return parseOgpHtml(response.data.slice(0, OGP_HTML_MAX_LENGTH), response.url || url);
}

async function fetchOgpViaApi(url: string) {
  if (!OGP_API_BASE_URL) return null;

  const response = await fetch(`${OGP_API_BASE_URL}/api/ogp?url=${encodeURIComponent(url)}`);
  if (!response.ok) return null;

  const data = await response.json() as OgpPreview;
  return data.title || data.image ? data : null;
}

export async function fetchOgpPreview(url: string): Promise<OgpPreview | null> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  try {
    new URL(trimmedUrl);
  } catch {
    return null;
  }

  try {
    return await fetchYouTubeOgp(trimmedUrl)
      ?? await fetchXOgp(trimmedUrl)
      ?? await fetchOgpViaNativeHttp(trimmedUrl)
      ?? await fetchOgpViaApi(trimmedUrl);
  } catch {
    return null;
  }
}
