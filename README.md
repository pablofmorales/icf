# 🚨 Incident Management

This repository is managed by [ICF](https://github.com/BlackAsteroid/incident-report) — Incident Command Framework.

## Quick Start

```bash
# Install ICF
npm install -g @blackasteroid/icf

# Authenticate
icf auth login

# Create an incident
icf incident create --severity P1 --service api --description "API latency spike"

# List open incidents
icf incident list

# Resolve an incident
icf incident resolve INC-1 --root-cause "Memory leak in worker pool"
```

## Incident Lifecycle

`open` → `investigating` → `mitigating` → `monitoring` → `resolved`

## Severity Levels

| Level | Description |
|-------|-------------|
| P0 | Critical — full outage or data loss |
| P1 | High — major feature degradation |
| P2 | Medium — partial degradation |
| P3 | Low — minor issue |

## Agent Workflow

Agents can interact via the CLI or GitHub API. Each incident is a GitHub Issue with structured data embedded as an HTML comment block.

```bash
# Agent creating an incident
icf incident create --severity P1 --service api-gateway --detected-by monitoring-agent --json

# Agent adding a timeline event
icf incident timeline INC-42 --event "Identified memory leak in worker pool" --json

# Agent resolving
icf incident resolve INC-42 --root-cause "Deployed fix for memory leak" --json
```
