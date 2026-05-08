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

## Hosting Note

GitHub Pages and other static hosts can display the HTML UI, but the Execute buttons need the Node proxy in `server.js` at:

```text
/ambassador/admin/tools/proxy
```

For curl execution, deploy this project to a Node-capable host such as an internal VM, EC2, Render, Railway, Fly.io, or run it locally with `npm start`. Static hosting alone cannot execute requests because it cannot run `server.js` or reach internal Birdeye hostnames on your behalf.

## Pages

- `http://localhost:4173/generic-api-config-tool.html`
- `http://localhost:4173/ops-tool.html`
- `http://localhost:4173/developer-portal-tool.html`
- `http://localhost:4173/curl-builder-tool.html`

The old Ambassador routes also work locally, for example:

```text
http://localhost:4173/ambassador/admin/generic-api-config-tool
```
