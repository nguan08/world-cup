import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'data.json');
const ROOMS_DIR = path.join(ROOT, 'rooms');
const DEFAULT_ROOM_PATH = path.join(ROOMS_DIR, 'default.json');
const INDEX_PATH = path.join(ROOMS_DIR, 'index.json');

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const players = Array.isArray(data.players) ? data.players : [];

fs.mkdirSync(ROOMS_DIR, { recursive: true });

const defaultRoom = {
  id: 'default',
  name: 'ห้องหลัก',
  createdAt: new Date().toISOString(),
  players
};

fs.writeFileSync(DEFAULT_ROOM_PATH, JSON.stringify(defaultRoom, null, 2) + '\n', 'utf8');

const index = {
  rooms: [
    {
      id: 'default',
      name: 'ห้องหลัก',
      createdAt: defaultRoom.createdAt,
      playerCount: players.length
    }
  ]
};

fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');
console.log(`Migrated ${players.length} players to rooms/default.json`);