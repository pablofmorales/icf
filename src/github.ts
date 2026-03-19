import { AuthConfig } from "./config.js";

export interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string; color: string; description?: string | null }>;
  assignees: Array<{ login: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  comments: number;
}

export interface GhLabel {
  name: string;
  color: string;
  description?: string;
}

export interface GhComment {
  id: number;
  body: string;
  created_at: string;
  user: { login: string };
  html_url: string;
}

export class GitHubClient {
  private token: string;
  private baseUrl = "https://api.github.com";

  constructor(auth: AuthConfig) {
    this.token = auth.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "icf-cli/0.1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      let errMsg = `GitHub API error: ${res.status} ${res.statusText}`;
      try {
        const json = await res.json() as { message?: string };
        if (json.message) errMsg = `GitHub API error: ${json.message} (${res.status})`;
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  async getAuthenticatedUser(): Promise<{ login: string; name: string | null }> {
    return this.request("GET", "/user");
  }

  // ── Repos ─────────────────────────────────────────────────────────────────

  async createRepo(org: string, name: string, opts: {
    description?: string;
    private?: boolean;
    has_issues?: boolean;
    has_projects?: boolean;
  } = {}): Promise<{ html_url: string; full_name: string }> {
    return this.request("POST", `/orgs/${org}/repos`, {
      name,
      description: opts.description ?? "Incident management powered by ICF",
      private: opts.private ?? true,
      has_issues: opts.has_issues ?? true,
      has_projects: opts.has_projects ?? true,
      auto_init: true,
    });
  }

  async repoExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.request("GET", `/repos/${owner}/${repo}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async listLabels(owner: string, repo: string): Promise<GhLabel[]> {
    return this.request("GET", `/repos/${owner}/${repo}/labels?per_page=100`);
  }

  async createLabel(owner: string, repo: string, label: GhLabel): Promise<GhLabel> {
    return this.request("POST", `/repos/${owner}/${repo}/labels`, label);
  }

  async deleteLabel(owner: string, repo: string, name: string): Promise<void> {
    return this.request("DELETE", `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`);
  }

  async upsertLabel(owner: string, repo: string, label: GhLabel): Promise<void> {
    try {
      await this.request("PATCH", `/repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`, label);
    } catch {
      await this.createLabel(owner, repo, label);
    }
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  async createIssue(owner: string, repo: string, opts: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<GhIssue> {
    return this.request("POST", `/repos/${owner}/${repo}/issues`, opts);
  }

  async updateIssue(owner: string, repo: string, number: number, opts: {
    title?: string;
    body?: string;
    state?: "open" | "closed";
    labels?: string[];
    assignees?: string[];
  }): Promise<GhIssue> {
    return this.request("PATCH", `/repos/${owner}/${repo}/issues/${number}`, opts);
  }

  async getIssue(owner: string, repo: string, number: number): Promise<GhIssue> {
    return this.request("GET", `/repos/${owner}/${repo}/issues/${number}`);
  }

  async listIssues(owner: string, repo: string, opts: {
    state?: "open" | "closed" | "all";
    labels?: string;
    per_page?: number;
    page?: number;
    assignee?: string;
  } = {}): Promise<GhIssue[]> {
    const params = new URLSearchParams();
    if (opts.state) params.set("state", opts.state);
    if (opts.labels) params.set("labels", opts.labels);
    if (opts.per_page) params.set("per_page", String(opts.per_page));
    if (opts.page) params.set("page", String(opts.page));
    if (opts.assignee) params.set("assignee", opts.assignee);
    const qs = params.toString();
    return this.request("GET", `/repos/${owner}/${repo}/issues${qs ? `?${qs}` : ""}`);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async addComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GhComment> {
    return this.request("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
  }

  async listComments(owner: string, repo: string, issueNumber: number): Promise<GhComment[]> {
    return this.request("GET", `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
  }

  // ── File contents ─────────────────────────────────────────────────────────

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<void> {
    await this.request("PUT", `/repos/${owner}/${repo}/contents/${path}`, {
      message,
      content: Buffer.from(content).toString("base64"),
      ...(sha ? { sha } : {}),
    });
  }

  async getFileSha(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const res = await this.request<{ sha: string }>("GET", `/repos/${owner}/${repo}/contents/${path}`);
      return res.sha;
    } catch {
      return null;
    }
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  async createWebhook(owner: string, repo: string, opts: {
    url: string;
    events?: string[];
    secret?: string;
  }): Promise<{ id: number }> {
    return this.request("POST", `/repos/${owner}/${repo}/hooks`, {
      name: "web",
      active: true,
      events: opts.events ?? ["issues", "issue_comment"],
      config: {
        url: opts.url,
        content_type: "json",
        secret: opts.secret,
      },
    });
  }
}

export function createGitHubClient(auth: AuthConfig): GitHubClient {
  return new GitHubClient(auth);
}
