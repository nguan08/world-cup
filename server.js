const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = __dirname;

const ADMIN_PASSWORD = '123456';
const DATA_PATH = path.join(PUBLIC_DIR, 'data.json');
const ROOMS_DIR = path.join(PUBLIC_DIR, 'rooms');
const ROOMS_INDEX_PATH = path.join(ROOMS_DIR, 'index.json');
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{3,32}$/;

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

function ensureRoomsDir() {
  if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true });
}

function normalizeRoomSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function isValidRoomSlug(slug) {
  if (!slug) return false;
  if (slug === 'default') return true;
  return SLUG_RE.test(slug);
}

function roomFilePath(slug) {
  return path.join(ROOMS_DIR, `${slug}.json`);
}

function readRoomsIndex() {
  ensureRoomsDir();
  if (!fs.existsSync(ROOMS_INDEX_PATH)) return { rooms: [] };
  return JSON.parse(fs.readFileSync(ROOMS_INDEX_PATH, 'utf8'));
}

function writeRoomsIndex(index) {
  ensureRoomsDir();
  fs.writeFileSync(ROOMS_INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

function readRoom(slug) {
  const filePath = roomFilePath(slug);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeRoom(record) {
  ensureRoomsDir();
  fs.writeFileSync(roomFilePath(record.id), JSON.stringify(record, null, 2) + '\n', 'utf8');
}

function upsertRoomIndex(record) {
  const index = readRoomsIndex();
  const rooms = Array.isArray(index.rooms) ? [...index.rooms] : [];
  const entry = {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    playerCount: Array.isArray(record.players) ? record.players.length : 0
  };
  const idx = rooms.findIndex((r) => r.id === record.id);
  if (idx === -1) rooms.push(entry);
  else rooms[idx] = { ...rooms[idx], ...entry };
  writeRoomsIndex({ rooms });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function normalizeRoomSettings(raw) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  return {
    averagePayoutRules: settings.averagePayoutRules !== false
  };
}

function buildRoomRecord({ existing, payload, slug, fallbackName }) {
  return {
    id: slug,
    name: String(payload?.name || existing?.name || fallbackName || slug).trim() || slug,
    createdAt: existing?.createdAt || payload?.createdAt || new Date().toISOString(),
    players: Array.isArray(payload?.players) ? payload.players : (existing?.players || []),
    settings: normalizeRoomSettings(payload?.settings ?? existing?.settings)
  };
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

  // Parse path and normalize (strip APP_BASE prefix if any)
  const APP_BASE = '/world-cup';
  let urlPath = req.url.split('?')[0];
  if (urlPath.startsWith(APP_BASE)) {
    urlPath = urlPath.slice(APP_BASE.length);
  }
  if (!urlPath.startsWith('/')) {
    urlPath = '/' + urlPath;
  }

  if (req.method === 'GET' && urlPath === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sync: true }));
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/eliminated-teams') {
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

  if ((req.method === 'POST' || req.method === 'PATCH') && urlPath === '/api/eliminated-teams') {
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

  const roomsMatch = urlPath.match(/^\/api\/rooms\/([a-z0-9-]+)\/save$/);
  if (req.method === 'POST' && roomsMatch) {
    parseJsonBody(req).then((payload) => {
      try {
        const slug = normalizeRoomSlug(roomsMatch[1]);
        if (!isValidRoomSlug(slug)) {
          sendJson(res, 400, { error: 'Invalid room id' });
          return;
        }
        if (!isAdminAuthorized(req, payload)) {
          sendJson(res, 401, { error: 'Unauthorized: admin credentials required' });
          return;
        }
        const existing = readRoom(slug);
        const record = buildRoomRecord({ existing, payload, slug });
        writeRoom(record);
        upsertRoomIndex(record);
        if (slug === 'default') {
          const data = readDataJson();
          data.players = record.players;
          writeDataJson(data);
        }
        console.log(`[Server] Saved room ${slug} (${record.players.length} players)`);
        sendJson(res, 200, { success: true, room: record });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/rooms') {
    try {
      sendJson(res, 200, readRoomsIndex());
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/rooms') {
    parseJsonBody(req).then((payload) => {
      try {
        const name = String(payload.name || '').trim();
        if (!name) {
          sendJson(res, 400, { error: 'Room name is required' });
          return;
        }
        const index = readRoomsIndex();
        const taken = new Set((index.rooms || []).map((r) => r.id));
        let slug = normalizeRoomSlug(payload.id || payload.slug || name);
        if (!slug || taken.has(slug) || !isValidRoomSlug(slug)) {
          const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
          do {
            slug = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
          } while (taken.has(slug));
        }
        if (readRoom(slug)) {
          sendJson(res, 409, { error: 'Room already exists' });
          return;
        }
        const record = buildRoomRecord({
          payload: { name, settings: { averagePayoutRules: true } },
          slug,
          fallbackName: name
        });
        record.players = [];
        writeRoom(record);
        upsertRoomIndex(record);
        console.log(`[Server] Created room ${slug} (${name})`);
        sendJson(res, 201, { success: true, room: record });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    }).catch(() => sendJson(res, 400, { error: 'Invalid JSON' }));
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/save') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.matches) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload: matches are required' }));
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
        if (!Array.isArray(payload.matches)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload shape: matches must be an array' }));
          return;
        }

        const { adminPassword: _pw, roomId, ...dataToSave } = payload;
        if (dataToSave.eliminatedTeams !== undefined) {
          dataToSave.eliminatedTeams = normalizeEliminatedTeams(dataToSave.eliminatedTeams);
        }

        const slug = normalizeRoomSlug(roomId || 'default') || 'default';
        if (Array.isArray(dataToSave.players)) {
          const existingRoom = readRoom(slug);
          const roomRecord = buildRoomRecord({
            existing: existingRoom,
            payload: {
              name: dataToSave.roomName,
              players: dataToSave.players,
              settings: dataToSave.roomSettings
            },
            slug,
            fallbackName: slug
          });
          writeRoom(roomRecord);
          upsertRoomIndex(roomRecord);
          if (slug !== 'default') {
            delete dataToSave.players;
          }
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
  let requestPath = urlPath;
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
