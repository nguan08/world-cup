const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = 'https://www.google.com/search?q=%E0%B8%9C%E0%B8%A5%E0%B8%9B%E0%B8%AD%E0%B8%A5&newwindow=1&hl=th#sie=lg;/m/0r4xs1m;2;/m/030q7;mt;fp;1;;;;-1';

const dataPath = path.join(__dirname, 'data.json');

const ALIASES = {
  'ไอเวอรีโคสต์': ['โกตดิวัวร์'],
  'คูราเซา': ['กือราเซา'],
  'บอสเนีย': ['บอสเนียและเฮอร์เซโกวีนา', 'บอสเนียฯ'],
  'สาธารณรัฐเช็ก': ['เช็ก', 'เช็กเกีย'],
  'สหรัฐอเมริกา': ['สหรัฐฯ', 'สหรัฐ'],
  'ซาอุดีอาระเบีย': ['ซาอุดีฯ', 'ซาอุ']
};

function getTeamNamesWithAliases(teamName) {
  const names = [teamName];
  if (ALIASES[teamName]) {
    names.push(...ALIASES[teamName]);
  }
  return names;
}

function findFirstNumberNearby(lines, idx) {
  // Search forward up to 3 elements
  for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i++) {
    const val = parseInt(lines[i]);
    if (!isNaN(val)) return val;
  }
  
  // Search backward up to 3 elements
  for (let i = idx - 1; i >= Math.max(0, idx - 3); i--) {
    const val = parseInt(lines[i]);
    if (!isNaN(val)) return val;
  }
  
  return null;
}

function parseScoreFromText(text, teamName) {
  const normalizedText = text.replace(/\s+/g, ' ');
  const names = getTeamNamesWithAliases(teamName);
  
  for (const name of names) {
    const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Pattern 1: Team Name followed by Score, e.g. "สเปน 2" or "สเปน ... 2"
    const patternAfter = new RegExp(escapedName + '\\s*\\D{0,50}\\s*(\\d+)', 'i');
    const matchAfter = normalizedText.match(patternAfter);
    if (matchAfter) {
      return parseInt(matchAfter[1]);
    }
    
    // Pattern 2: Score followed by Team Name, e.g. "2 สเปน" or "2 ... สเปน"
    const patternBefore = new RegExp('(\\d+)\\s*\\D{0,50}\\s*' + escapedName, 'i');
    const matchBefore = normalizedText.match(patternBefore);
    if (matchBefore) {
      return parseInt(matchBefore[1]);
    }
  }
  
  return null;
}

function isMatchFinished(text) {
  const t = text.toLowerCase();
  return (
    t.includes('จบเกม') || 
    t.includes('จบการแข่งขัน') || 
    t.includes('จบ') || 
    t.includes('ft') || 
    t.includes('full time') || 
    t.includes('full-time')
  );
}

async function scrape() {
  console.log(`[${new Date().toISOString()}] Starting score update script...`);
  
  if (!fs.existsSync(dataPath)) {
    console.error(`Error: data.json not found at ${dataPath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded data.json. Total matches: ${data.matches.length}`);
  
  // Resolve browser path to local Chrome if on Windows (to bypass bot protection)
  let executablePath = undefined;
  let headless = true;
  
  if (process.platform === 'win32') {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    
    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        headless = false; // Run headfully on Windows local GUI session to avoid blocks
        break;
      }
    }
  }
  
  console.log('Using browser executable path:', executablePath || 'Playwright Default');
  console.log('Headless mode:', headless);
  
  const browser = await chromium.launch({
    executablePath,
    headless
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 1000 }
  });
  
  const page = await context.newPage();
  console.log(`Navigating to Google Search Sports Widget...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  
  console.log('Waiting 6 seconds for dynamic content to render...');
  await page.waitForTimeout(6000);
  
  // Expand the matches list by clicking "ดูเพิ่มเติม" if it exists
  console.log('Checking for "ดูเพิ่มเติม" (View More) button to expand matches...');
  try {
    const viewMoreLocator = page.locator('text="ดูเพิ่มเติม"');
    // Wait up to 5 seconds for the button to load/render
    await viewMoreLocator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    
    let clicks = 0;
    while (await viewMoreLocator.isVisible() && clicks < 5) {
      console.log(`Clicking "ดูเพิ่มเติม" (click #${clicks + 1})...`);
      await viewMoreLocator.click();
      await page.waitForTimeout(2000); // Wait for content to expand
      clicks++;
    }
  } catch (e) {
    console.log('No "ดูเพิ่มเติม" button found or failed to click it:', e.message);
  }
  
  // Evaluate a script in the browser to extract texts of all containers that match team pairs
  const scrapeResult = await page.evaluate(({ matchesToUpdate, aliasesDef }) => {
    // Helper to resolve aliases inside the browser sandbox
    function getAliases(teamName) {
      const names = [teamName];
      if (aliasesDef[teamName]) {
        names.push(...aliasesDef[teamName]);
      }
      return names;
    }
    
    // Get unique list of all team names
    const allTeamNames = [];
    matchesToUpdate.forEach(m => {
      if (!allTeamNames.includes(m.home)) allTeamNames.push(m.home);
      if (!allTeamNames.includes(m.away)) allTeamNames.push(m.away);
    });
    
    // Select all divs and tables
    const divs = Array.from(document.querySelectorAll('div'));
    const tables = Array.from(document.querySelectorAll('table'));
    const allElements = [...tables, ...divs];
    
    const updates = [];
    
    matchesToUpdate.forEach(m => {
      // Find containers containing both team names or their aliases
      let bestContainer = null;
      let minLength = Infinity;
      
      const homeNames = getAliases(m.home);
      const awayNames = getAliases(m.away);
      
      const otherTeams = allTeamNames.filter(name => !homeNames.includes(name) && !awayNames.includes(name));
      
      allElements.forEach(el => {
        const text = el.innerText || '';
        
        const matchesHome = homeNames.some(name => text.includes(name));
        const matchesAway = awayNames.some(name => text.includes(name));
        
        if (matchesHome && matchesAway) {
          // Verify it does not contain other teams or their aliases
          const hasOtherTeams = otherTeams.some(otherTeam => {
            const otherAliases = getAliases(otherTeam);
            return otherAliases.some(alias => text.includes(alias));
          });
          
          if (!hasOtherTeams) {
            if (text.length < minLength && text.length < 800) { // filter out overly large outer containers
              minLength = text.length;
              bestContainer = el;
            }
          }
        }
      });
      
      if (bestContainer) {
        updates.push({
          id: m.id,
          home: m.home,
          away: m.away,
          text: bestContainer.innerText
        });
      } else {
        updates.push({
          id: m.id,
          home: m.home,
          away: m.away,
          notFound: true
        });
      }
    });
    
    return updates;
  }, { matchesToUpdate: data.matches, aliasesDef: ALIASES });
  
  let changesCount = 0;
  
  scrapeResult.forEach(res => {
    if (res.notFound) {
      console.log(`⚠️ Match ${res.id} (${res.home} vs ${res.away}) was not found on the Google page.`);
      return;
    }
    
    const dbMatch = data.matches.find(m => m.id == res.id);
    if (!dbMatch) return;
    
    const text = res.text;
    const finished = isMatchFinished(text);
    
    console.log(`\nAnalyzing Match ${res.id}: ${res.home} vs ${res.away}`);
    console.log(`Found text:\n--- START ---\n${text.trim()}\n--- END ---`);
    
    if (finished) {
      const homeScore = parseScoreFromText(text, res.home);
      const awayScore = parseScoreFromText(text, res.away);
      
      if (homeScore !== null && awayScore !== null) {
        // Check if values actually changed
        const scoreChanged = dbMatch.homeScore !== homeScore || dbMatch.awayScore !== awayScore;
        const statusChanged = dbMatch.status !== 'finished';
        
        dbMatch.homeScore = homeScore;
        dbMatch.awayScore = awayScore;
        dbMatch.status = 'finished';
        
        // Handle penalty shootouts for knockout matches
        if (dbMatch.isKnockout && homeScore === awayScore) {
          let penaltyWinner = null;
          const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
          const penWinIdx = lines.findIndex(l => l.includes('ชนะจุดโทษ') || l.includes('ชนะด้วยจุดโทษ') || l.includes('won on penalties'));
          
          if (penWinIdx !== -1) {
            const penLine = lines[penWinIdx];
            const homeNames = getTeamNamesWithAliases(res.home);
            const awayNames = getTeamNamesWithAliases(res.away);
            
            const homeWonText = homeNames.some(name => penLine.includes(name));
            const awayWonText = awayNames.some(name => penLine.includes(name));
            
            if (homeWonText) {
              penaltyWinner = 'home';
            } else if (awayWonText) {
              penaltyWinner = 'away';
            } else {
              // Check adjacent lines
              const prevLine = lines[penWinIdx - 1] || '';
              const nextLine = lines[penWinIdx + 1] || '';
              const homeWonAdjacent = homeNames.some(name => prevLine.includes(name) || nextLine.includes(name));
              const awayWonAdjacent = awayNames.some(name => prevLine.includes(name) || nextLine.includes(name));
              
              if (homeWonAdjacent) {
                penaltyWinner = 'home';
              } else if (awayWonAdjacent) {
                penaltyWinner = 'away';
              }
            }
          }
          
          if (penaltyWinner && dbMatch.penaltyWinner !== penaltyWinner) {
            dbMatch.penaltyWinner = penaltyWinner;
            console.log(`👉 Penalty shootout winner identified: ${penaltyWinner === 'home' ? res.home : res.away}`);
            changesCount++;
          }
        } else {
          dbMatch.penaltyWinner = null;
        }
        
        if (scoreChanged || statusChanged) {
          console.log(`✅ Updated: ${res.home} ${homeScore} - ${awayScore} ${res.away} (status: finished)`);
          changesCount++;
        } else {
          console.log(`ℹ️ Match already finished and scores are up-to-date.`);
        }
      } else {
        console.log(`⚠️ Match is finished, but could not parse scores. Home parsed: ${homeScore}, Away parsed: ${awayScore}`);
      }
    } else {
      console.log(`ℹ️ Match is not finished (still pending or live). Status on Google: not finished.`);
    }
  });
  
  if (changesCount > 0) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n[${new Date().toISOString()}] Successfully updated data.json with ${changesCount} changes!`);
  } else {
    console.log(`\n[${new Date().toISOString()}] No changes to write. data.json is up to date.`);
  }
  
  await browser.close();
}

scrape().catch(err => {
  console.error('Scraping error:', err);
  process.exit(1);
});
