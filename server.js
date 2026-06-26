const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = __dirname;

const ADMIN_PASSWORD = '123456';
const DATA_PATH = path.join(PUBLIC_DIR, 'data.json');

function readDataJson() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function writeDataJson(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getAdminPassword(req, body = {}) {
  return body.adminPassword || req.headers['x-admin-password'] || '';
}

function isAdminAuthorized(req, body = {}) {
  return getAdminPassword(req, body) === ADMIN_PASSWORD;
}

function normalizeEliminatedTeams(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((t) => String(t || '').trim()).filter(Boolean))];
}

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
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  // CORS Headers to allow requests from local network IP
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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

  if (req.method === 'GET' && req.url === '/api/eliminated-teams') {
    try {
      const data = readDataJson();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ eliminatedTeams: normalizeEliminatedTeams(data.eliminatedTeams) }));
    } catch (e) {
      console.error('[Server] Failed to read eliminated teams:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error: ' + e.message }));
    }
    return;
  }

  if ((req.method === 'POST' || req.method === 'PATCH') && req.url === '/api/eliminated-teams') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!isAdminAuthorized(req, payload)) {
          console.warn(`[Server] Rejected /api/eliminated-teams from ${req.socket.remoteAddress} - invalid admin credentials`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: admin credentials required' }));
          return;
        }

        const data = readDataJson();
        let nextEliminated = normalizeEliminatedTeams(data.eliminatedTeams);

        if (Array.isArray(payload.eliminatedTeams)) {
          nextEliminated = normalizeEliminatedTeams(payload.eliminatedTeams);
        } else if (payload.team) {
          const team = String(payload.team).trim();
          if (!team) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid team name' }));
            return;
          }
          const eliminated = payload.eliminated !== false;
          const set = new Set(nextEliminated);
          if (eliminated) set.add(team);
          else set.delete(team);
          nextEliminated = [...set];
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload: eliminatedTeams array or team field required' }));
          return;
        }

        data.eliminatedTeams = nextEliminated;
        writeDataJson(data);
        console.log(`[Server] Updated eliminated teams (${nextEliminated.length}) from IP: ${req.socket.remoteAddress}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, eliminatedTeams: nextEliminated }));
      } catch (e) {
        console.error('[Server] Failed to update eliminated teams:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error: ' + e.message }));
      }
    });
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

        // Write to data.json (strip auth fields)
        const { adminPassword: _pw, ...dataToSave } = payload;
        if (dataToSave.eliminatedTeams !== undefined) {
          dataToSave.eliminatedTeams = normalizeEliminatedTeams(dataToSave.eliminatedTeams);
        }
        writeDataJson(dataToSave);
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
  let requestPath = req.url.split('?')[0];
  // Support subpath deployment e.g. /world-cup/
  const APP_BASE = '/world-cup';
  if (requestPath.startsWith(APP_BASE)) {
    requestPath = requestPath.slice(APP_BASE.length) || '/';
  }
  if (requestPath === '/favicon.ico') {
    const pngPath = path.join(PUBLIC_DIR, 'icons', 'icon-192.png');
    fs.access(pngPath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(pngPath).pipe(res);
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
    const headers = { 'Content-Type': contentType };

    if (requestPath === '/sw.js') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Service-Worker-Allowed'] = '/';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

function printServerUrls(port) {
  console.log(`[Server] Running locally at:`);
  console.log(`  http://localhost:${port}`);
  console.log(`  http://127.0.0.1:${port}`);

  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  http://${net.address}:${port}`);
      }
    }
  }
  console.log('[Server] Press Ctrl+C to stop.');
}

function startServer(port, maxPort = PORT + 10) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      console.warn(`[Server] Port ${port} is already in use — trying ${port + 1}...`);
      startServer(port + 1, maxPort);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] Ports ${PORT}-${maxPort} are all in use.`);
      console.error('[Server] Close other Node processes or run:  taskkill /F /IM node.exe');
    } else {
      console.error('[Server] Failed to start:', err.message);
    }
    process.exit(1);
  });

  server.listen(port, '0.0.0.0', () => {
    printServerUrls(port);
  });
}

const requestedPort = Number(process.env.PORT) || PORT;
startServer(requestedPort);
