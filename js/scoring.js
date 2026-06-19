import { TEAMS } from './constants.js';
import {
  matches, players, simulationScores, isSyncEnabled,
  manualEliminatedTeams, teamPoints, processedPlayers, teamMatchesPlayedCounts
} from './state.js';
import { saveToServer } from './persist.js';

let _recalcHook = null;
export function setRecalcHook(fn) { _recalcHook = typeof fn === 'function' ? fn : null; }

  // Initialize all teams with 0 points
  TEAMS.forEach(team => {
    teamScores[team.name] = {
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };
  });
  
  // Compute match points
  targetMatches.forEach(match => {
    const isSimulated = simulationScores[match.id];
    if (match.status !== 'finished' && !isSimulated) return;
    
    const h = isSimulated ? isSimulated.homeScore : match.homeScore;
    const a = isSimulated ? isSimulated.awayScore : match.awayScore;
    
    if (h === null || a === null) return;

    // Add stats to teams
    if (teamScores[match.home]) {
      teamScores[match.home].played++;
      teamScores[match.home].goalsFor += h;
      teamScores[match.home].goalsAgainst += a;
    }
    if (teamScores[match.away]) {
      teamScores[match.away].played++;
      teamScores[match.away].goalsFor += a;
      teamScores[match.away].goalsAgainst += h;
    }
    
    let homeResPoints = 0;
    let awayResPoints = 0;
    
    if (h > a) {
      homeResPoints = 3; // Win
      awayResPoints = 1; // Loss
      if (teamScores[match.home]) teamScores[match.home].wins++;
      if (teamScores[match.away]) teamScores[match.away].losses++;
    } else if (h < a) {
      homeResPoints = 1; // Loss
      awayResPoints = 3; // Win
      if (teamScores[match.home]) teamScores[match.home].losses++;
      if (teamScores[match.away]) teamScores[match.away].wins++;
    } else {
      // Draw (in normal time or 120 mins)
      if (match.isKnockout && match.penaltyWinner) {
        // Knockout draw decided by penalties
        if (match.penaltyWinner === 'home') {
          homeResPoints = 3;
          awayResPoints = 1;
          if (teamScores[match.home]) teamScores[match.home].wins++;
          if (teamScores[match.away]) teamScores[match.away].losses++;
        } else {
          homeResPoints = 1;
          awayResPoints = 3;
          if (teamScores[match.home]) teamScores[match.home].losses++;
          if (teamScores[match.away]) teamScores[match.away].wins++;
        }
      } else {
        // Normal draw
        homeResPoints = 2;
        awayResPoints = 2;
        if (teamScores[match.home]) teamScores[match.home].draws++;
        if (teamScores[match.away]) teamScores[match.away].draws++;
      }
    }
    
    // Calculate final points based on multiplier: (resultPoints + goals) * multiplier
    const hTeam = TEAMS.find(t => t.name === match.home);
    const aTeam = TEAMS.find(t => t.name === match.away);
    
    if (hTeam && teamScores[match.home]) {
      teamScores[match.home].points += (homeResPoints + h) * hTeam.multiplier;
    }
    if (aTeam && teamScores[match.away]) {
      teamScores[match.away].points += (awayResPoints + a) * aTeam.multiplier;
    }
  });
  
  // Format numbers
  for (const name in teamScores) {
    teamScores[name].points = parseFloat(teamScores[name].points.toFixed(2));
  }
  
  return teamScores;
}

// Calculate final prediction score for a user
function calculatePredictionPoints(user, finalMatch) {
  if (!finalMatch || finalMatch.status !== 'finished') return 0;
  
  const totalGoals = finalMatch.homeScore + finalMatch.awayScore;
  if (user.guess !== totalGoals) return 0; // Guess incorrect
  
  // Guess is correct, calculate points: (A_goals * A_mult) + (B_goals * B_mult)
  // Rule: 0 and 1 goals = 1 goal
  const rawHomeGoals = finalMatch.homeScore;
  const rawAwayGoals = finalMatch.awayScore;
  
  const calcHomeGoals = rawHomeGoals <= 1 ? 1 : rawHomeGoals;
  const calcAwayGoals = rawAwayGoals <= 1 ? 1 : rawAwayGoals;
  
  const hTeam = TEAMS.find(t => t.name === finalMatch.home);
  const aTeam = TEAMS.find(t => t.name === finalMatch.away);
  
  const hMult = hTeam ? hTeam.multiplier : 1;
  const aMult = aTeam ? aTeam.multiplier : 1;
  
  let score = (calcHomeGoals * hMult) + (calcAwayGoals * aMult);
  
  // Divide by 2 if score exceeds 7 points
  if (score > 7) {
    score = score / 2;
  }
  
  return parseFloat(score.toFixed(2));
}

// Calculate player total score & sort them
function processPlayers(teamScores) {
  const finalMatch = matches.find(m => m.isFinal);
  
  const processed = players.map(player => {
    let teamsScore = 0;
    const teamBreakdown = [];
    
    player.teams.forEach(teamName => {
      const tScore = teamScores[teamName] ? teamScores[teamName].points : 0;
      teamsScore += tScore;
      
      const teamObj = TEAMS.find(t => t.name === teamName);
      teamBreakdown.push({
        name: teamName,
        zone: teamObj ? teamObj.zone : 'blue',
        multiplier: teamObj ? teamObj.multiplier : 1,
        points: tScore
      });
    });
    
    const predictionScore = calculatePredictionPoints(player, finalMatch);
    const totalScore = parseFloat((teamsScore + predictionScore).toFixed(2));
    
    return {
      ...player,
      teamsScore: parseFloat(teamsScore.toFixed(2)),
      predictionScore,
      totalScore,
      teamBreakdown
    };
  });
  
  // Sort players by total score descending.
  // We need to implement the boundary tie-breaker:
  // "หมายเหตุ: หากคะแนนเท่ากัน ให้ปัดลงในโซนที่ ต่ำกว่า"
  // First, do a primary sort by score descending.
  processed.sort((a, b) => b.totalScore - a.totalScore);
  
  // Determine rankings
  let currentRank = 1;
  for (let i = 0; i < processed.length; i++) {
    if (i > 0 && processed[i].totalScore < processed[i - 1].totalScore) {
      currentRank = i + 1;
    }
    processed[i].rank = currentRank;
  }
  
  // Partition into zones based on ranks/scores:
  // Blue: top 20%
  // Green: 25 players
  // Red: bottom (the rest)
  const total = processed.length;
  const blueCount = 12; 
  const greenCount = 25; 
  
  // Rough indexes for boundaries
  const blueBoundaryIndex = blueCount - 1; 
  const greenBoundaryIndex = blueCount + greenCount - 1; 
  
  // Get boundary scores
  const blueCutoffScore = processed[blueBoundaryIndex] ? processed[blueBoundaryIndex].totalScore : 0;
  const greenCutoffScore = processed[greenBoundaryIndex] ? processed[greenBoundaryIndex].totalScore : 0;
  
  // Assign initial zones and handle demotions for ties
  processed.forEach((p, idx) => {
    let zone = 'red';
    
    if (idx < blueCount) {
      zone = 'blue';
    } else if (idx < blueCount + greenCount) {
      zone = 'green';
    } else {
      zone = 'red';
    }
    
    p.zone = zone;
  });
  
  // Apply tie-breaker: "หากคะแนนเท่ากัน ให้ปัดลงในโซนที่ ต่ำกว่า"
  // If a Blue player has the same score as the cutoff of Green, demote them to Green!
  // If a Green player has the same score as the cutoff of Red, demote them to Red!
  processed.forEach(p => {
    if (p.zone === 'blue' && p.totalScore === blueCutoffScore) {
      const hasGreenWithSameScore = processed.some(x => x.zone === 'green' && x.totalScore === p.totalScore);
      if (hasGreenWithSameScore && p.rank > blueCount) {
        p.zone = 'green';
      }
    }
    if (p.zone === 'green' && p.totalScore === greenCutoffScore) {
      const hasRedWithSameScore = processed.some(x => x.zone === 'red' && x.totalScore === p.totalScore);
      if (hasRedWithSameScore && p.rank > (blueCount + greenCount)) {
        p.zone = 'red';
      }
    }
  });
  
  // Assign party payouts:
  // - Last place pays 1500
  // - Second to last pays 1200
  // - Red Zone players pay 1000, except the TOP Red Zone player who is exempt.
  // - Bottom 2 Green Zone players pay extra (let's display them as paying 300 Baht or highlight them).
  
  // Find bottom and second-to-last
  const lastIndex = total - 1;
  const secondLastIndex = total - 2;
  
  // Find Red Zone players and calculate average score
  const redZonePlayers = processed.filter(p => p.zone === 'red');
  
  let closestToAvgPlayer = null;
  if (redZonePlayers.length > 0) {
    const avgScore = redZonePlayers.reduce((sum, p) => sum + p.totalScore, 0) / redZonePlayers.length;
    closestToAvgPlayer = redZonePlayers.reduce((closest, p) => {
      const currentDiff = Math.abs(p.totalScore - avgScore);
      const closestDiff = Math.abs(closest.totalScore - avgScore);
      return currentDiff < closestDiff ? p : closest;
    });
  }
  
  // Find the top of Red Zone (first player in Red Zone) - DEPRECATED, use closest to avg instead
  let topRedPlayer = null;
  for (let i = 0; i < total; i++) {
    if (processed[i].zone === 'red') {
      topRedPlayer = processed[i];
      break;
    }
  }
  
  // Find Green Zone players and calculate average score for the special charge rule
  const greenPlayers = processed.filter(p => p.zone === 'green');
  let closestToAvgGreen = null;
  if (greenPlayers.length > 0) {
    const greenAvgScore = greenPlayers.reduce((sum, p) => sum + p.totalScore, 0) / greenPlayers.length;
    closestToAvgGreen = greenPlayers.reduce((closest, p) => {
      if (!closest) return p;
      const currentDiff = Math.abs(p.totalScore - greenAvgScore);
      const closestDiff = Math.abs(closest.totalScore - greenAvgScore);
      return currentDiff < closestDiff ? p : closest;
    }, null);
  }
  
  // Find overall average score for the all-player charging rule
  let closestToAvgAll = null;
  if (total > 0) {
    const overallAvgScore = processed.reduce((sum, p) => sum + p.totalScore, 0) / total;
    closestToAvgAll = processed.reduce((closest, p) => {
      if (!closest) return p;
      const currentDiff = Math.abs(p.totalScore - overallAvgScore);
      const closestDiff = Math.abs(closest.totalScore - overallAvgScore);
      return currentDiff < closestDiff ? p : closest;
    }, null);
  }
  
  processed.forEach((p, idx) => {
    p.payout = 0;
    p.payoutLabel = 'ไม่ต้องจ่าย';
    
    if (p.zone === 'red') {
      p.payout = 1000;
      p.payoutLabel = 'จ่าย 1,000 บาท';
      
      // Closest to Red Zone average exemption
      if (closestToAvgPlayer && p.name === closestToAvgPlayer.name) {
        p.payout = 0;
        p.payoutLabel = 'ยกเว้นไม่ต้องจ่าย (ใกล้ค่าเฉลี่ย Red Zone)';
      }
      
      // Second to last
      if (idx === secondLastIndex) {
        p.payout = 1200;
        p.payoutLabel = 'รองบ๊วย จ่าย 1,200 บาท';
      }
      
      // Last place
      if (idx === lastIndex) {
        p.payout = 1500;
        p.payoutLabel = 'บ๊วย จ่าย 1,500 บาท';
      }
    } else if (p.zone === 'green') {
      // Closest to Green Zone average - must pay 1000
      if (closestToAvgGreen && p.name === closestToAvgGreen.name) {
        p.payout = 1000;
        p.payoutLabel = 'จ่าย 1,000 บาท (ใกล้ค่าเฉลี่ย Green Zone)';
      }
    } else if (p.zone === 'blue') {
      p.payoutLabel = 'สิทธิ์เลือกสถานที่ (ไม่ต้องจ่าย)';
    }
    
    // Closest to overall average - must pay 1000
    if (closestToAvgAll && p.name === closestToAvgAll.name) {
      p.payout = 1000;
      p.payoutLabel = 'จ่าย 1,000 บาท (ใกล้ค่าเฉลี่ยทั้งหมด)';
    }
  });
  
  return processed;
}

// Global calculated state
let teamPoints = {};
    teamMatchesPlayedCounts[m.away] = (teamMatchesPlayedCounts[m.away] || 0) + 1;
  });
}
export function getPlayerTotalMatchesPlayed(playerTeams) {
  if (!playerTeams) return 0;
  return playerTeams.reduce((sum, teamName) => sum + (teamMatchesPlayedCounts[teamName] || 0), 0);
}

// Load manual eliminated teams
export function loadEliminatedTeams() {
  if (isSyncEnabled) return; // Do not load from localstorage if sync is enabled
  const stored = localStorage.getItem('worldcup_eliminated_teams');
  if (stored) {
    try {
      manualEliminatedTeams = new Set(JSON.parse(stored));
    } catch(e) {
      manualEliminatedTeams = new Set();
    }
  } else {
    manualEliminatedTeams = new Set();
  }
}

// Save manual eliminated teams
export async function saveEliminatedTeams() {
  localStorage.setItem('worldcup_eliminated_teams', JSON.stringify(Array.from(manualEliminatedTeams)));
  if (isSyncEnabled) {
    await saveToServer();
  }
}

// Check if a team is eliminated (auto-calculated from knockout losses + manual overrides)
export function isTeamEliminated(teamName) {
  // 1. Check manual override
  if (manualEliminatedTeams.has(teamName)) return true;

  // 2. Check auto-detect from knockout losses
  for (const match of matches) {
    if (match.status === 'finished' && match.isKnockout) {
      const h = match.homeScore;
      const a = match.awayScore;
      if (h > a && match.away === teamName) return true;
      if (h < a && match.home === teamName) return true;
      if (h === a) {
        if (match.penaltyWinner === 'home' && match.away === teamName) return true;
        if (match.penaltyWinner === 'away' && match.home === teamName) return true;
      }
    }
  }

  return false;
}

export function recalculateAll() {
  if (_recalcHook) _recalcHook();
  teamPoints = calculateTeamPoints();
  processedPlayers = processPlayers(teamPoints);
  updateTeamMatchesPlayedCounts();
}

export function refreshActivePage() {
  const activePage = document.querySelector('.page.active');