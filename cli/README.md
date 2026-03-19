# 🚨 ICF — Incident Command Framework

CLI-first incident management backed by GitHub. Designed for AI agents and DevOps teams.

## Install

```bash
npm install -g @blackasteroid/icf
```

## Quick Start

```bash
# 1. Authenticate
icf auth login

# 2. Bootstrap an incident repo
icf init BlackAsteroid/incidents

# 3. Create an incident
icf incident create --severity P1 --service api-gateway --description "Latency spike"

# 4. Update status
icf incident update INC-1 --status investigating

# 5. Add timeline events
icf incident timeline INC-1 --event "Found db connection pool exhaustion"

# 6. Resolve
icf incident resolve INC-1 --root-cause "Increased pool size, deployed fix"
```

## Commands

### `icf auth`
```
icf auth login [--token '$GITHUB_TOKEN']
icf auth logout
icf auth status
```

### `icf init <org/repo>`
Bootstraps a GitHub repo with ICF labels, issue templates, and configuration.

### `icf incident`
```
icf incident create --severity <P0-P3> --service <name> --description <text>
icf incident list [--severity P1] [--status investigating] [--service api]
icf incident show INC-42
icf incident update INC-42 --status mitigating
icf incident resolve INC-42 --root-cause "..."
icf incident timeline INC-42 --event "Deployed hotfix"
```

### `icf config`
```
icf config validate
icf config show
```

## JSON Mode

All commands support `--json` for machine-readable output:

```bash
icf incident list --json | jq '.data[] | select(.severity == "P0")'
ICF_JSON=1 icf incident create --severity P1 --service api --description "..."
```

## Agent Workflow

```bash
# Full lifecycle
INCIDENT=$(icf incident create --severity P1 --service api --description "Spike" --json | jq -r '.data.incident_id')
icf incident update $INCIDENT --status investigating
icf incident timeline $INCIDENT --event "Root cause identified"
icf incident resolve $INCIDENT --root-cause "Fixed and deployed"
```

## Severity Levels

| Level | Description |
|-------|-------------|
| P0 | Critical — full outage or data loss |
| P1 | High — major feature degradation |
| P2 | Medium — partial degradation |
| P3 | Low — minor issue |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Network error |
| 3 | Not found |
| 4 | Auth error |
| 5 | Validation error |

## License

MIT — Black Asteroid
