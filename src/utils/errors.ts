import { error, isJsonMode, jsonError } from "./output.js";

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL: 1,
  NETWORK: 2,
  NOT_FOUND: 3,
  AUTH: 4,
  VALIDATION: 5,
} as const;

function exitCodeFor(err: unknown): number {
  if (!(err instanceof Error)) return EXIT_CODES.GENERAL;
  const msg = err.message.toLowerCase();
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("bad credentials")) return EXIT_CODES.AUTH;
  if (msg.includes("404") || msg.includes("not found")) return EXIT_CODES.NOT_FOUND;
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused")) return EXIT_CODES.NETWORK;
  return EXIT_CODES.GENERAL;
}

export function handleError(err: unknown, opts?: { json?: boolean }): never {
  const message = err instanceof Error ? err.message : String(err);
  const code = exitCodeFor(err);
  if (isJsonMode(opts)) jsonError(message, code);
  error(message);
  process.exit(code);
}

export function requireAuth(opts?: { json?: boolean }): never {
  const message = "Not authenticated. Run: icf auth login";
  if (isJsonMode(opts)) jsonError(message, EXIT_CODES.AUTH);
  error(message);
  process.exit(EXIT_CODES.AUTH);
}
