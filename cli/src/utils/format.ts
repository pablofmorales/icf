/**
 * Visual formatting utilities — all chalk calls go through here.
 * No inline color logic in command files (per Pato's spec).
 */
import chalk from "chalk";
import Table from "cli-table3";

// ── Severity ──────────────────────────────────────────────────────────────────

export function severityColor(sev: string): string {
  switch (sev) {
    case "P0": return chalk.bold.red(sev);
    case "P1": return chalk.bold.yellow(sev);
    case "P2": return chalk.yellow(sev);
    case "P3": return chalk.blue(sev);
    default:   return chalk.gray(sev);
  }
}

export function severityDot(sev: string): string {
  switch (sev) {
    case "P0": return chalk.bold.red("●");
    case "P1": return chalk.bold.yellow("●");
    case "P2": return chalk.yellow("●");
    case "P3": return chalk.blue("●");
    default:   return chalk.gray("●");
  }
}

export function severityEmoji(sev: string): string {
  const map: Record<string, string> = { P0: "🔴", P1: "🟠", P2: "🟡", P3: "🔵" };
  return map[sev] ?? "⚪";
}

// ── Status ────────────────────────────────────────────────────────────────────

export function statusColor(status: string): string {
  switch (status) {
    case "open":         return chalk.red(status);
    case "mitigating":   return chalk.yellow(status);
    case "resolved":     return chalk.green(status);
    default:             return chalk.gray(status);
  }
}

export function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    open: "🔴", mitigating: "🟡", resolved: "✅",
  };
  return map[status] ?? "⚪";
}

// ── Age / Time ────────────────────────────────────────────────────────────────

/** Returns "47m", "2h 3m", "1d 4h" */
export function formatAge(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** Color-code age: < 1h → red, < 4h → yellow, else gray */
export function formatAgeColored(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  const label = formatAge(dateStr);
  if (mins < 60) return chalk.red(label);
  if (mins < 240) return chalk.yellow(label);
  return chalk.gray(label);
}

/** "Wed Mar 19 00:14 GMT-3" style */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

/** Duration in minutes → "1h 3m" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function formatTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((h) => chalk.gray(h)),
    style: { head: [], border: ["gray"] },
    chars: {
      top: "─", "top-mid": "─", "top-left": "─", "top-right": "─",
      bottom: "─", "bottom-mid": "─", "bottom-left": "─", "bottom-right": "─",
      left: "", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: "  ",
    },
  });
}

// ── Output helpers ────────────────────────────────────────────────────────────

export function success(msg: string): void {
  console.log(chalk.green("✅ " + msg));
}

export function errorLine(msg: string): void {
  console.error(chalk.red("✖ " + msg));
}

export function warnLine(msg: string): void {
  console.warn(chalk.yellow("⚠  " + msg));
}

// ── JSON mode ─────────────────────────────────────────────────────────────────

export function isJsonMode(opts?: { json?: boolean }): boolean {
  if (opts?.json) return true;
  const env = process.env["ICF_JSON"];
  return env === "1" || env === "true" || env === "yes";
}

export function jsonOut(data: unknown, exitCode = 0): never {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
  process.exit(exitCode);
}

export function jsonError(message: string, code = 1): never {
  console.log(JSON.stringify({ ok: false, error: message, code }, null, 2));
  process.exit(code);
}
