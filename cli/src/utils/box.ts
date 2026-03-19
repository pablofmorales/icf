/**
 * Header box for `icf incident show` — per Pato's visual spec.
 * Box border color = severity color.
 */
import chalk from "chalk";
import { severityColor } from "./format.js";

function borderColor(sev: string): (s: string) => string {
  switch (sev) {
    case "P0": return chalk.red;
    case "P1": return chalk.yellow;
    case "P2": return chalk.yellow;
    case "P3": return chalk.blue;
    default:   return chalk.gray;
  }
}

export function incidentBox(
  incidentId: string,
  severity: string,
  title: string
): string {
  const color = borderColor(severity);
  const inner = ` ${color("●")} ${severityColor(severity)}  ${incidentId} — ${title} `;
  const width = Math.max(inner.replace(/\x1b\[[0-9;]*m/g, "").length + 2, 54);
  const top    = color("╔" + "═".repeat(width) + "╗");
  const mid    = color("║") + inner.padEnd(width + inner.length - inner.replace(/\x1b\[[0-9;]*m/g, "").length) + color("║");
  const bottom = color("╚" + "═".repeat(width) + "╝");
  return [top, mid, bottom].join("\n");
}

export function divider(width = 54): string {
  return chalk.gray("─".repeat(width));
}

export function sectionHeader(title: string): string {
  return chalk.bold.white(title) + "\n" + chalk.gray("─".repeat(title.length));
}
