import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, existsSync } from "fs";
import enquirer from "enquirer";
import { getAuth, getRepo } from "../config.js";
import { createOctokit, incidentId, parseIncidentRef, getSeverityFromLabels, getStatusFromLabels } from "../github.js";
import {
  severityColor, severityDot, severityEmoji, statusColor, statusEmoji,
  formatAge, formatAgeColored, formatDateShort, formatDuration,
  formatTable, success, errorLine, isJsonMode, jsonOut, jsonError,
} from "../utils/format.js";
import { incidentBox, divider, sectionHeader } from "../utils/box.js";
import { handleError, requireAuth, requireRepo, EXIT } from "../utils/errors.js";

const { prompt } = enquirer as any;

function collect(v: string, prev: string[]): string[] { return [...prev, v]; }

function getRepoOrDie(opts: { repo?: string; json?: boolean }): { owner: string; repo: string } {
  if (opts.repo) {
    const [owner, repo] = opts.repo.split("/");
    if (owner && repo) return { owner, repo };
  }
  const saved = getRepo();
  if (saved) return { owner: saved.owner, repo: saved.repo };
  requireRepo(opts);
}

const VALID_SEVERITIES = ["P0", "P1", "P2", "P3"];
const VALID_STATUSES   = ["open", "mitigating", "resolved"];

export function incidentCommand(program: Command): void {
  const inc = program
    .command("incident")
    .description("Manage incidents — create, list, show, update, resolve")
    .addHelpText("after", `
${chalk.dim("Commands:")}
  ${chalk.cyan("incident create")}          Open a new incident
  ${chalk.cyan("incident list")}            List open incidents
  ${chalk.cyan("incident show <id>")}       Show full incident details
  ${chalk.cyan("incident update <id>")}     Change severity, service, or title
  ${chalk.cyan("incident mitigate <id>")}   Transition to mitigating status
  ${chalk.cyan("incident comment <id>")}    Add a timeline entry
  ${chalk.cyan("incident resolve <id>")}    Close the incident with RCA
`);

  // ── CREATE ──────────────────────────────────────────────────────────────────
  inc
    .command("create")
    .description("Open a new incident as a GitHub Issue")
    .option("--title <text>",       "Incident title")
    .option("--service <name>",     "Affected service")
    .option("--severity <P0-P3>",   "Severity level: P0, P1, P2, P3")
    .option("--description <text>", "Detailed description")
    .option("--assign <login>",       "Assign to GitHub user (repeatable)", collect, [])
    .option("--repo <owner/repo>",    "Target repo (default: from config)")
    .option("--input-json [payload]", "Accept incident fields as JSON (from flag value or stdin pipe)")
    .option("--json",                 "Output as JSON ({ ok, data })")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident create --title \"DB pool exhausted\" --service payments --severity P0 --description \"...\"")}
  ${chalk.cyan("icf incident create")}   (interactive mode)
  ${chalk.cyan("icf incident create --severity P1 --service api --title \"...\" --json | jq '.data.id'")}

${chalk.dim("Agent / pipe usage (--input-json):")}
  ${chalk.cyan("icf incident create --input-json '{\"title\":\"Down\",\"service\":\"api\",\"severity\":\"P1\",\"description\":\"...\"}'")}
  ${chalk.cyan("echo '{\"title\":\"Down\",\"service\":\"api\",\"severity\":\"P1\"}' | icf incident create --input-json --json")}
  ${chalk.cyan("cat payload.json | icf incident create --input-json --json")}
`)
    .action(async (opts: {
      title?: string; service?: string; severity?: string;
      description?: string; assign: string[]; repo?: string;
      inputJson?: string | boolean; json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const octokit = createOctokit(auth!);

      // --input-json: parse from flag value or stdin
      if (opts.inputJson !== undefined) {
        let raw: string;
        if (typeof opts.inputJson === "string") {
          raw = opts.inputJson;
        } else {
          // boolean true means --input-json was passed without value — read from stdin
          raw = !process.stdin.isTTY ? readFileSync("/dev/stdin", "utf8").trim() : "";
        }
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (!opts.title       && parsed.title)       opts.title       = String(parsed.title);
            if (!opts.service     && parsed.service)     opts.service     = String(parsed.service);
            if (!opts.severity    && parsed.severity)    opts.severity    = String(parsed.severity);
            if (!opts.description && parsed.description) opts.description = String(parsed.description);
            if (!opts.assign.length && Array.isArray(parsed.assign)) {
              opts.assign = (parsed.assign as unknown[]).map(String);
            }
          } catch {
            const msg = `Invalid JSON in --input-json: ${raw.slice(0, 80)}`;
            if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
          }
        }
      }

      // BUG-02 fix: if --input-json was used (or stdin was piped), require title + severity.
      // Empty payload ({} or '') silently created incidents with P3 defaults — dangerous in automation.
      if (opts.inputJson !== undefined && !process.stdin.isTTY) {
        const missing: string[] = [];
        if (!opts.title)    missing.push("title");
        if (!opts.severity) missing.push("severity");
        if (missing.length > 0) {
          const msg = `--input-json payload is missing required fields: ${missing.join(", ")}`;
          if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
        }
      }

      // Interactive prompts for missing required fields (only in TTY mode)
      const answers = await prompt([
        ...(!opts.title       && process.stdin.isTTY ? [{ type: "input",  name: "title",       message: "Incident title:" }] : []),
        ...(!opts.service     && process.stdin.isTTY ? [{ type: "input",  name: "service",     message: "Affected service:" }] : []),
        ...(!opts.severity    && process.stdin.isTTY ? [{ type: "select", name: "severity",    message: "Severity:", choices: VALID_SEVERITIES }] : []),
        ...(!opts.description && process.stdin.isTTY ? [{ type: "input",  name: "description", message: "Description:" }] : []),
      ]);

      const title       = opts.title       ?? answers.title;
      const service     = opts.service     ?? answers.service;
      const severity    = (opts.severity   ?? answers.severity ?? "P3").toUpperCase();
      const description = opts.description ?? answers.description ?? "";

      // Validate service name to prevent injection / garbage data
      if (!/^[a-zA-Z0-9._\-/\s]{1,100}$/.test(service)) {
        const msg = "Service name contains invalid characters (max 100 chars, alphanumeric + . _ - / space)";
        if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
      }

      if (!VALID_SEVERITIES.includes(severity)) {
        const msg = `Invalid severity "${severity}". Use P0, P1, P2, or P3`;
        if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
      }

      try {
        const { data: issue } = await octokit.issues.create({
          owner: target.owner,
          repo: target.repo,
          title: `[${severity}] ${title}`,
          labels: [`severity:${severity}`, "status:open", "type:incident"],
          assignees: opts.assign,
          body: buildIssueBody(service, severity, description, auth!.github_user),
        });

        const id = incidentId(issue.number);

        // Post initial timeline comment
        await octokit.issues.createComment({
          owner: target.owner,
          repo: target.repo,
          issue_number: issue.number,
          body: `${severityEmoji(severity)} Incident created by @${auth!.github_user}`,
        });

        if (json) {
          jsonOut({ id, issue_number: issue.number, severity, status: "open", service, url: issue.html_url });
        }

        success(`Incident created\n`);
        console.log(`${severityDot(severity)} ${severityColor(severity)}  ${chalk.bold(id)} ${title}`);
        console.log(chalk.dim(issue.html_url));

      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── LIST ─────────────────────────────────────────────────────────────────────
  inc
    .command("list")
    .description("List incidents (open by default)")
    .option("--status <status>",    "Filter by status: open, mitigating, resolved")
    .option("--severity <P0-P3>",   "Filter by severity")
    .option("--service <name>",     "Filter by service name")
    .option("--all",                "Include resolved incidents")
    .option("--repo <owner/repo>",  "Target repo")
    .option("--json",               "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident list")}
  ${chalk.cyan("icf incident list --severity P0")}
  ${chalk.cyan("icf incident list --status mitigating")}
  ${chalk.cyan("icf incident list --all --json")}
`)
    .action(async (opts: {
      status?: string; severity?: string; service?: string;
      all?: boolean; repo?: string; json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const octokit = createOctokit(auth!);

      // BUG-01: validate filter values before querying — unknown values produce
      // empty results with no indication of a typo, which is dangerous in scripts.
      if (opts.severity) {
        const sev = opts.severity.toUpperCase();
        if (!VALID_SEVERITIES.includes(sev)) {
          const msg = `Invalid severity "${opts.severity}". Valid: ${VALID_SEVERITIES.join(", ")}`;
          if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
        }
      }
      if (opts.status) {
        if (!VALID_STATUSES.includes(opts.status.toLowerCase())) {
          const msg = `Invalid status "${opts.status}". Valid: ${VALID_STATUSES.join(", ")}`;
          if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
        }
      }

      try {
        const labelFilters: string[] = ["type:incident"];
        if (opts.severity) labelFilters.push(`severity:${opts.severity.toUpperCase()}`);
        if (opts.status)   labelFilters.push(`status:${opts.status.toLowerCase()}`);

        const { data: issues } = await octokit.issues.listForRepo({
          owner: target.owner,
          repo: target.repo,
          state: opts.all ? "all" : "open",
          labels: labelFilters.join(","),
          per_page: 50,
          sort: "created",
          direction: "desc",
        });

        let incidents = issues.filter((i) => i.pull_request == null);
        if (opts.service) {
          const svc = opts.service.toLowerCase();
          incidents = incidents.filter((i) => i.body?.toLowerCase().includes(svc));
        }

        if (json) {
          jsonOut(incidents.map((i) => ({
            id: incidentId(i.number),
            number: i.number,
            title: i.title.replace(/^\[[^\]]+\]\s*/, ""),
            severity: getSeverityFromLabels(i.labels as any),
            status:   getStatusFromLabels(i.labels as any),
            service:  extractField(i.body, "service"),
            created_at: i.created_at,
            url: i.html_url,
            assignees: i.assignees?.map((a) => a.login) ?? [],
          })));
        }

        if (incidents.length === 0) {
          console.log("No open incidents. ✅");
          return;
        }

        const table = formatTable(["ID", "Severity", "Status", "Service", "Title", "Age"]);
        incidents.forEach((i) => {
          const sev    = getSeverityFromLabels(i.labels as any);
          const status = getStatusFromLabels(i.labels as any);
          const svc    = extractField(i.body, "service") ?? "—";
          const ttl    = i.title.replace(/^\[[^\]]+\]\s*/, "").slice(0, 38);
          table.push([
            chalk.bold(incidentId(i.number)),
            `${severityDot(sev)} ${severityColor(sev)}`,
            statusColor(status),
            svc,
            ttl,
            formatAgeColored(i.created_at),
          ]);
        });

        console.log(`\n${chalk.bold(`Incidents (${incidents.length} ${opts.all ? "total" : "open"})`)}`);
        console.log(chalk.gray("─".repeat(70)));
        console.log(table.toString());
      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── SHOW ──────────────────────────────────────────────────────────────────────
  inc
    .command("show <id>")
    .description("Show full incident details with timeline")
    .option("--repo <owner/repo>", "Target repo")
    .option("--json",              "Output as JSON")
    .action(async (id: string, opts: { repo?: string; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const num = parseIncidentRef(id);
      if (isNaN(num) || num <= 0) {
        const msg = `Invalid incident ID: "${id}"`;
        if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
      }

      const octokit = createOctokit(auth!);
      try {
        const [{ data: issue }, { data: comments }] = await Promise.all([
          octokit.issues.get({ owner: target.owner, repo: target.repo, issue_number: num }),
          octokit.issues.listComments({ owner: target.owner, repo: target.repo, issue_number: num, per_page: 100 }),
        ]);

        const sev    = getSeverityFromLabels(issue.labels as any);
        const status = getStatusFromLabels(issue.labels as any);
        const svc    = extractField(issue.body, "service") ?? "—";
        const incId  = incidentId(issue.number);
        const title  = issue.title.replace(/^\[[^\]]+\]\s*/, "");

        // SLA (from triage comment)
        const triageComment = comments.find((c) => c.body?.includes("SLA Deadline") || c.body?.includes("SLA"));
        const slaLine = triageComment ? parseSlaFromComment(triageComment.body ?? "") : null;

        if (json) {
          jsonOut({
            id: incId, number: issue.number, title, severity: sev, status,
            service: svc, created_at: issue.created_at, updated_at: issue.updated_at,
            closed_at: issue.closed_at, url: issue.html_url,
            assignees: issue.assignees?.map((a) => a.login) ?? [],
            comments: comments.map((c) => ({
              id: c.id, body: c.body, author: c.user?.login, created_at: c.created_at,
            })),
          });
        }

        // Human output
        console.log("\n" + incidentBox(incId, sev, title));
        console.log("");
        const fieldW = 12;
        console.log(`${"Status".padEnd(fieldW)} ${statusColor(status)}`);
        console.log(`${"Service".padEnd(fieldW)} ${svc}`);
        console.log(`${"Created".padEnd(fieldW)} ${formatDateShort(issue.created_at)}`);
        console.log(`${"Updated".padEnd(fieldW)} ${formatDateShort(issue.updated_at)}`);
        if (slaLine) console.log(`${"SLA".padEnd(fieldW)} ${slaLine}`);
        const assignees = issue.assignees?.map((a) => "@" + a.login).join(", ") ?? "—";
        console.log(`${"Reporter".padEnd(fieldW)} @${issue.user?.login ?? "—"}`);
        if (assignees !== "—") console.log(`${"Assignee".padEnd(fieldW)} ${assignees}`);

        const desc = extractField(issue.body, "description");
        if (desc) {
          console.log("\n" + sectionHeader("Description"));
          console.log(desc.slice(0, 300));
        }

        if (comments.length > 0) {
          console.log("\n" + sectionHeader("Timeline"));
          comments.forEach((c) => {
            const time = new Date(c.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
            const firstLine = (c.body ?? "").split("\n")[0].slice(0, 80);
            console.log(`${chalk.dim(time)}  ${firstLine}`);
          });
        }

        console.log("\n" + chalk.dim(issue.html_url));

      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  inc
    .command("update <id>")
    .description("Change severity, service, or title of an incident")
    .option("--severity <P0-P3>",  "New severity level")
    .option("--service <name>",    "New service name")
    .option("--title <text>",      "New title (INC-XXX prefix is preserved)")
    .option("--repo <owner/repo>", "Target repo")
    .option("--json",              "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident update INC-001 --severity P1")}
  ${chalk.cyan("icf incident update INC-001 --severity P1 --service auth-svc")}
`)
    .action(async (id: string, opts: {
      severity?: string; service?: string; title?: string; repo?: string; json?: boolean;
    }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const num = parseIncidentRef(id);
      if (isNaN(num) || num <= 0) {
        const msg = `Invalid incident ID: "${id}"`;
        if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
      }

      if (!opts.severity && !opts.service && !opts.title) {
        const msg = "Specify at least one field to update: --severity, --service, --title";
        if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
      }

      const octokit = createOctokit(auth!);
      try {
        const { data: issue } = await octokit.issues.get({ owner: target.owner, repo: target.repo, issue_number: num });
        const incId   = incidentId(num);
        const oldSev  = getSeverityFromLabels(issue.labels as any);
        const changes: string[] = [];
        const timelineLines: string[] = [];

        let newLabels = (issue.labels as any[]).map((l) => l.name as string);

        // Severity swap
        if (opts.severity) {
          const newSev = opts.severity.toUpperCase();
          if (!VALID_SEVERITIES.includes(newSev)) {
            if (json) jsonError(`Invalid severity "${newSev}"`, EXIT.VALIDATION);
            errorLine(`Invalid severity "${newSev}"`); process.exit(EXIT.VALIDATION);
          }
          newLabels = newLabels.filter((l) => !l.startsWith("severity:"));
          newLabels.push(`severity:${newSev}`);
          changes.push(`severity: ${severityColor(oldSev)} → ${severityColor(newSev)}`);
          timelineLines.push(`${severityEmoji(newSev)} Severity changed from ${oldSev} → ${newSev} by @${auth!.github_user}`);
        }

        // Service update
        let newBody = issue.body ?? "";
        if (opts.service) {
          if (!/^[a-zA-Z0-9._\-/\s]{1,100}$/.test(opts.service)) {
            const msg = "Service name contains invalid characters (max 100 chars, alphanumeric + . _ - / space)";
            if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
          }
          newBody = updateBodyField(newBody, "service", opts.service);
          changes.push(`service: ${opts.service}`);
          timelineLines.push(`📝 Service updated to ${opts.service} by @${auth!.github_user}`);
        }

        // Title update
        const newTitle = opts.title
          ? `[${opts.severity?.toUpperCase() ?? oldSev}] ${opts.title}`
          : issue.title;

        await octokit.issues.update({
          owner: target.owner, repo: target.repo, issue_number: num,
          title: newTitle,
          body: newBody,
          labels: newLabels,
        });

        if (timelineLines.length > 0) {
          await octokit.issues.createComment({
            owner: target.owner, repo: target.repo, issue_number: num,
            body: timelineLines.join("\n"),
          });
        }

        if (json) {
          jsonOut({ id: incId, changes: changes.map((c) => c.replace(/\x1b\[[0-9;]*m/g, "")) });
        }

        success(`${incId} updated`);
        changes.forEach((c) => console.log(`  ${c}`));

      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── MITIGATE ──────────────────────────────────────────────────────────────────
  inc
    .command("mitigate <id>")
    .description("Transition incident to mitigating status")
    .option("-m, --message <text>", "Optional message to include in timeline")
    .option("--repo <owner/repo>",  "Target repo")
    .option("--json",               "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident mitigate INC-001")}
  ${chalk.cyan("icf incident mitigate INC-001 --message \"Identified root cause, deploying fix\"")}
`)
    .action(async (id: string, opts: { message?: string; repo?: string; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const num = parseIncidentRef(id);
      if (isNaN(num) || num <= 0) {
        if (json) jsonError(`Invalid incident ID: "${id}"`, EXIT.VALIDATION);
        errorLine(`Invalid incident ID`); process.exit(EXIT.VALIDATION);
      }

      const octokit = createOctokit(auth!);
      try {
        const { data: issue } = await octokit.issues.get({ owner: target.owner, repo: target.repo, issue_number: num });
        const incId  = incidentId(num);
        const status = getStatusFromLabels(issue.labels as any);

        if (status === "mitigating") {
          const msg = `${incId} is already mitigating`;
          if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
        }
        if (status === "resolved") {
          const msg = `${incId} is already resolved`;
          if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
        }

        const newLabels = (issue.labels as any[]).map((l) => l.name as string)
          .filter((l) => !l.startsWith("status:"));
        newLabels.push("status:mitigating");

        await octokit.issues.update({ owner: target.owner, repo: target.repo, issue_number: num, labels: newLabels });

        const commentLines = [`🟡 Status changed to mitigating by @${auth!.github_user}`];
        if (opts.message) commentLines.push(opts.message);
        await octokit.issues.createComment({
          owner: target.owner, repo: target.repo, issue_number: num,
          body: commentLines.join("\n"),
        });

        if (json) jsonOut({ id: incId, status: "mitigating" });
        success(`${incId} → mitigating`);

      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── COMMENT ───────────────────────────────────────────────────────────────────
  inc
    .command("comment <id>")
    .description("Add a timestamped timeline entry to an incident")
    .option("-m, --message <text>", "Comment text (or pipe via stdin)")
    .option("--repo <owner/repo>",  "Target repo")
    .option("--json",               "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident comment INC-001 --message \"Found memory leak in pool\"")}
  ${chalk.cyan("echo \"Rollback initiated\" | icf incident comment INC-001")}
  ${chalk.cyan("icf incident comment INC-001 -m \"Deploy complete\" --json")}
`)
    .action(async (id: string, opts: { message?: string; repo?: string; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const num = parseIncidentRef(id);
      if (isNaN(num) || num <= 0) {
        if (json) jsonError(`Invalid incident ID: "${id}"`, EXIT.VALIDATION);
        errorLine(`Invalid incident ID`); process.exit(EXIT.VALIDATION);
      }

      // Message from flag or stdin
      let message = opts.message;
      if (!message && !process.stdin.isTTY) {
        message = readFileSync("/dev/stdin", "utf8").trim();
      }
      if (!message) {
        const { m } = await prompt({ type: "input", name: "m", message: "Timeline entry:" }) as { m: string };
        message = m;
      }

      const octokit = createOctokit(auth!);
      try {
        const incId = incidentId(num);
        const body  = `📝 ${message}\n— @${auth!.github_user} · ${new Date().toLocaleString()}`;
        const { data: comment } = await octokit.issues.createComment({
          owner: target.owner, repo: target.repo, issue_number: num, body,
        });

        if (json) jsonOut({ comment_id: comment.id, url: comment.html_url });
        success(`Comment added to ${incId}`);

      } catch (err) {
        handleError(err, opts);
      }
    });

  // ── RESOLVE ───────────────────────────────────────────────────────────────────
  inc
    .command("resolve <id>")
    .description("Close an incident and post final RCA timeline entry")
    .option("--rca <text>",        "Root cause analysis text")
    .option("--rca-file <path>",   "Read RCA from a markdown file")
    .option("--repo <owner/repo>", "Target repo")
    .option("--json",              "Output as JSON")
    .addHelpText("after", `
${chalk.dim("Examples:")}
  ${chalk.cyan("icf incident resolve INC-001 --rca \"Increased pool size to 200, deployed v1.2.3\"")}
  ${chalk.cyan("icf incident resolve INC-001 --rca-file ./rca-inc001.md")}
`)
    .action(async (id: string, opts: { rca?: string; rcaFile?: string; repo?: string; json?: boolean }) => {
      const auth = getAuth();
      if (!auth) requireAuth(opts);

      const json = isJsonMode(opts);
      const target = getRepoOrDie(opts);
      const num = parseIncidentRef(id);
      if (isNaN(num) || num <= 0) {
        if (json) jsonError(`Invalid incident ID: "${id}"`, EXIT.VALIDATION);
        errorLine(`Invalid incident ID`); process.exit(EXIT.VALIDATION);
      }

      const octokit = createOctokit(auth!);
      try {
        const { data: issue } = await octokit.issues.get({ owner: target.owner, repo: target.repo, issue_number: num });
        const incId  = incidentId(num);
        const status = getStatusFromLabels(issue.labels as any);

        if (status === "resolved" && issue.state === "closed") {
          const msg = `${incId} is already resolved`;
          if (json) jsonError(msg, EXIT.VALIDATION); errorLine(msg); process.exit(EXIT.VALIDATION);
        }

        // RCA from flag, file, or prompt
        let rca = opts.rca;
        if (!rca && opts.rcaFile) {
          if (!existsSync(opts.rcaFile)) {
            if (json) jsonError(`File not found: ${opts.rcaFile}`, EXIT.VALIDATION);
            errorLine(`File not found: ${opts.rcaFile}`); process.exit(EXIT.VALIDATION);
          }
          rca = readFileSync(opts.rcaFile, "utf8").trim();
        }
        // NIT-02: prompt for RCA in interactive mode instead of accepting null silently.
        // In JSON / non-TTY mode, allow empty RCA (some automations may not know it yet).
        if (!rca && process.stdin.isTTY && !json) {
          const { rcaInput } = await prompt({
            type: "input", name: "rcaInput",
            message: "Root cause analysis (leave blank to skip):",
          }) as { rcaInput: string };
          if (rcaInput.trim()) rca = rcaInput.trim();
        }

        const durationMins = Math.floor((Date.now() - new Date(issue.created_at).getTime()) / 60000);
        const resolvedAt = new Date().toISOString();

        const newLabels = (issue.labels as any[]).map((l) => l.name as string)
          .filter((l) => !l.startsWith("status:"));
        newLabels.push("status:resolved");

        await octokit.issues.update({
          owner: target.owner, repo: target.repo, issue_number: num,
          labels: newLabels,
          state: "closed",
        });

        const commentLines = [
          `✅ Incident resolved by @${auth!.github_user}`,
          `Duration: ${formatDuration(durationMins)}`,
        ];
        if (rca) commentLines.push(`RCA: ${rca}`);

        await octokit.issues.createComment({
          owner: target.owner, repo: target.repo, issue_number: num,
          body: commentLines.join("\n"),
        });

        if (json) {
          jsonOut({ id: incId, status: "resolved", resolved_at: resolvedAt, duration_minutes: durationMins, rca: rca ?? null });
        }

        success(`${incId} resolved`);
        console.log(`  Duration: ${formatDuration(durationMins)}`);
        if (rca) console.log(`  RCA: ${rca.slice(0, 80)}`);

      } catch (err) {
        handleError(err, opts);
      }
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildIssueBody(service: string, severity: string, description: string, reporter: string): string {
  return [
    `**Service:** ${service}`,
    `**Severity:** ${severity}`,
    `**Reporter:** @${reporter}`,
    `**Created:** ${new Date().toISOString()}`,
    "",
    "**Description:**",
    description,
  ].join("\n");
}

function extractField(body: string | null | undefined, field: string): string | null {
  if (!body) return null;
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, "i");
  const m = re.exec(body);
  return m ? m[1].trim() : null;
}

function updateBodyField(body: string, field: string, value: string): string {
  const re = new RegExp(`(\\*\\*${field}:\\*\\*\\s*)(.+)`, "i");
  if (re.test(body)) return body.replace(re, `$1${value}`);
  return body + `\n**${field}:** ${value}`;
}

function parseSlaFromComment(body: string): string | null {
  const m = /Deadline.*?(\d{1,2}:\d{2}\s*UTC)/i.exec(body);
  return m ? m[1] : null;
}
