import Conf from "conf";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

export interface AuthConfig {
  token: string;
  login: string;
  name?: string;
}

export interface IcfRepoConfig {
  org: string;
  repo: string;
  timezone?: string;
}

export interface IcfConfig {
  auth?: AuthConfig;
  repo?: IcfRepoConfig;
}

const conf = new Conf<IcfConfig>({
  projectName: "icf",
  schema: {},
});

export function getAuth(): AuthConfig | undefined {
  return conf.get("auth");
}

export function saveAuth(auth: AuthConfig): void {
  conf.set("auth", auth);
}

export function clearAuth(): void {
  conf.delete("auth");
}

export function getRepoConfig(): IcfRepoConfig | undefined {
  return conf.get("repo");
}

export function saveRepoConfig(repo: IcfRepoConfig): void {
  conf.set("repo", repo);
}

export function getConfigPath(): string {
  return conf.path;
}

/** Read the local icf.yml from the current directory or a given path */
export function readLocalConfig(dir = process.cwd()): Record<string, unknown> | null {
  const candidates = [
    join(dir, "config", "icf.yml"),
    join(dir, "icf.yml"),
    join(dir, ".icf.yml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return yaml.load(readFileSync(p, "utf8")) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}
