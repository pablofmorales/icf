# icf - Incident Command Framework

Manage service incidents through GitHub Issues from your terminal. No third-party tools. No vendor lock-in. Just your existing GitHub org, structured labels, and automated triage workflows.

## What it does

icf turns a GitHub repository into a full incident management system:

- Every incident is a GitHub issue with severity labels, status tracking, and a comment timeline
- `icf init` sets up labels, issue templates, and GitHub Actions workflows in one command  
- `icf incident create` opens an incident in seconds, with or without a TTY
- AI agents can use `--input-json` and `--json` for fully programmatic operation

## The CLI lives in `cli/`

```
icf/
├── cli/              ← npm package (@blackasteroid/icf)
│   ├── src/
│   │   ├── commands/ ← auth, init, incident, config, upgrade
│   │   ├── utils/    ← format, box, errors
│   │   ├── config.ts ← local config (~/.config/icf-nodejs/)
│   │   ├── github.ts ← Octokit wrapper + ICF labels
│   │   └── index.ts  ← CLI entry point
│   └── dist/         ← compiled binary
├── .github/
│   └── workflows/    ← incident-triage.yml, incident-escalation.yml
└── README.md
```

## Install

```bash
npm install -g @blackasteroid/icf
```

## Quick start

```bash
icf auth login
icf init my-org/incidents --create
icf incident create --severity P1 --service api --title "Latency spike" --description "..."
icf incident list
icf incident resolve INC-001 --rca "Root cause fixed"
```

Full documentation: [cli/README.md](./cli/README.md)

## Agent usage

```bash
# Create an incident from a JSON payload
echo '{"title":"DB down","service":"postgres","severity":"P0","description":"..."}' \
  | icf incident create --input-json --json

# Get structured output
icf incident list --json | jq '.data[] | select(.severity == "P0")'
```

## License

MIT — [Black Asteroid](https://blackasteroid.com.ar)
