import { Command } from "commander";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { isJsonMode, jsonOut, jsonError, success } from "../utils/format.js";
import { EXIT } from "../utils/errors.js";

interface GithubRelease {
  tag_name: string;
  html_url: string;
}

async function fetchLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(
      "https://registry.npmjs.org/@blackasteroid/icf/latest",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    if (!data.version) return null;
    return { tag_name: data.version, html_url: `https://www.npmjs.com/package/@blackasteroid/icf` };
  } catch {
    return null;
  }
}

function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }
  return 0;
}

function readCurrentVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch { /* ignore */ }
  try {
    const pkgPath = join(__dirname, "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch { /* ignore */ }
  return "unknown";
}

export function upgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("Update icf to the latest version from npm")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf upgrade")}
  ${chalk.cyan("icf upgrade --json")}
`)
    .action(async (opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const current = readCurrentVersion();

      if (!json) {
        console.log(`Current version: ${chalk.cyan(`v${current}`)}`);
        process.stdout.write("Checking for latest release… ");
      }

      const release = await fetchLatestRelease();

      if (!release) {
        if (!json) console.log(chalk.red("failed"));
        const msg = "Could not reach npm registry. Check your internet connection and try again.";
        if (json) jsonError(msg, EXIT.NETWORK);
        console.error(chalk.red(`\n❌ ${msg}`));
        process.exit(EXIT.NETWORK);
      }

      const latest = release.tag_name.replace(/^v/, "");

      if (!json) console.log(chalk.green("done"));

      if (compareSemver(current, latest) >= 0) {
        if (json) jsonOut({ current, latest, upgraded: false, reason: "Already up to date" });
        console.log(`Latest version: ${chalk.cyan(`v${latest}`)}\n${chalk.green("✅ Already up to date — nothing to do.")}`);
        return;
      }

      if (!json) {
        console.log(`Latest version:  ${chalk.cyan(`v${latest}`)}`);
        console.log(`\n${chalk.bold("Upgrading icf")} ${chalk.dim(`v${current}`)} → ${chalk.green(`v${latest}`)}…`);
      }

      try {
        // Pin exact version (not @latest) to reduce supply-chain risk
        execSync(`npm install -g @blackasteroid/icf@${latest}`, {
          stdio: json ? "pipe" : "inherit",
        });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        const isPermission = /permission|eacces|eperm/i.test(raw);
        if (json) {
          jsonError(
            isPermission ? "Permission denied. Try running with elevated permissions (sudo)." : `Upgrade failed: ${raw}`,
            isPermission ? EXIT.AUTH : EXIT.GENERAL
          );
        }
        if (isPermission) {
          console.error(chalk.red("\n❌ Permission denied.") + " Try:\n" + chalk.cyan("   sudo icf upgrade"));
        } else {
          console.error(chalk.red(`\n❌ Upgrade failed: ${raw}`));
        }
        process.exit(isPermission ? EXIT.AUTH : EXIT.GENERAL);
      }

      if (json) jsonOut({ current, latest, upgraded: true });
      success(`icf upgraded to v${latest} successfully!`);
    });
}
