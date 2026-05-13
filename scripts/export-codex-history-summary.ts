import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

type SessionMeta = {
  id: string;
  cwd: string;
  timestamp?: string;
};

type Turn = {
  timestamp: string;
  userMessage: string;
  assistantUpdates: string[];
  finalAnswer: string | null;
};

type ThreadRecord = {
  id: string;
  originalTitle: string;
  title: string;
  category: string;
  startedAt: string;
  endedAt: string;
  sessionPath: string;
  turns: Turn[];
  summary: string;
  tags: string[];
};

type SessionLine =
  | {
      timestamp?: string;
      type?: string;
      payload?: Record<string, unknown>;
    }
  | undefined;

const DEFAULT_CODEX_HOME = resolve(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".codex");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = normalizePath(resolve(args.project ?? process.cwd()));
  const codexHome = resolve(args.codexHome ?? DEFAULT_CODEX_HOME);
  const sessionsRoot = join(codexHome, "sessions");

  if (!existsSync(sessionsRoot)) {
    throw new Error(`Codex sessions folder was not found: ${sessionsRoot}`);
  }

  const sessionFiles = collectSessionFiles(sessionsRoot);
  const threads: ThreadRecord[] = [];

  for (const sessionPath of sessionFiles) {
    const thread = await parseSessionFile(sessionPath, projectRoot);
    if (thread) {
      threads.push(enrichThread(thread));
    }
  }

  threads.sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  const markdown = renderHistoryMarkdown({
    projectRoot,
    codexHome,
    generatedAt: new Date().toISOString(),
    threads,
  });

  const outputPath = resolve(
    args.output ??
      join(process.cwd(), "output", `codex-history-summary-${safeTimestamp(new Date().toISOString())}.md`),
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");

  process.stdout.write(
    [
      `Exported ${threads.length} summarized thread(s).`,
      `Project: ${projectRoot}`,
      `Output: ${outputPath}`,
    ].join("\n") + "\n",
  );
}

function parseArgs(argv: string[]) {
  const result: {
    project?: string;
    codexHome?: string;
    output?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--project" && next) {
      result.project = next;
      index += 1;
      continue;
    }

    if (arg === "--codex-home" && next) {
      result.codexHome = next;
      index += 1;
      continue;
    }

    if (arg === "--output" && next) {
      result.output = next;
      index += 1;
    }
  }

  return result;
}

function collectSessionFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl") && entry.name.startsWith("rollout-")) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

async function parseSessionFile(sessionPath: string, projectRoot: string): Promise<ThreadRecord | null> {
  const stream = createReadStream(sessionPath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  let meta: SessionMeta | null = null;
  let currentTurn: Turn | null = null;
  const turns: Turn[] = [];
  let originalTitle = "";
  let lastTimestamp = "";

  for await (const line of reader) {
    const parsed = parseJsonLine(line);
    if (!parsed) {
      continue;
    }

    if (parsed.timestamp) {
      lastTimestamp = parsed.timestamp;
    }

    if (parsed.type === "session_meta") {
      const payload = parsed.payload as SessionMeta | undefined;
      if (!payload?.cwd || normalizePath(payload.cwd) !== projectRoot) {
        reader.close();
        stream.close();
        return null;
      }

      meta = payload;
      continue;
    }

    if (!meta) {
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload?.type === "thread_name_updated") {
      const threadName = asString(parsed.payload.thread_name);
      if (threadName) {
        originalTitle = threadName;
      }
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload?.type === "user_message") {
      const message = cleanText(asString(parsed.payload.message));
      if (!message) {
        continue;
      }

      currentTurn = {
        timestamp: parsed.timestamp ?? meta.timestamp ?? "",
        userMessage: message,
        assistantUpdates: [],
        finalAnswer: null,
      };
      turns.push(currentTurn);
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload?.type === "agent_message") {
      const message = cleanText(asString(parsed.payload.message));
      if (!message || !currentTurn) {
        continue;
      }

      const phase = asString(parsed.payload.phase);
      if (phase === "final_answer") {
        currentTurn.finalAnswer = message;
      } else {
        currentTurn.assistantUpdates.push(message);
      }
    }
  }

  if (!meta || turns.length === 0) {
    return null;
  }

  return {
    id: meta.id,
    originalTitle: originalTitle || firstLine(turns[0]?.userMessage) || meta.id,
    title: "",
    category: "",
    startedAt: meta.timestamp ?? turns[0]?.timestamp ?? "",
    endedAt: lastTimestamp || turns.at(-1)?.timestamp || meta.timestamp || "",
    sessionPath,
    turns,
    summary: "",
    tags: [],
  };
}

function enrichThread(thread: ThreadRecord): ThreadRecord {
  const combined = `${thread.originalTitle}\n${thread.turns.map((turn) => turn.userMessage).join("\n")}`.toLowerCase();
  const { category, tags } = classifyThread(combined);
  const title = retitleThread(combined, thread.originalTitle, category);
  const summary = summarizeThread(thread, category, tags);

  return {
    ...thread,
    title,
    category,
    summary,
    tags,
  };
}

function classifyThread(combined: string) {
  const rules = [
    { category: "Foundation", tags: ["next.js", "figma", "mvp", "local", "indexeddb", "supabase"] },
    { category: "Timeline UI", tags: ["timeline", "home画面", "カード", "レイアウト", "spacing", "density"] },
    { category: "Navigation", tags: ["戻る", "detail", "post detail", "タブ", "calendar"] },
    { category: "Android Native", tags: ["android", "capacitor", "実機", "share sheet", "ネイティブ", "clipdata"] },
    { category: "Share & Preview", tags: ["共有", "preview", "ogp", "instagram", "youtube", "amazon", "x.com"] },
    { category: "Media Handling", tags: ["画像", "camera", "5mb", "compression", "thumbnail", "media"] },
    { category: "Tags & Organization", tags: ["tag", "タグ", "calendar", "group", "日付", "catalog"] },
    { category: "Backup & Data Safety", tags: ["json", "backup", "import", "export", "復元"] },
    { category: "Testing & QA", tags: ["test", "lint", "build", "simulate", "audit", "review"] },
    { category: "Naming & Direction", tags: ["name", "名前", "roadmap", "次に", "方針", "iphone"] },
    { category: "Bug Fix", tags: ["bug", "fix", "エラー", "問題", "反応しない", "点滅"] },
  ];

  let best = { category: "General", score: 0, tags: [] as string[] };

  for (const rule of rules) {
    const matched = rule.tags.filter((tag) => combined.includes(tag.toLowerCase()));
    if (matched.length > best.score) {
      best = { category: rule.category, score: matched.length, tags: matched };
    }
  }

  return { category: best.category, tags: best.tags };
}

function retitleThread(combined: string, originalTitle: string, category: string) {
  const patterns: Array<{ match: string[]; title: string }> = [
    { match: ["figma", "next.js"], title: "Figmaデザインから最初のアプリ骨格を起こす" },
    { match: ["mvp", "indexeddb"], title: "Supabase案を捨ててローカル完結MVPへ切り替える" },
    { match: ["timeline", "scroll"], title: "タイムラインのスクロールと見え方を整える" },
    { match: ["左スワイプ", "削除"], title: "カードのスワイプ削除を導入する" },
    { match: ["roadmap"], title: "ロードマップを更新して次の進み方を固める" },
    { match: ["サムネイル", "thumbnail"], title: "タイムライン画像を軽量サムネイル化する" },
    { match: ["タグ管理", "tag"], title: "タグ管理の設計と運用を詰める" },
    { match: ["android", "share"], title: "Android共有導線をつなぎ込む" },
    { match: ["clipdata", "preview"], title: "共有プレビューの実データ挙動を洗う" },
    { match: ["instagram", "preview"], title: "Instagram共有プレビューの精度を上げる" },
    { match: ["home画面", "レイアウト"], title: "HOMEタイムラインの密度を相談しながら磨く" },
    { match: ["編集", "detail"], title: "投稿詳細の編集不具合を潰す" },
    { match: ["calendar", "日付"], title: "カレンダー復帰時の日付ズレを直す" },
    { match: ["iphone"], title: "iPhone版に必要な環境を整理する" },
    { match: ["名前", "アプリ"], title: "アプリ名の変更影響を洗い出してHollogへ寄せる" },
    { match: ["x.com/home"], title: "Xの特殊URLが誤解釈される問題を直す" },
    { match: ["json", "import"], title: "JSONバックアップ導線の実装を点検する" },
    { match: ["camera", "5mb"], title: "カメラ画像の容量制限を圧縮で回避する" },
    { match: ["タグ", "スライド"], title: "タグ付きカードのタッチ範囲を修正する" },
    { match: ["点滅", "起動"], title: "起動時のスプラッシュと再描画の点滅を調べる" },
    { match: ["simulate", "手動"], title: "手動確認前の総合シミュレーションを作る" },
    { match: ["チャット履歴", "note"], title: "開発の流れを会話から掘り起こす" },
  ];

  for (const pattern of patterns) {
    if (pattern.match.every((value) => combined.includes(value.toLowerCase()))) {
      return pattern.title;
    }
  }

  const first = firstLine(originalTitle);
  if (first && first.length <= 42) {
    return first;
  }

  return `${category}に関する作業`;
}

function summarizeThread(thread: ThreadRecord, category: string, tags: string[]) {
  const firstAsk = firstSentence(thread.turns[0]?.userMessage ?? "");
  const lastOutcome = thread.turns
    .map((turn) => turn.finalAnswer || turn.assistantUpdates.at(-1) || "")
    .filter(Boolean)
    .at(-1);
  const outcome = firstSentence(lastOutcome ?? "");

  const parts = [`${category}の流れ。`];

  if (firstAsk) {
    parts.push(`きっかけは「${trimForQuote(firstAsk, 90)}」。`);
  }

  if (outcome) {
    parts.push(`着地は「${trimForQuote(outcome, 110)}」。`);
  }

  if (tags.length > 0) {
    parts.push(`軸になった話題は ${tags.slice(0, 4).map((tag) => `\`${tag}\``).join("、")}。`);
  }

  return parts.join(" ");
}

function renderHistoryMarkdown(input: {
  projectRoot: string;
  codexHome: string;
  generatedAt: string;
  threads: ThreadRecord[];
}) {
  const lines: string[] = [];
  const threadsByDay = groupByDay(input.threads);
  const overlaps = buildOverlapWindows(input.threads);

  lines.push("# Codex Development History Summary");
  lines.push("");
  lines.push(`- Project root: \`${input.projectRoot}\``);
  lines.push(`- Codex home: \`${input.codexHome}\``);
  lines.push(`- Generated at: \`${input.generatedAt}\``);
  lines.push(`- Threads summarized: \`${input.threads.length}\``);
  lines.push("");
  lines.push("## What This File Is");
  lines.push("");
  lines.push("- 既存の逐次ログとは別に、読んで流れが分かるように圧縮した開発史です。");
  lines.push("- `T01` 形式の番号を振り直し、内容ベースでタイトルも付け直しています。");
  lines.push("- 元のチャットタイトルは各項目に残し、カテゴリも併記しています。");
  lines.push("");
  lines.push("## Parallel View");
  lines.push("");
  lines.push("```mermaid");
  lines.push("gantt");
  lines.push("    title Codex Threads In Parallel");
  lines.push("    dateFormat YYYY-MM-DDTHH:mm:ss");
  lines.push("    axisFormat %m/%d %H:%M");

  for (const [day, dayThreads] of threadsByDay) {
    lines.push(`    section ${day}`);
    dayThreads.forEach((thread, index) => {
      const threadNumber = input.threads.indexOf(thread) + 1;
      const label = `T${String(threadNumber).padStart(2, "0")} ${shortTitle(thread.title, 24)}`;
      lines.push(`    ${escapeMermaid(label)} :t${threadNumber}-${index}, ${thread.startedAt}, ${thread.endedAt}`);
    });
  }

  lines.push("```");
  lines.push("");
  lines.push("## Overlap Windows");
  lines.push("");

  if (overlaps.length === 0) {
    lines.push("- 目立つ同時並行の塊は見つかりませんでした。");
  } else {
    overlaps.forEach((window, index) => {
      lines.push(
        `${index + 1}. ${window.day} ${window.label} - ${window.threadRefs.join(" / ")}`
      );
    });
  }

  lines.push("");
  lines.push("## Retitled Thread Index");
  lines.push("");

  input.threads.forEach((thread, index) => {
    lines.push(
      `- T${String(index + 1).padStart(2, "0")} [${escapeMarkdown(thread.title)}](#t${String(index + 1).padStart(2, "0")}) | ${thread.category} | ${formatTimestamp(thread.startedAt)}`
    );
  });

  for (const [day, dayThreads] of threadsByDay) {
    lines.push("");
    lines.push(`## ${day}`);
    lines.push("");

    const dayCategories = summarizeDayCategories(dayThreads);
    lines.push(`- Main themes: ${dayCategories.join(" / ")}`);
    lines.push("");

    dayThreads.forEach((thread) => {
      const threadNumber = input.threads.indexOf(thread) + 1;
      const ref = `T${String(threadNumber).padStart(2, "0")}`;

      lines.push(`### ${ref} ${escapeMarkdown(thread.title)}`);
      lines.push("");
      lines.push(`<a id="t${String(threadNumber).padStart(2, "0")}"></a>`);
      lines.push("");
      lines.push(`- Category: ${thread.category}`);
      lines.push(`- Time: ${formatTimestamp(thread.startedAt)} - ${formatTimestamp(thread.endedAt)}`);
      lines.push(`- Original title: ${escapeMarkdown(thread.originalTitle)}`);
      lines.push(`- Turns: ${thread.turns.length}`);
      lines.push(`- Summary: ${escapeMarkdown(thread.summary)}`);
      lines.push("");
      lines.push("- Key moments:");

      buildKeyMoments(thread).forEach((moment) => {
        lines.push(`  - ${escapeMarkdown(moment)}`);
      });

      lines.push("");
    });
  }

  return lines.join("\n");
}

function buildKeyMoments(thread: ThreadRecord) {
  const moments: string[] = [];
  const firstAsk = firstSentence(thread.turns[0]?.userMessage ?? "");
  if (firstAsk) {
    moments.push(`依頼の出発点: ${trimForQuote(firstAsk, 110)}`);
  }

  const notableOutcomes = thread.turns
    .map((turn) => turn.finalAnswer || turn.assistantUpdates.at(-1) || "")
    .filter(Boolean)
    .map((value) => firstSentence(value))
    .filter(Boolean);

  for (const outcome of notableOutcomes.slice(-2)) {
    moments.push(`着地点: ${trimForQuote(outcome, 120)}`);
  }

  if (moments.length === 0) {
    moments.push("要約に使える明確な節目が少ない短いスレッド。");
  }

  return moments;
}

function buildOverlapWindows(threads: ThreadRecord[]) {
  const windows: Array<{ day: string; label: string; threadRefs: string[] }> = [];
  const byDay = groupByDay(threads);

  for (const [day, dayThreads] of byDay) {
    const sorted = [...dayThreads].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    let current: ThreadRecord[] = [];
    let currentEnd = "";

    for (const thread of sorted) {
      if (current.length === 0) {
        current = [thread];
        currentEnd = thread.endedAt;
        continue;
      }

      if (thread.startedAt <= currentEnd) {
        current.push(thread);
        if (thread.endedAt > currentEnd) {
          currentEnd = thread.endedAt;
        }
      } else {
        if (current.length > 1) {
          windows.push({
            day,
            label: `${formatClock(current[0].startedAt)} - ${formatClock(currentEnd)}`,
            threadRefs: current.map((item) => {
              const globalIndex = threads.indexOf(item) + 1;
              return `T${String(globalIndex).padStart(2, "0")} ${shortTitle(item.title, 22)}`;
            }),
          });
        }

        current = [thread];
        currentEnd = thread.endedAt;
      }
    }

    if (current.length > 1) {
      windows.push({
        day,
        label: `${formatClock(current[0].startedAt)} - ${formatClock(currentEnd)}`,
        threadRefs: current.map((item) => {
          const globalIndex = threads.indexOf(item) + 1;
          return `T${String(globalIndex).padStart(2, "0")} ${shortTitle(item.title, 22)}`;
        }),
      });
    }
  }

  return windows;
}

function summarizeDayCategories(threads: ThreadRecord[]) {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    counts.set(thread.category, (counts.get(thread.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([category]) => category);
}

function groupByDay(threads: ThreadRecord[]) {
  const map = new Map<string, ThreadRecord[]>();

  for (const thread of threads) {
    const day = formatDay(thread.startedAt);
    const existing = map.get(day);
    if (existing) {
      existing.push(thread);
    } else {
      map.set(day, [thread]);
    }
  }

  return map;
}

function parseJsonLine(line: string): SessionLine {
  try {
    return JSON.parse(line) as SessionLine;
  } catch {
    return undefined;
  }
}

function normalizePath(value: string) {
  return resolve(value).toLowerCase();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cleanText(value: string) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function firstLine(value: string) {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function firstSentence(value: string) {
  return cleanText(value).replace(/\s+/g, " ").split(/(?<=[。.!?])\s/, 1)[0] ?? "";
}

function trimForQuote(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit).trimEnd()}...`;
}

function shortTitle(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 3)}...`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "unknown";
  }

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown-day";
  }

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "unknown";
  }

  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeTimestamp(value: string) {
  return value.replace(/[:.]/g, "-");
}

function escapeMarkdown(value: string) {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeMermaid(value: string) {
  return value.replace(/:/g, "-").replace(/#/g, "");
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`Codex history summary export failed.\n${message}\n`);
  process.exitCode = 1;
});
