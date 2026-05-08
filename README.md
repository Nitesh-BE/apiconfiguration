# Generic API Config Tool

Standalone copy of the Ambassador admin tools UI. It serves the same HTML tools locally and includes a lightweight proxy endpoint used by the pages for requests to Ambassador, Armor, and other internal services.

## Requirements

- Node.js 18 or newer
- Access to the Birdeye internal network/VPN for internal hostnames

## Run

```bash
cd /Users/nitesh/Documents/genericapiconfigtool
npm start
```

Open:

```text
http://localhost:4173
```

Use another port if needed:

```bash
PORT=5000 npm start
```

## Deploy on Vercel

This repo is Vercel-ready:

- Static pages are served from the project root.
- `vercel.json` rewrites the old Ambassador routes to the matching HTML pages.
- `/ambassador/admin/tools/proxy` is routed to the root-level Vercel function in `proxy.js`.
- Vercel Web Analytics and Speed Insights scripts are included on every page.

Set this environment variable in Vercel before using Execute:

```text
TOOL_PROXY_TOKEN=<choose-a-long-random-token>
```

When the UI receives a 401 from the proxy, it prompts for that token once and stores it in the browser session for subsequent Execute calls.

Optional hardening:

```text
TOOL_PROXY_ALLOWED_HOSTS=*.birdeye.internal,api.example.com
TOOL_PROXY_TIMEOUT_MS=25000
```

`TOOL_PROXY_ALLOWED_HOSTS` is a comma-separated allowlist. Wildcards only support a leading `*.` suffix match.

## Hosting Note

GitHub Pages and other static hosts can display the HTML UI, but the Execute buttons need a running proxy at:

```text
/ambassador/admin/tools/proxy
```

For curl execution, deploy this project to Vercel, a Node-capable host such as an internal VM, EC2, Render, Railway, Fly.io, or run it locally with `npm start`. Static hosting alone cannot execute requests because it cannot run the proxy or reach internal Birdeye hostnames on your behalf.

## Pages

- `http://localhost:4173/generic-api-config-tool.html`
- `http://localhost:4173/ops-tool.html`
- `http://localhost:4173/developer-portal-tool.html`
- `http://localhost:4173/curl-builder-tool.html`

The old Ambassador routes also work locally, for example:

```text
http://localhost:4173/ambassador/admin/generic-api-config-tool
```
