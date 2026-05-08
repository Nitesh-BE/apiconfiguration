const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleProxy } = require('./proxy-handler');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const ROUTES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/tools-index.html', 'tools-index.html'],
  ['/tools-index', 'tools-index.html'],
  ['/curl-builder-tool.html', 'curl-builder-tool.html'],
  ['/curl-builder-tool', 'curl-builder-tool.html'],
  ['/developer-portal-tool.html', 'developer-portal-tool.html'],
  ['/developer-portal-tool', 'developer-portal-tool.html'],
  ['/generic-api-config-tool.html', 'generic-api-config-tool.html'],
  ['/generic-api-config-tool', 'generic-api-config-tool.html'],
  ['/ops-tool.html', 'ops-tool.html'],
  ['/ops-tool', 'ops-tool.html'],
  ['/ambassador/admin/tools', 'index.html'],
  ['/ambassador/admin/curl-builder-tool', 'curl-builder-tool.html'],
  ['/ambassador/admin/developer-portal-tool', 'developer-portal-tool.html'],
  ['/ambassador/admin/generic-api-config-tool', 'generic-api-config-tool.html'],
  ['/ambassador/admin/ops-tool', 'ops-tool.html']
]);

const PUBLIC_FILES = new Set(ROUTES.values());

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,*',
    ...headers
  });
  res.end(body);
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const routeFile = ROUTES.get(requestPath) || ROUTES.get(requestPath.replace(/\/$/, ''));
  const requestedFile = requestPath.replace(/^\/+/, '');
  const staticFile = routeFile || requestedFile;

  if (!PUBLIC_FILES.has(staticFile)) {
    send(res, 404, 'Not found');
    return;
  }

  const filePath = path.join(ROOT, staticFile);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(ROOT + path.sep)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      send(res, 404, 'Not found');
      return;
    }
    const contentType = MIME_TYPES[path.extname(resolvedPath)] || 'application/octet-stream';
    send(res, 200, content, { 'Content-Type': contentType });
  });
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (requestPath === '/ambassador/admin/tools/proxy') {
    handleProxy(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Standalone tools are running at http://${HOST}:${PORT}`);
});
