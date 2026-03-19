import { Command } from "commander";
import chalk from "chalk";
import { authCommand } from "./commands/auth.js";
import { initCommand } from "./commands/init.js";
import { incidentCommand } from "./commands/incident.js";
import { configCommand } from "./commands/config.js";
import { getConfigPath } from "./config.js";

const program = new Command();

program
  .name("icf")
  .description("Incident Command Framework — CLI-first incident management backed by GitHub")
  .version("0.1.0")
  .addHelpText("beforeAll", `
${chalk.bold.red("🚨 ICF")} — ${chalk.bold("Incident Command Framework")}
`)
  .addHelpText("after", `
${chalk.bold("Quick Start:")}
  ${chalk.cyan("icf auth login")}                                            Authenticate with GitHub
  ${chalk.cyan("icf init BlackAsteroid/incidents")}                          Bootstrap incident repo
  ${chalk.cyan("icf incident create --severity P1 --service api --description \"...\"")}
  ${chalk.cyan("icf incident list")}                                         List open incidents
  ${chalk.cyan("icf incident resolve INC-42 --root-cause \"...\"")}           Resolve an incident

${chalk.bold("Agent Workflow:")}
  ${chalk.cyan("# Detect → Create → Update → Resolve")}
  ${chalk.cyan("INCIDENT=\$(icf incident create --severity P1 --service api --description \"Spike\" --json | jq -r '.data.incident_id')")}
  ${chalk.cyan("icf incident update \$INCIDENT --status investigating")}
  ${chalk.cyan("icf incident timeline \$INCIDENT --event \"Found memory leak\"")}
  ${chalk.cyan("icf incident resolve \$INCIDENT --root-cause \"Patched and deployed\"")}

${chalk.bold("JSON Mode:")}
  ${chalk.cyan("icf incident list --json")}                                  Machine-readable output
  ${chalk.cyan("ICF_JSON=1 icf incident list")}                              Global JSON mode via env var

${chalk.bold("Exit Codes:")}
  ${chalk.yellow("0")} Success  ${chalk.yellow("1")} General  ${chalk.yellow("2")} Network  ${chalk.yellow("3")} Not Found  ${chalk.yellow("4")} Auth  ${chalk.yellow("5")} Validation

${chalk.dim("Config stored at:")} ${chalk.yellow(getConfigPath())}
`);

// Register commands
authCommand(program);
initCommand(program);
incidentCommand(program);
configCommand(program);

program.parse(process.argv);
