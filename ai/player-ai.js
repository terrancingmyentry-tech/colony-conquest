// ai/player-ai.js
// Modular AI for Colony Conquest - Score-based only (no lookahead to prevent freeze)
// Exports: decideMove(state, pid, meta)
// Tiers: training, normal, advanced, grandmaster
// Personalities: attacker, defender, strategist, gambler, hunter

function cloneState(s) { return JSON.parse(JSON.stringify(s)); }

function scoreForPid(s, pidToScore) {
  let score = 0;
  for (let yy = 0; yy < s.size; yy++) for (let xx = 0; xx < s.size; xx++) {
    const c = s.grid[yy][xx];
    if (!c) continue;
    if (c.type === 'unit') {
      score += (c.pid === pidToScore) ? (10 * c.level) : (-8 * c.level);
    } else if (c.type === 'obstacle') {
      if (c.hp) score -= (c.hp * 0.5);
    }
  }
  return score;
}

// Simulate a single move and return the resulting score
function simulateMoveAndScore(origState, moveX, moveY, ownerPid) {
  const s = cloneState(origState);
  const tile = s.grid[moveY][moveX];
  if (!tile) {
    s.grid[moveY][moveX] = { type: 'unit', pid: ownerPid, level: 1 };
  } else if (tile.type === 'unit') {
    if (tile.level === 3) {
      s.grid[moveY][moveX] = null;
      const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
      for (const [dx,dy] of dirs) {
        const nx = moveX + dx, ny = moveY + dy;
        if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
        const t = s.grid[ny][nx];
        if (!t) s.grid[ny][nx] = { type: 'unit', pid: ownerPid, level: 1 };
        else if (t.type === 'unit') {
          t.pid = ownerPid;
          t.level = Math.min(3, (t.level || 1) + 1);
        }
      }
    } else {
      tile.level = Math.min(3, tile.level + 1);
    }
  }
  return scoreForPid(s, ownerPid);
}

function genMovesFor(pidToGen, s) {
  const moves = [];
  for (let yy = 0; yy < s.size; yy++) for (let xx = 0; xx < s.size; xx++) {
    const t = s.grid[yy][xx]; if (t && t.type === 'unit' && t.pid === pidToGen) moves.push({ x: xx, y: yy, level: t.level });
  }
  moves.sort((a,b) => b.level - a.level);
  return moves;
}

function adjacencyBonus(s, pidToCheck, x, y) {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  let bonus = 0;
  for (const [dx,dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
    const t = s.grid[ny][nx]; if (t && t.type === 'unit' && t.pid === pidToCheck) bonus += (2 * (t.level || 1));
  }
  return bonus;
}

function countEnemyThreats(s, pidToCheck, x, y) {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  let threats = 0;
  for (const [dx,dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= s.size || ny >= s.size) continue;
    const t = s.grid[ny][nx]; if (t && t.type === 'unit' && t.pid !== pidToCheck) threats += (t.level || 1);
  }
  return threats;
}

const PERSONALITIES = ['attacker','defender','strategist','gambler','hunter'];

function decideMove(state, pid, meta) {
  if (!meta) meta = {};
  if (!meta.personality) {
    meta.personality = PERSONALITIES[pid % PERSONALITIES.length];
  }
  const personality = meta.personality;

  const candidates = genMovesFor(pid, state);
  if (!candidates.length) return null;

  // Score each candidate move based on immediate result + personality
  // No lookahead = instant decisions, no freezes
  const scored = [];
  for (const c of candidates.slice(0, 20)) {
    const immediate = simulateMoveAndScore(state, c.x, c.y, pid);
    const adj = adjacencyBonus(state, pid, c.x, c.y);
    const threats = countEnemyThreats(state, pid, c.x, c.y);
    
    let val = immediate;

    if (personality === 'attacker') {
      // Boost offensive value (prioritize level and score gain)
      val = immediate * 1.3 + (c.level * 3);
    } else if (personality === 'defender') {
      // Prefer adjacency and avoid threats
      val = immediate + (adj * 1.2) - (threats * 2) - (c.level * 0.3);
    } else if (personality === 'strategist') {
      // Balanced: good score + some adjacency, moderate threat avoidance
      val = immediate + (adj * 0.5) - (threats * 0.8) + (c.level * 0.5);
    } else if (personality === 'gambler') {
      // Will be handled specially below (50% best/worst)
      val = immediate;
    } else if (personality === 'hunter') {
      // Maximize score gain, but also punish adjacency (set traps via isolation)
      val = immediate - (adj * 0.5) + (c.level * 1.5);
    }

    scored.push({ move: c, val });
  }

  // Gambler: 50% best, 50% worst move
  if (personality === 'gambler') {
    scored.sort((a,b) => b.val - a.val);
    if (Math.random() < 0.5) {
      return scored[0].move;
    } else {
      return scored[scored.length - 1].move;
    }
  }

  // All other personalities: pick highest value
  scored.sort((a,b) => b.val - a.val);
  return scored[0] ? scored[0].move : candidates[0];
}

module.exports = { decideMove };
