import chalk from "chalk";
import Table from "cli-table3";

export const SEVERITY_COLORS: Record<string, (s: string) => string> = {
  P0: (s) => chalk.bgRed.white.bold(s),
  P1: (s) => chalk.red.bold(s),
  P2: (s) => chalk.yellow(s),
  P3: (s) => chalk.blue(s),
};

export const STATUS_COLORS: Record<string, (s: string) => string> = {
  open: (s) => chalk.red(s),
  investigating: (s) => chalk.yellow(s),
  mitigating: (s) => chalk.cyan(s),
  monitoring: (s) => chalk.blue(s),
  resolved: (s) => chalk.green(s),
};

export function createTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
    chars: {
      top: "─", "top-mid": "┬", "top-left": "╭", "top-right": "╮",
      bottom: "─", "bottom-mid": "┴", "bottom-left": "╰", "bottom-right": "╯",
      left: "│", "left-mid": "├", mid: "─", "mid-mid": "┼",
      right: "│", "right-mid": "┤", middle: "│",
    },
  });
}

export function success(msg: string): void {
  console.log(chalk.green("✅ " + msg));
}

export function error(msg: string): void {
  console.error(chalk.red("❌ " + msg));
}

export function warn(msg: string): void {
  console.warn(chalk.yellow("⚠️  " + msg));
}

export function info(msg: string): void {
  console.log(chalk.blue("ℹ️  " + msg));
}

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

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
