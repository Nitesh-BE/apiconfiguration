const DEFAULT_TIMEOUT_MS = 25000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()] || req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function setCommonHeaders(res, contentType) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Tool-Proxy-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
}

function sendJson(res, status, payload) {
  setCommonHeaders(res, 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return Promise.resolve(parseBody(req.body.toString('utf8')));
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(parseBody(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Proxy request body must be valid JSON');
  }
}

function sanitizeHeaders(headers = {}) {
  return Object.entries(headers).reduce((safeHeaders, [key, value]) => {
    if (!key || value == null) return safeHeaders;

    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) return safeHeaders;

    safeHeaders[key] = String(value);
    return safeHeaders;
  }, {
    Accept: 'application/json',
    'Cache-Control': 'no-cache'
  });
}

function isAllowedHost(hostname) {
  const allowedHosts = (process.env.TOOL_PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);

  if (allowedHosts.length === 0) return true;

  const candidate = hostname.toLowerCase();
  return allowedHosts.some(allowedHost => {
    if (allowedHost.startsWith('*.')) {
      const suffix = allowedHost.slice(1);
      return candidate.endsWith(suffix);
    }
    return candidate === allowedHost;
  });
}

function verifyProxyToken(req) {
  const requiredToken = process.env.TOOL_PROXY_TOKEN || '';
  const isVercelRuntime = process.env.VERCEL === '1';

  if (!requiredToken && isVercelRuntime) {
    return {
      ok: false,
      status: 503,
      error: 'TOOL_PROXY_TOKEN must be set in Vercel Environment Variables before the proxy can execute API requests.'
    };
  }

  if (!requiredToken) return { ok: true };

  const providedToken = getHeader(req, 'x-tool-proxy-token');
  if (providedToken !== requiredToken) {
    return {
      ok: false,
      status: 401,
      error: 'Proxy token is missing or invalid. Enter the TOOL_PROXY_TOKEN value configured for this deployment.'
    };
  }

  return { ok: true };
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function buildFetchOptions(proxyRequest) {
  const method = String(proxyRequest.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error('Unsupported method. Use GET, POST, PUT, PATCH, DELETE, or HEAD.');
  }

  const headers = sanitizeHeaders(proxyRequest.headers);
  const fetchOptions = { method, headers };

  if (method !== 'GET' && method !== 'HEAD') {
    if (hasOwn(proxyRequest, 'payload')) {
      fetchOptions.body = JSON.stringify(proxyRequest.payload);
      fetchOptions.headers['Content-Type'] = fetchOptions.headers['Content-Type'] || 'application/json';
    } else if (hasOwn(proxyRequest, 'rawBody')) {
      fetchOptions.body = String(proxyRequest.rawBody);
      fetchOptions.headers['Content-Type'] = fetchOptions.headers['Content-Type'] || 'text/plain; charset=utf-8';
    }
  }

  return fetchOptions;
}

async function handleProxy(req, res) {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end('');
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Only POST is supported' });
    return;
  }

  const tokenCheck = verifyProxyToken(req);
  if (!tokenCheck.ok) {
    sendJson(res, tokenCheck.status, { error: tokenCheck.error });
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TOOL_PROXY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proxyRequest = await readBody(req);
    if (!proxyRequest.targetUrl) {
      throw new Error('targetUrl is required');
    }

    const targetUrl = new URL(proxyRequest.targetUrl);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      throw new Error('Only http and https target URLs are supported');
    }

    if (!isAllowedHost(targetUrl.hostname)) {
      throw new Error('Target host is not allowed by TOOL_PROXY_ALLOWED_HOSTS');
    }

    const upstream = await fetch(targetUrl, {
      ...buildFetchOptions(proxyRequest),
      signal: controller.signal
    });
    const upstreamBody = await upstream.text();

    sendJson(res, 200, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: Object.fromEntries(upstream.headers.entries()),
      body: upstreamBody,
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? `Request timed out after ${Math.round(timeoutMs / 1000)}s`
      : error.message;

    sendJson(res, 200, {
      error: message,
      elapsedMs: Date.now() - startedAt
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  handleProxy
};
