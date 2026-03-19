import { Command } from "commander";
import chalk from "chalk";
import { authCommand    } from "./commands/auth.js";
import { initCommand    } from "./commands/init.js";
import { incidentCommand} from "./commands/incident.js";
import { configCommand  } from "./commands/config.js";
import { getConfigPath  } from "./config.js";

const program = new Command();

program
  .name("icf")
  .description("Incident Command Framework — CLI-first incident management backed by GitHub")
  .version("0.1.0")
  .addHelpText("beforeAll", `\n${chalk.bold.red("🚨 ICF")} — ${chalk.bold("Incident Command Framework")}\n`)
  .addHelpText("after", `
${chalk.bold("Quick Start:")}
  ${chalk.cyan("icf auth login")}
  ${chalk.cyan("icf init BlackAsteroid/incident-report")}
  ${chalk.cyan("icf incident create --title \"DB down\" --service payments --severity P0 --description \"...\"")}
  ${chalk.cyan("icf incident list")}
  ${chalk.cyan("icf incident resolve INC-001 --rca \"Fixed and deployed\"")}

${chalk.bold("JSON Mode:")}
  ${chalk.cyan("icf incident list --json")}
  ${chalk.cyan("ICF_JSON=1 icf incident create ...")}

${chalk.bold("Exit Codes:")} 0=ok  1=general  2=network  3=not-found  4=auth  5=validation
${chalk.dim("Config: ")}${getConfigPath()}
`);

authCommand(program);
initCommand(program);
incidentCommand(program);
configCommand(program);

program.parse(process.argv);
