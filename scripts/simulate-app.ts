import { runAppSimulation } from "@/lib/app-simulation";

async function main() {
  const result = await runAppSimulation();
  process.stdout.write(
    [
      "App simulation passed.",
      `Scenarios: ${result.scenarioCount}`,
      `Posts after simulation: ${result.postCount}`,
      ...result.scenarioNames.map((name, index) => `${index + 1}. ${name}`),
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`App simulation failed.\n${message}\n`);
  process.exitCode = 1;
});
