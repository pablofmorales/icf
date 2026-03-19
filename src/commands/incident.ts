import { Command } from "commander";
import chalk from "chalk";
import { getAuth, getRepoConfig } from "../config.js";
import { createGitHubClient } from "../github.js";
import {
  Severity, IncidentStatus, IncidentBody,
  renderIssueBody, parseIssueBody, incidentId, parseIncidentId, ICF_LABELS
} from "../incident.js";
import {
  createTable, SEVERITY_COLORS, STATUS_COLORS,
  success, error, warn, isJsonMode, jsonOut, jsonError, formatRelativeTime,
} from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";

function collect(val: string, prev: string[]): string[] { return [...prev, val]; }

/** Resolve org/repo from option or saved config */
function resolveRepo(opts: { repo?: string }): { org: string; repo: string } | null {
  if (opts.repo) {
    const [org, repo] = opts.repo.split("/");
    if (org && repo) return { org, repo };
  }
  const saved = getRepoConfig();
  if (saved) return { org: saved.org, repo: saved.repo };
  return null;
}

export function incidentCommand(program: Command): void {
  const inc = program
    .command("incident")
    .description("Manage incidents — create, update, resolve, and list")
    .addHelpText("after", `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("incident create")}          Open a new incident
  ${chalk.cyan("incident list")}            List open/recent incidents
  ${chalk.cyan("incident show <id>")}       Show full incident details
  ${chalk.cyan("incident update <id>")}     Update status, severity, or fields
  ${chalk.cyan("incident resolve <id>")}    Mark an incident as resolved
  ${chalk.cyan("incident timeline <id>")}   Add a timeline event (comment)

${chalk.dim("Run")} ${chalk.cyan("icf incident <subcommand> --help")} ${chalk.dim("for examples.")}
`);

  // ── CREATE ────────────────────────────────────────────────────────────────
  inc
    .command("create")
    .description("Open a new incident")
    .requiredOption("--severity <level>", "Severity: P0, P1, P2, P3")
    .requiredOption("--service <name>", "Affected service name")
    .requiredOption("--description <text>", "Incident description")
    .option("--title <text>", "Custom issue title (defaults to severity + service + description)")
    .option("--blast-radius <radius>", "Blast radius: all-users, region, single-tenant, internal")
    .option("--detected-by <who>", "Who/what detected the incident (default: git username)")
    .option("--runbook <name>", "Associated runbook name")
    .option("--evidence <json>", "Evidence item (repeatable JSON)", collect, [])
    .option("--assign <login>", "Assign to GitHub user (repeatable)", collect, [])
    .option("--repo <org/repo>", "Target repo (default: saved from icf init)")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident create --severity P1 --service api-gateway --description \"High latency spike\"")}
  ${chalk.cyan("icf incident create --severity P0 --service db --description \"DB unreachable\" --blast-radius all-users")}
  ${chalk.cyan("icf incident create --severity P2 --service auth --description \"Login slow\" --assign leo --json")}

${chalk.dim("Severity guide:")}
  ${chalk.red("P0")} Critical — full outage or data loss
  ${chalk.yellow("P1")} High — major feature degradation
  ${chalk.blue("P2")} Medium — partial degradation
  ${chalk.gray("P3")} Low — minor issue
`)
    .action(async (opts: {
      severity: string;
      service: string;
      description: string;
      title?: string;
      blastRadius?: string;
      detectedBy?: string;
      runbook?: string;
      evidence: string[];
      assign: string[];
      repo?: string;
      json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = resolveRepo(opts);
      if (!target) {
        const msg = "No repo configured. Run `icf init <org/repo>` first or pass --repo <org/repo>";
        if (json) jsonError(msg, 1);
        error(msg);
        process.exit(1);
      }

      // Validate severity
      const severity = opts.severity.toUpperCase() as Severity;
      if (!["P0", "P1", "P2", "P3"].includes(severity)) {
        const msg = `Invalid severity "${opts.severity}". Use P0, P1, P2, or P3`;
        if (json) jsonError(msg, 1);
        error(msg);
        process.exit(1);
      }

      const detectedBy = opts.detectedBy ?? auth!.login;
      const title = opts.title ?? `[${severity}] ${opts.service}: ${opts.description.slice(0, 60)}`;

      const data: IncidentBody = {
        icf_version: "1",
        severity,
        status: "open",
        service: opts.service,
        blast_radius: opts.blastRadius as IncidentBody["blast_radius"],
        description: opts.description,
        detected_at: new Date().toISOString(),
        detected_by: detectedBy,
        runbook: opts.runbook,
        evidence: opts.evidence.map((e) => {
          try { return JSON.parse(e); } catch { return { type: "url" as const, source: e }; }
        }),
      };

      const labels = [
        `severity: ${severity}`,
        "status: open",
        "type: incident",
        "icf",
      ];

      try {
        const client = createGitHubClient(auth!);
        const issue = await client.createIssue(target.org, target.repo, {
          title,
          body: renderIssueBody(data),
          labels,
          assignees: opts.assign,
        });

        const id = incidentId(issue.number);

        if (json) {
          jsonOut({
            incident_id: id,
            number: issue.number,
            severity,
            status: "open",
            service: opts.service,
            url: issue.html_url,
          });
        }

        const sev = SEVERITY_COLORS[severity]?.(severity) ?? severity;
        success(`Incident ${chalk.bold(id)} created ${sev}`);
        console.log(`   Service:  ${opts.service}`);
        console.log(`   URL:      ${chalk.dim(issue.html_url)}`);
        if (opts.assign.length > 0) console.log(`   Assigned: ${opts.assign.join(", ")}`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── LIST ─────────────────────────────────────────────────────────────────
  inc
    .command("list")
    .description("List incidents (open by default)")
    .option("--state <state>", "Filter: open, closed, all (default: open)")
    .option("--severity <level>", "Filter by severity: P0, P1, P2, P3")
    .option("--status <status>", "Filter by status: open, investigating, mitigating, monitoring, resolved")
    .option("--service <name>", "Filter by service name")
    .option("--limit <n>", "Max incidents to show (default: 30)", "30")
    .option("--repo <org/repo>", "Target repo")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident list")}                          All open incidents
  ${chalk.cyan("icf incident list --severity P0")}           Critical incidents only
  ${chalk.cyan("icf incident list --status investigating")}  Incidents being investigated
  ${chalk.cyan("icf incident list --state all --json")}      All incidents as JSON
`)
    .action(async (opts: {
      state?: string;
      severity?: string;
      status?: string;
      service?: string;
      limit?: string;
      repo?: string;
      json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = resolveRepo(opts);
      if (!target) {
        const msg = "No repo configured. Run `icf init <org/repo>` first or pass --repo";
        if (json) jsonError(msg, 1);
        error(msg);
        process.exit(1);
      }

      try {
        const client = createGitHubClient(auth!);

        // Build label filter
        const labelFilters: string[] = ["type: incident"];
        if (opts.severity) labelFilters.push(`severity: ${opts.severity.toUpperCase()}`);
        if (opts.status) labelFilters.push(`status: ${opts.status.toLowerCase()}`);

        const issues = await client.listIssues(target.org, target.repo, {
          state: (opts.state ?? "open") as "open" | "closed" | "all",
          labels: labelFilters.join(","),
          per_page: Math.min(parseInt(opts.limit ?? "30", 10), 100),
        });

        // Parse ICF data and optionally filter by service
        const incidents = issues
          .map((issue) => {
            const data = parseIssueBody(issue.body);
            return data ? { issue, data } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .filter((x) => !opts.service || x.data.service.toLowerCase().includes(opts.service.toLowerCase()));

        if (json) {
          jsonOut(incidents.map(({ issue, data }) => ({
            incident_id: incidentId(issue.number),
            number: issue.number,
            title: issue.title,
            severity: data.severity,
            status: data.status,
            service: data.service,
            detected_by: data.detected_by,
            detected_at: data.detected_at,
            url: issue.html_url,
            assignees: issue.assignees.map((a) => a.login),
          })));
        }

        if (incidents.length === 0) {
          console.log("No incidents found.");
          return;
        }

        const table = createTable(["ID", "Sev", "Status", "Service", "Title", "Age", "Assignee"]);
        incidents.forEach(({ issue, data }) => {
          const sevFn = SEVERITY_COLORS[data.severity] ?? ((s: string) => s);
          const statusFn = STATUS_COLORS[data.status] ?? ((s: string) => s);
          const assignee = issue.assignees[0]?.login ?? "—";
          table.push([
            chalk.bold(incidentId(issue.number)),
            sevFn(data.severity),
            statusFn(data.status),
            data.service,
            issue.title.replace(/^\[P[0-3]\] /, "").slice(0, 40),
            formatRelativeTime(issue.created_at),
            assignee,
          ]);
        });
        console.log(table.toString());
        console.log(`\n${incidents.length} incident(s)`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── SHOW ─────────────────────────────────────────────────────────────────
  inc
    .command("show <id>")
    .description("Show full details for an incident (INC-NNN or issue number)")
    .option("--repo <org/repo>", "Target repo")
    .option("--json", "Output as JSON ({ ok, data })")
    .action(async (id: string, opts: { repo?: string; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = resolveRepo(opts);
      if (!target) { if (json) jsonError("No repo configured", 1); error("No repo configured"); process.exit(1); }

      const issueNum = parseIncidentId(id);
      if (isNaN(issueNum) || issueNum <= 0) {
        const msg = `Invalid incident ID: "${id}". Use INC-NNN or just the issue number.`;
        if (json) jsonError(msg, 1);
        error(msg);
        process.exit(1);
      }

      try {
        const client = createGitHubClient(auth!);
        const issue = await client.getIssue(target.org, target.repo, issueNum);
        const data = parseIssueBody(issue.body);

        if (!data) {
          const msg = `Issue #${issueNum} is not an ICF incident`;
          if (json) jsonError(msg, 3);
          error(msg);
          process.exit(3);
        }

        if (json) {
          jsonOut({
            incident_id: incidentId(issue.number),
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
            assignees: issue.assignees.map((a) => a.login),
            comments: issue.comments,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            closed_at: issue.closed_at,
            ...data,
          });
        }

        const sevFn = SEVERITY_COLORS[data.severity] ?? ((s: string) => s);
        const statusFn = STATUS_COLORS[data.status] ?? ((s: string) => s);

        console.log(`\n${chalk.bold.white(incidentId(issue.number))} — ${sevFn(data.severity)} ${statusFn(data.status)}`);
        console.log(`${chalk.dim("─".repeat(60))}`);
        console.log(`Title:      ${issue.title}`);
        console.log(`Service:    ${chalk.cyan(data.service)}`);
        if (data.blast_radius) console.log(`Blast:      ${data.blast_radius}`);
        console.log(`Detected:   ${new Date(data.detected_at).toLocaleString()} by ${data.detected_by}`);
        if (data.runbook) console.log(`Runbook:    ${chalk.cyan(data.runbook)}`);
        if (issue.assignees.length > 0) console.log(`Assignees:  ${issue.assignees.map((a) => a.login).join(", ")}`);
        console.log(`URL:        ${chalk.dim(issue.html_url)}`);
        console.log(`\n${chalk.bold("Description:")}`);
        console.log(data.description);
        if (data.evidence?.length) {
          console.log(`\n${chalk.bold("Evidence:")}`);
          data.evidence.forEach((e) => console.log(`  • [${e.type}] ${e.source}${e.url ? ` (${e.url})` : ""}`));
        }
        if (data.root_cause) {
          console.log(`\n${chalk.bold("Root Cause:")}`);
          console.log(data.root_cause);
        }
        console.log(`\n${chalk.dim(`${issue.comments} comment(s) — view at ${issue.html_url}`)}`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── UPDATE ────────────────────────────────────────────────────────────────
  inc
    .command("update <id>")
    .description("Update incident status, severity, or other fields")
    .option("--status <status>", "New status: investigating, mitigating, monitoring")
    .option("--severity <level>", "Change severity: P0, P1, P2, P3")
    .option("--assign <login>", "Add assignee (repeatable)", collect, [])
    .option("--runbook <name>", "Set associated runbook")
    .option("--repo <org/repo>", "Target repo")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident update INC-42 --status investigating")}
  ${chalk.cyan("icf incident update INC-42 --status mitigating --assign leo")}
  ${chalk.cyan("icf incident update INC-42 --severity P0")}
`)
    .action(async (id: string, opts: {
      status?: string;
      severity?: string;
      assign: string[];
      runbook?: string;
      repo?: string;
      json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = resolveRepo(opts);
      if (!target) { if (json) jsonError("No repo configured", 1); error("No repo configured"); process.exit(1); }

      const issueNum = parseIncidentId(id);
      if (isNaN(issueNum) || issueNum <= 0) {
        const msg = `Invalid incident ID: "${id}"`;
        if (json) jsonError(msg, 1);
        error(msg); process.exit(1);
      }

      if (!opts.status && !opts.severity && opts.assign.length === 0 && !opts.runbook) {
        const msg = "Nothing to update. Provide --status, --severity, --assign, or --runbook.";
        if (json) jsonError(msg, 1);
        error(msg); process.exit(1);
      }

      try {
        const client = createGitHubClient(auth!);
        const issue = await client.getIssue(target.org, target.repo, issueNum);
        const data = parseIssueBody(issue.body);
        if (!data) { if (json) jsonError("Not an ICF incident", 3); error("Not an ICF incident"); process.exit(3); }

        const newData: IncidentBody = { ...data! };
        const changes: string[] = [];

        if (opts.status) {
          const validStatuses: IncidentStatus[] = ["open", "investigating", "mitigating", "monitoring", "resolved"];
          if (!validStatuses.includes(opts.status as IncidentStatus)) {
            const msg = `Invalid status "${opts.status}". Valid: ${validStatuses.join(", ")}`;
            if (json) jsonError(msg, 1); error(msg); process.exit(1);
          }
          newData.status = opts.status as IncidentStatus;
          changes.push(`status → ${opts.status}`);
        }

        if (opts.severity) {
          const sev = opts.severity.toUpperCase() as Severity;
          if (!["P0", "P1", "P2", "P3"].includes(sev)) {
            if (json) jsonError(`Invalid severity "${opts.severity}"`, 1);
            error(`Invalid severity`); process.exit(1);
          }
          newData.severity = sev;
          changes.push(`severity → ${sev}`);
        }

        if (opts.runbook) {
          newData.runbook = opts.runbook;
          changes.push(`runbook → ${opts.runbook}`);
        }

        // Build new label set: remove old severity/status labels, add new ones
        const existingLabels = issue.labels
          .map((l) => l.name)
          .filter((l) => !l.startsWith("severity: ") && !l.startsWith("status: "));
        const newLabels = [
          ...existingLabels,
          `severity: ${newData.severity}`,
          `status: ${newData.status}`,
        ];

        await client.updateIssue(target.org, target.repo, issueNum, {
          body: renderIssueBody(newData),
          labels: newLabels,
          ...(opts.assign.length > 0 ? { assignees: [...issue.assignees.map((a) => a.login), ...opts.assign] } : {}),
        });

        if (json) {
          jsonOut({ incident_id: incidentId(issueNum), changes });
        }

        success(`${incidentId(issueNum)} updated (${changes.join(", ")})`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── RESOLVE ───────────────────────────────────────────────────────────────
  inc
    .command("resolve <id>")
    .description("Mark an incident as resolved")
    .requiredOption("--root-cause <text>", "Root cause description (required)")
    .option("--follow-up <item>", "Follow-up action item (repeatable)", collect, [])
    .option("--repo <org/repo>", "Target repo")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident resolve INC-42 --root-cause \"Memory leak in worker pool, fixed in v1.2.3\"")}
  ${chalk.cyan("icf incident resolve INC-42 --root-cause \"...\" --follow-up \"Add memory alerts\" --follow-up \"Load test\"")}
`)
    .action(async (id: string, opts: {
      rootCause: string;
      followUp: string[];
      repo?: string;
      json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = resolveRepo(opts);
      if (!target) { if (json) jsonError("No repo configured", 1); error("No repo configured"); process.exit(1); }

      const issueNum = parseIncidentId(id);
      if (isNaN(issueNum) || issueNum <= 0) {
        if (json) jsonError(`Invalid incident ID: "${id}"`, 1);
        error(`Invalid incident ID`); process.exit(1);
      }

      try {
        const client = createGitHubClient(auth!);
        const issue = await client.getIssue(target.org, target.repo, issueNum);
        const data = parseIssueBody(issue.body);
        if (!data) { if (json) jsonError("Not an ICF incident", 3); error("Not an ICF incident"); process.exit(3); }

        const resolvedAt = new Date().toISOString();
        const newData: IncidentBody = {
          ...data!,
          status: "resolved",
          root_cause: opts.rootCause,
          resolved_at: resolvedAt,
          resolved_by: auth!.login,
          follow_up: opts.followUp.length > 0 ? opts.followUp : undefined,
        };

        const existingLabels = issue.labels
          .map((l) => l.name)
          .filter((l) => !l.startsWith("status: "));
        const newLabels = [...existingLabels, "status: resolved"];

        await client.updateIssue(target.org, target.repo, issueNum, {
          body: renderIssueBody(newData),
          labels: newLabels,
          state: "closed",
        });

        // Add resolution comment
        const resolveComment = [
          `✅ **Incident resolved** by \`${auth!.login}\` at ${new Date(resolvedAt).toLocaleString()}`,
          "",
          `**Root cause:** ${opts.rootCause}`,
          ...(opts.followUp.length > 0 ? ["", "**Follow-up actions:**", ...opts.followUp.map((f) => `- ${f}`)] : []),
        ].join("\n");

        await client.addComment(target.org, target.repo, issueNum, resolveComment);

        if (json) {
          jsonOut({
            incident_id: incidentId(issueNum),
            status: "resolved",
            root_cause: opts.rootCause,
            resolved_at: resolvedAt,
            resolved_by: auth!.login,
          });
        }

        success(`${incidentId(issueNum)} resolved`);
        console.log(`   Root cause: ${opts.rootCause}`);
        if (opts.followUp.length > 0) {
          console.log(`   Follow-ups: ${opts.followUp.length} item(s) added`);
        }
      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── TIMELINE ─────────────────────────────────────────────────────────────
  inc
    .command("timeline <id>")
    .description("Add a timeline event (comment) to an incident")
    .requiredOption("--event <text>", "Timeline event description")
    .option("--repo <org/repo>", "Target repo")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident timeline INC-42 --event \"Identified memory leak in worker pool\"")}
  ${chalk.cyan("icf incident timeline INC-42 --event \"Deployed hotfix v1.2.3\" --json")}
`)
    .action(async (id: string, opts: { event: string; repo?: string; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = resolveRepo(opts);
      if (!target) { if (json) jsonError("No repo configured", 1); error("No repo configured"); process.exit(1); }

      const issueNum = parseIncidentId(id);
      if (isNaN(issueNum) || issueNum <= 0) {
        if (json) jsonError(`Invalid incident ID: "${id}"`, 1);
        error(`Invalid incident ID`); process.exit(1);
      }

      try {
        const client = createGitHubClient(auth!);
        const now = new Date().toISOString();
        const body = `🕐 **Timeline** \`${new Date(now).toLocaleString()}\` — ${opts.event}`;
        const comment = await client.addComment(target.org, target.repo, issueNum, body);

        if (json) {
          jsonOut({
            incident_id: incidentId(issueNum),
            comment_id: comment.id,
            event: opts.event,
            timestamp: now,
            url: comment.html_url,
          });
        }

        success(`Timeline event added to ${incidentId(issueNum)}`);
        console.log(chalk.dim(`   ${comment.html_url}`));
      } catch (err) {
        handleError(err, opts);
      }
    });
}
