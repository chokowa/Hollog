import process from "node:process";

import { runCalendarUiAudit } from "@/lib/calendar-ui-audit";

function main() {
  const result = runCalendarUiAudit(process.cwd());
  const lines = [
    "CALENDAR UI audit completed.",
    `Findings: ${result.findingCount}`,
    `Pass: ${result.passCount}`,
    `Warn: ${result.warnCount}`,
    `Fail: ${result.failCount}`,
    "",
  ];

  for (const finding of result.findings) {
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`File: ${finding.file}`);
    lines.push(`Summary: ${finding.summary}`);
    if (finding.triggeredBy) lines.push(`Triggered by: ${finding.triggeredBy}`);
    if (finding.expectedFailure) lines.push(`Expected failure: ${finding.expectedFailure}`);
    if (finding.hint) lines.push(`Manual test hint: ${finding.hint}`);
    lines.push("");
  }

  process.stdout.write(`${lines.join("\n")}\n`);
  if (result.failCount > 0) process.exitCode = 1;
}

main();
