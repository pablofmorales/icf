import { Command } from "commander";
import chalk from "chalk";
import { authCommand    } from "./commands/auth.js";
import { initCommand    } from "./commands/init.js";
import { incidentCommand} from "./commands/incident.js";
import { configCommand  } from "./commands/config.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { getConfigPath  } from "./config.js";
import { readFileSync   } from "fs";
import { join           } from "path";

// Read version from package.json (works in CJS bundle)
function readVersion(): string {
  try { return (JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string }).version; }
  catch { try { return (JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string }).version; } catch { return "unknown"; } }
}
const VERSION = readVersion();

const program = new Command();

program
  .name("icf")
  .description("Manage service incidents through GitHub Issues from your terminal.")
  .version(VERSION)
  .addHelpText("beforeAll", `\n${chalk.bold("icf")} — Incident Command Framework\n`)
  .addHelpText("after", `
${chalk.bold("Quick start:")}
  ${chalk.cyan("icf auth login")}                                              Authenticate with GitHub
  ${chalk.cyan("icf init my-org/incidents --create")}                          Create + configure incident repo
  ${chalk.cyan("icf incident create --severity P1 --service api --title \"...\"")}
  ${chalk.cyan("icf incident list")}                                            List open incidents
  ${chalk.cyan("icf incident resolve INC-001 --rca \"Fixed and deployed\"")}   Resolve with root cause

${chalk.bold("Agent usage:")}
  ${chalk.cyan("icf incident list --json | jq '.data[] | select(.severity == \"P0\")'")}
  ${chalk.cyan("echo '{\"title\":\"Down\",\"service\":\"api\",\"severity\":\"P1\",\"description\":\"...\"}'")}
  ${chalk.cyan("  | icf incident create --input-json --json")}
  ${chalk.cyan("ICF_JSON=1 icf incident list")}                                Global JSON mode

${chalk.bold("JSON responses follow:")} ${chalk.dim("{ ok, data } on success — { ok: false, error, code } on failure")}
${chalk.bold("Exit codes:")} ${chalk.dim("0 ok  1 general  2 network  3 not-found  4 auth  5 validation")}

${chalk.dim("Run")} ${chalk.cyan("icf <command> --help")} ${chalk.dim("for per-command examples.")}
${chalk.dim("Config stored at:")} ${chalk.yellow(getConfigPath())}
`);

authCommand(program);
initCommand(program);
incidentCommand(program);
configCommand(program);
upgradeCommand(program);

// `icf version --json` for agent use
program
  .command("version")
  .description("Show ICF version")
  .option("--json", "Output as JSON")
  .action((opts: { json?: boolean }) => {
    if (opts.json || process.env["ICF_JSON"]) {
      console.log(JSON.stringify({ ok: true, data: { version: VERSION, name: "@pablofmorales/icf" } }, null, 2));
    } else {
      console.log(VERSION);
    }
  });

// BUG-01 fix: Commander's built-in --version flag bypasses all custom logic
// and always outputs plain text. Intercept before Commander parses argv.
// If user passes both --version and --json (or ICF_JSON=1), output JSON.
const args = process.argv.slice(2);
if ((args.includes("--version") || args.includes("-V")) &&
    (args.includes("--json") || process.env["ICF_JSON"])) {
  console.log(JSON.stringify({ ok: true, data: { version: VERSION, name: "@pablofmorales/icf" } }, null, 2));
  process.exit(0);
}

program.parse(process.argv);
