import { Command } from "commander";
import chalk from "chalk";
import { getAuth, saveRepoConfig } from "../config.js";
import { createGitHubClient } from "../github.js";
import { ICF_LABELS } from "../incident.js";
import { success, error, info, isJsonMode, jsonOut } from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";

// Issue templates
const INCIDENT_TEMPLATE = `---
name: Incident Report
about: Report a production incident
title: "[INCIDENT] "
labels: "type: incident, icf"
---

<!-- Fill in the details below. The ICF data block at the bottom is managed by the CLI. -->

## What happened?
<!-- Brief description of the incident -->

## Impact
<!-- Who is affected and how? -->

## Current Status
<!-- What is being done right now? -->
`;

const POSTMORTEM_TEMPLATE = `---
name: Post-Mortem
about: Post-mortem review for a resolved incident
title: "[POST-MORTEM] INC-"
labels: "type: post-mortem, icf"
---

## Summary
**Incident:** <!-- INC-XXX -->
**Date:** 
**Duration:**
**Severity:**
**Author:**

## Timeline
| Time | Event |
|------|-------|
|      |       |

## Root Cause

## Contributing Factors

## What Went Well

## What Could Be Improved

## Action Items
| Item | Owner | Due Date |
|------|-------|----------|
|      |       |          |
`;

const ICF_CONFIG_TEMPLATE = `# ICF Configuration
version: 1
project:
  org: "{ORG}"
  repo: "{REPO}"
  timezone: "UTC"

incident:
  id_prefix: "INC"
  auto_close_on_resolve: false
  require_root_cause: true
  require_follow_up: false

postmortem:
  auto_generate: true
  auto_create_pr: false
  due_after_resolve_hours: 24

notifications:
  deduplicate_window: 300
  quiet_hours:
    enabled: false
    start: "22:00"
    end: "08:00"
    timezone: "UTC"
    override_for: ["P0"]

agent:
  default_timeout: 300
  max_retries: 3
`;

const README_TEMPLATE = `# 🚨 Incident Management

This repository is managed by [ICF](https://github.com/BlackAsteroid/incident-report) — Incident Command Framework.

## Quick Start

\`\`\`bash
# Install ICF
npm install -g @blackasteroid/icf

# Authenticate
icf auth login

# Create an incident
icf incident create --severity P1 --service api --description "API latency spike"

# List open incidents
icf incident list

# Resolve an incident
icf incident resolve INC-1 --root-cause "Memory leak in worker pool"
\`\`\`

## Incident Lifecycle

\`open\` → \`investigating\` → \`mitigating\` → \`monitoring\` → \`resolved\`

## Severity Levels

| Level | Description |
|-------|-------------|
| P0 | Critical — full outage or data loss |
| P1 | High — major feature degradation |
| P2 | Medium — partial degradation |
| P3 | Low — minor issue |

## Agent Workflow

Agents can interact via the CLI or GitHub API. Each incident is a GitHub Issue with structured data embedded as an HTML comment block.

\`\`\`bash
# Agent creating an incident
icf incident create --severity P1 --service api-gateway --detected-by monitoring-agent --json

# Agent adding a timeline event
icf incident timeline INC-42 --event "Identified memory leak in worker pool" --json

# Agent resolving
icf incident resolve INC-42 --root-cause "Deployed fix for memory leak" --json
\`\`\`
`;

export function initCommand(program: Command): void {
  program
    .command("init <org/repo>")
    .description("Bootstrap a new incident management repository with ICF structure")
    .option("--private", "Create a private repository (default: true)", true)
    .option("--public", "Create a public repository")
    .option("--skip-labels", "Skip creating ICF labels")
    .option("--skip-templates", "Skip creating issue templates")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf init BlackAsteroid/incidents")}              Create private incidents repo
  ${chalk.cyan("icf init my-org/incidents --public")}            Create public repo
  ${chalk.cyan("icf init my-org/incidents --json")}              Machine-readable output

${chalk.dim("What gets created:")}
  ✅ GitHub repository (private by default)
  ✅ ICF label set (severity, status, type)
  ✅ Issue templates (incident report, post-mortem)
  ✅ config/icf.yml — master configuration
  ✅ README.md — quick-start guide
`)
    .action(async (orgRepo: string, opts: {
      private?: boolean;
      public?: boolean;
      skipLabels?: boolean;
      skipTemplates?: boolean;
      json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);

      // Parse org/repo
      const parts = orgRepo.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        const msg = `Invalid format: "${orgRepo}". Use "org/repo" (e.g., "BlackAsteroid/incidents")`;
        if (json) { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); }
        error(msg);
        process.exit(1);
      }
      const [org, repo] = parts;
      const isPrivate = !opts.public;

      const client = createGitHubClient(auth!);
      const results: string[] = [];

      try {
        // 1. Create or verify repo
        const exists = await client.repoExists(org, repo);
        if (exists) {
          if (!json) info(`Repository ${chalk.cyan(`${org}/${repo}`)} already exists — continuing setup`);
        } else {
          if (!json) process.stdout.write(`Creating repository ${chalk.cyan(`${org}/${repo}`)}… `);
          await client.createRepo(org, repo, { private: isPrivate });
          if (!json) console.log(chalk.green("done"));
          results.push("repo_created");
        }

        // 2. Labels
        if (!opts.skipLabels) {
          if (!json) process.stdout.write("Setting up labels… ");
          for (const label of ICF_LABELS) {
            await client.upsertLabel(org, repo, label);
          }
          if (!json) console.log(chalk.green(`done (${ICF_LABELS.length} labels)`));
          results.push("labels_created");
        }

        // 3. Issue templates
        if (!opts.skipTemplates) {
          if (!json) process.stdout.write("Creating issue templates… ");
          const incidentSha = await client.getFileSha(org, repo, ".github/ISSUE_TEMPLATE/incident.md");
          await client.createOrUpdateFile(
            org, repo,
            ".github/ISSUE_TEMPLATE/incident.md",
            INCIDENT_TEMPLATE,
            "chore: add ICF incident issue template",
            incidentSha ?? undefined
          );
          const postmortemSha = await client.getFileSha(org, repo, ".github/ISSUE_TEMPLATE/post-mortem.md");
          await client.createOrUpdateFile(
            org, repo,
            ".github/ISSUE_TEMPLATE/post-mortem.md",
            POSTMORTEM_TEMPLATE,
            "chore: add ICF post-mortem issue template",
            postmortemSha ?? undefined
          );
          if (!json) console.log(chalk.green("done"));
          results.push("templates_created");
        }

        // 4. ICF config
        if (!json) process.stdout.write("Creating config/icf.yml… ");
        const configContent = ICF_CONFIG_TEMPLATE
          .replace("{ORG}", org)
          .replace("{REPO}", repo);
        const configSha = await client.getFileSha(org, repo, "config/icf.yml");
        if (!configSha) {
          await client.createOrUpdateFile(
            org, repo,
            "config/icf.yml",
            configContent,
            "chore: add ICF configuration"
          );
          results.push("config_created");
        }
        if (!json) console.log(chalk.green("done"));

        // 5. README
        if (!json) process.stdout.write("Creating README.md… ");
        const readmeSha = await client.getFileSha(org, repo, "README.md");
        // Only overwrite README if it's the default GitHub one (< 200 bytes) or doesn't exist
        if (!readmeSha) {
          await client.createOrUpdateFile(
            org, repo,
            "README.md",
            README_TEMPLATE,
            "docs: add ICF README"
          );
          results.push("readme_created");
        }
        if (!json) console.log(chalk.green("done"));

        // 6. Save repo config locally
        saveRepoConfig({ org, repo });

        const repoUrl = `https://github.com/${org}/${repo}`;

        if (json) {
          jsonOut({ org, repo, url: repoUrl, steps: results });
        }

        console.log("");
        success(`Repository initialized: ${chalk.cyan(repoUrl)}`);
        console.log(chalk.dim(`\nNext steps:`));
        console.log(`  ${chalk.cyan("icf incident create --severity P1 --service my-service --description \"...\"")} `);
        console.log(`  ${chalk.cyan("icf incident list")}`);

      } catch (err) {
        handleError(err, opts);
      }
    });
}
