import { Command } from "commander";
import chalk from "chalk";
import enquirer from "enquirer";
import { getAuth, saveAuth, clearAuth, getConfigPath } from "../config.js";
import { createOctokit } from "../github.js";
import { success, errorLine, warnLine, isJsonMode, jsonOut, jsonError } from "../utils/format.js";
import { handleError, EXIT } from "../utils/errors.js";

const { prompt } = enquirer as any;

export function authCommand(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authenticate with GitHub using a personal access token")
    .addHelpText("after", `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("auth login")}    Store a GitHub token
  ${chalk.cyan("auth status")}   Show who you're logged in as
  ${chalk.cyan("auth logout")}   Remove stored credentials

${chalk.dim("Run")} ${chalk.cyan("icf auth <subcommand> --help")} ${chalk.dim("for examples.")}
`);

  // LOGIN
  auth
    .command("login")
    .description("Store a GitHub token and verify it has the right scopes")
    .option("--token <token|$VAR>", "GitHub PAT or env var reference like '$GITHUB_TOKEN'")
    .option("--json", "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Required token scopes: repo, workflow, write:packages")}
${chalk.dim("Create a pre-configured token at:")}
  ${chalk.cyan("https://github.com/settings/tokens/new?scopes=repo,workflow,write:packages&description=icf-cli")}

${chalk.dim("Examples:")}
  ${chalk.cyan("icf auth login")}
  ${chalk.cyan("icf auth login --token '$GITHUB_TOKEN'")}
`)
    .action(async (opts: { token?: string; json?: boolean }) => {
      const json = isJsonMode(opts);

      let rawToken: string;

      if (opts.token) {
        if (opts.token.startsWith("$")) {
          const varName = opts.token.slice(1);
          const resolved = process.env[varName];
          if (!resolved) {
            const msg = `Environment variable ${varName} is not set`;
            if (json) jsonError(msg, EXIT.VALIDATION);
            errorLine(msg); process.exit(EXIT.VALIDATION);
          }
          rawToken = resolved;
        } else {
          rawToken = opts.token;
        }
      } else {
        if (!json) {
          const tokenUrl = "https://github.com/settings/tokens/new?scopes=repo,workflow,write:packages&description=icf-cli";
          console.log(chalk.dim("Create a pre-configured token (scopes pre-selected):"));
          console.log(chalk.cyan(tokenUrl));
          console.log(chalk.dim("Required scopes: repo, workflow, write:packages\n"));
        }
        const { t } = await prompt({ type: "password", name: "t", message: "GitHub Personal Access Token:" }) as { t: string };
        rawToken = t;
      }

      if (!rawToken?.trim()) {
        const msg = "Token cannot be empty";
        if (json) jsonError(msg, EXIT.VALIDATION);
        errorLine(msg); process.exit(EXIT.VALIDATION);
      }

      try {
        const octokit = new (await import("@octokit/rest")).Octokit({ auth: rawToken });
        const { data: user } = await octokit.users.getAuthenticated();

        saveAuth({
          github_token: rawToken,
          github_user: user.login,
          authenticated_at: new Date().toISOString(),
        });

        if (json) jsonOut({ login: user.login, name: user.name });

        success(`Authenticated as ${chalk.cyan("@" + user.login)}`);
        console.log(chalk.dim(`Config saved to: ${getConfigPath()}`));
      } catch (err) {
        handleError(err, opts);
      }
    });

  // LOGOUT
  auth
    .command("logout")
    .description("Remove stored credentials")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const existing = getAuth();
      if (!existing) {
        if (json) jsonOut({ loggedOut: false, reason: "Not logged in" });
        warnLine("Not currently logged in.");
        return;
      }
      clearAuth();
      if (json) jsonOut({ loggedOut: true });
      success("Logged out. Run `icf auth login` to re-authenticate.");
    });

  // STATUS
  auth
    .command("status")
    .description("Show current authentication state")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const existing = getAuth();
      if (!existing) {
        if (json) jsonOut({ loggedIn: false });
        console.log(chalk.yellow("Not logged in. Run: icf auth login"));
        return;
      }
      const age = Math.floor((Date.now() - new Date(existing.authenticated_at).getTime()) / 3600000);
      if (json) {
        jsonOut({ loggedIn: true, login: existing.github_user, authenticated_at: existing.authenticated_at });
      }
      console.log(chalk.green("✅ Authenticated"));
      console.log(`   User:  ${chalk.cyan("@" + existing.github_user)}`);
      console.log(`   Since: ${new Date(existing.authenticated_at).toLocaleString()} (${age}h ago)`);
      console.log(`   Config: ${chalk.dim(getConfigPath())}`);
    });
}
