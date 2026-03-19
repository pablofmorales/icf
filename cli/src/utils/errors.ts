import { errorLine, isJsonMode, jsonError } from "./format.js";

export const EXIT = {
  OK: 0,
  GENERAL: 1,
  NETWORK: 2,
  NOT_FOUND: 3,
  AUTH: 4,
  VALIDATION: 5,
} as const;

function codeFor(err: unknown): number {
  if (!(err instanceof Error)) return EXIT.GENERAL;
  const m = err.message.toLowerCase();
  if (m.includes("401") || m.includes("bad credentials") || m.includes("unauthorized")) return EXIT.AUTH;
  if (m.includes("404") || m.includes("not found")) return EXIT.NOT_FOUND;
  if (m.includes("fetch") || m.includes("econnrefused") || m.includes("network")) return EXIT.NETWORK;
  return EXIT.GENERAL;
}

export function handleError(err: unknown, opts?: { json?: boolean }): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (isJsonMode(opts)) jsonError(msg, codeFor(err));
  errorLine(msg);
  process.exit(codeFor(err));
}

export function requireAuth(opts?: { json?: boolean }): never {
  const msg = "Not authenticated. Run icf auth login first.";
  if (isJsonMode(opts)) jsonError(msg, EXIT.AUTH);
  errorLine(msg);
  process.exit(EXIT.AUTH);
}

export function requireRepo(opts?: { json?: boolean }): never {
  const msg = "No incident repo configured. Run icf init <owner/repo> first.";
  if (isJsonMode(opts)) jsonError(msg, EXIT.VALIDATION);
  errorLine(msg);
  process.exit(EXIT.VALIDATION);
}
