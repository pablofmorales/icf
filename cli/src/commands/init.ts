import { Command } from "commander";
import chalk from "chalk";
import { getAuth, saveRepo } from "../config.js";
import { createOctokit, ICF_LABELS } from "../github.js";
import { success, errorLine, isJsonMode, jsonOut, jsonError } from "../utils/format.js";
import { handleError, requireAuth } from "../utils/errors.js";

const ISSUE_TEMPLATE = `---
name: Incident Report
about: Report a production incident managed by ICF
title: "[INCIDENT] "
labels: "type:incident,status:open"
---
**Service:** 
**Severity:** P0 / P1 / P2 / P3

**Description:**
<!-- What is happening? -->

**Impact:**
<!-- Who is affected and how many users? -->
`;

export function initCommand(program: Command): void {
  program
    .command("init [owner/repo]")
    .description("Bootstrap a GitHub repo as an ICF incident repository")
    .option("--private", "Create private repo (default: true)")
    .option("--public",  "Create public repo")
    .option("--json",    "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf init BlackAsteroid/incident-report")}
  ${chalk.cyan("icf init my-org/incidents --public")}

${chalk.dim("What gets created:")}
  ✅ Labels: severity (P0-P3), status (open/mitigating/resolved), type:incident
  ✅ Milestone: Active Incidents
  ✅ Issue template
  ✅ Default repo saved to config
`)
    .action(async (orgRepo: string | undefined, opts: { private?: boolean; public?: boolean; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);

      let owner: string, repo: string;
      if (orgRepo) {
        const parts = orgRepo.split("/");
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          const msg = `Invalid format "${orgRepo}". Use owner/repo`;
          if (json) jsonError(msg, 1); errorLine(msg); process.exit(1);
        }
        [owner, repo] = parts;
      } else {
        errorLine("Usage: icf init <owner/repo>"); process.exit(1);
        // TypeScript needs this
        owner = ""; repo = "";
      }

      const isPrivate = !opts.public;
      const octokit = createOctokit(auth!);
      const results: Record<string, unknown> = {};

      try {
        // 1. Ensure repo exists
        let repoUrl: string;
        try {
          const { data } = await octokit.repos.get({ owner, repo });
          repoUrl = data.html_url;
          if (!json) console.log(chalk.dim(`Repository ${owner}/${repo} already exists — configuring…`));
        } catch {
          if (!json) process.stdout.write(`Creating repository ${chalk.cyan(`${owner}/${repo}`)}… `);
          const { data } = await octokit.repos.createInOrg({
            org: owner,
            name: repo,
            description: "Incident management powered by ICF",
            private: isPrivate,
            has_issues: true,
            auto_init: true,
          }).catch(() =>
            // Fall back to user repo if org creation fails
            octokit.repos.createForAuthenticatedUser({
              name: repo,
              description: "Incident management powered by ICF",
              private: isPrivate,
              has_issues: true,
              auto_init: true,
            })
          );
          repoUrl = data.html_url;
          if (!json) console.log(chalk.green("done"));
          results.repo_created = true;
        }

        // 2. Labels (idempotent — upsert)
        if (!json) process.stdout.write(`Creating ${ICF_LABELS.length} labels… `);
        for (const label of ICF_LABELS) {
          await octokit.issues.createLabel({ owner, repo, ...label }).catch(async () => {
            // Already exists — update it
            await octokit.issues.updateLabel({ owner, repo, name: label.name, color: label.color, description: label.description ?? "" }).catch(() => {});
          });
        }
        if (!json) console.log(chalk.green(`done (${ICF_LABELS.length})`));
        results.labels_created = ICF_LABELS.length;

        // 3. Milestone — Active Incidents
        if (!json) process.stdout.write("Creating milestone… ");
        const { data: milestones } = await octokit.issues.listMilestones({ owner, repo });
        let milestoneNumber: number;
        const existing = milestones.find((m) => m.title === "Active Incidents");
        if (existing) {
          milestoneNumber = existing.number;
          if (!json) console.log(chalk.dim("already exists"));
        } else {
          const { data: ms } = await octokit.issues.createMilestone({
            owner, repo,
            title: "Active Incidents",
            description: "All active incidents managed by ICF",
          });
          milestoneNumber = ms.number;
          if (!json) console.log(chalk.green(`done (#${milestoneNumber})`));
        }
        results.milestone = `Active Incidents (#${milestoneNumber})`;

        // 4. Issue template
        if (!json) process.stdout.write("Creating issue template… ");
        const templatePath = ".github/ISSUE_TEMPLATE/incident.md";
        try {
          const { data: existing } = await octokit.repos.getContent({ owner, repo, path: templatePath });
          const sha = Array.isArray(existing) ? undefined : existing.sha;
          await octokit.repos.createOrUpdateFileContents({
            owner, repo, path: templatePath,
            message: "chore: update ICF issue template",
            content: Buffer.from(ISSUE_TEMPLATE).toString("base64"),
            sha,
          });
        } catch {
          await octokit.repos.createOrUpdateFileContents({
            owner, repo, path: templatePath,
            message: "chore: add ICF issue template",
            content: Buffer.from(ISSUE_TEMPLATE).toString("base64"),
          });
        }
        if (!json) console.log(chalk.green("done"));
        results.template_created = true;

        // 5. Save to local config
        saveRepo({ owner, repo });

        if (json) {
          jsonOut({ owner, repo, url: repoUrl, ...results });
        }

        console.log("");
        success(`ICF initialized in ${chalk.cyan(`${owner}/${repo}`)}\n`);
        console.log(`  Labels created:  ${chalk.bold(ICF_LABELS.length)}`);
        console.log(`  Milestone:       ${chalk.bold(results.milestone)}`);
        console.log(`  Templates:       ${chalk.bold(1)}`);
        console.log(`\nRun ${chalk.cyan("icf incident create")} to file your first incident.`);

      } catch (err) {
        handleError(err, opts);
      }
    });
}
