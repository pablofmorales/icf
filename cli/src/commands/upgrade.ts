import { Command } from "commander";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { isJsonMode, jsonOut, jsonError, success } from "../utils/format.js";
import { EXIT } from "../utils/errors.js";

/** Validate that a version string is a safe semver before passing to npm. */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?(?:\+[a-zA-Z0-9._-]+)?$/;

interface GithubRelease {
  tag_name: string;
  html_url: string;
}

async function fetchLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(
      "https://registry.npmjs.org/@pablofmorales/icf/latest",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    if (!data.version) return null;
    return { tag_name: data.version, html_url: `https://www.npmjs.com/package/@pablofmorales/icf` };
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

      // Security fix #46: validate version before using in npm install.
      // Reject anything that doesn't look like a semver to prevent shell injection.
      if (!SEMVER_RE.test(latest)) {
        const msg = `Received invalid version string from registry: "${latest}"`;
        if (json) jsonError(msg, EXIT.GENERAL);
        console.error(chalk.red(`\n❌ ${msg}`));
        process.exit(EXIT.GENERAL);
      }

      try {
        // Security fix #46: use spawnSync with an args array instead of execSync
        // with string interpolation — prevents shell injection regardless of version string.
        const result = spawnSync(
          "npm",
          ["install", "-g", `@pablofmorales/icf@${latest}`],
          { stdio: json ? "pipe" : "inherit", shell: false }
        );

        if (result.status !== 0) {
          const raw = result.stderr?.toString() ?? "";
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
            console.error(chalk.red(`\n❌ Upgrade failed.`));
          }
          process.exit(isPermission ? EXIT.AUTH : EXIT.GENERAL);
        }
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        if (json) jsonError(`Upgrade failed: ${raw}`, EXIT.GENERAL);
        console.error(chalk.red(`\n❌ Upgrade failed: ${raw}`));
        process.exit(EXIT.GENERAL);
      }

      if (json) jsonOut({ current, latest, upgraded: true });
      success(`icf upgraded to v${latest} successfully!`);
    });
}
