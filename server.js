const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = __dirname;

const ADMIN_PASSWORD = '123456';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  // CORS Headers to allow requests from local network IP
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sync: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.matches || !payload.players) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload: matches and players are required' }));
          return;
        }

        // Server-side admin auth gate for /api/save to prevent unauthenticated tampering
        const providedPw = payload.adminPassword || (req.headers['x-admin-password'] || '');
        if (providedPw !== ADMIN_PASSWORD) {
          console.warn(`[Server] Rejected /api/save from ${req.socket.remoteAddress} - invalid admin credentials`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: admin credentials required for save' }));
          return;
        }

        // Basic shape validation (arrays as expected)
        if (!Array.isArray(payload.matches) || !Array.isArray(payload.players)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload shape: matches and players must be arrays' }));
          return;
        }

        // Write to data.json
        const dataPath = path.join(PUBLIC_DIR, 'data.json');
        fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`[Server] Successfully saved data.json from IP: ${req.socket.remoteAddress}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error('[Server] Failed to save data.json:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error: ' + e.message }));
      }
    });
    return;
  }

  // Serve static files
  const requestPath = req.url.split('?')[0];
  if (requestPath === '/favicon.ico') {
    const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
    fs.access(svgPath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      fs.createReadStream(svgPath).pipe(res);
    });
    return;
  }

  let filePath = path.join(PUBLIC_DIR, requestPath === '/' ? 'index.html' : requestPath);

  // Security check: ensure path is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // Read and serve file
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running locally at:`);
  console.log(`  http://localhost:${PORT}`);

  // Print local network IP
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  http://${net.address}:${PORT}`);
      }
    }
  }
});
