import type { OgpPreview } from "@/types/post";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const OGP_API_BASE_URL = process.env.NEXT_PUBLIC_OGP_API_BASE_URL?.replace(/\/$/, "");
const OGP_HTML_MAX_LENGTH = 512_000;

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
    return await fetchOgpViaNativeHttp(trimmedUrl) ?? await fetchOgpViaApi(trimmedUrl);
  } catch {
    return null;
  }
}
