import { Command } from "commander";
import chalk from "chalk";
import { getAuth, getRepoConfig, getConfigPath, readLocalConfig } from "../config.js";
import { createGitHubClient } from "../github.js";
import { success, error, warn, info, isJsonMode, jsonOut } from "../utils/output.js";
import { handleError } from "../utils/errors.js";

export function configCommand(program: Command): void {
  const cfg = program
    .command("config")
    .description("Manage ICF configuration")
    .addHelpText("after", `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("config validate")}   Validate auth, repo, and local icf.yml
  ${chalk.cyan("config show")}       Show current configuration
`);

  // VALIDATE
  cfg
    .command("validate")
    .description("Validate ICF setup: auth, repo access, and local config file")
    .option("--repo <org/repo>", "Repo to validate against")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf config validate")}
  ${chalk.cyan("icf config validate --repo BlackAsteroid/incidents")}
`)
    .action(async (opts: { repo?: string; json?: boolean }) => {
      const json = isJsonMode(opts);
      const checks: Array<{ name: string; ok: boolean; msg: string }> = [];

      // 1. Auth check
      const auth = getAuth();
      if (!auth) {
        checks.push({ name: "auth", ok: false, msg: "Not authenticated. Run: icf auth login" });
      } else {
        try {
          const client = createGitHubClient(auth);
          const user = await client.getAuthenticatedUser();
          checks.push({ name: "auth", ok: true, msg: `Authenticated as ${user.login}` });
        } catch (e) {
          checks.push({ name: "auth", ok: false, msg: `Token invalid: ${(e as Error).message}` });
        }
      }

      // 2. Repo check
      let repoOrg: string | undefined;
      let repoName: string | undefined;
      if (opts.repo) {
        [repoOrg, repoName] = opts.repo.split("/");
      } else {
        const saved = getRepoConfig();
        repoOrg = saved?.org;
        repoName = saved?.repo;
      }

      if (!repoOrg || !repoName) {
        checks.push({ name: "repo", ok: false, msg: "No repo configured. Run: icf init <org/repo>" });
      } else if (auth) {
        try {
          const client = createGitHubClient(auth);
          const exists = await client.repoExists(repoOrg, repoName);
          if (exists) {
            checks.push({ name: "repo", ok: true, msg: `${repoOrg}/${repoName} accessible` });
          } else {
            checks.push({ name: "repo", ok: false, msg: `${repoOrg}/${repoName} not found or no access` });
          }
        } catch (e) {
          checks.push({ name: "repo", ok: false, msg: `Repo check failed: ${(e as Error).message}` });
        }
      } else {
        checks.push({ name: "repo", ok: false, msg: "Cannot check repo — auth failed first" });
      }

      // 3. Local config
      const localCfg = readLocalConfig();
      if (localCfg) {
        checks.push({ name: "local_config", ok: true, msg: "config/icf.yml found and valid YAML" });
      } else {
        checks.push({ name: "local_config", ok: false, msg: "No config/icf.yml found in current directory" });
      }

      const allOk = checks.every((c) => c.ok);

      if (json) {
        jsonOut({ valid: allOk, checks }, allOk ? 0 : 1);
      }

      checks.forEach((c) => {
        const icon = c.ok ? chalk.green("✅") : chalk.red("❌");
        console.log(`${icon} ${chalk.bold(c.name.padEnd(14))} ${c.msg}`);
      });

      if (!allOk) {
        console.log(chalk.yellow("\n⚠️  Some checks failed. See above for details."));
        process.exit(1);
      }

      console.log(chalk.green("\n✅ All checks passed."));
    });

  // SHOW
  cfg
    .command("show")
    .description("Show current ICF configuration")
    .option("--json", "Output as JSON ({ ok, data })")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const auth = getAuth();
      const repo = getRepoConfig();
      const configPath = getConfigPath();

      if (json) {
        jsonOut({
          auth: auth ? { login: auth.login, name: auth.name ?? null } : null,
          repo: repo ?? null,
          configPath,
        });
      }

      console.log(`${chalk.bold("Auth:")}   ${auth ? chalk.green(`${auth.login}`) : chalk.red("not logged in")}`);
      console.log(`${chalk.bold("Repo:")}   ${repo ? chalk.cyan(`${repo.org}/${repo.repo}`) : chalk.yellow("not configured")}`);
      console.log(`${chalk.bold("Config:")} ${chalk.dim(configPath)}`);
    });
}
