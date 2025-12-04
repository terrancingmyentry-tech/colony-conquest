const fs = require('fs');

let content = fs.readFileSync('./server.js', 'utf8');

// Step 1: Check if function already at module level
if (content.includes('function isValidStarterPos(st, x, y)')) {
  console.log('Function already at module level');
  process.exit(0);
}

// Step 2: Add module-level function before runAI
const funcCode = `
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

`;

// Find the exact position to insert (before '// -------------------------\n// AI behavior\nfunction runAI')
const idx = content.indexOf('// -------------------------\n// AI behavior');
if (idx === -1) {
  console.error('Could not find insertion point');
  process.exit(1);
}

// Insert the function
content = content.slice(0, idx) + funcCode + content.slice(idx);

fs.writeFileSync('./server.js', content);
console.log('Module-level function inserted successfully!');
