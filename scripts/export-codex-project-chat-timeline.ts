import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

type SessionMeta = {
  id: string;
  cwd: string;
  timestamp?: string;
};

type ThreadInfo = {
  id: string;
  startedAt: string;
  title: string;
  sessionPath: string;
  userMessages: number;
  turns: Turn[];
};

type Turn = {
  timestamp: string;
  userMessage: string;
  assistantUpdates: string[];
  finalAnswer: string | null;
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
  const threads: ThreadInfo[] = [];

  for (const sessionPath of sessionFiles) {
    const thread = await parseSessionFile(sessionPath, projectRoot);
    if (thread) {
      threads.push(thread);
    }
  }

  threads.sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  const markdown = renderMarkdown({
    projectRoot,
    codexHome,
    generatedAt: new Date().toISOString(),
    threads,
  });

  const outputPath = resolve(
    args.output ??
      join(process.cwd(), "output", `codex-project-chat-timeline-${safeTimestamp(new Date().toISOString())}.md`),
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");

  process.stdout.write(
    [
      `Exported ${threads.length} thread(s).`,
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
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".jsonl") && basename(fullPath).startsWith("rollout-")) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

async function parseSessionFile(sessionPath: string, projectRoot: string): Promise<ThreadInfo | null> {
  const stream = createReadStream(sessionPath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  let meta: SessionMeta | null = null;
  let title = "";
  let currentTurn: Turn | null = null;
  const turns: Turn[] = [];
  let userMessages = 0;

  for await (const line of reader) {
    const parsed = parseJsonLine(line);
    if (!parsed) {
      continue;
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
        title = threadName;
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
      userMessages += 1;
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

  if (!meta) {
    return null;
  }

  return {
    id: meta.id,
    startedAt: meta.timestamp ?? turns[0]?.timestamp ?? "",
    title: title || firstLine(turns[0]?.userMessage) || meta.id,
    sessionPath,
    userMessages,
    turns,
  };
}

function parseJsonLine(line: string): SessionLine {
  try {
    return JSON.parse(line) as SessionLine;
  } catch {
    return undefined;
  }
}

function renderMarkdown(input: {
  projectRoot: string;
  codexHome: string;
  generatedAt: string;
  threads: ThreadInfo[];
}) {
  const lines: string[] = [];

  lines.push("# Codex Project Chat Timeline");
  lines.push("");
  lines.push(`- Project root: \`${input.projectRoot}\``);
  lines.push(`- Codex home: \`${input.codexHome}\``);
  lines.push(`- Generated at: \`${input.generatedAt}\``);
  lines.push(`- Threads found: \`${input.threads.length}\``);
  lines.push("");
  lines.push("## Index");
  lines.push("");

  if (input.threads.length === 0) {
    lines.push("No matching Codex session files were found for this project.");
    lines.push("");
    return lines.join("\n");
  }

  input.threads.forEach((thread, index) => {
    lines.push(
      `${index + 1}. [${escapeMarkdown(thread.title)}](#thread-${index + 1}) - ${formatTimestamp(thread.startedAt)} - ${thread.turns.length} turn(s)`,
    );
  });

  for (let index = 0; index < input.threads.length; index += 1) {
    const thread = input.threads[index];
    lines.push("");
    lines.push(`## Thread ${index + 1}`);
    lines.push("");
    lines.push(`<a id="thread-${index + 1}"></a>`);
    lines.push("");
    lines.push(`- Title: ${escapeMarkdown(thread.title)}`);
    lines.push(`- Started: ${formatTimestamp(thread.startedAt)}`);
    lines.push(`- Thread ID: \`${thread.id}\``);
    lines.push(`- Session file: \`${thread.sessionPath}\``);
    lines.push(`- Turns: \`${thread.turns.length}\``);
    lines.push("");

    thread.turns.forEach((turn, turnIndex) => {
      lines.push(`### ${index + 1}.${turnIndex + 1} ${formatTimestamp(turn.timestamp)}`);
      lines.push("");
      lines.push(`- User: ${toBulletSummary(turn.userMessage)}`);

      if (turn.finalAnswer) {
        lines.push(`- Outcome: ${toBulletSummary(turn.finalAnswer)}`);
      } else if (turn.assistantUpdates.length > 0) {
        lines.push(`- Progress: ${toBulletSummary(turn.assistantUpdates[turn.assistantUpdates.length - 1])}`);
      } else {
        lines.push("- Outcome: No assistant summary found in this turn.");
      }

      const notableUpdates = turn.assistantUpdates
        .map((value) => toBulletSummary(value))
        .filter(Boolean)
        .slice(0, 2);

      if (notableUpdates.length > 0) {
        lines.push(`- Notes: ${notableUpdates.join(" / ")}`);
      }

      lines.push("");
    });
  }

  return lines.join("\n");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanText(value: string): string {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function firstLine(value: string | undefined): string {
  return (value ?? "").split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function toBulletSummary(value: string, limit = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return escapeMarkdown(normalized);
  }

  return `${escapeMarkdown(normalized.slice(0, limit).trimEnd())}...`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizePath(value: string): string {
  return resolve(value).toLowerCase();
}

function formatTimestamp(value: string): string {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`Codex chat timeline export failed.\n${message}\n`);
  process.exitCode = 1;
});
