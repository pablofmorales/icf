# icf — Incident Command Framework

Manage service incidents through GitHub Issues from your terminal. Every incident is a GitHub issue with structured labels and a timeline of comments — no third-party tools, no vendor lock-in, and a full audit trail in your existing GitHub org.

## Install

### Homebrew (macOS / Linux)

```bash
brew tap BlackAsteroid/tap
brew install icf
```

### npm

```bash
npm install -g @blackasteroid/icf
```

Or try it without installing:

```bash
npx @blackasteroid/icf auth login
```

## Quick start

```bash
# 1. Authenticate
icf auth login

# 2. Set up your incident repo (creates labels, templates, workflows)
icf init my-org/incidents --create

# 3. Open an incident
icf incident create \
  --severity P1 \
  --service api-gateway \
  --title "High latency on checkout" \
  --description "p99 > 3s since 14:20 UTC"

# 4. Add a timeline entry
icf incident comment INC-001 --message "Identified db query regression"

# 5. Mark as mitigating
icf incident mitigate INC-001 --message "Rolling back to v1.4.2"

# 6. Resolve with root cause
icf incident resolve INC-001 --rca "Unindexed query introduced in v1.4.3, rolled back"
```

## Commands

### `icf auth`

```bash
icf auth login                    # Prompted for a GitHub token
icf auth login --token '$TOKEN'   # Token from env var (recommended in scripts)
icf auth status
icf auth logout
```

Token needs these scopes: `repo`, `workflow`, `write:packages`.  
Create one at: [github.com/settings/tokens/new?scopes=repo,workflow,write:packages&description=icf-cli](https://github.com/settings/tokens/new?scopes=repo,workflow,write:packages&description=icf-cli)

### `icf init <owner/repo>`

Sets up a GitHub repo for incident tracking. Creates severity and status labels, an issue template, a milestone, and two GitHub Actions workflows (triage and escalation).

```bash
icf init my-org/incidents              # Configure an existing repo
icf init my-org/incidents --create     # Create the repo first, then configure
icf init my-org/incidents --create --public
icf init my-org/incidents --no-workflows   # Skip pushing GitHub Actions
```

### `icf incident`

```bash
# Open an incident
icf incident create --severity P0 --service payments --title "DB unreachable" --description "..."

# List
icf incident list                       # Open incidents
icf incident list --severity P0         # Filter by severity
icf incident list --status mitigating   # Filter by status
icf incident list --all                 # Include resolved

# View
icf incident show INC-001

# Update severity or service
icf incident update INC-001 --severity P1
icf incident update INC-001 --service auth-svc --severity P2

# Add a timeline entry
icf incident comment INC-001 --message "Deployed hotfix, monitoring"
icf incident comment INC-001 -m "Rollback complete"
echo "Status update" | icf incident comment INC-001

# Mark as mitigating
icf incident mitigate INC-001
icf incident mitigate INC-001 --message "Fix deployed, watching metrics"

# Resolve
icf incident resolve INC-001 --rca "Root cause description"
icf incident resolve INC-001 --rca-file ./rca.md
```

### `icf config`

```bash
icf config show
icf config validate
icf config validate --repo my-org/incidents
```

### `icf upgrade`

```bash
icf upgrade           # Update to latest published version
icf upgrade --json
```

## Severity levels

| Level | Meaning |
|-------|---------|
| P0 | Critical — full outage or data loss |
| P1 | High — major feature broken |
| P2 | Medium — partial degradation |
| P3 | Low — minor issue |

## Incident lifecycle

`open` → `mitigating` → `resolved`

Each transition posts a timeline comment. Resolved incidents are closed as GitHub issues.

---

## Using icf as an agent

icf is designed to be operated by AI agents. Every command produces machine-readable output and accepts structured input.

### JSON output mode

Add `--json` to any command, or set `ICF_JSON=1` globally:

```bash
# Single command
icf incident list --json

# All commands for this session
ICF_JSON=1 icf incident create --severity P1 --service api --title "Down"
```

### Response envelope

All responses follow the same shape:

```json
// Success
{ "ok": true, "data": { ... } }

// Error
{ "ok": false, "error": "Incident INC-999 not found", "code": 3 }
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Network error |
| 3 | Not found |
| 4 | Auth error |
| 5 | Validation error |

### Creating incidents from a JSON payload

Agents can pipe a JSON object directly to `incident create`:

```bash
# Inline flag
icf incident create \
  --input-json '{"title":"DB latency","service":"postgres","severity":"P1","description":"p99 > 5s"}' \
  --json

# Stdin pipe
echo '{"title":"DB latency","service":"postgres","severity":"P1","description":"p99 > 5s"}' \
  | icf incident create --input-json --json

# From a file
cat incident-payload.json | icf incident create --input-json --json
```

Required fields in the payload: `title`, `severity`. Optional: `service`, `description`, `assign`.

### Full agent pipeline

```bash
# 1. Create
INC=$(icf incident create \
  --severity P1 --service api --title "Latency spike" --description "p99 > 3s" \
  --json | jq -r '.data.id')

# 2. Add investigation notes
icf incident comment $INC --message "Traced to db query regression" --json

# 3. Mark as mitigating
icf incident mitigate $INC --message "Rollback initiated" --json

# 4. Resolve
icf incident resolve $INC --rca "Rolled back v1.4.3, issue fixed" --json
```

### Version check

```bash
icf version --json
# → { "ok": true, "data": { "version": "1.1.0", "name": "@blackasteroid/icf" } }

icf --version --json
# → same
```

---

## Security

Report vulnerabilities privately to **security@blackasteroid.com.ar**. See [SECURITY.md](./SECURITY.md).

## License

MIT — [Black Asteroid](https://blackasteroid.com.ar)
