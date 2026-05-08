const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const ROUTES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/tools-index.html', 'tools-index.html'],
  ['/curl-builder-tool.html', 'curl-builder-tool.html'],
  ['/developer-portal-tool.html', 'developer-portal-tool.html'],
  ['/generic-api-config-tool.html', 'generic-api-config-tool.html'],
  ['/ops-tool.html', 'ops-tool.html'],
  ['/ambassador/admin/tools', 'index.html'],
  ['/ambassador/admin/curl-builder-tool', 'curl-builder-tool.html'],
  ['/ambassador/admin/developer-portal-tool', 'developer-portal-tool.html'],
  ['/ambassador/admin/generic-api-config-tool', 'generic-api-config-tool.html'],
  ['/ambassador/admin/ops-tool', 'ops-tool.html']
]);

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function proxyRequest(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, JSON.stringify({ error: 'Only POST is supported' }), {
      'Content-Type': 'application/json; charset=utf-8'
    });
    return;
  }

  try {
    const body = await readBody(req);
    const proxyRequest = JSON.parse(body || '{}');
    const targetUrl = new URL(proxyRequest.targetUrl);

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      throw new Error('Only http and https target URLs are supported');
    }

    const method = proxyRequest.method || 'GET';
    const headers = {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      ...(proxyRequest.headers || {})
    };
    const fetchOptions = { method, headers };

    if (proxyRequest.payload && method !== 'GET') {
      fetchOptions.body = JSON.stringify(proxyRequest.payload);
      fetchOptions.headers['Content-Type'] = fetchOptions.headers['Content-Type'] || 'application/json';
    }

    const upstream = await fetch(targetUrl, fetchOptions);
    const upstreamBody = await upstream.text();

    send(res, 200, JSON.stringify({
      status: upstream.status,
      statusText: upstream.statusText,
      body: upstreamBody
    }), {
      'Content-Type': 'application/json; charset=utf-8'
    });
  } catch (error) {
    send(res, 200, JSON.stringify({ error: error.message }), {
      'Content-Type': 'application/json; charset=utf-8'
    });
  }
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const routeFile = ROUTES.get(requestPath);
  const filePath = routeFile ? path.join(ROOT, routeFile) : path.join(ROOT, requestPath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(ROOT)) {
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
    proxyRequest(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Standalone tools are running at http://${HOST}:${PORT}`);
});
