// Team data and formatting helpers (match/player data: data.json)

export const TEAMS = [
  // BLUE ZONE
  { name: 'สเปน', zone: 'blue', multiplier: 1.0 },
  { name: 'ฝรั่งเศส', zone: 'blue', multiplier: 1.0 },
  { name: 'บราซิล', zone: 'blue', multiplier: 1.1 },
  { name: 'อาร์เจนตินา', zone: 'blue', multiplier: 1.1 },
  { name: 'อังกฤษ', zone: 'blue', multiplier: 1.1 },
  { name: 'เยอรมนี', zone: 'blue', multiplier: 1.2 },
  { name: 'โปรตุเกส', zone: 'blue', multiplier: 1.2 },
  { name: 'เบลเยียม', zone: 'blue', multiplier: 1.3 },
  { name: 'เนเธอร์แลนด์', zone: 'blue', multiplier: 1.3 },

  // GREEN ZONE
  { name: 'สวิตเซอร์แลนด์', zone: 'green', multiplier: 1.4 },
  { name: 'อุรุกวัย', zone: 'green', multiplier: 1.4 },
  { name: 'เม็กซิโก', zone: 'green', multiplier: 1.5 },
  { name: 'สหรัฐอเมริกา', zone: 'green', multiplier: 1.5 },
  { name: 'โมร็อกโก', zone: 'green', multiplier: 1.5 },
  { name: 'นอร์เวย์', zone: 'green', multiplier: 1.6 },
  { name: 'โคลอมเบีย', zone: 'green', multiplier: 1.6 },
  { name: 'สาธารณรัฐเช็ก', zone: 'green', multiplier: 1.7 },
  { name: 'โครเอเชีย', zone: 'green', multiplier: 1.7 },
  { name: 'ตุรกี', zone: 'green', multiplier: 1.7 },

  // YELLOW ZONE
  { name: 'แคนาดา', zone: 'yellow', multiplier: 1.8 },
  { name: 'ญี่ปุ่น', zone: 'yellow', multiplier: 1.8 },
  { name: 'เอกวาดอร์', zone: 'yellow', multiplier: 1.8 },
  { name: 'บอสเนีย', zone: 'yellow', multiplier: 1.9 },
  { name: 'อียิปต์', zone: 'yellow', multiplier: 1.9 },
  { name: 'ออสเตรีย', zone: 'yellow', multiplier: 1.9 },
  { name: 'อิหร่าน', zone: 'yellow', multiplier: 2.0 },
  { name: 'ไอเวอรีโคสต์', zone: 'yellow', multiplier: 2.0 },
  { name: 'เกาหลีใต้', zone: 'yellow', multiplier: 2.1 },
  { name: 'แอลจีเรีย', zone: 'yellow', multiplier: 2.1 },

  // LIGHT ORANGE ZONE
  { name: 'ปารากวัย', zone: 'grey', multiplier: 2.2 },
  { name: 'สวีเดน', zone: 'grey', multiplier: 2.2 },

  { name: 'สกอตแลนด์', zone: 'grey', multiplier: 2.3 },
  { name: 'เซเนกัล', zone: 'grey', multiplier: 2.4 },
  { name: 'กานา', zone: 'grey', multiplier: 2.4 },
  { name: 'ออสเตรเลีย', zone: 'grey', multiplier: 2.5 },
  { name: 'ซาอุดีอาระเบีย', zone: 'grey', multiplier: 2.5 },

  { name: 'แอฟริกาใต้', zone: 'grey', multiplier: 2.6 },
  { name: 'ตูนิเซีย', zone: 'grey', multiplier: 2.6 },

  // RED-ORANGE ZONE
  { name: 'นิวซีแลนด์', zone: 'red-orange', multiplier: 2.7 },
  { name: 'ปานามา', zone: 'red-orange', multiplier: 2.7 },
  { name: 'กาตาร์', zone: 'red-orange', multiplier: 2.8 },
  { name: 'จอร์แดน', zone: 'red-orange', multiplier: 2.8 },
  { name: 'อุซเบกิสถาน', zone: 'red-orange', multiplier: 2.8 },
  { name: 'อิรัก', zone: 'red-orange', multiplier: 2.9 },
  { name: 'คูราเซา', zone: 'red-orange', multiplier: 2.9 },
  { name: 'เคปเวิร์ด', zone: 'red-orange', multiplier: 3.0 },
  { name: 'คองโก', zone: 'grey', multiplier: 2.3 },
  { name: 'เฮติ', zone: 'red-orange', multiplier: 3.0 },

];

export const TEAM_WC_GROUP_MEMBERS = {
  A: ['เม็กซิโก', 'แอฟริกาใต้', 'เกาหลีใต้', 'สาธารณรัฐเช็ก'],
  B: ['แคนาดา', 'บอสเนีย', 'กาตาร์', 'สวิตเซอร์แลนด์'],
  C: ['บราซิล', 'โมร็อกโก', 'เฮติ', 'สกอตแลนด์'],
  D: ['สหรัฐอเมริกา', 'ปารากวัย', 'ออสเตรเลีย', 'ตุรกี'],
  E: ['เยอรมนี', 'คูราเซา', 'ไอเวอรีโคสต์', 'เอกวาดอร์'],
  F: ['เนเธอร์แลนด์', 'ญี่ปุ่น', 'สวีเดน', 'ตูนิเซีย'],
  G: ['สเปน', 'เคปเวิร์ด', 'ซาอุดีอาระเบีย', 'อุรุกวัย'],
  H: ['เบลเยียม', 'อิหร่าน', 'นิวซีแลนด์', 'อียิปต์'],
  I: ['ฝรั่งเศส', 'เซเนกัล', 'อิรัก', 'นอร์เวย์'],
  J: ['อาร์เจนตินา', 'แอลจีเรีย', 'ออสเตรีย', 'จอร์แดน'],
  K: ['โปรตุเกส', 'คองโก', 'อุซเบกิสถาน', 'โคลอมเบีย'],
  L: ['อังกฤษ', 'โครเอเชีย', 'กานา', 'ปานามา']
};

export const TEAM_WC_GROUPS = Object.fromEntries(
  Object.entries(TEAM_WC_GROUP_MEMBERS).flatMap(([group, teams]) =>
    teams.map(team => [team, group])
  )
);

TEAMS.forEach(team => {
  team.wcGroup = TEAM_WC_GROUPS[team.name] || null;
});

export function getTeamWcGroup(teamName) {
  return TEAM_WC_GROUPS[teamName] || TEAMS.find(t => t.name === teamName)?.wcGroup || '';
}

export function formatWcGroupLabel(group) {
  return group ? `กลุ่ม ${group}` : '-';
}

export function formatZoneDisplayLabel(zone) {
  if (zone === 'red-orange') return 'red';
  return zone || '';
}

export function getZoneBadgeClass(zone) {
  if (!zone) return 'grey';
  if (zone === 'red-orange') return 'red';
  return zone;
}

export function getWcGroupBadgeHtml(group, extraClass = '') {
  if (!group) return '<span class="wc-group-badge wc-group-badge--empty">-</span>';
  return `<span class="wc-group-badge ${extraClass}" title="${formatWcGroupLabel(group)}">${group}</span>`;
}

export const TEAM_FLAG_CODES = {
  'สเปน': 'es', 'ฝรั่งเศส': 'fr', 'บราซิล': 'br', 'อาร์เจนตินา': 'ar',
  'อังกฤษ': 'gb-eng', 'เยอรมนี': 'de', 'โปรตุเกส': 'pt', 'เบลเยียม': 'be',
  'เนเธอร์แลนด์': 'nl', 'สวิตเซอร์แลนด์': 'ch', 'อุรุกวัย': 'uy', 'เม็กซิโก': 'mx',
  'สหรัฐอเมริกา': 'us', 'โมร็อกโก': 'ma', 'นอร์เวย์': 'no', 'โคลอมเบีย': 'co',
  'สาธารณรัฐเช็ก': 'cz', 'โครเอเชีย': 'hr', 'ตุรกี': 'tr', 'แคนาดา': 'ca',
  'ญี่ปุ่น': 'jp', 'เอกวาดอร์': 'ec', 'บอสเนีย': 'ba', 'อียิปต์': 'eg',
  'ออสเตรีย': 'at', 'อิหร่าน': 'ir', 'ไอเวอรีโคสต์': 'ci', 'เกาหลีใต้': 'kr',
  'แอลจีเรีย': 'dz', 'ปารากวัย': 'py', 'สวีเดน': 'se', 'สกอตแลนด์': 'gb-sct',
  'เซเนกัล': 'sn', 'กานา': 'gh', 'ออสเตรเลีย': 'au', 'ซาอุดีอาระเบีย': 'sa',
  'แอฟริกาใต้': 'za', 'ตูนิเซีย': 'tn', 'นิวซีแลนด์': 'nz', 'ปานามา': 'pa',
  'กาตาร์': 'qa', 'จอร์แดน': 'jo', 'อุซเบกิสถาน': 'uz', 'อิรัก': 'iq',
  'คูราเซา': 'cw', 'เคปเวิร์ด': 'cv', 'คองโก': 'cd', 'เฮติ': 'ht'
};

export function getTeamFlagUrl(teamName) {
  const code = TEAM_FLAG_CODES[teamName];
  return code ? `https://flagcdn.com/w80/${code}.png` : null;
}

export function getTeamFlagHtml(teamName) {
  const url = getTeamFlagUrl(teamName);
  if (url) {
    return `<img src="${url}" alt="${teamName}" class="team-flag" loading="lazy" width="44" height="44">`;
  }
  return `<div class="team-avatar" title="${teamName}">${teamName.slice(0, 2)}</div>`;
}

export const INITIAL_MATCHES = [];
export const INITIAL_PLAYERS = [];
