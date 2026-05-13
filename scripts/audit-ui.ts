import process from "node:process";

import { runCalendarUiAudit } from "@/lib/calendar-ui-audit";
import { runHomeUiAudit } from "@/lib/home-ui-audit";

const audits = [
  ["HOME", runHomeUiAudit(process.cwd())] as const,
  ["CALENDAR", runCalendarUiAudit(process.cwd())] as const,
];

const lines: string[] = [];
let failCount = 0;

for (const [name, result] of audits) {
  failCount += result.failCount;
  lines.push(`${name} UI audit completed.`);
  lines.push(`Findings: ${result.findingCount}`);
  lines.push(`Pass: ${result.passCount}`);
  lines.push(`Warn: ${result.warnCount}`);
  lines.push(`Fail: ${result.failCount}`);
  lines.push("");

  for (const finding of result.findings) {
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`File: ${finding.file}`);
    lines.push(`Summary: ${finding.summary}`);
    if (finding.triggeredBy) lines.push(`Triggered by: ${finding.triggeredBy}`);
    if (finding.expectedFailure) lines.push(`Expected failure: ${finding.expectedFailure}`);
    if (finding.hint) lines.push(`Manual test hint: ${finding.hint}`);
    lines.push("");
  }
}

process.stdout.write(`${lines.join("\n")}\n`);
if (failCount > 0) process.exitCode = 1;
