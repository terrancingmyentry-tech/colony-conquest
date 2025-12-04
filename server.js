// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static('public'));

const rooms = {};

const ai = require('./ai/player-ai');

// -------------------------
// Utilities
function inside(x, y, size) { return x >= 0 && y >= 0 && x < size && y < size; }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// Generate grid with obstacles + water variants: random water and lakes

function makeGrid(size, bPct = 8, options = {}) {
  // We'll produce two layers: terrain (water/grass) and objects (obstacles/units)
  const terrain = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
  const objects = Array.from({ length: size }, () => Array.from({ length: size }, () => null));

  // Water placement: determine target water tiles from percentage
  // Split water percentage equally among lakes, rivers, and scattered water (if enabled)
  const totalWaterPct = options.waterPct || 0;
  const waterFeatures = (options.lakeOn ? 1 : 0) + (options.riverOn ? 1 : 0) + (options.scatteredWaterOn ? 1 : 0);
  const waterPerFeature = waterFeatures > 0 ? totalWaterPct / waterFeatures : 0;
  
  const targetWaterLakes = options.waterOn && options.lakeOn ? Math.round(size * size * (waterPerFeature / 100)) : 0;
  const targetWaterRivers = options.waterOn && options.riverOn ? Math.round(size * size * (waterPerFeature / 100)) : 0;
  const targetWaterScattered = options.waterOn && options.scatteredWaterOn ? Math.round(size * size * (waterPerFeature / 100)) : 0;
  
  const poisonWaterOn = options.poisonWaterOn || false;

  // Helper to place a water tile at (x,y) if empty
  function placeWaterAt(x, y, isPoison = false) {
    if (!inside(x, y, size)) return false;
    if (terrain[y][x]) return false;
    const subtype = isPoison ? 'poison' : 'water';
    terrain[y][x] = { type: 'water', subtype };
    return true;
  }

  // Generate rectangular/square lakes (multiple lakes)
  if (options.waterOn && options.lakeOn) {
    let placedTotal = 0;
    
    for (let lakeNum = 0; lakeNum < 100 && placedTotal < targetWaterLakes; lakeNum++) {
      // Random lake dimensions (min 3x3, max roughly size/2.5 each dimension)
      const minDim = 3;
      const maxDim = Math.floor(size / 2.5);
      const width = minDim + Math.floor(Math.random() * (maxDim - minDim + 1));
      const height = minDim + Math.floor(Math.random() * (maxDim - minDim + 1));
      
      // Try multiple times to find a valid spot for this lake
      let lakeAttempts = 0;
      let placed = false;
      
      while (lakeAttempts < 5 && placedTotal < targetWaterLakes) {
        lakeAttempts++;
        // Random starting position with margins
        const margin = 1;
        const maxStartX = size - width - margin;
        const maxStartY = size - height - margin;
        
        if (maxStartX < margin || maxStartY < margin) continue; // Lake too big for map
        
        const startX = margin + Math.floor(Math.random() * (maxStartX - margin + 1));
        const startY = margin + Math.floor(Math.random() * (maxStartY - margin + 1));
        
        // Check if area is mostly empty
        let emptyCount = 0;
        for (let y = startY; y < startY + height && y < size; y++) {
          for (let x = startX; x < startX + width && x < size; x++) {
            if (!terrain[y][x]) emptyCount++;
          }
        }
        
        // If at least 80% of the area is empty, place the lake
        if (emptyCount / (width * height) >= 0.8) {
          let lakeSize = 0;
          for (let y = startY; y < startY + height && y < size; y++) {
            for (let x = startX; x < startX + width && x < size; x++) {
              if (placeWaterAt(x, y)) {
                lakeSize++;
                placedTotal++;
              }
            }
          }
          
          // Add poison water scattered in lake if enabled (10% of lake tiles)
          if (poisonWaterOn && lakeSize > 0) {
            for (let y = startY; y < startY + height && y < size; y++) {
              for (let x = startX; x < startX + width && x < size; x++) {
                if (terrain[y][x] && terrain[y][x].type === 'water' && Math.random() < 0.1) {
                  terrain[y][x].subtype = 'poison';
                }
              }
            }
          }
          placed = true;
        }
      }
    }
  }

  // Generate rivers (carving paths across map)
  if (options.waterOn && options.riverOn) {
    const numRivers = Math.max(1, Math.floor(size / 6));
    let riverWaterPlaced = 0;
    
    for (let riverNum = 0; riverNum < numRivers && riverWaterPlaced < targetWaterRivers; riverNum++) {
      // Random start point on edge of map
      const side = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
      let x, y;
      
      if (side === 0) { // top
        x = Math.floor(Math.random() * size);
        y = 0;
      } else if (side === 1) { // right
        x = size - 1;
        y = Math.floor(Math.random() * size);
      } else if (side === 2) { // bottom
        x = Math.floor(Math.random() * size);
        y = size - 1;
      } else { // left
        x = 0;
        y = Math.floor(Math.random() * size);
      }
      
      // Carve river across map
      const maxRiverLength = size * 2;
      let riverLength = 0;
      
      while (riverLength < maxRiverLength && x >= 0 && x < size && y >= 0 && y < size && riverWaterPlaced < targetWaterRivers) {
        if (!terrain[y][x]) {
          terrain[y][x] = { type: 'water', subtype: 'water' };
          riverWaterPlaced++;
        }
        
        // Random walk towards opposite edge (with bias towards center)
        const dirs = [
          [0, -1], [0, 1], [-1, 0], [1, 0], // cardinal directions
          [-1, -1], [1, -1], [-1, 1], [1, 1] // diagonals
        ];
        
        // Prefer directions towards opposite edge
        let bestDir = dirs[Math.floor(Math.random() * dirs.length)];
        
        if (side === 0 && y < size - 1) bestDir = [0, 1]; // going down
        else if (side === 1 && x > 0) bestDir = [-1, 0]; // going left
        else if (side === 2 && y > 0) bestDir = [0, -1]; // going up
        else if (side === 3 && x < size - 1) bestDir = [1, 0]; // going right
        
        x += bestDir[0];
        y += bestDir[1];
        riverLength++;
        
        // Add slight randomness to river path
        if (Math.random() < 0.3) {
          const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
          x += randomDir[0];
          y += randomDir[1];
        }
      }
    }
  }

  // Generate scattered water points (completely isolated, no straight-line connections)
  if (options.waterOn && options.scatteredWaterOn) {
    let scatteredWaterPlaced = 0;
    let attempts = 0;
    const maxAttempts = Math.max(500, size * size);
    
    while (scatteredWaterPlaced < targetWaterScattered && attempts < maxAttempts) {
      attempts++;
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      
      // Only place scattered water on empty grass tiles
      if (terrain[y][x]) continue;
      
      // Check that no water exists in the 4 cardinal directions (up, down, left, right)
      // This ensures scattered water tiles never connect in straight lines
      const up = (y > 0) && terrain[y-1][x] && terrain[y-1][x].type === 'water';
      const down = (y < size-1) && terrain[y+1][x] && terrain[y+1][x].type === 'water';
      const left = (x > 0) && terrain[y][x-1] && terrain[y][x-1].type === 'water';
      const right = (x < size-1) && terrain[y][x+1] && terrain[y][x+1].type === 'water';
      
      // Only place if no straight-line neighbors
      if (!up && !down && !left && !right) {
        terrain[y][x] = { type: 'water', subtype: 'scattered' };
        scatteredWaterPlaced++;
      }
    }
  }

  // Sand removed - all non-water terrain is grass (null)
  // Remaining tiles are grass (leave as null - client will render grass by default)

  // Check for cut-off grass patches and remove them
  // Flood fill from edges to find all connected grass
  const visitedGrass = new Set();
  const grassQueue = [];
  
  // Start flood fill from all edge tiles
  for (let i = 0; i < size; i++) {
    // Top edge
    if (!terrain[0][i]) grassQueue.push([i, 0]);
    // Bottom edge
    if (!terrain[size-1][i]) grassQueue.push([i, size-1]);
    // Left edge
    if (!terrain[i][0]) grassQueue.push([0, i]);
    // Right edge
    if (!terrain[i][size-1]) grassQueue.push([size-1, i]);
  }
  
  // Flood fill to mark all connected grass
  while (grassQueue.length > 0) {
    const [x, y] = grassQueue.shift();
    const key = `${x},${y}`;
    if (visitedGrass.has(key)) continue;
    visitedGrass.add(key);
    
    // Check 4-way neighbors
    const neighbors = [[x, y-1], [x, y+1], [x-1, y], [x+1, y]];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && !terrain[ny][nx]) {
        const nkey = `${nx},${ny}`;
        if (!visitedGrass.has(nkey)) {
          grassQueue.push([nx, ny]);
        }
      }
    }
  }
  
  // Remove all grass tiles that are not connected to edges (cut-off patches)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!terrain[y][x]) { // Is grass
        const key = `${x},${y}`;
        if (!visitedGrass.has(key)) {
          // This is a cut-off grass patch - convert to water to prevent isolation
          terrain[y][x] = { type: 'water', subtype: 'water' };
        }
      }
    }
  }

   // PLACE OBSTACLES (random) on non-water, non-sand terrain (grass only)
  const totalObstacles = Math.round(size * size * (bPct || 0) / 100);
  let placed = 0;
  let attempts = 0;
  while (placed < totalObstacles && attempts < totalObstacles * 8) {
    attempts++;
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    if (objects[y][x]) continue;
    // don't place obstacles on water or anything that's not grass
    if (terrain[y][x]) continue;
    const hp = Number.isFinite(options.obstacleHp) && options.obstacleHp > 0 ? options.obstacleHp : 6;
    objects[y][x] = { type: 'obstacle', hp, maxHp: hp };
    placed++;
  }

  return { terrain, objects };
}
// -------------------------
// Game Logic: burst/activate/downgrade
// Damage obstacles adjacent (4-way) to an activation/burst
function damageAdjacentObstacles(st, x, y, amount = 1, config = {}) {
  // If obstacleHp is 0, obstacles cannot be damaged
  if (config.obstacleHp === 0) return;
  
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx, ny, st.size)) continue;
    const t = st.grid[ny][nx];
    if (t && t.type === 'obstacle') {
      t.hp = (Number.isFinite(t.hp) ? t.hp : (t.maxHp || 1)) - amount;
      if (t.hp <= 0) st.grid[ny][nx] = null;
    }
  }
}

// Tile Events system
function spawnTileEvents(st, maxEvents = 0) {
  if (maxEvents <= 0) return;
  
  // Count active events (phase 1 or 2, not phase 3)
  const activeCount = (st.tileEvents || []).filter(e => e.phase && e.phase !== 3).length;
  
  // Only spawn if below max concurrent events
  const available = maxEvents - activeCount;
  if (available <= 0) return;
  
  // Spawn 0 to available random events
  const toSpawn = Math.floor(Math.random() * (available + 1));
  
  for (let i = 0; i < toSpawn; i++) {
    // Pick random tile
    const x = Math.floor(Math.random() * st.size);
    const y = Math.floor(Math.random() * st.size);
    
    // Pick event type based on percentages: 10% destroy, 30% obstacle, 60% water (no rivers)
    const roll = Math.random() * 100;
    let eventType;
    if (roll < 10) eventType = 'destroy';
    else if (roll < 40) eventType = 'obstacle';
    else eventType = 'water';
    
    // Check if event with same coords already exists (active only)
    if (st.tileEvents.some(e => e.x === x && e.y === y && e.phase !== 3)) continue;
    
    // Add event in phase 1 (30% visible)
    st.tileEvents.push({ x, y, type: eventType, phase: 1 });
  }
}

function advanceTileEventPhases(st, config) {
  if (!st.tileEvents) return;
  
  for (let e of st.tileEvents) {
    if (e.phase === 1) {
      e.phase = 2; // Move to 100% visible
    } else if (e.phase === 2) {
      e.phase = 3; // Move to apply effect
      applyTileEvent(st, e.x, e.y, e.type, config);
    }
  }
  
  // Remove phase 3 events (cleanup)
  st.tileEvents = st.tileEvents.filter(e => e.phase !== 3);
}

// Apply poison effects for units standing on poison water at the start of a new round
function applyPoisonEffects(roomId) {
  const room = rooms[roomId]; if (!room || !room.state) return;
  const st = room.state;
  let changed = false;
  for (let y = 0; y < st.size; y++) {
    for (let x = 0; x < st.size; x++) {
      const terr = st.terrain && st.terrain[y] ? st.terrain[y][x] : null;
      if (!terr || terr.type !== 'water' || terr.subtype !== 'poison') continue;
      const obj = st.grid[y][x];
      if (obj && obj.type === 'unit') {
        if (obj.level > 1) {
          obj.level = Math.max(1, obj.level - 1);
        } else {
          // level === 1 -> unit dies
          st.grid[y][x] = null;
        }
        changed = true;
      }
    }
  }
  if (changed) {
    removeDeadPlayers(room);
    checkEndGame(roomId);
    io.to(roomId).emit('state', st);
  }
}

function applyTileEvent(st, x, y, eventType, config = {}) {
  if (!inside(x, y, st.size)) return;
  const tile = st.grid[y][x];
  const terr = st.terrain && st.terrain[y] ? st.terrain[y][x] : null;

  if (eventType === 'destroy') {
    // remove object at location
    st.grid[y][x] = null;
    // 10% chance to spawn a new water terrain on a random empty cell
    if (Math.random() < 0.1) {
      const emptySpaces = [];
      for (let yy = 0; yy < st.size; yy++) {
        for (let xx = 0; xx < st.size; xx++) {
          if (!st.grid[yy][xx] && !(st.terrain && st.terrain[yy] && st.terrain[yy][xx])) emptySpaces.push({ x: xx, y: yy });
        }
      }
      if (emptySpaces.length > 0) {
        const randomEmpty = emptySpaces[Math.floor(Math.random() * emptySpaces.length)];
        if (!st.terrain) st.terrain = Array.from({ length: st.size }, () => Array.from({ length: st.size }, () => null));
        st.terrain[randomEmpty.y][randomEmpty.x] = { type: 'water', subtype: 'water' };
      }
    }
  } else if (eventType === 'obstacle') {
    // toggle obstacle object at location
    if (tile && tile.type === 'obstacle') {
      st.grid[y][x] = null;
    } else {
      const hp = Number.isFinite(config.obstacleHp) && config.obstacleHp > 0 ? config.obstacleHp : 6;
      st.grid[y][x] = { type: 'obstacle', hp, maxHp: hp };
    }
  } else if (eventType === 'water') {
    // toggle water terrain at location
    if (!st.terrain) st.terrain = Array.from({ length: st.size }, () => Array.from({ length: st.size }, () => null));
    if (st.terrain[y][x] && st.terrain[y][x].type === 'water') {
      st.terrain[y][x] = null;
    } else {
      st.terrain[y][x] = { type: 'water', subtype: 'water' };
    }
  }
}

function activateTile(st, x, y, ownerPid, hitTracker={}, config={}) {
  if (!inside(x,y,st.size)) return;
  const tile = st.grid[y][x];
  if (!tile || tile.type!=='unit') return;

  const key = `${x},${y}`;
  if (!hitTracker[key]) hitTracker[key]=0;
  // damage any adjacent obstacles when this tile activates
  damageAdjacentObstacles(st, x, y, 1, config);
  if (tile.level===3) st.grid[y][x]=null;

  const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
  for (const [dx,dy] of dirs) {
    const nx=x+dx, ny=y+dy;
    if (!inside(nx,ny,st.size)) continue;
    // Cannot move to regular water, but can move to poison water
    const terr = st.terrain && st.terrain[ny] ? st.terrain[ny][nx] : null;
    if (terr && terr.type === 'water' && terr.subtype !== 'poison') continue;
    const target = st.grid[ny][nx];
    if (!target) {
      st.grid[ny][nx] = { type:'unit', pid:ownerPid, level:1 };
      continue;
    }
    if (target.type!=='unit') continue;
    const tkey = `${nx},${ny}`;
    hitTracker[tkey] = (hitTracker[tkey]||0)+1;
    if (target.pid===ownerPid) {
      if (target.level<3) target.level++;
      else if (target.level===3 && hitTracker[tkey]===1) activateTile(st,nx,ny,ownerPid,hitTracker,config);
    } else {
      target.pid = ownerPid;
      if (target.level<3) target.level++;
      else if (target.level===3 && hitTracker[tkey]===1) activateTile(st,nx,ny,ownerPid,hitTracker,config);
    }
  }
}

function burst(st, x, y, ownerPid, config={}) {
  if (!inside(x,y,st.size)) return;
  const tile=st.grid[y][x];
  // Check if target is regular water (can't burst there, but can burst on poison water)
  const terr = st.terrain && st.terrain[y] ? st.terrain[y][x] : null;
  if (terr && terr.type === 'water' && terr.subtype !== 'poison') return;
  // any burst/activation at (x,y) damages adjacent obstacles (4-way)
  damageAdjacentObstacles(st, x, y, 1, config);
  if (!tile) st.grid[y][x]={type:'unit', pid:ownerPid, level:1};
  else if (tile.type==='unit') {
    if (tile.pid!==ownerPid) tile.pid=ownerPid;
    if (tile.level===3) activateTile(st, x, y, ownerPid, {}, config);
    else tile.level=Math.min(tile.level+1,3);
  } else if (tile.type==='obstacle') {
    // Only damage if obstacleHp is not 0
    if (config.obstacleHp !== 0) {
      tile.hp=(tile.hp||tile.maxHp||1)-1;
      if (tile.hp<=0) st.grid[y][x]=null;
    }
  }
}

function downgradeTile(st,x,y,ownerPid) {
  if (!inside(x,y,st.size)) return;
  const tile=st.grid[y][x];
  if (!tile||tile.type!=='unit'||tile.pid!==ownerPid) return;
  if (tile.level===1) st.grid[y][x]=null;
  else tile.level--;
}

// -------------------------
// Player elimination & turn order helpers
function updateAliveStatus(st) {
  for (const pid in st.playersMeta) {
    const meta = st.playersMeta[pid];
    const pidNum = Number(pid);
    const hasUnits = st.grid.some(row => row.some(cell => cell && cell.type === 'unit' && cell.pid === pidNum));
    meta.alive = !!hasUnits;
  }
}

function removeDeadPlayers(room) {
  const st=room.state;
  for (const pid in st.playersMeta) {
    const meta=st.playersMeta[pid];
    const alive=st.grid.some(row=>row.some(c=>c && c.type==='unit' && c.pid===Number(pid)));
    meta.alive=!!alive;
  }
  st.turnOrder=st.turnOrder.filter(pid=>st.playersMeta[pid] && st.playersMeta[pid].alive);
  if (!st.turnOrder.length) st.activeIndex=0;
  else if (st.activeIndex>=st.turnOrder.length) st.activeIndex=0;
}

// -------------------------
// Starter & Normal timers (per-room)
function startStarterTimer(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  if (room.timer) { clearInterval(room.timer); room.timer = null; }

  let remaining = 120;
  io.to(roomId).emit('turnTimer', { remaining });

  room.timer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(room.timer); room.timer = null;
      handleStarterTimeout(roomId);
    } else {
      io.to(roomId).emit('turnTimer', { remaining });
    }
  }, 1000);
}

function handleStarterTimeout(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  const st = room.state;
  const activePid = st.turnOrder[st.activeIndex];
  if (st.playersMeta[activePid]) {
    st.playersMeta[activePid].alive = false;
    for (let y = 0; y < st.size; y++) {
      for (let x = 0; x < st.size; x++) {
        const cell = st.grid[y][x];
        if (cell && cell.type === 'unit' && cell.pid === activePid) st.grid[y][x] = null;
      }
    }
    st.startersToPlace = Math.max(0, st.startersToPlace - 1);
    io.to(roomId).emit('state', st);
    io.to(roomId).emit('playerKicked', { pid: activePid, reason: 'starterTimeout' });
  }
  nextStarterTurn(roomId);
}

function nextStarterTurn(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  const st = room.state;

  if (!st.turnOrder.length) return startNormalTurn(roomId);

  for (let i = 0; i < st.turnOrder.length; i++) {
    st.activeIndex = (st.activeIndex + 1) % st.turnOrder.length;
    const pid = st.turnOrder[st.activeIndex];
    if (st.playersMeta[pid] && st.playersMeta[pid].alive !== false) break;
  }

  if (st.startersToPlace <= 0) {
    startNormalTurn(roomId);
    return;
  }

  // Calculate blocked zones for turn 1 (starter placement phase)
  const spawnRange = getSpawnBlockRange(st.size);
  const blockedZones = new Set();
  for (let y = 0; y < st.size; y++) {
    for (let x = 0; x < st.size; x++) {
      const c = st.grid[y][x];
      if (c && c.type === 'unit') {
        // Block all tiles within spawn range (both cardinal and diagonal)
        for (let yy = Math.max(0, y - spawnRange); yy <= Math.min(st.size - 1, y + spawnRange); yy++) {
          for (let xx = Math.max(0, x - spawnRange); xx <= Math.min(st.size - 1, x + spawnRange); xx++) {
            if (Math.abs(xx - x) <= spawnRange && Math.abs(yy - y) <= spawnRange) {
              blockedZones.add(`${xx},${yy}`);
            }
          }
        }
      }
    }
  }
  st.blockedZones = Array.from(blockedZones).map(key => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });

  const activePid = st.turnOrder[st.activeIndex];
  io.to(roomId).emit('turnChange', { activePid });
  io.to(roomId).emit('state', st);
  if (st.playersMeta[activePid] && st.playersMeta[activePid].isAI) {
    setTimeout(() => runAI(roomId, activePid), 350);
  }
  startStarterTimer(roomId);
}

function startNormalTurn(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  const st = room.state;

  if (st.turnOrder.length === 0) return;

  // Clear blocked zones (starter phase is over)
  st.blockedZones = [];

  if (st.activeIndex === undefined || st.activeIndex >= st.turnOrder.length) st.activeIndex = 0;
  const activePid = st.turnOrder[st.activeIndex];
  io.to(roomId).emit('turnChange', { activePid });

  if (st.playersMeta[activePid] && st.playersMeta[activePid].isAI) setTimeout(() => runAI(roomId, activePid), 350);
  startNormalTurnTimer(roomId);
}

function startNormalTurnTimer(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  const st = room.state;
  if (room.timer) { clearInterval(room.timer); room.timer = null; }

  let remaining = 30;
  io.to(roomId).emit('turnTimer', { remaining });

  room.timer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(room.timer); room.timer = null;
      handleTurnTimeout(roomId);
    } else {
      io.to(roomId).emit('turnTimer', { remaining });
    }
  }, 1000);
}

function handleTurnTimeout(roomId) {
  nextNormalTurn(roomId);
}

// Calculate spawn block range based on map size
function getSpawnBlockRange(mapSize) {
  if (mapSize === 10) return 2;
  if (mapSize >= 12 && mapSize <= 20) return 3;
  if (mapSize >= 22) return 4;
  return 2; // default
}

function nextNormalTurn(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  const st = room.state;
  if (!st.turnOrder.length) return;

  // Advance to next alive player
  const prevIndex = st.activeIndex;
  for (let i = 0; i < st.turnOrder.length; i++) {
    st.activeIndex = (st.activeIndex + 1) % st.turnOrder.length;
    const pid = st.turnOrder[st.activeIndex];
    if (st.playersMeta[pid] && st.playersMeta[pid].alive !== false) break;
  }

  // If we wrapped to the first player (index 0), count as a new round
  if (st.activeIndex === 0) {
    st.turnNumber = (st.turnNumber || 1) + 1;
    // Apply poison effects for units standing on poison water at start of new round
    applyPoisonEffects(roomId);
    // Advance tile event phases at the start of each new round
    advanceTileEventPhases(st, room.config);
    // Spawn tile events at the start of each new round
    spawnTileEvents(st, room.config.tileEventsMax);
  }

  const activePid = st.turnOrder[st.activeIndex];
  io.to(roomId).emit('turnChange', { activePid });
  if (st.playersMeta[activePid] && st.playersMeta[activePid].isAI) setTimeout(() => runAI(roomId, activePid), 350);
  startNormalTurnTimer(roomId);
}

// -------------------------
// Endgame check
function checkEndGame(roomId) {
  const room = rooms[roomId];
  if (!room || !room.state) return;
  const st = room.state;
  const alivePlayers = Object.values(st.playersMeta).filter(p => p.alive);
  if (st.startersToPlace > 0) return;
  if (st.ended) return;
  if (alivePlayers.length <= 1) {
    st.ended = true;
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    st.winner = alivePlayers.length === 1 ? alivePlayers[0].pid : null;
    io.to(roomId).emit('gameEnded', { winner: st.winner });
  }
}


// Validate starter position (used by both socket handler and AI)
function isValidStarterPos(st, x, y) {
  if (!inside(x,y,st.size)) return { ok: false, error: 'Position out of bounds' };
  if (st.grid[y][x]) return { ok: false, error: 'Position occupied' };
  
  // Check if position is in blocked zones (red overlay areas)
  if (st.blockedZones && st.blockedZones.some(zone => zone.x === x && zone.y === y)) {
    return { ok: false, error: 'Too close to enemy unit' };
  }
  
  // Cannot place on any water (poison or normal)
  const terr = st.terrain && st.terrain[y] ? st.terrain[y][x] : null;
  if (terr && terr.type === 'water') return { ok: false, error: 'Cannot spawn on water' };
  for (let yy = y-1; yy <= y+1; yy++) for (let xx = x-1; xx <= x+1; xx++) {
    if (!inside(xx,yy,st.size)) continue;
    const c = st.grid[yy][xx];
    if (c && c.type === 'unit') return { ok: false, error: 'Too close to enemy unit' };
  }
  let bcount = 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [dx,dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx,ny,st.size)) continue;
    const c = st.grid[ny][nx];
    if (c && c.type==='obstacle') bcount++;
  }
  if (bcount >= 3) return { ok: false, error: 'Too many obstacles nearby' };
  
  // Dynamic spawn range check based on map size
  const spawnRange = getSpawnBlockRange(st.size);
  for (const pidKey of Object.keys(st.playersMeta)) {
    const pm = st.playersMeta[pidKey];
    if (!pm) continue;
    for (let yy = 0; yy < st.size; yy++) for (let xx = 0; xx < st.size; xx++) {
      const c = st.grid[yy][xx];
      if (c && c.type === 'unit' && c.pid === Number(pidKey)) {
        // Check within spawn range (both cardinal and diagonal)
        if (Math.abs(xx - x) <= spawnRange && Math.abs(yy - y) <= spawnRange) {
          return { ok: false, error: 'Too close to enemy unit' };
        }
      }
    }
  }
  return { ok: true };
}
// -------------------------
// AI behavior
function runAI(roomId, pid) {
  const room = rooms[roomId]; if (!room || !room.state) return;
  const st = room.state;
  const meta = st.playersMeta[pid];
  if (!meta || meta.alive === false) return nextNormalTurn(roomId);



  if (!meta.starPlaced && st.startersToPlace > 0) {
    const coords = [];
    for (let y = 0; y < st.size; y++) for (let x = 0; x < st.size; x++) if (!st.grid[y][x]) coords.push({x,y});
    shuffle(coords);
    for (const p of coords) {
      const validation = isValidStarterPos(st, p.x, p.y);
      if (validation && validation.ok) {
        st.grid[p.y][p.x] = { type: 'unit', pid, level: 1 };
        meta.starPlaced = true;
        st.startersToPlace = Math.max(0, st.startersToPlace - 1);
        st.lastMove = { pid, x: p.x, y: p.y };
        io.to(roomId).emit('state', st);
        return nextStarterTurn(roomId);
      }
    }
    // No valid starter position found for AI (respect blocked zones) � skip placement
    return nextStarterTurn(roomId);
  }
  // Build candidate list (existing units)
  let candidates = [];
  for (let y = 0; y < st.size; y++) {
    for (let x = 0; x < st.size; x++) {
      const t = st.grid[y][x];
      if (t && t.type === 'unit' && t.pid === pid) candidates.push({ x, y, level: t.level });
    }
  }
  if (!candidates.length) return nextNormalTurn(roomId);

  // Wrap AI decision with a timeout (3 seconds max) to prevent freeze
  let pick = null;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    console.warn(`AI decision timeout for pid=${pid} in room=${roomId}, picking random move`);
    pick = candidates[Math.floor(Math.random() * candidates.length)] || null;
  }, 3000);

  try {
    pick = ai.decideMove(st, pid, st.playersMeta[pid]);
  } catch (e) {
    console.error(`AI decision error for pid=${pid}:`, e.message);
    pick = candidates[0] || null;
  }
  
  clearTimeout(timeout);
  if (timedOut) {
    // timeout already set pick
  }

  if (!pick) return nextNormalTurn(roomId);
  const tile = st.grid[pick.y][pick.x];
  if (tile && tile.level === 3) activateTile(st, pick.x, pick.y, pid);
  else if (tile) tile.level = Math.min(3, tile.level + 1);
  else st.grid[pick.y][pick.x] = { type: 'unit', pid, level: 1 };

  st.lastMove = { pid, x: pick.x, y: pick.y };
  io.to(roomId).emit('state', st);
  removeDeadPlayers(room);
  checkEndGame(roomId);
  try {
    const pmeta = st.playersMeta[pid] || {};
    console.log(`AI pick - pid=${pid} name=${pmeta.name || ''} personality=${pmeta.personality || pmeta.personality} level=${pmeta.aiLevel || 'normal'} pick=${pick ? `${pick.x},${pick.y}` : 'none'}`);
  } catch (e) { /* ignore logging errors */ }
  return nextNormalTurn(roomId);
}

// -------------------------
// Socket.io handlers
io.on('connection', socket => {
  let myRoom = null;
  let myPid = null;

  socket.on('createRoom', ({ name, color, maxPlayers = 4, aiCount = 0, aiConfig = null, mapSize = 10, bPct = 8, obstacleOn = true, obstacleHp = 6, waterOn = false, waterPct = 0, scatteredWaterOn = false, riverOn = false, lakeOn = false, poisonWaterOn = false, tileEventsMax = 0, isPrivate = false, password = '' }, cb) => {
    try {
      maxPlayers = Math.min(Math.max(Number(maxPlayers) || 4, 2), 16);
      mapSize = Math.min(Math.max(Number(mapSize) || 10, 10), 30);
      if (mapSize % 2 !== 0) mapSize++;
      tileEventsMax = Math.min(Math.max(Number(tileEventsMax) || 0, 0), 10);
      obstacleHp = obstacleHp > 0 ? obstacleHp : 0;

      const roomId = nanoid(6).toUpperCase();
      // normalize aiConfig (counts per difficulty)
      const normalizedAi = aiConfig && typeof aiConfig === 'object' ? {
        normal: Number(aiConfig.normal) || 0,
        advanced: Number(aiConfig.advanced) || 0,
        grandmaster: Number(aiConfig.grandmaster) || 0
      } : { normal: Number(aiCount) || 0, advanced: 0, grandmaster: 0 };

      const room = {
        roomId,
        hostSid: socket.id,
        config: { maxPlayers, aiConfig: normalizedAi, mapSize, bPct, obstacleOn, obstacleHp, waterOn, waterPct, scatteredWaterOn, riverOn, lakeOn, poisonWaterOn, tileEventsMax },
        players: [],
        state: null,
        timer: null,
        private: isPrivate,
        password: isPrivate ? password : null
      };

      const hostPlayer = {
        sid: socket.id,
        pid: 0,
        name: (name || 'Host'),
        color: (color || '#e74c3c'),
        isAI: false,
        alive: true,
        starPlaced: false
      };
      room.players.push(hostPlayer);
      rooms[roomId] = room;

      socket.join(roomId);
      myRoom = roomId; myPid = 0;
      // return players and config for immediate rendering
      cb && cb({ ok: true, roomId, pid: 0, players: room.players, config: room.config });

      io.to(roomId).emit('lobbyUpdate', { players: room.players, config: room.config });
    } catch (err) {
      console.error('createRoom error', err);
      cb && cb({ ok: false, err: 'create failed' });
    }
  });

  socket.on('joinRoom', ({ roomId, name, color, password = '' }, cb) => {
    if (!roomId) return cb && cb({ ok:false, err:'No room provided' });
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room) return cb && cb({ ok: false, err: 'Room not found' });
    if (room.private && room.password !== password) return cb && cb({ ok: false, err: 'Invalid password' });
    if (room.players.length >= room.config.maxPlayers) return cb && cb({ ok:false, err:'Room full' });

    const pid = room.players.length;
    const defaultColors = ['#3498db','#2ecc71','#9b59b6','#e67e22','#1abc9c','#f06292','#f4d03f','#777'];
    const chosenColor = color || defaultColors.find(c => !room.players.some(p => p.color === c)) || '#777';

    const player = {
      sid: socket.id,
      pid,
      name: (name || `P${pid+1}`),
      color: chosenColor,
      isAI: false,
      alive: true,
      starPlaced: false
    };
    room.players.push(player);
    socket.join(rid);
    myRoom = rid; myPid = pid;

    // Return players & config so client can populate immediately
    cb && cb({ ok: true, roomId: rid, pid, players: room.players, config: room.config });
    io.to(rid).emit('lobbyUpdate', { players: room.players, config: room.config });
  });

  socket.on('leaveRoom', ({ roomId }, cb) => {
    if (!roomId) return cb && cb({ ok: false });
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room) return cb && cb({ ok: false });

    const idx = room.players.findIndex(p => p.sid === socket.id);
    if (idx !== -1) {
      const leaving = room.players.splice(idx, 1)[0];
      if (room.state) removePlayerFromState(room, leaving.pid);
    }

    socket.leave(rid);

    if (room.hostSid === socket.id) room.hostSid = room.players[0]?.sid || null;
    if (!room.players.length) {
      if (room.timer) { clearInterval(room.timer); room.timer = null; }
      delete rooms[rid];
    } else {
      io.to(rid).emit('lobbyUpdate', { players: room.players, config: room.config });
      if (room.state) io.to(rid).emit('state', room.state);
    }

    cb && cb({ ok: true });
  });

  socket.on('startGame', ({ roomId }, cb) => {
    if (!roomId) return cb && cb({ ok: false, err: 'No room' });
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room) return cb && cb({ ok: false, err: 'Room not found' });
    if (socket.id !== room.hostSid) return cb && cb({ ok: false, err: 'Only host can start' });

    // Add AI players according to configured counts per difficulty.
    // NOTE: previously this respected room.config.maxPlayers which could prevent spawning all requested bots.
    // To honor the user's requested AI counts, add all requested AI bots (may exceed maxPlayers).
    const botColors = ['#2ecc71','#9b59b6','#e67e22','#1abc9c','#f06292','#f4d03f','#95a5a6'];
    const aiCfg = room.config.aiConfig || { normal: 0, advanced: 0, grandmaster: 0 };

    function addBotsUnbounded(count, levelName) {
      const addCount = Math.max(0, Number(count) || 0);
      for (let i = 0; i < addCount; i++) {
        const pid = room.players.length;
        room.players.push({ sid: null, pid, name: `[BOT-${levelName.toUpperCase()}-${pid}]`, color: botColors[pid % botColors.length], isAI: true, aiLevel: levelName, alive: true, starPlaced: false });
      }
    }

    addBotsUnbounded(aiCfg.normal, 'normal');
    addBotsUnbounded(aiCfg.advanced, 'advanced');
    addBotsUnbounded(aiCfg.grandmaster, 'grandmaster');

    const size = room.config.mapSize;
    const gen = makeGrid(size, room.config.bPct, { obstacleHp: room.config.obstacleHp, waterOn: room.config.waterOn, waterPct: room.config.waterPct, scatteredWaterOn: room.config.scatteredWaterOn, riverOn: room.config.riverOn, lakeOn: room.config.lakeOn, poisonWaterOn: room.config.poisonWaterOn });
    const state = { size, terrain: gen.terrain, grid: gen.objects, playersMeta: {}, turnOrder: [], activeIndex: 0, startersToPlace: room.players.length, ended: false, winner: null, lastMove: null, turnNumber: 1, tileEvents: [], blockedZones: [] };
    room.players.forEach(p => { state.playersMeta[p.pid] = { ...p }; state.turnOrder.push(p.pid); });
    shuffle(state.turnOrder);
    room.state = state;

    io.to(rid).emit('gameStarted', { state });
    io.to(rid).emit('state', state);
    cb && cb({ ok: true });

    const firstPid = state.turnOrder[state.activeIndex];
    io.to(rid).emit('turnChange', { activePid: firstPid });
    startStarterTimer(rid);
    if (state.playersMeta[firstPid].isAI) setTimeout(() => runAI(rid, firstPid), 700);
  });

  socket.on('action', ({ roomId, type, payload }, cb) => {
    if (!roomId) return cb && cb({ ok:false, err:'no room' });
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room || !room.state) return cb && cb({ ok: false, err: 'No such room or state' });
    const st = room.state;
    const player = room.players.find(p => p.sid === socket.id);
    const pid = player ? player.pid : null;
    const activePid = st.turnOrder[st.activeIndex];

    if (st.ended) return cb && cb({ ok: false, err: 'Game ended' });
    if (pid !== activePid) return cb && cb({ ok: false, err: 'Not your turn' });

    const setLastMove = (x, y) => st.lastMove = { pid, x, y };

    if (type === 'placeStarter') {
      const { x, y } = payload;
      const validation = isValidStarterPos(st, x, y);
      if (!validation.ok) {
        return cb && cb({ ok: false, err: validation.error });
      }
      st.grid[y][x] = { type: 'unit', pid, level: 1 };
      if (st.playersMeta[pid]) st.playersMeta[pid].starPlaced = true;
      st.startersToPlace = Math.max(0, st.startersToPlace - 1);
      setLastMove(x, y);
      io.to(rid).emit('state', st);
      nextStarterTurn(rid);
      return cb && cb({ ok: true });
    } else if (type === 'upgrade') {
      const { x, y } = payload;
      if (!inside(x, y, st.size)) return cb && cb({ ok: false, err: 'Out of bounds' });
      const tile = st.grid[y][x];
      if (!tile || tile.type !== 'unit' || tile.pid !== pid) return cb && cb({ ok: false, err: 'Invalid tile' });
      if (tile.level === 3) activateTile(st, x, y, pid, {}, room.config);
      else tile.level = Math.min(3, tile.level + 1);
      setLastMove(x, y);
    } else if (type === 'downgrade') {
      const { x, y } = payload;
      if (!inside(x, y, st.size)) return cb && cb({ ok: false, err: 'Out of bounds' });
      downgradeTile(st, x, y, pid);
      setLastMove(x, y);
    } else if (type === 'placeUnit' || type === 'burst') {
      const { x, y } = payload;
      if (!inside(x, y, st.size)) return cb && cb({ ok: false, err: 'Out of bounds' });
      burst(st, x, y, pid, room.config);
      setLastMove(x, y);
    } else {
      return cb && cb({ ok: false, err: 'Unknown action' });
    }

    io.to(rid).emit('state', st);
    removeDeadPlayers(room);
    checkEndGame(rid);
    nextNormalTurn(rid);
    return cb && cb({ ok: true });
  });

  socket.on('timeout', ({ roomId }) => {
    if (!roomId) return;
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room || !room.state) return;
    const st = room.state;
    if (st.startersToPlace > 0) handleStarterTimeout(rid);
    else handleTurnTimeout(rid);
  });

  socket.on('getLobbies', ({}, cb) => {
    const lobbies = [];
    for (const rid in rooms) {
      const room = rooms[rid];
      if (!room.state) { // only unstarted lobbies
        lobbies.push({
          roomId: room.roomId,
          hostName: room.players[0]?.name || 'Host',
          players: room.players.length,
          maxPlayers: room.config.maxPlayers,
          private: room.private || false
        });
      }
    }
    cb && cb({ lobbies });
    // Also broadcast to all clients so lobby browser updates
    socket.emit('lobbiesList', { lobbies });
  });

  socket.on('sendChat', ({ roomId, message }, cb) => {
    if (!roomId || !message) return;
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room) return cb && cb({ ok: false, err: 'Room not found' });
    
    const sender = room.players.find(p => p.sid === socket.id);
    if (!sender) return cb && cb({ ok: false, err: 'Not in room' });
    
    const msg = {
      sender: sender.name,
      senderColor: sender.color,
      message: String(message).substring(0, 256),
      timestamp: Date.now()
    };
    
    io.to(rid).emit('chatMessage', msg);
    cb && cb({ ok: true });
  });

  socket.on('kickPlayer', ({ roomId, targetPid }, cb) => {
    if (!roomId) return cb && cb({ ok: false, err: 'No room' });
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room) return cb && cb({ ok: false, err: 'Room not found' });
    if (room.hostSid !== socket.id) return cb && cb({ ok: false, err: 'Only host can kick' });
    
    const targetPlayer = room.players.find(p => p.pid === targetPid);
    if (!targetPlayer) return cb && cb({ ok: false, err: 'Player not found' });
    if (targetPid === 0) return cb && cb({ ok: false, err: 'Cannot kick host' });
    
    const idx = room.players.findIndex(p => p.pid === targetPid);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      if (room.state) removePlayerFromState(room, targetPid);
    }
    
    if (targetPlayer.sid) {
      io.to(targetPlayer.sid).emit('playerKicked', { reason: 'kickedByHost' });
    }
    
    io.to(rid).emit('lobbyUpdate', { players: room.players, config: room.config });
    if (room.state) io.to(rid).emit('state', room.state);
    
    cb && cb({ ok: true });
  });

  socket.on('changeColor', ({ roomId, newColor }, cb) => {
    if (!roomId || !newColor) return cb && cb({ ok: false, err: 'Missing room or color' });
    const rid = String(roomId).toUpperCase();
    const room = rooms[rid];
    if (!room) return cb && cb({ ok: false, err: 'Room not found' });
    
    // Only allow changing color if game hasn't started
    if (room.state) return cb && cb({ ok: false, err: 'Cannot change color after game starts' });
    
    const player = room.players.find(p => p.sid === socket.id);
    if (!player) return cb && cb({ ok: false, err: 'Player not in room' });
    
    player.color = newColor;
    io.to(rid).emit('lobbyUpdate', { players: room.players, config: room.config });
    
    cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    if (myRoom && rooms[myRoom]) {
      const room = rooms[myRoom];
      const idx = room.players.findIndex(p => p.sid === socket.id);
      if (idx !== -1) { const leaving = room.players.splice(idx, 1)[0]; if (room.state) removePlayerFromState(room, leaving.pid); }
      socket.leave(myRoom);
      if (!room.players.length) { if (room.timer) { clearInterval(room.timer); room.timer = null; } delete rooms[myRoom]; }
      else { io.to(myRoom).emit('lobbyUpdate', { players: room.players, config: room.config }); if (room.state) io.to(myRoom).emit('state', room.state); }
    }
  });

  function removePlayerFromState(room, pidToRemove) {
    if (!room || !room.state) return;
    const st = room.state;

    for (let y = 0; y < st.size; y++) for (let x = 0; x < st.size; x++) {
      const cell = st.grid[y][x]; if (cell && cell.type === 'unit' && cell.pid === pidToRemove) st.grid[y][x] = null;
    }

    delete st.playersMeta[pidToRemove];
    st.turnOrder = st.turnOrder.filter(p => p !== pidToRemove);
    if (st.turnOrder.length === 0) st.activeIndex = 0;
    else if (st.activeIndex >= st.turnOrder.length) st.activeIndex = 0;

    io.to(room.roomId).emit('state', st);
    if (Object.keys(st.playersMeta).length <= 1) checkEndGame(room.roomId);
    else startNormalTurn(room.roomId);
  }
});

// -------------------------
server.listen(PORT, '0.0.0.0', () => console.log(`Colony Conquest server running on :${PORT}`));




