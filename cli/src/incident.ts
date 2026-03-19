/**
 * ICF Incident data model.
 * Incidents are stored as GitHub Issues with a structured body (JSON block).
 */

export type Severity = "P0" | "P1" | "P2" | "P3";
export type IncidentStatus = "open" | "investigating" | "mitigating" | "monitoring" | "resolved";
export type BlastRadius = "all-users" | "region" | "single-tenant" | "internal";

export interface IncidentEvidence {
  type: "log" | "metric" | "screenshot" | "url";
  source: string;
  url?: string;
}

export interface IncidentBody {
  icf_version: "1";
  severity: Severity;
  status: IncidentStatus;
  service: string;
  blast_radius?: BlastRadius;
  description: string;
  evidence?: IncidentEvidence[];
  detected_at: string;
  detected_by: string;
  runbook?: string;
  root_cause?: string;
  resolved_at?: string;
  resolved_by?: string;
  follow_up?: string[];
}

export interface Incident {
  id: string;           // INC-{number}
  number: number;       // GitHub issue number
  title: string;
  data: IncidentBody;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  assignees: string[];
  comments: number;
}

// ── Markers used to embed structured data in issue body ───────────────────

const JSON_OPEN = "<!-- ICF_DATA_START\n";
const JSON_CLOSE = "\n ICF_DATA_END -->";

/**
 * Serialize an IncidentBody into a GitHub issue body (human-readable + machine-readable).
 */
export function renderIssueBody(data: IncidentBody, description?: string): string {
  const severityEmoji: Record<Severity, string> = { P0: "🔴", P1: "🟠", P2: "🟡", P3: "🔵" };
  const statusEmoji: Record<IncidentStatus, string> = {
    open: "🔥", investigating: "🔍", mitigating: "⚙️", monitoring: "👀", resolved: "✅"
  };

  const humanPart = [
    `## ${severityEmoji[data.severity]} ${data.severity} — ${statusEmoji[data.status]} ${data.status.toUpperCase()}`,
    "",
    `**Service:** ${data.service}`,
    data.blast_radius ? `**Blast Radius:** ${data.blast_radius}` : null,
    `**Detected:** ${new Date(data.detected_at).toISOString()} by \`${data.detected_by}\``,
    data.runbook ? `**Runbook:** \`${data.runbook}\`` : null,
    "",
    "### Description",
    description ?? data.description,
    "",
  ].filter((l) => l !== null).join("\n");

  const evidencePart = data.evidence?.length
    ? [
        "### Evidence",
        ...data.evidence.map((e) => `- **[${e.type}]** ${e.source}${e.url ? ` → [link](${e.url})` : ""}`),
        "",
      ].join("\n")
    : "";

  const resolvedPart = data.status === "resolved" && data.root_cause
    ? [
        "### Resolution",
        `**Root Cause:** ${data.root_cause}`,
        data.resolved_at ? `**Resolved At:** ${new Date(data.resolved_at).toISOString()}` : "",
        data.resolved_by ? `**Resolved By:** \`${data.resolved_by}\`` : "",
        "",
      ].filter(Boolean).join("\n")
    : "";

  const machineBlock = `${JSON_OPEN}${JSON.stringify(data, null, 2)}${JSON_CLOSE}`;

  return [humanPart, evidencePart, resolvedPart, machineBlock].filter(Boolean).join("\n");
}

/**
 * Parse the ICF structured data from a GitHub issue body.
 * Returns null if the body is not an ICF incident.
 */
export function parseIssueBody(body: string | null): IncidentBody | null {
  if (!body) return null;
  const start = body.indexOf(JSON_OPEN);
  const end = body.indexOf(JSON_CLOSE);
  if (start === -1 || end === -1) return null;
  try {
    const raw = body.slice(start + JSON_OPEN.length, end);
    const data = JSON.parse(raw) as IncidentBody;
    if (data.icf_version !== "1") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Extract the incident number from an INC-NNN label or issue title.
 */
export function incidentId(issueNumber: number): string {
  return `INC-${issueNumber}`;
}

/**
 * Parse "INC-123" → 123. Returns NaN if invalid.
 */
export function parseIncidentId(id: string): number {
  const match = /^(?:INC-)?(\d+)$/i.exec(id.trim());
  return match ? parseInt(match[1], 10) : NaN;
}

// ── ICF label definitions ─────────────────────────────────────────────────

export const ICF_LABELS = [
  // Severity
  { name: "severity: P0", color: "d73a4a", description: "Critical — full outage or data loss risk" },
  { name: "severity: P1", color: "e4e669", description: "High — major feature degradation" },
  { name: "severity: P2", color: "0075ca", description: "Medium — partial degradation" },
  { name: "severity: P3", color: "cfd3d7", description: "Low — minor issue or cosmetic" },
  // Status
  { name: "status: open", color: "d73a4a", description: "Incident is open and unacknowledged" },
  { name: "status: investigating", color: "e4e669", description: "Actively investigating root cause" },
  { name: "status: mitigating", color: "0052cc", description: "Mitigation in progress" },
  { name: "status: monitoring", color: "0075ca", description: "Fix deployed, monitoring for stability" },
  { name: "status: resolved", color: "0e8a16", description: "Incident resolved" },
  // Type
  { name: "type: incident", color: "b60205", description: "Production incident" },
  { name: "type: post-mortem", color: "5319e7", description: "Post-mortem review" },
  { name: "type: runbook", color: "006b75", description: "Runbook document" },
  // ICF marker
  { name: "icf", color: "1d76db", description: "Managed by ICF" },
];
