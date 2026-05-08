import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // 対象URLのHTMLを取得（タイムアウト5秒）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "bot",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await response.text();

    // OGPメタタグからタイトル・説明文・画像を抽出
    const getMetaContent = (property: string): string | null => {
      // og:xxx 形式
      const ogMatch = html.match(
        new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i")
      );
      if (ogMatch) return ogMatch[1];

      // content が先に来るパターン
      const reverseMatch = html.match(
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, "i")
      );
      if (reverseMatch) return reverseMatch[1];

      return null;
    };

    // <title>タグからのフォールバック
    const getTitleTag = (): string | null => {
      const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      return match ? match[1].trim() : null;
    };

    const rawTitle = getMetaContent("og:title") || getTitleTag() || null;
    const description = getMetaContent("og:description") || null;
    const image = getMetaContent("og:image") || null;
    const siteName = getMetaContent("og:site_name") || null;

    // Bot対策ページのダミータイトルを除外するフィルター
    const blockedTitles = [
      "just a moment",
      "attention required",
      "please wait",
      "access denied",
      "security check",
      "verify you are human",
      "one moment, please",
    ];
    const title = rawTitle && blockedTitles.some(b => rawTitle.toLowerCase().includes(b))
      ? null
      : rawTitle;

    // フィルタリング後にすべて空ならnullレスポンス
    if (!title && !image) {
      return NextResponse.json({ title: null, description: null, image: null, siteName: null });
    }

    return NextResponse.json({ title, description, image, siteName });
  } catch (err) {
    console.error("OGP fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch OGP data" },
      { status: 500 }
    );
  }
}
