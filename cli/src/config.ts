import Conf from "conf";

export interface AuthConfig {
  github_token: string;
  github_user: string;
  authenticated_at: string;
}

export interface RepoConfig {
  owner: string;
  repo: string;
}

export interface IcfConfig {
  auth?: AuthConfig;
  repo?: RepoConfig;
}

const store = new Conf<IcfConfig>({ projectName: "icf", schema: {} });

export const getAuth   = (): AuthConfig | undefined => store.get("auth");
export const saveAuth  = (auth: AuthConfig): void   => store.set("auth", auth);
export const clearAuth = (): void                   => store.delete("auth");

export const getRepo   = (): RepoConfig | undefined => store.get("repo");
export const saveRepo  = (r: RepoConfig): void      => store.set("repo", r);

export const getConfigPath = (): string => store.path;
