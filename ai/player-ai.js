// ai/player-ai.js
// Modular AI for Colony Conquest
// Exports: decideMove(state, pid, meta)
// Tiers: training (depth1), normal (depth2), advanced (depth3), grandmaster (depth5)
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

function minimax(s, targetPid, currentPid, depthLeft, breadth) {
  if (depthLeft === 0) return scoreForPid(s, targetPid);
  const moves = genMovesFor(currentPid, s).slice(0, breadth);
  if (!moves.length) return scoreForPid(s, targetPid);
  let bestLocal = (currentPid === targetPid) ? -Infinity : Infinity;
  for (const m of moves) {
    const sCopy = cloneState(s);
    if (!sCopy.grid[m.y][m.x]) sCopy.grid[m.y][m.x] = { type: 'unit', pid: currentPid, level: 1 };
    else if (sCopy.grid[m.y][m.x].type === 'unit') {
      if (sCopy.grid[m.y][m.x].level === 3) {
        sCopy.grid[m.y][m.x] = null;
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
        for (const [dx,dy] of dirs) {
          const nx = m.x + dx, ny = m.y + dy;
          if (nx < 0 || ny < 0 || nx >= sCopy.size || ny >= sCopy.size) continue;
          const t = sCopy.grid[ny][nx];
          if (!t) sCopy.grid[ny][nx] = { type: 'unit', pid: currentPid, level: 1 };
          else if (t.type === 'unit') { t.pid = currentPid; t.level = Math.min(3, (t.level||1)+1); }
        }
      } else sCopy.grid[m.y][m.x].level = Math.min(3, sCopy.grid[m.y][m.x].level + 1);
    }
    const pids = Object.keys(sCopy.playersMeta).map(k => Number(k)).filter(n => sCopy.playersMeta[n] && sCopy.playersMeta[n].alive);
    const idx = pids.indexOf(currentPid);
    const nextIdx = (idx + 1) % pids.length;
    const nextPid = pids[nextIdx];
    const val = minimax(sCopy, targetPid, nextPid, depthLeft - 1, breadth);
    if (currentPid === targetPid) bestLocal = Math.max(bestLocal, val); else bestLocal = Math.min(bestLocal, val);
  }
  return bestLocal;
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

const PERSONALITIES = ['attacker','defender','strategist','gambler','hunter'];

function decideMove(state, pid, meta) {
  if (!meta) meta = {};
  if (!meta.personality) {
    // assign personality deterministically using pid to reduce randomness in tests
    meta.personality = PERSONALITIES[pid % PERSONALITIES.length];
  }
  const personality = meta.personality;
  const levelName = (meta.aiLevel || 'normal').toLowerCase();
  const depthMap = { training: 1, normal: 2, advanced: 3, grandmaster: 5 };
  const depth = depthMap[levelName] || 2;
  // breadth limits to control CPU
  const breadth = (levelName === 'grandmaster') ? 3 : (levelName === 'advanced' ? 4 : 6);

  const candidates = genMovesFor(pid, state);
  if (!candidates.length) return null;

  // Evaluate each candidate according to personality and depth
  const scored = [];
  for (const c of candidates.slice(0, 12)) {
    const immediate = simulateMoveAndScore(state, c.x, c.y, pid);
    let val = immediate;

    if (personality === 'attacker') {
      // boost offensive value
      val = immediate * 1.2 + (c.level * 2);
    } else if (personality === 'defender') {
      // prefer adjacency and conservative moves
      const adj = adjacencyBonus(state, pid, c.x, c.y);
      val = immediate + adj * 0.8 - (c.level * 0.5);
    } else if (personality === 'strategist') {
      // use shallow minimax
      val = minimax(state, pid, pid, Math.max(1, Math.min(depth, 2)), breadth);
    } else if (personality === 'gambler') {
      // evaluate both best and worst quickly
      const bestVal = minimax(state, pid, pid, 1, breadth);
      const worstVal = minimax(state, pid, pid, 1, breadth);
      val = Math.random() < 0.5 ? bestVal : worstVal;
    } else if (personality === 'hunter') {
      // maximize own score minus opponent best reply
      const myScore = immediate;
      let worstOpp = -Infinity;
      for (const opPidStr of Object.keys(state.playersMeta)) {
        const opPid = Number(opPidStr);
        if (opPid === pid) continue;
        const oppMoves = genMovesFor(opPid, state).slice(0, breadth);
        for (const om of oppMoves) {
          const oppScore = simulateMoveAndScore(state, om.x, om.y, opPid);
          worstOpp = Math.max(worstOpp, oppScore);
        }
      }
      val = myScore - (worstOpp === -Infinity ? 0 : worstOpp * 0.6);
    }

    // deeper lookahead adjustment for higher tiers
    if (depth > 1 && (personality === 'strategist' || personality === 'hunter' || levelName === 'grandmaster')) {
      const mm = minimax(state, pid, pid, Math.min(depth, 5), breadth);
      val = (val * 0.6) + (mm * 0.4);
    }

    scored.push({ move: c, val });
  }

  // Gambler special: 50% best 50% worst
  if (personality === 'gambler') {
    scored.sort((a,b) => b.val - a.val);
    if (Math.random() < 0.5) return scored[0].move; else return scored[scored.length-1].move;
  }

  // Pick highest value
  scored.sort((a,b) => b.val - a.val);
  return scored[0].move;
}

module.exports = { decideMove };
