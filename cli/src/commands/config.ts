import { Command } from "commander";
import chalk from "chalk";
import { getAuth, getRepo, getConfigPath } from "../config.js";
import { createOctokit } from "../github.js";
import { success, errorLine, isJsonMode, jsonOut } from "../utils/format.js";
import { handleError } from "../utils/errors.js";

export function configCommand(program: Command): void {
  const cfg = program.command("config").description("Manage ICF configuration");

  cfg
    .command("validate")
    .description("Validate auth, repo access, and local configuration")
    .option("--repo <owner/repo>", "Repo to check")
    .option("--json",              "Output as JSON")
    .action(async (opts: { repo?: string; json?: boolean }) => {
      const json = isJsonMode(opts);
      const checks: Array<{ name: string; ok: boolean; msg: string }> = [];

      // 1. Auth
      const auth = getAuth();
      if (!auth) {
        checks.push({ name: "auth", ok: false, msg: "Not authenticated. Run: icf auth login" });
      } else {
        try {
          const octokit = createOctokit(auth);
          const { data: user } = await octokit.users.getAuthenticated();
          checks.push({ name: "auth", ok: true, msg: `Authenticated as @${user.login}` });
        } catch (e) {
          checks.push({ name: "auth", ok: false, msg: `Token invalid: ${(e as Error).message}` });
        }
      }

      // 2. Repo
      let owner: string | undefined, repo: string | undefined;
      if (opts.repo) { [owner, repo] = opts.repo.split("/"); }
      else { owner = getRepo()?.owner; repo = getRepo()?.repo; }

      if (!owner || !repo) {
        checks.push({ name: "repo", ok: false, msg: "No repo configured. Run: icf init <owner/repo>" });
      } else if (auth) {
        try {
          const octokit = createOctokit(auth);
          await octokit.repos.get({ owner, repo });
          checks.push({ name: "repo", ok: true, msg: `${owner}/${repo} accessible` });
        } catch (e) {
          checks.push({ name: "repo", ok: false, msg: `${owner}/${repo}: ${(e as Error).message}` });
        }
      } else {
        checks.push({ name: "repo", ok: false, msg: "Cannot check — auth failed" });
      }

      const allOk = checks.every((c) => c.ok);
      if (json) jsonOut({ valid: allOk, checks }, allOk ? 0 : 1);

      checks.forEach((c) => {
        const icon = c.ok ? chalk.green("✅") : chalk.red("✖");
        console.log(`${icon} ${chalk.bold(c.name.padEnd(10))} ${c.msg}`);
      });

      if (!allOk) { console.log(chalk.yellow("\n⚠  Some checks failed.")); process.exit(1); }
      else success("All checks passed.");
    });

  cfg
    .command("show")
    .description("Show current ICF configuration")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const auth = getAuth();
      const repo = getRepo();
      const path = getConfigPath();
      if (json) jsonOut({ auth: auth ? { user: auth.github_user } : null, repo: repo ?? null, configPath: path });
      console.log(`${chalk.bold("Auth:  ")} ${auth ? chalk.green("@" + auth.github_user) : chalk.red("not logged in")}`);
      console.log(`${chalk.bold("Repo:  ")} ${repo ? chalk.cyan(`${repo.owner}/${repo.repo}`) : chalk.yellow("not configured")}`);
      console.log(`${chalk.bold("Config:")} ${chalk.dim(path)}`);
    });
}
