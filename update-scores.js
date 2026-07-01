const fs = require('fs');
const path = require('path');

const ESPN_SCOREBOARD_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const dataPath = path.join(__dirname, 'data.json');

/** ESPN 3-letter codes → Thai team names in data.json */
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
  COL: 'โคลอมเบีย'
};

function toEspnDate(isoDate) {
  return String(isoDate || '').replace(/-/g, '');
}

function matchKey(home, away) {
  return `${home}|${away}`;
}

function parseCompetitorScore(competitor) {
  const raw = competitor?.score;
  if (raw == null || raw === '') return null;
  const val = Number.parseInt(String(raw), 10);
  return Number.isFinite(val) ? val : null;
}

function extractFinishedMatches(event) {
  const competition = event?.competitions?.[0];
  if (!competition?.status?.type?.completed) return null;

  const competitors = competition.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const homeCode = home.team?.abbreviation;
  const awayCode = away.team?.abbreviation;
  const homeThai = ESPN_TO_THAI[homeCode];
  const awayThai = ESPN_TO_THAI[awayCode];
  const homeScore = parseCompetitorScore(home);
  const awayScore = parseCompetitorScore(away);

  if (!homeThai || !awayThai || homeScore == null || awayScore == null) {
    return {
      skipped: true,
      homeCode,
      awayCode,
      reason: 'unmapped team or missing score'
    };
  }

  let penaltyWinner = null;
  const detail = competition.status?.type?.detail || '';
  const shortDetail = competition.status?.type?.shortDetail || '';
  const penText = `${detail} ${shortDetail}`.toLowerCase();
  if (penText.includes('penalt')) {
    if (home.winner) penaltyWinner = 'home';
    else if (away.winner) penaltyWinner = 'away';
  }

  return {
    home: homeThai,
    away: awayThai,
    homeScore,
    awayScore,
    penaltyWinner,
    date: event.date ? event.date.slice(0, 10) : null
  };
}

async function fetchEspnScoresForDate(dateYmd) {
  const url = `${ESPN_SCOREBOARD_API}?dates=${dateYmd}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'world-cup-score-updater/1.0' }
  });
  if (!res.ok) {
    throw new Error(`ESPN API ${res.status} for ${dateYmd}`);
  }
  const json = await res.json();
  return (json.events || []).map(extractFinishedMatches).filter(Boolean);
}

async function scrape() {
  console.log(`[${new Date().toISOString()}] Starting score update (ESPN API)...`);

  if (!fs.existsSync(dataPath)) {
    console.error(`Error: data.json not found at ${dataPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded data.json. Total matches: ${data.matches.length}`);

  const dates = [...new Set((data.matches || []).map((m) => toEspnDate(m.date)).filter(Boolean))].sort();
  const espnResults = new Map();

  for (const dateYmd of dates) {
    try {
      const dayMatches = await fetchEspnScoresForDate(dateYmd);
      let added = 0;
      dayMatches.forEach((item) => {
        if (item.skipped) {
          console.warn(`⚠️ Skip unmapped ESPN match on ${dateYmd}: ${item.homeCode} vs ${item.awayCode}`);
          return;
        }
        const key = matchKey(item.home, item.away);
        espnResults.set(key, item);
        added += 1;
      });
      if (added > 0) {
        console.log(`📅 ${dateYmd}: ${added} finished match(es) from ESPN`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to fetch ESPN for ${dateYmd}: ${err.message}`);
    }
  }

  console.log(`\nESPN returned ${espnResults.size} unique finished matches.`);

  let changesCount = 0;
  let matchedCount = 0;
  let notFoundCount = 0;

  data.matches.forEach((dbMatch) => {
    const key = matchKey(dbMatch.home, dbMatch.away);
    const espn = espnResults.get(key);
    if (!espn) {
      notFoundCount += 1;
      return;
    }

    matchedCount += 1;
    const scoreChanged = dbMatch.homeScore !== espn.homeScore || dbMatch.awayScore !== espn.awayScore;
    const statusChanged = dbMatch.status !== 'finished';

    if (!scoreChanged && !statusChanged && dbMatch.penaltyWinner === espn.penaltyWinner) {
      return;
    }

    dbMatch.homeScore = espn.homeScore;
    dbMatch.awayScore = espn.awayScore;
    dbMatch.status = 'finished';
    if (dbMatch.isKnockout && espn.homeScore === espn.awayScore) {
      dbMatch.penaltyWinner = espn.penaltyWinner || dbMatch.penaltyWinner || null;
    } else if (!dbMatch.isKnockout) {
      dbMatch.penaltyWinner = null;
    }

    console.log(`✅ Updated #${dbMatch.id}: ${dbMatch.home} ${espn.homeScore}-${espn.awayScore} ${dbMatch.away}`);
    changesCount += 1;
  });

  console.log(`\nMatched ${matchedCount}/${data.matches.length} local fixtures with ESPN (${notFoundCount} not on ESPN yet).`);

  if (changesCount > 0) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`[${new Date().toISOString()}] Successfully updated data.json with ${changesCount} change(s)!`);
  } else {
    console.log(`[${new Date().toISOString()}] No changes to write. data.json is up to date.`);
  }
}

scrape().catch((err) => {
  console.error('Scraping error:', err);
  process.exit(1);
});