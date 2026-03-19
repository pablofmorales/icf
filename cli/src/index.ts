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
  .description("Incident Command Framework — CLI-first incident management backed by GitHub")
  .version(VERSION)
  .addHelpText("beforeAll", `\n${chalk.bold.red("🚨 ICF")} — ${chalk.bold("Incident Command Framework")}\n`)
  .addHelpText("after", `
${chalk.bold("Quick Start:")}
  ${chalk.cyan("icf auth login")}
  ${chalk.cyan("icf init my-org/incidents --create")}
  ${chalk.cyan("icf incident create --title \"DB down\" --service payments --severity P0 --description \"...\"")}
  ${chalk.cyan("icf incident list")}
  ${chalk.cyan("icf incident resolve INC-001 --rca \"Fixed and deployed\"")}

${chalk.bold("Agent / pipe usage:")}
  ${chalk.cyan("icf incident list --json | jq '.data[] | select(.severity == \"P0\")'")}
  ${chalk.cyan("echo '{\"title\":\"Down\",\"service\":\"api\",\"severity\":\"P1\"}' | icf incident create --input-json --json")}
  ${chalk.cyan("ICF_JSON=1 icf incident create --input-json '{...}'")}

${chalk.bold("JSON mode:")}
  All commands support ${chalk.cyan("--json")} or ${chalk.cyan("ICF_JSON=1")} env var.
  All responses follow: ${chalk.dim("{ ok: bool, data: {}, error?: string, code?: number }")}

${chalk.bold("Exit Codes:")} 0=ok  1=general  2=network  3=not-found  4=auth  5=validation
${chalk.dim("Config: ")}${getConfigPath()}
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
      console.log(JSON.stringify({ ok: true, data: { version: VERSION, name: "@blackasteroid/icf" } }, null, 2));
    } else {
      console.log(VERSION);
    }
  });

program.parse(process.argv);
