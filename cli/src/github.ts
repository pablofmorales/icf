import { Octokit } from "@octokit/rest";
import { AuthConfig } from "./config.js";

export { Octokit };

export function createOctokit(auth: AuthConfig): Octokit {
  return new Octokit({ auth: auth.github_token });
}

// ── Label definitions (from Pato's spec) ─────────────────────────────────────

export const ICF_LABELS = [
  // Severity
  { name: "severity:P0", color: "FF0000", description: "Critical — full outage or data loss risk" },
  { name: "severity:P1", color: "FF8C00", description: "High — major feature degradation" },
  { name: "severity:P2", color: "FFD700", description: "Medium — partial feature degradation" },
  { name: "severity:P3", color: "4A9EFF", description: "Low — minor issue or cosmetic" },
  // Status
  { name: "status:open",       color: "d73a4a", description: "Incident is open" },
  { name: "status:mitigating", color: "e4e669", description: "Mitigation in progress" },
  { name: "status:resolved",   color: "0e8a16", description: "Incident resolved" },
  // Type
  { name: "type:incident",  color: "b60205", description: "Production incident" },
  { name: "type:postmortem",color: "5319e7", description: "Post-mortem review"  },
];

export const SEVERITY_LABELS = ICF_LABELS.filter((l) => l.name.startsWith("severity:"));
export const STATUS_LABELS   = ICF_LABELS.filter((l) => l.name.startsWith("status:"));

/** Zero-pad incident number to 3 digits: 5 → INC-005 */
export function incidentId(n: number): string {
  return `INC-${String(n).padStart(3, "0")}`;
}

/** Parse INC-005 or "5" → 5. Returns NaN on failure. */
export function parseIncidentRef(ref: string): number {
  const m = /^(?:INC-)?(\d+)$/i.exec(ref.trim());
  return m ? parseInt(m[1], 10) : NaN;
}

/** Extract severity string from issue labels */
export function getSeverityFromLabels(labels: Array<{ name: string }>): string {
  const l = labels.find((l) => l.name.startsWith("severity:"));
  return l ? l.name.replace("severity:", "") : "P3";
}

/** Extract status string from issue labels */
export function getStatusFromLabels(labels: Array<{ name: string }>): string {
  const l = labels.find((l) => l.name.startsWith("status:"));
  return l ? l.name.replace("status:", "") : "open";
}
