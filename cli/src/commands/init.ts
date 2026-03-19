import { Command } from "commander";
import chalk from "chalk";
import { getAuth, saveRepo } from "../config.js";
import { createOctokit, ICF_LABELS } from "../github.js";
import { success, errorLine, isJsonMode, jsonOut, jsonError } from "../utils/format.js";
import { handleError, requireAuth } from "../utils/errors.js";

// ── Bundled content ───────────────────────────────────────────────────────────

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

// Bundled ICF workflows — pushed to target repo by icf init
const WORKFLOW_TRIAGE = `name: Incident Triage

on:
  issues:
    types: [opened, labeled]

jobs:
  triage:
    name: Set SLA Deadline
    runs-on: ubuntu-latest
    permissions:
      issues: write
    if: |
      contains(github.event.issue.labels.*.name, 'type:incident')

    steps:
      - name: Determine severity and post SLA comment
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            const labels = context.payload.issue.labels.map(l => l.name);
            const issueNumber = context.issue.number;
            const SEVERITY_CONFIG = {
              'severity:P0': { level: 'P0', emoji: '🔴', slaMin: 15,  slaText: '15 min — immediate response required' },
              'severity:P1': { level: 'P1', emoji: '🟠', slaMin: 30,  slaText: '30 min — urgent response required' },
              'severity:P2': { level: 'P2', emoji: '🟡', slaMin: 120, slaText: '2 hours — response required this shift' },
              'severity:P3': { level: 'P3', emoji: '🔵', slaMin: 480, slaText: '8 hours — response required today' },
            };
            const severityOrder = ['severity:P0', 'severity:P1', 'severity:P2', 'severity:P3'];
            const matchedKey = severityOrder.find(k => labels.includes(k));
            const config = matchedKey ? SEVERITY_CONFIG[matchedKey] : SEVERITY_CONFIG['severity:P3'];
            const now = new Date();
            const deadline = new Date(now.getTime() + config.slaMin * 60 * 1000);
            const incidentId = \`INC-\${String(issueNumber).padStart(3, '0')}\`;
            const body = [
              \`## \${config.emoji} Incident Triage — Automated SLA\`,
              '',
              '| Field | Value |',
              '|-------|-------|',
              \`| **Incident** | \${incidentId} |\`,
              \`| **Severity** | \${config.emoji} \${config.level} |\`,
              \`| **SLA** | \${config.slaText} |\`,
              \`| **Deadline** | \${deadline.toUTCString()} |\`,
              '',
              '### Response Checklist',
              '- [ ] Incident commander assigned',
              '- [ ] Initial assessment posted',
              '- [ ] Stakeholders notified',
              '- [ ] Mitigation started',
              '',
              \`> Use \\\`icf incident update \${incidentId} --status mitigating\\\` to update status.\`,
              '<!-- icf-triage-comment -->',
            ].join('\\n');
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: issueNumber, body,
            });
            try {
              await github.rest.issues.addAssignees({
                owner: context.repo.owner, repo: context.repo.repo,
                issue_number: issueNumber,
                assignees: [context.payload.issue.user.login],
              });
            } catch(e) { console.log('Auto-assign skipped:', e.message); }
`;

const WORKFLOW_ESCALATION = `name: Incident Escalation

on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (no comments posted)'
        required: false
        default: 'false'

jobs:
  escalate:
    name: Escalate Stale Incidents
    runs-on: ubuntu-latest
    permissions:
      issues: write

    steps:
      - name: Check for stale P0/P1 incidents
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            const DRY_RUN = '\${{ github.event.inputs.dry_run }}' === 'true';
            const NOW = Date.now();
            const THRESHOLDS = {
              'severity:P0': 15 * 60 * 1000,
              'severity:P1': 30 * 60 * 1000,
            };
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner, repo: context.repo.repo,
              state: 'open', labels: 'type:incident', per_page: 50,
            });
            for (const issue of issues) {
              const labelNames = issue.labels.map(l => l.name);
              if (labelNames.includes('status:resolved') || labelNames.includes('status:mitigating')) continue;
              let threshold = null, severity = null, emoji = '';
              if (labelNames.includes('severity:P0'))      { threshold = THRESHOLDS['severity:P0']; severity = 'P0'; emoji = '🔴'; }
              else if (labelNames.includes('severity:P1')) { threshold = THRESHOLDS['severity:P1']; severity = 'P1'; emoji = '🟠'; }
              if (!threshold) continue;
              const { data: comments } = await github.rest.issues.listComments({
                owner: context.repo.owner, repo: context.repo.repo,
                issue_number: issue.number, per_page: 100,
              });
              const lastActivity = Math.max(
                comments.length > 0 ? new Date(comments[comments.length-1].updated_at).getTime() : 0,
                new Date(issue.updated_at).getTime()
              );
              const staleMin = Math.floor((NOW - lastActivity) / 60000);
              if ((NOW - lastActivity) < threshold) continue;
              const recent = comments
                .filter(c => c.user.login === 'github-actions[bot]')
                .filter(c => c.body.includes('<!-- icf-escalation-alert -->'))
                .filter(c => (NOW - new Date(c.created_at).getTime()) < threshold);
              if (recent.length > 0) continue;
              const incidentId = \`INC-\${String(issue.number).padStart(3, '0')}\`;
              const assignees = issue.assignees.map(a => \`@\${a.login}\`).join(', ') || '@everyone';
              const body = [
                \`## ⚠️ **Escalation Alert** — \${emoji} \${severity} SLA Breach\`,
                '',
                \`This incident has had **no updates for \${staleMin} minutes**.\`,
                '',
                \`| **Incident** | \${incidentId} |\`,
                \`| **Assigned to** | \${assignees} |\`,
                '',
                '<!-- icf-escalation-alert -->',
              ].join('\\n');
              if (DRY_RUN) { console.log('[DRY RUN] Would escalate #' + issue.number); }
              else {
                await github.rest.issues.createComment({
                  owner: context.repo.owner, repo: context.repo.repo,
                  issue_number: issue.number, body,
                });
              }
            }
`;

// ── Command ───────────────────────────────────────────────────────────────────

export function initCommand(program: Command): void {
  program
    .command("init [owner/repo]")
    .description("Bootstrap a GitHub repo as a fully configured ICF incident repository")
    .option("--create",        "Create the repository if it does not exist")
    .option("--private",       "When --create: make the repo private (default)")
    .option("--public",        "When --create: make the repo public")
    .option("--no-workflows",  "Skip pushing ICF GitHub Actions workflows")
    .option("--no-create",     "Skip repo creation even if it doesn't exist (configure existing)")
    .option("--json",          "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf init my-org/incident-tracker")}                        Configure existing repo
  ${chalk.cyan("icf init my-org/incident-tracker --create")}              Create + full bootstrap
  ${chalk.cyan("icf init my-org/incident-tracker --create --public")}     Create as public
  ${chalk.cyan("icf init my-org/incident-tracker --no-workflows")}        Skip workflow push

${chalk.dim("What gets set up:")}
  ✅ Labels: severity:P0-P3, status:open/mitigating/resolved, type:incident
  ✅ Milestone: Active Incidents
  ✅ Issue template (.github/ISSUE_TEMPLATE/incident.md)
  ✅ Workflows: incident-triage.yml + incident-escalation.yml (requires workflow scope)
  ✅ Repo config saved locally for subsequent icf commands

${chalk.dim("Token scope required for workflows: repo, workflow, write:packages")}
`)
    .action(async (orgRepo: string | undefined, opts: {
      create?: boolean;
      private?: boolean;
      public?: boolean;
      workflows?: boolean;   // commander's --no-workflows sets this false
      json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);

      if (!orgRepo) {
        errorLine("Usage: icf init <owner/repo>"); process.exit(1);
      }
      const parts = orgRepo.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        const msg = `Invalid format "${orgRepo}". Use owner/repo`;
        if (json) jsonError(msg, 1); errorLine(msg); process.exit(1);
      }
      const [owner, repo] = parts;
      const includeWorkflows = opts.workflows !== false; // default true unless --no-workflows

      const octokit = createOctokit(auth!);
      const results: Record<string, unknown> = {};

      try {
        // 1. Repo existence check + optional creation
        let repoUrl = "";
        let repoExists = true;
        try {
          const { data } = await octokit.repos.get({ owner, repo });
          repoUrl = data.html_url;
          if (!json) console.log(chalk.dim(`Repository ${owner}/${repo} exists — configuring…`));
        } catch (e: unknown) {
          if ((e as { status?: number }).status === 404) {
            repoExists = false;
          } else {
            throw e;
          }
        }

        if (!repoExists) {
          if (!opts.create) {
            const msg = `Repository ${owner}/${repo} does not exist. Use --create to create it.`;
            if (json) jsonError(msg, 1); errorLine(msg); process.exit(1);
          }
          if (!json) process.stdout.write(`Creating repository ${chalk.cyan(`${owner}/${repo}`)}… `);
          const isPrivate = !opts.public;
          const { data } = await octokit.repos.createInOrg({
            org: owner, name: repo,
            description: "Incident management powered by ICF",
            private: isPrivate, has_issues: true, auto_init: true,
          }).catch(() => octokit.repos.createForAuthenticatedUser({
            name: repo, description: "Incident management powered by ICF",
            private: isPrivate, has_issues: true, auto_init: true,
          }));
          repoUrl = data.html_url;
          if (!json) console.log(chalk.green("done"));
          results.repo_created = true;
        }

        // 2. Labels (idempotent)
        if (!json) process.stdout.write(`Creating ${ICF_LABELS.length} labels… `);
        for (const label of ICF_LABELS) {
          await octokit.issues.createLabel({ owner, repo, ...label }).catch(async () => {
            await octokit.issues.updateLabel({ owner, repo, name: label.name, color: label.color, description: label.description ?? "" }).catch(() => {});
          });
        }
        if (!json) console.log(chalk.green(`done (${ICF_LABELS.length})`));
        results.labels_created = ICF_LABELS.length;

        // 3. Milestone — Active Incidents
        if (!json) process.stdout.write("Creating milestone… ");
        const { data: milestones } = await octokit.issues.listMilestones({ owner, repo });
        const existingMs = milestones.find((m) => m.title === "Active Incidents");
        let milestoneNum: number;
        if (existingMs) {
          milestoneNum = existingMs.number;
          if (!json) console.log(chalk.dim("already exists"));
        } else {
          const { data: ms } = await octokit.issues.createMilestone({ owner, repo, title: "Active Incidents", description: "All active incidents managed by ICF" });
          milestoneNum = ms.number;
          if (!json) console.log(chalk.green(`done (#${milestoneNum})`));
        }
        results.milestone = `Active Incidents (#${milestoneNum})`;

        // 4. Issue template
        if (!json) process.stdout.write("Creating issue template… ");
        const templatePath = ".github/ISSUE_TEMPLATE/incident.md";
        try {
          const { data: existing } = await octokit.repos.getContent({ owner, repo, path: templatePath });
          const sha = Array.isArray(existing) ? undefined : existing.sha;
          await octokit.repos.createOrUpdateFileContents({ owner, repo, path: templatePath, message: "chore: update ICF issue template", content: Buffer.from(ISSUE_TEMPLATE).toString("base64"), sha });
        } catch {
          await octokit.repos.createOrUpdateFileContents({ owner, repo, path: templatePath, message: "chore: add ICF issue template", content: Buffer.from(ISSUE_TEMPLATE).toString("base64") });
        }
        if (!json) console.log(chalk.green("done"));
        results.template_created = true;

        // 5. GitHub Actions workflows (requires `workflow` token scope)
        if (includeWorkflows) {
          if (!json) process.stdout.write("Pushing ICF workflows (incident-triage + incident-escalation)… ");
          const workflows = [
            { path: ".github/workflows/incident-triage.yml",     content: WORKFLOW_TRIAGE,     msg: "chore: add ICF incident-triage workflow" },
            { path: ".github/workflows/incident-escalation.yml", content: WORKFLOW_ESCALATION, msg: "chore: add ICF incident-escalation workflow" },
          ];
          let workflowsOk = true;
          for (const wf of workflows) {
            try {
              const sha = await getFileSha(octokit, owner, repo, wf.path);
              await octokit.repos.createOrUpdateFileContents({ owner, repo, path: wf.path, message: wf.msg, content: Buffer.from(wf.content).toString("base64"), ...(sha ? { sha } : {}) });
            } catch (e: unknown) {
              // 422/403 usually means missing `workflow` scope
              const status = (e as { status?: number }).status;
              if (status === 422 || status === 403) {
                workflowsOk = false;
                if (!json) console.log(chalk.yellow("\n⚠️  Workflow push failed — token needs `workflow` scope"));
                if (!json) console.log(chalk.dim(`   Re-run: icf auth login → ${chalk.cyan("https://github.com/settings/tokens/new?scopes=repo,workflow,write:packages&description=icf-cli")}`));
              } else {
                throw e;
              }
              break;
            }
          }
          if (workflowsOk && !json) console.log(chalk.green("done"));
          results.workflows_created = workflowsOk;
        } else {
          results.workflows_created = false;
          results.workflows_skipped = true;
        }

        // 6. Save repo to local config
        saveRepo({ owner, repo });

        const cloneUrl  = repoUrl.replace("https://github.com/", "git@github.com:") + ".git";
        const issuesUrl = `${repoUrl}/issues`;

        if (json) {
          jsonOut({ owner, repo, repo_url: repoUrl, clone_url: cloneUrl, issues_url: issuesUrl, ...results });
        }

        console.log("");
        success(`ICF initialized in ${chalk.cyan(`${owner}/${repo}`)}\n`);
        console.log(`  Labels:      ${chalk.bold(ICF_LABELS.length)}`);
        console.log(`  Milestone:   ${chalk.bold(results.milestone)}`);
        console.log(`  Workflows:   ${results.workflows_created ? chalk.bold("incident-triage + incident-escalation") : chalk.yellow("skipped")}`);
        console.log(`  Issues URL:  ${chalk.dim(issuesUrl)}`);
        console.log(`\nRun ${chalk.cyan("icf incident create")} to file your first incident.`);

      } catch (err) {
        handleError(err, opts);
      }
    });
}

async function getFileSha(octokit: ReturnType<typeof createOctokit>, owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    return Array.isArray(data) ? null : data.sha;
  } catch {
    return null;
  }
}
