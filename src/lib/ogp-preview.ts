import type { OgpPreview } from "@/types/post";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const OGP_API_BASE_URL = process.env.NEXT_PUBLIC_OGP_API_BASE_URL?.replace(/\/$/, "");
const OGP_HTML_MAX_LENGTH = 512_000;
const INSTAGRAM_PREVIEW_IMAGE = "/instagram-preview.svg";
const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6",
  "User-Agent": "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
} as const;

const CRAWLER_HEADERS = [
  {
    "User-Agent": "Twitterbot/1.0",
  },
  {
    "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  },
].map((headers) => ({ ...BROWSER_HEADERS, ...headers })) as readonly (typeof BROWSER_HEADERS)[];

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

function getElementText(document: Document, selectors: string[]) {
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
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

function isAmazonUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "amazon.co.jp"
      || hostname.endsWith(".amazon.co.jp")
      || hostname === "amzn.to"
      || hostname === "amzn.asia";
  } catch {
    return false;
  }
}

function isInstagramUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "instagram.com"
      || hostname.endsWith(".instagram.com")
      || hostname === "instagr.am";
  } catch {
    return false;
  }
}

function getSiteNameFallback(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com") || hostname === "instagr.am") {
      return "Instagram";
    }
  } catch {}
  return "";
}

function getInstagramFallbackPreview(url: string): OgpPreview | null {
  if (!isInstagramUrl(url)) return null;

  let title = "Instagram";
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.startsWith("/reel/") || path.startsWith("/reels/")) {
      title = "Instagramリール";
    } else if (path.startsWith("/p/")) {
      title = "Instagramの投稿";
    } else if (path.startsWith("/stories/")) {
      title = "Instagramストーリーズ";
    } else if (path.startsWith("/share/")) {
      title = "Instagramの共有リンク";
    } else if (path !== "/") {
      title = "Instagramプロフィール";
    }
  } catch {}

  return {
    title,
    description: "Instagramで共有されたリンク",
    siteName: "Instagram",
    image: INSTAGRAM_PREVIEW_IMAGE,
  };
}

function extractAmazonDynamicImages(value: string, pageUrl: string) {
  if (!value) return [];

  try {
    const images = JSON.parse(value) as Record<string, [number, number] | undefined>;
    return Object.entries(images)
      .map(([url, size]) => ({
        url: resolveUrl(url, pageUrl),
        area: (size?.[0] ?? 0) * (size?.[1] ?? 0),
      }))
      .filter((image) => image.url)
      .sort((a, b) => b.area - a.area)
      .map((image) => image.url);
  } catch {
    return [];
  }
}

function extractAmazonAsin(value: string) {
  const patterns = [
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i,
    /(?:[?&]asin=)([A-Z0-9]{10})(?:[&#]|$)/i,
    /"asin"\s*:\s*"([A-Z0-9]{10})"/i,
    /data-asin=["']([A-Z0-9]{10})["']/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return "";
}

function getAmazonAsinImageUrl(asin: string) {
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

function parseAmazonHtml(html: string, pageUrl: string): OgpPreview | null {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const basePreview = parseOgpHtml(html, pageUrl);
  const title = basePreview?.title
    || getElementText(document, ["#productTitle", "#ebooksProductTitle", "#title"])
    || document.title.replace(/\s*\|\s*Amazon.*$/i, "").trim();
  const description = basePreview?.description || getMetaContent(document, ["description"]);
  const dynamicImages = Array.from(document.querySelectorAll<HTMLElement>("[data-a-dynamic-image]"))
    .flatMap((element) => extractAmazonDynamicImages(element.getAttribute("data-a-dynamic-image") ?? "", pageUrl));
  const directImage = [
    basePreview?.image,
    document.querySelector<HTMLImageElement>("#landingImage")?.getAttribute("data-old-hires"),
    document.querySelector<HTMLImageElement>("#landingImage")?.src,
    document.querySelector<HTMLImageElement>("#imgBlkFront")?.src,
    document.querySelector<HTMLImageElement>("#ebooksImgBlkFront")?.src,
    ...dynamicImages,
    getAmazonAsinImageUrl(extractAmazonAsin(`${pageUrl}\n${html}`)),
  ].find(Boolean);
  const image = directImage ? resolveUrl(directImage, pageUrl) : "";

  return title || image
    ? { title, description, siteName: basePreview?.siteName || "Amazon", image }
    : null;
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
  const siteName = getMetaContent(document, ["og:site_name", "application-name", "application-title"])
    || getSiteNameFallback(pageUrl);
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

  const isAmazon = isAmazonUrl(url);
  const isInstagram = isInstagramUrl(url);
  const headerCandidates = isAmazon || isInstagram ? CRAWLER_HEADERS : [BROWSER_HEADERS];

  for (const headers of headerCandidates) {
    const response = await CapacitorHttp.get({
      url,
      responseType: "text",
      headers,
    });
    if (response.status < 200 || response.status >= 400 || typeof response.data !== "string") {
      continue;
    }

    const pageUrl = response.url || url;
    const html = response.data.slice(0, OGP_HTML_MAX_LENGTH);
    const preview = isAmazonUrl(pageUrl) || isAmazon
      ? parseAmazonHtml(html, pageUrl)
      : parseOgpHtml(html, pageUrl);
    const isInstagramPage = isInstagramUrl(pageUrl) || isInstagram;
    if (preview?.image || (!isAmazon && !isInstagramPage && preview?.title)) {
      return preview;
    }
    if (isInstagramPage && preview?.title && preview.title !== "Instagram") {
      return { ...getInstagramFallbackPreview(pageUrl), ...preview, image: preview.image || INSTAGRAM_PREVIEW_IMAGE };
    }
  }

  const asin = extractAmazonAsin(url);
  if (isAmazon && asin) {
    return {
      title: "Amazon",
      siteName: "Amazon",
      image: getAmazonAsinImageUrl(asin),
    };
  }

  const instagramFallback = getInstagramFallbackPreview(url);
  if (instagramFallback) return instagramFallback;

  return null;
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
