# Reporting Security Vulnerabilities

If you discover a security vulnerability in ICF or in this incident repository, **do not open a public GitHub issue**.

## Contact

**Email:** pablo@blackasteroid.com.ar  
**Response time:** We aim to acknowledge within 48 hours and provide a fix or mitigation within 7 days for critical issues.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

We will credit you in release notes unless you prefer to remain anonymous.

## Scope

| In scope | Out of scope |
|----------|-------------|
| ICF CLI (`cli/`) | Third-party GitHub Actions |
| GitHub workflow configurations | GitHub platform itself |
| Authentication / token handling | Self-hosted runner infrastructure |

## Known Considerations

- **GitHub tokens** are stored in plaintext at `~/.config/icf-nodejs/config.json` with `0600` permissions. OS-level keychain integration is planned.
- **Workflow secrets** (`GH_PAT`, `OPENCLAW_GATEWAY_TOKEN`) are only exposed to PRs from within this repository — fork PRs are blocked at the job level.
- **Service names and incident fields** are validated server-side by the GitHub API and client-side by the CLI before submission.
