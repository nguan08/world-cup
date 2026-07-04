import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data.json');

const ESPN_SCOREBOARD_API =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

/** ESPN 3-letter codes → Thai team names (same mapping as update-scores.js) */
const ESPN_TO_THAI = {
  MEX: 'เม็กซิโก',
  RSA: 'แอฟริกาใต้',
  KOR: 'เกาหลีใต้',
  CZE: 'สาธารณรัฐเช็ก',
  CAN: 'แคนาดา',
  BIH: 'บอสเนีย',
  USA: 'สหรัฐอเมริกา',
  PAR: 'ปารากวัย',
  QAT: 'กาตาร์',
  SUI: 'สวิตเซอร์แลนด์',
  BRA: 'บราซิล',
  MAR: 'โมร็อกโก',
  HAI: 'เฮติ',
  SCO: 'สกอตแลนด์',
  AUS: 'ออสเตรเลีย',
  TUR: 'ตุรกี',
  GER: 'เยอรมนี',
  CUW: 'คูราเซา',
  NED: 'เนเธอร์แลนด์',
  JPN: 'ญี่ปุ่น',
  CIV: 'ไอเวอรีโคสต์',
  ECU: 'เอกวาดอร์',
  SWE: 'สวีเดน',
  TUN: 'ตูนิเซีย',
  ESP: 'สเปน',
  CPV: 'เคปเวิร์ด',
  BEL: 'เบลเยียม',
  EGY: 'อียิปต์',
  KSA: 'ซาอุดีอาระเบีย',
  URU: 'อุรุกวัย',
  IRN: 'อิหร่าน',
  NZL: 'นิวซีแลนด์',
  FRA: 'ฝรั่งเศส',
  SEN: 'เซเนกัล',
  IRQ: 'อิรัก',
  NOR: 'นอร์เวย์',
  ARG: 'อาร์เจนตินา',
  ALG: 'แอลจีเรีย',
  AUT: 'ออสเตรีย',
  JOR: 'จอร์แดน',
  POR: 'โปรตุเกส',
  COD: 'คองโก',
  ENG: 'อังกฤษ',
  CRO: 'โครเอเชีย',
  GHA: 'กานา',
  PAN: 'ปานามา',
  UZB: 'อุซเบกิสถาน',
  COL: 'โคลอมเบีย',
};

const ROUND32_START = '2026-06-28';
const ROUND32_END = '2026-07-04';
const ROUND16_START = '2026-07-04';
const ROUND16_END = '2026-07-07';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function toEspnDate(isoDate) {
  return String(isoDate || '').replace(/-/g, '');
}

function matchKey(home, away) {
  return `${home}|${away}`;
}

function dateRange(startIso, endIso) {
  const dates = [];
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}${m}${day}`);
  }
  return dates;
}

async function fetchEspnEventsForDate(dateYmd) {
  const url = `${ESPN_SCOREBOARD_API}?dates=${dateYmd}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'world-cup-knockout-pull/1.0' },
  });
  if (!res.ok) {
    throw new Error(`ESPN API ${res.status} for ${dateYmd}`);
  }
  const json = await res.json();
  return json.events || [];
}

function extractKnockoutFixture(event) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const homeCode = home.team?.abbreviation;
  const awayCode = away.team?.abbreviation;
  const homeThai = ESPN_TO_THAI[homeCode];
  const awayThai = ESPN_TO_THAI[awayCode];
  if (!homeThai || !awayThai) return null;

  const statusType = competition?.status?.type || {};
  const status = statusType.completed ? 'finished' : 'pending';

  let penaltyWinner = null;
  if (status === 'finished') {
    const penText = `${statusType.detail || ''} ${statusType.shortDetail || ''}`.toLowerCase();
    if (penText.includes('penalt')) {
      if (home.winner) penaltyWinner = 'home';
      else if (away.winner) penaltyWinner = 'away';
    }
  }

  const homeScore = home.score != null && home.score !== '' ? Number.parseInt(String(home.score), 10) : null;
  const awayScore = away.score != null && away.score !== '' ? Number.parseInt(String(away.score), 10) : null;

  return {
    home: homeThai,
    away: awayThai,
    homeScore: Number.isFinite(homeScore) ? homeScore : null,
    awayScore: Number.isFinite(awayScore) ? awayScore : null,
    status,
    isKnockout: true,
    date: event.date ? event.date.slice(0, 10) : null,
    penaltyWinner,
  };
}

async function fetchKnockoutFixtures(startIso, endIso) {
  const fixtures = [];
  const seen = new Set();

  for (const dateYmd of dateRange(startIso, endIso)) {
    try {
      const events = await fetchEspnEventsForDate(dateYmd);
      for (const event of events) {
        const fixture = extractKnockoutFixture(event);
        if (!fixture) continue;
        const key = matchKey(fixture.home, fixture.away);
        if (seen.has(key)) continue;
        seen.add(key);
        fixtures.push(fixture);
      }
    } catch (err) {
      console.warn(`[pull-knockout] Failed to fetch ${dateYmd}: ${err.message}`);
    }
  }

  fixtures.sort((a, b) => {
    const dateCmp = String(a.date).localeCompare(String(b.date));
    if (dateCmp !== 0) return dateCmp;
    return matchKey(a.home, a.away).localeCompare(matchKey(b.home, b.away));
  });

  return fixtures;
}

function mergeFixtures(...fixtureLists) {
  const merged = [];
  const seen = new Set();
  for (const fixtures of fixtureLists) {
    for (const fixture of fixtures) {
      const key = matchKey(fixture.home, fixture.away);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(fixture);
    }
  }
  merged.sort((a, b) => {
    const dateCmp = String(a.date).localeCompare(String(b.date));
    if (dateCmp !== 0) return dateCmp;
    return matchKey(a.home, a.away).localeCompare(matchKey(b.home, b.away));
  });
  return merged;
}

function nextMatchId(matches) {
  const ids = matches.filter((m) => m.id < 100).map((m) => Number(m.id)).filter(Number.isFinite);
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

const data = readJson(DATA_PATH);
const matches = Array.isArray(data.matches) ? data.matches : [];
const existingKeys = new Set(matches.map((m) => matchKey(m.home, m.away)));
const knockoutBefore = matches.filter((m) => m.isKnockout).length;

const round32Fixtures = await fetchKnockoutFixtures(ROUND32_START, ROUND32_END);
const round16Fixtures = await fetchKnockoutFixtures(ROUND16_START, ROUND16_END);
const fixtures = mergeFixtures(round32Fixtures, round16Fixtures);
if (fixtures.length === 0) {
  console.error('[pull-knockout] No knockout fixtures found on ESPN');
  process.exit(1);
}

let nextId = nextMatchId(matches);
let added = 0;
let updated = 0;

for (const fixture of fixtures) {
  const key = matchKey(fixture.home, fixture.away);
  const existing = matches.find((m) => matchKey(m.home, m.away) === key);

  if (existing) {
    const changed =
      existing.isKnockout !== true ||
      existing.date !== fixture.date ||
      (fixture.status === 'finished' &&
        (existing.status !== 'finished' ||
          existing.homeScore !== fixture.homeScore ||
          existing.awayScore !== fixture.awayScore ||
          existing.penaltyWinner !== fixture.penaltyWinner));

    if (changed) {
      existing.isKnockout = true;
      existing.date = fixture.date;
      if (fixture.status === 'finished') {
        existing.status = 'finished';
        existing.homeScore = fixture.homeScore;
        existing.awayScore = fixture.awayScore;
        if (fixture.penaltyWinner != null) {
          existing.penaltyWinner = fixture.penaltyWinner;
        }
      }
      updated += 1;
      console.log(`↻ Updated #${existing.id}: ${fixture.home} vs ${fixture.away} (${fixture.date})`);
    }
    continue;
  }

  const newMatch = {
    id: nextId++,
    home: fixture.home,
    away: fixture.away,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    status: fixture.status,
    isKnockout: true,
    date: fixture.date,
    penaltyWinner: fixture.penaltyWinner,
  };
  matches.push(newMatch);
  existingKeys.add(key);
  added += 1;
  console.log(`+ Added #${newMatch.id}: ${fixture.home} vs ${fixture.away} (${fixture.date})`);
}

data.matches = matches;
writeJson(DATA_PATH, data);

const knockoutAfter = matches.filter((m) => m.isKnockout).length;
console.log(`[pull-knockout] Round of 32: ${round32Fixtures.length}, Round of 16: ${round16Fixtures.length} fixtures from ESPN`);
console.log(`  added: ${added}, updated: ${updated}`);
console.log(`  knockout matches: ${knockoutBefore} → ${knockoutAfter} (total ${matches.length})`);