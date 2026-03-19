import { Command } from "commander";
import chalk from "chalk";
import enquirer from "enquirer";
import { getAuth, saveAuth, clearAuth, getConfigPath } from "../config.js";
import { createGitHubClient } from "../github.js";
import { success, error, warn, isJsonMode, jsonOut, jsonError } from "../utils/output.js";
import { handleError, EXIT_CODES } from "../utils/errors.js";

const { prompt } = enquirer as any;

export function authCommand(program: Command): void {
  const auth = program
    .command("auth")
    .description("Manage GitHub authentication")
    .addHelpText("after", `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("auth login")}    Authenticate with GitHub via personal access token
  ${chalk.cyan("auth logout")}   Remove saved credentials
  ${chalk.cyan("auth status")}   Show current authentication status
`);

  // LOGIN
  auth
    .command("login")
    .description("Authenticate with GitHub using a personal access token")
    .option("--token <token|$VAR>", "GitHub PAT (or env var name like '$GITHUB_TOKEN')")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf auth login")}                              Interactive prompt
  ${chalk.cyan("icf auth login --token '$GITHUB_TOKEN'")}    Use env var (recommended)

${chalk.dim("Required scopes: repo, read:org")}
Create a token at: https://github.com/settings/tokens/new
`)
    .action(async (opts: { token?: string; json?: boolean }) => {
      const json = isJsonMode(opts);

      let token: string;

      if (opts.token) {
        // Resolve env var reference
        if (opts.token.startsWith("$")) {
          const varName = opts.token.slice(1);
          const resolved = process.env[varName];
          if (!resolved) {
            const msg = `Environment variable ${varName} is not set`;
            if (json) jsonError(msg, EXIT_CODES.VALIDATION);
            error(msg);
            process.exit(EXIT_CODES.VALIDATION);
          }
          token = resolved;
        } else {
          token = opts.token;
        }
      } else {
        if (!json) {
          console.log(chalk.dim("Tip: create a token at https://github.com/settings/tokens/new"));
          console.log(chalk.dim("Required scopes: repo, read:org\n"));
        }
        const { inputToken } = await prompt({
          type: "password",
          name: "inputToken",
          message: "GitHub personal access token:",
        }) as { inputToken: string };
        token = inputToken;
      }

      if (!token?.trim()) {
        const msg = "Token cannot be empty";
        if (json) jsonError(msg, EXIT_CODES.VALIDATION);
        error(msg);
        process.exit(EXIT_CODES.VALIDATION);
      }

      // Validate the token against GitHub API
      try {
        const client = createGitHubClient({ token, login: "" });
        const user = await client.getAuthenticatedUser();
        saveAuth({ token, login: user.login, name: user.name ?? undefined });

        if (json) {
          jsonOut({ login: user.login, name: user.name });
        }

        success(`Logged in as ${chalk.cyan(user.login)}${user.name ? ` (${user.name})` : ""}`);
        console.log(chalk.dim(`Config saved to: ${getConfigPath()}`));
      } catch (err) {
        handleError(err, opts);
      }
    });

  // LOGOUT
  auth
    .command("logout")
    .description("Remove saved GitHub credentials")
    .option("--json", "Output as JSON ({ ok, data })")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const existing = getAuth();

      if (!existing) {
        if (json) jsonOut({ loggedOut: false, reason: "Not currently logged in" });
        warn("Not currently logged in.");
        return;
      }

      clearAuth();

      if (json) jsonOut({ loggedOut: true });
      success("Logged out. Run `icf auth login` to authenticate again.");
    });

  // STATUS
  auth
    .command("status")
    .description("Show current authentication state")
    .option("--json", "Output as JSON ({ ok, data })")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const existing = getAuth();

      if (!existing) {
        if (json) jsonOut({ loggedIn: false });
        console.log(chalk.yellow("Not logged in. Run: icf auth login"));
        return;
      }

      if (json) {
        jsonOut({ loggedIn: true, login: existing.login, name: existing.name ?? null });
      }

      console.log(chalk.green("✅ Logged in"));
      console.log(`   Login:  ${chalk.cyan(existing.login)}`);
      if (existing.name) console.log(`   Name:   ${existing.name}`);
      console.log(`   Config: ${chalk.dim(getConfigPath())}`);
    });
}
