// client.js - full updated client (tile events, obstacle HP, lobby fixed)
// Avoid redeclaring `socket` if another script already created it (e.g., `public/index.js`).
const socket = window.socket || (window.socket = io());
let roomId = null;
let pid = null;
let mySid = socket.id;
let isHost = false;
let state = null;
let zoom = 1.0;

// Variant caches for per-tile random selection (obstacle, grass)
let obstacleVariantCache = {};
let grassVariantCache = {};

// Camera / viewport
let offsetX = 0;
let offsetY = 0;

// Custom texture loader (place your files under public/custom_assets/custom/)
const customTextures = {
  // Grass variants (pick randomly per tile for visual variety)
  grassVariants: [null, null, null, null], // Grass_1, Grass_2, Grass_3, Grass_4
  // Water/sand/obstacle with variants
  // waterVariants holds specific edge/center tile images
  waterVariants: {
    top_left: null,
    top_mid: null,
    top_right: null,
    mid_left: null,
    mid: null,
    mid_right: null,
    bottom_left: null,
    bottom_mid: null,
    bottom_right: null,
    one: null,
    grass_corner: null
  },
   // Water corner tiles (1, 2, 3, 4 corners)
   waterCorner4: null, // All 4 corners
   waterCorner3: {
     no_right_bottom: null,
     no_left_bottom: null,
     no_left_top: null,
     no_right_top: null
   },
   waterCorner2: {
     top_left_bottom_right: null,
     top_right_bottom_left: null,
     bottom: null,
     left: null,
     right: null,
     top: null
   },
   waterCorner1: {
     top_right: null,
     top_left: null,
     bottom_right: null,
     bottom_left: null
   },
   // backward-compat fallback (center water)
   water: null,
   poisonWater: null,
   sand: null,
   obstacleVariants: [null, null, null], // Bush_Obstacle, Rock_Obstacle, Tree_Obstacle
   // Unit textures by level
   unitLevels: [null, null, null] // Unit_Lvl_1, Unit_Lvl_2, Unit_Lvl_3
};

// Track texture loading completion
let texturesLoadedPromise = null;
let texturesLoadedResolve = null;

function loadTextures() {
  console.log('?? Loading custom textures (robust loader)...');
  
  // Create a promise to track when all textures are loaded
  texturesLoadedPromise = new Promise(resolve => {
    texturesLoadedResolve = resolve;
  });

  // Try list of candidate URLs (unencoded and URL-encoded)
  function candidatesFor(name) {
    const base = `/custom_assets/custom/${name}`;
    const encoded = `/custom_assets/custom/${encodeURIComponent(name)}`;
    // include both; encodeURIComponent will encode spaces and other chars
    return [base, encoded];
  }

  // Attempt to fetch a URL and return a blob URL on success, else null
  async function tryFetchToBlob(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) {
        console.warn('fetch failed', url, res.status);
        return null;
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('fetch error for', url, e && e.message);
      return null;
    }
  }

  async function loadOne(name) {
    const cands = candidatesFor(name);
    // First try fetch->blob for each candidate (more robust across proxies)
    for (const u of cands) {
      const blobUrl = await tryFetchToBlob(u);
      if (blobUrl) {
        const img = new Image();
        img.onload = () => { console.log(`? ${name} loaded via fetch:`, u); requestDraw(); };
        img.onerror = () => { console.warn(`? Loaded blob but img error for ${name}`); };
        img.src = blobUrl;
        return img;
      }
    }
    // If fetch failed (CORS or network), fall back to assigning direct src to Image
    for (const u of cands) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { console.log(`? ${name} loaded via direct src:`, u); requestDraw(); };
        img.onerror = () => { console.warn(`?? direct src failed for ${name}:`, u); };
        img.src = u;
        // return image immediately; onerror will try next candidate next tick
        return img;
      } catch (e) {
        console.warn('error creating Image for', u, e && e.message);
      }
    }
    console.warn('All attempts failed for', name, '- creating placeholder image');
    try {
      const cvs = document.createElement('canvas');
      const s = 128;
      cvs.width = s; cvs.height = s;
      const cctx = cvs.getContext('2d');
      cctx.fillStyle = '#cccccc';
      cctx.fillRect(0,0,s,s);
      cctx.fillStyle = '#333';
      cctx.font = '16px sans-serif';
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';
      cctx.fillText(name.replace(/\.(png|jpg|jpeg|gif)$/i, ''), s/2, s/2);
      const img = new Image();
      img.onload = () => { console.log(`?? Placeholder generated for ${name}`); };
      img.src = cvs.toDataURL('image/png');
      return img;
    } catch (e) {
      return null;
    }
  }

  // Texture file names
  const files = {
    // Grass variants (place your 4 grass images)
    grass1: 'Grass1.png',
    grass2: 'Grass2.png',
    grass3: 'Grass3.png',
    grass4: 'Grass4.png',
    // Map elements
    sand: 'Sand.png',
    water: 'Water.png',
    poisonWater: 'Poison_Water.png',
    // Water variants (edges/corners)
    topLeftWater: 'Top_Left_Water.png',
    topMidWater: 'Top_Middle_Water.png',
    topRightWater: 'Top_Right_Water.png',
    midLeftWater: 'Middle_Left_Water.png',
    midRightWater: 'Middle_Right_Water.png',
    bottomLeftWater: 'Bottom_Left_Water.png',
    bottomMidWater: 'Bottom_Middle_Water.png',
    bottomRightWater: 'Bottom_Right_Water.png',
    waterOne: 'Water_One_Tile.png',
    grassCorner: 'Grass_Corner.png',
    obstacle1: 'Bush_Obstacle.png',
    obstacle2: 'Rock_Obstacle.png',
    obstacle3: 'Tree_Obstacle.png',
    // Units
    unit1: 'Unit_Lvl_1.png',
    unit2: 'Unit_Lvl_2.png',
    unit3: 'Unit_Lvl_3.png'
    // Water corner tiles (4 corners)
    ,
    waterC4: 'Water_4Corners.png',
   // Water corner tiles (3 corners)
   waterC3_no_right_bottom: 'Water_3Corners(no.right.bottom).png',
   waterC3_no_left_bottom: 'Water_3Corners(no.left.bottom).png',
   waterC3_no_left_top: 'Water_3Corners(no.left.top).png',
   waterC3_no_right_top: 'Water_3Corners(no.right.top).png',
   // Water corner tiles (2 corners)
   waterC2_tl_br: 'WaterC_TopLeft+BottomRight.png',
   waterC2_tr_bl: 'WaterC_TopRight+BottomLeft.png',
   waterC2_bottom: 'WaterC2_Bottom.png',
   waterC2_left: 'WaterC2_Left.png',
   waterC2_right: 'WaterC2_Right.png',
   waterC2_top: 'WaterC2_Top.png',
   // Water corner tiles (1 corner)
   waterC1_top_right: 'WaterC_TopRight.png',
   waterC1_top_left: 'WaterC_TopLeft.png',
   waterC1_bottom_right: 'WaterC_BottomRight.png',
   waterC1_bottom_left: 'WaterC_BottomLeft.png'
  };

  // Load all textures in parallel
  (async () => {
    customTextures.grassVariants[0] = await loadOne(files.grass1);
    customTextures.grassVariants[1] = await loadOne(files.grass2);
    customTextures.grassVariants[2] = await loadOne(files.grass3);
    customTextures.grassVariants[3] = await loadOne(files.grass4);
    customTextures.sand = await loadOne(files.sand);
    // Load center water and poison fallback
    customTextures.water = await loadOne(files.water);
    customTextures.poisonWater = await loadOne(files.poisonWater);
    // Load the new water edge/center variants (if present)
    customTextures.waterVariants.top_left = await loadOne(files.topLeftWater);
    customTextures.waterVariants.top_mid = await loadOne(files.topMidWater);
    customTextures.waterVariants.top_right = await loadOne(files.topRightWater);
    customTextures.waterVariants.mid_left = await loadOne(files.midLeftWater);
    // Use the center water as the mid (fallback) variant — specific mid asset may not exist
    customTextures.waterVariants.mid = customTextures.water;
    customTextures.waterVariants.mid_right = await loadOne(files.midRightWater);
    customTextures.waterVariants.bottom_left = await loadOne(files.bottomLeftWater);
    customTextures.waterVariants.bottom_mid = await loadOne(files.bottomMidWater);
    customTextures.waterVariants.bottom_right = await loadOne(files.bottomRightWater);
    customTextures.waterVariants.one = await loadOne(files.waterOne);
    customTextures.waterVariants.grass_corner = await loadOne(files.grassCorner);
      // Load water corner tiles
      customTextures.waterCorner4 = await loadOne(files.waterC4);
      customTextures.waterCorner3.no_right_bottom = await loadOne(files.waterC3_no_right_bottom);
      customTextures.waterCorner3.no_left_bottom = await loadOne(files.waterC3_no_left_bottom);
      customTextures.waterCorner3.no_left_top = await loadOne(files.waterC3_no_left_top);
      customTextures.waterCorner3.no_right_top = await loadOne(files.waterC3_no_right_top);
      customTextures.waterCorner2.top_left_bottom_right = await loadOne(files.waterC2_tl_br);
      customTextures.waterCorner2.top_right_bottom_left = await loadOne(files.waterC2_tr_bl);
      customTextures.waterCorner2.bottom = await loadOne(files.waterC2_bottom);
      customTextures.waterCorner2.left = await loadOne(files.waterC2_left);
      customTextures.waterCorner2.right = await loadOne(files.waterC2_right);
      customTextures.waterCorner2.top = await loadOne(files.waterC2_top);
      customTextures.waterCorner1.top_right = await loadOne(files.waterC1_top_right);
      customTextures.waterCorner1.top_left = await loadOne(files.waterC1_top_left);
      customTextures.waterCorner1.bottom_right = await loadOne(files.waterC1_bottom_right);
      customTextures.waterCorner1.bottom_left = await loadOne(files.waterC1_bottom_left);
    customTextures.obstacleVariants[0] = await loadOne(files.obstacle1);
    customTextures.obstacleVariants[1] = await loadOne(files.obstacle2);
    customTextures.obstacleVariants[2] = await loadOne(files.obstacle3);
    // Unit textures disabled: units are rendered via canvas shapes now
    customTextures.unitLevels[0] = null;
    customTextures.unitLevels[1] = null;
    customTextures.unitLevels[2] = null;
    console.log('? All textures loaded');
    if (texturesLoadedResolve) texturesLoadedResolve(true);
    draw();
  })();
}

// UI refs
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const startBtn = document.getElementById('startBtn');
const roomLabel = document.getElementById('roomLabel');
const playersList = document.getElementById('playersList');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: true, antialias: true, willReadFrequently: false });
// Optimize for quality rendering
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
const turnInfo = document.getElementById('turnInfo');
const lastMoveInfo = document.getElementById('lastMoveInfo');
const mapContainer = document.getElementById('mapContainer');
const timerDisplay = document.getElementById('turnTimer');
const hostNameInput = document.getElementById('hostName');
const hostColorInput = document.getElementById('hostColor');
const maxPlayersSel = document.getElementById('maxPlayers');
const aiCountSel = document.getElementById('aiCount');
const aiNormalSel = document.getElementById('aiNormal');
const aiAdvancedSel = document.getElementById('aiAdvanced');
const aiGrandmasterSel = document.getElementById('aiGrandmaster');
const mapSizeSel = document.getElementById('mapSize');
const obstaclePctSel = document.getElementById('obstaclePct');
let obstacleOnSel = document.getElementById('obstacleOn');
let obstacleHpOnSel = document.getElementById('obstacleHpOn');
let obstacleHpSel = document.getElementById('obstacleHp');
let waterOnSel = document.getElementById('waterOn');
let waterPctSel = document.getElementById('waterPct');
let riverOnSel = document.getElementById('riverOn');
let lakeOnSel = document.getElementById('lakeOn');
const tileEventsMaxSel = document.getElementById('tileEventsMax');
const guidePanelToggle = document.getElementById('guidePanelToggle');
const guidePanelContent = document.getElementById('guidePanelContent');
let guidePanelOpen = false;
const advancedBtn = document.getElementById('advancedBtn');
const advancedOptions = document.getElementById('advancedOptions');
const joinPassword = document.getElementById('joinPassword');
const lobbyBrowser = document.getElementById('lobbyBrowser');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const chatPanel = document.getElementById('chatPanel');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const lobbyPrivate = document.getElementById('lobbyPrivate');
const lobbyPassword = document.getElementById('lobbyPassword');

if (mapContainer) mapContainer.style.overflow = 'hidden';
if (canvas) canvas.style.display = 'block';

// Advanced toggle handler
if (advancedBtn && advancedOptions) {
  advancedBtn.addEventListener('click', () => {
    const isOpen = advancedOptions.classList.contains('show');
    advancedOptions.classList.toggle('show', !isOpen);
    advancedBtn.classList.toggle('open', !isOpen);
  });
}

// obstacle HP conditional display
function updateObstacleHpDisplay() {
  const obstacleHpLabel = document.getElementById('obstacleHpLabel');
  if (obstacleHpLabel && obstacleHpOnSel) {
    obstacleHpLabel.style.display = obstacleHpOnSel.checked ? 'block' : 'none';
  }
}
if (obstacleHpOnSel) {
  obstacleHpOnSel.addEventListener('change', updateObstacleHpDisplay);
  updateObstacleHpDisplay(); // init
}

// Random color defaults
(function setRandomDefaultColors() {
  const palette = ['#e74c3c','#2ecc71','#3498db','#9b59b6','#f1c40f','#e67e22','#1abc9c','#95a5a6'];
  hostColorInput.value = palette[Math.floor(Math.random()*palette.length)];
  joinColor.value = palette[Math.floor(Math.random()*palette.length)];
})();

// Enforce 30-char name limits
[hostNameInput, joinName].forEach(el => {
  if (el) el.addEventListener('input', () => {
    if (el.value.length > 30) el.value = el.value.substring(0, 30);
  });
});

// Populate selects
function populateHostSelects() {
  maxPlayersSel.innerHTML = '';
  for (let i = 2; i <= 16; i++) {
    const opt = document.createElement('option'); opt.value = i; opt.text = i; maxPlayersSel.appendChild(opt);
  }
  if (aiCountSel) {
    aiCountSel.innerHTML = '';
    for (let i = 0; i <= 8; i++) { const opt = document.createElement('option'); opt.value = i; opt.text = i; aiCountSel.appendChild(opt); }
  }
  if (aiNormalSel && aiAdvancedSel && aiGrandmasterSel) {
    aiNormalSel.innerHTML = ''; aiAdvancedSel.innerHTML = ''; aiGrandmasterSel.innerHTML = '';
    for (let i = 0; i <= 8; i++) {
      const optN = document.createElement('option'); optN.value = i; optN.text = i; aiNormalSel.appendChild(optN);
      const optA = document.createElement('option'); optA.value = i; optA.text = i; aiAdvancedSel.appendChild(optA);
      const optG = document.createElement('option'); optG.value = i; optG.text = i; aiGrandmasterSel.appendChild(optG);
    }
  }
  mapSizeSel.innerHTML = '';
  for (let i = 10; i <= 30; i += 2) { const opt = document.createElement('option'); opt.value = i; opt.text = i; mapSizeSel.appendChild(opt); }
  obstaclePctSel.innerHTML = '';
  for (let i = 0; i <= 50; i += 5) { const opt = document.createElement('option'); opt.value = i; opt.text = i + '%'; obstaclePctSel.appendChild(opt); }

  if (obstacleHpSel) {
    obstacleHpSel.innerHTML = '';
    const offOpt = document.createElement('option'); offOpt.value = 0; offOpt.text = 'Off (0)'; obstacleHpSel.appendChild(offOpt);
    for (let i = 1; i <= 10; i++) {
      const opt = document.createElement('option'); opt.value = i; opt.text = `${i} HP`; obstacleHpSel.appendChild(opt);
    }
  }

  if (waterPctSel) {
    waterPctSel.innerHTML = '';
    for (let i = 5; i <= 50; i += 5) { 
      const opt = document.createElement('option'); opt.value = i; opt.text = i + '%'; waterPctSel.appendChild(opt);
    }
  }

  if (tileEventsMaxSel) {
    tileEventsMaxSel.innerHTML = '';
    for (let i = 0; i <= 10; i++) {
      const opt = document.createElement('option'); opt.value = i; opt.text = i; tileEventsMaxSel.appendChild(opt);
    }
  }
}
populateHostSelects();

// Timer display
let turnTimer = null;
let remainingTime = 30;

// Highlights
let highlights = [];
function flashTile(x, y, color = '#f39c12', duration = 400) {
  highlights.push({ x, y, color });
  setTimeout(() => {
    highlights = highlights.filter(h => !(h.x === x && h.y === y));
    draw();
  }, duration);
}

// Create / Join / Leave
createBtn.onclick = () => {
  const name = hostNameInput.value || 'Host';
  const color = hostColorInput.value || '#e74c3c';
  const cfg = {
    name,
    color,
    maxPlayers: Number(maxPlayersSel.value),
    // support aiConfig (counts per difficulty)
    aiConfig: {
      normal: Number(aiNormalSel ? aiNormalSel.value : aiCountSel.value),
      advanced: Number(aiAdvancedSel ? aiAdvancedSel.value : 0),
      grandmaster: Number(aiGrandmasterSel ? aiGrandmasterSel.value : 0)
    },
    mapSize: Number(mapSizeSel.value),
    bPct: Number(obstaclePctSel.value),
    obstacleOn: obstacleOnSel ? obstacleOnSel.checked : false,
    obstacleHp: obstacleHpOnSel && obstacleHpOnSel.checked ? Number(obstacleHpSel.value) : 0,
    waterOn: waterOnSel ? waterOnSel.checked : false,
    waterPct: waterPctSel ? Number(waterPctSel.value) : 0,
    riverOn: riverOnSel ? riverOnSel.checked : false,
    lakeOn: lakeOnSel ? lakeOnSel.checked : false,
    tileEventsMax: tileEventsMaxSel ? Number(tileEventsMaxSel.value) : 0,
    isPrivate: lobbyPrivate ? lobbyPrivate.checked : false,
    password: lobbyPassword ? lobbyPassword.value : ''
  };
  socket.emit('createRoom', cfg, (res) => {
    if (res && res.ok) {
      roomId = res.roomId; pid = 0; isHost = true;
      roomLabel.textContent = `Room: ${roomId}`;
      startBtn.style.display = 'inline-block';
      leaveBtn.style.display = 'inline-block';
      document.getElementById('hostControls').style.display = 'block';
      // Disable create/join buttons when in lobby
      createBtn.disabled = true;
      joinBtn.disabled = true;

      // Update lobby UI immediately (server will broadcast too)
      playersList.innerHTML = `<div><span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:3px;margin-right:6px"></span>${name} (0)</div>`;
    } else alert(res?.err || 'Create failed');
  });
};

joinBtn.onclick = () => {
  const code = joinInput.value.trim().toUpperCase();
  const name = joinName.value || 'Guest';
  const color = joinColor.value || '#3498db';
  const password = joinPassword.value || '';
  if (!code) return alert('Enter room code');
  socket.emit('joinRoom', { roomId: code, name, color, password }, (res) => {
    if (!res || !res.ok) return alert(res ? res.err : 'Join failed');
    roomId = res.roomId; pid = res.pid; isHost = false;
    roomLabel.textContent = `Room: ${roomId}`;
    document.getElementById('hostControls').style.display = 'none';
    leaveBtn.style.display = 'inline-block';
    // Disable create/join buttons when in lobby
    createBtn.disabled = true;
    joinBtn.disabled = true;
    // render players returned by server
    if (res.players) renderPlayersList(res.players);
  });
};

leaveBtn.onclick = () => {
  if (!roomId) return;
  socket.emit('leaveRoom', { roomId }, (res) => {
    if (res && res.ok) {
      clearInterval(turnTimer);
      createBtn.disabled = false;
      joinBtn.disabled = false;
      alert('Left the game.');
      location.reload();
    }
  });
};

document.getElementById('leaveGameBtn')?.addEventListener('click', () => leaveBtn.onclick());
startBtn.onclick = () => {
  if (!roomId) return alert('No room');
  socket.emit('startGame', { roomId }, (res) => { if (!res.ok) alert(res.err); });
};

// Zoom helpers
function baseTile(size) { return canvas.width / size; }
function visibleTiles(size) {
  const tSize = baseTile(size) * zoom;
  // Calculate how many tiles (fractional) fit in the canvas
  return { x: canvas.width / tSize, y: canvas.height / tSize };
}
function clampCamera() {
  if (!state) return;
  const size = state.size;
  const tSize = baseTile(state.size) * zoom;
  // Allow camera to pan so that:
  // - First tile can be at x=0
  // - Last tile's right edge (pixel at tSize) reaches the right edge of canvas
  // This means the last tile can start at position: size - (canvas.width / tSize)
  // But we add 1 to fully show the last tile's right edge
  const maxOffsetX = Math.max(0, size - Math.floor(canvas.width / tSize));
  const maxOffsetY = Math.max(0, size - Math.floor(canvas.height / tSize));
  offsetX = Math.max(0, Math.min(offsetX, maxOffsetX));
  offsetY = Math.max(0, Math.min(offsetY, maxOffsetY));
}
function applyZoom(factor, centerX, centerY) {
  if (!state) return;
  const size = state.size;
  const oldZoom = zoom;
  const tileOld = baseTile(size) * oldZoom;
  const minZoom = 1;
  const maxZoom = Math.max(1, size / 7);
  zoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * factor));
  const tileNew = baseTile(size) * zoom;
  const rect = canvas.getBoundingClientRect();
  const cx = centerX - rect.left;
  const cy = centerY - rect.top;
  const mxTile = offsetX + cx / tileOld;
  const myTile = offsetY + cy / tileOld;
  offsetX = mxTile - cx / tileNew;
  offsetY = myTile - cy / tileNew;
  clampCamera();
  requestDraw();
}
zoomInBtn.onclick = () => applyZoom(1.15, canvas.width/2, canvas.height/2);
zoomOutBtn.onclick = () => applyZoom(1/1.15, canvas.width/2, canvas.height/2);

// Socket handlers
socket.on('connect', () => { mySid = socket.id; });

socket.on('lobbyUpdate', ({ players, config }) => {
  renderPlayersList(players);
  // host controls visible for host
  if (socket.id === players.find(p => p.sid === socket.id)?.sid) {
    startBtn.style.display = 'inline-block';
    document.getElementById('hostControls').style.display = 'block';
    roomLabel.textContent = `Room: ${players.length ? (players[0] && players[0].roomId) || roomLabel.textContent.split(': ')[1] : ''}`;
  }
});

// Allow color changes in pre-game lobby
joinColor.addEventListener('change', () => {
  if (roomId) {
    socket.emit('changeColor', { roomId, newColor: joinColor.value }, (res) => {
      if (res && !res.ok) {
        alert(res.err || 'Color change failed');
      }
    });
  }
});

socket.on('gameStarted', ({ state: st }) => {
  state = st;
  offsetX = offsetY = 0;
  // Reset variant caches for new game
  obstacleVariantCache = {};
  grassVariantCache = {};
  
  // Show loading screen
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  
  // Load textures and wait for completion
  loadTextures();
  if (texturesLoadedPromise) {
    texturesLoadedPromise.then(() => {
      // Textures loaded, hide loading overlay
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      requestDraw();
    });
  } else {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    requestDraw();
  }
  
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('gameUI').style.display = 'block';
  document.getElementById('hostControls').style.display = 'none';
  createBtn.disabled = true; joinBtn.disabled = true;
  if (chatPanel) chatPanel.style.display = 'block'; // show chat panel
  ensureLeaderboard();
});

socket.on('state', (st) => { state = st; requestDraw(); updateLeaderboard(); });

socket.on('turnChange', ({ activePid }) => {
  if (!state) return;
  state.activeIndex = state.turnOrder.indexOf(activePid);
  draw();
  resetTurnTimer();
});

socket.on('turnTimer', ({ remaining }) => {
  if (timerDisplay) timerDisplay.textContent = `? ${remaining}s left`;
});

socket.on('gameEnded', ({ winner }) => {
  clearInterval(turnTimer);
  alert(winner != null ? `Winner: ${state.playersMeta[winner].name}` : 'Draw!');
  location.reload();
});

socket.on('playerKicked', ({ reason }) => {
  clearInterval(turnTimer);
  alert('You have been kicked from the game.');
  location.reload();
});

// Chat handlers
socket.on('chatMessage', ({ sender, senderColor, message, timestamp }) => {
  if (!chatMessages) return;
  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '6px';
  msgDiv.style.fontSize = '12px';
  msgDiv.style.lineHeight = '1.4';
  msgDiv.style.wordWrap = 'break-word';
  msgDiv.style.overflowWrap = 'break-word';
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const colorDot = `<span style="display:inline-block;width:8px;height:8px;background:${senderColor || '#3498db'};border-radius:50%;margin-left:4px;vertical-align:middle;"></span>`;
  msgDiv.innerHTML = `<strong style="color:#2c3e50">${sender}</strong>${colorDot} <span style="color:#7f8c8d;font-size:11px">${time}</span><br><span style="color:#34495e;margin-left:4px;display:inline-block;">${message}</span>`;
  chatMessages.appendChild(msgDiv);
  // Auto-scroll to bottom when new message arrives
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 0);
});

if (chatSend && chatInput) {
  chatSend.addEventListener('click', () => {
    const msg = chatInput.value.trim();
    if (msg && roomId) {
      socket.emit('sendChat', { roomId, message: msg });
      chatInput.value = '';
    }
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSend.click();
    }
  });
}

// Lobby browser handlers
socket.on('lobbiesList', ({ lobbies }) => {
  if (!lobbyBrowser) return;
  if (!lobbies || lobbies.length === 0) {
    lobbyBrowser.innerHTML = '<div style="padding: 8px; color: #999;">No unstarted lobbies available</div>';
    return;
  }
  lobbyBrowser.innerHTML = '';
  for (const lobby of lobbies) {
    const item = document.createElement('div');
    item.style.padding = '8px';
    item.style.marginBottom = '6px';
    item.style.background = '#f5f5f5';
    item.style.border = '1px solid #ddd';
    item.style.borderRadius = '4px';
    item.style.cursor = 'pointer';
    item.style.userSelect = 'none';
    item.className = 'lobbyItem';
    
    const lockIcon = lobby.private ? '??' : '??';
    item.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px">
        ${lockIcon} ${lobby.roomId}
        <span style="font-size: 11px; color: #666; font-weight: normal">
          (${lobby.players}/${lobby.maxPlayers})
        </span>
      </div>
      <div style="font-size: 11px; color: #666;">Host: ${lobby.hostName}</div>
    `;
    
    item.addEventListener('click', () => {
      if (lobby.private) {
        const pwd = prompt('Enter password:');
        if (pwd === null) return;
        joinPassword.value = pwd;
      } else {
        joinPassword.value = '';
      }
      joinInput.value = lobby.roomId;
      joinName.value = joinName.value || 'Guest';
      joinBtn.click();
    });
    
    lobbyBrowser.appendChild(item);
  }
});

// Request lobbies list on lobby page load
function refreshLobbiesList() {
  socket.emit('getLobbies', {});
}
const lobbyTab = document.querySelector('[href="#lobby"]');
if (lobbyTab) {
  lobbyTab.addEventListener('click', refreshLobbiesList);
}
// Also refresh periodically
setInterval(refreshLobbiesList, 3000);

// Timer logic
function resetTurnTimer() {
  clearInterval(turnTimer);
  const isPlacementPhase = !!(state && state.startersToPlace && state.startersToPlace>0);
  remainingTime = isPlacementPhase ? 120 : 30;
  if (timerDisplay) timerDisplay.textContent = `? ${remainingTime}s left`;
  turnTimer = setInterval(() => {
    remainingTime--;
    if (timerDisplay) timerDisplay.textContent = `? ${remainingTime}s left`;
    if (remainingTime <= 0) {
      clearInterval(turnTimer);
      if (timerDisplay) timerDisplay.textContent = '? Time up!';
      socket.emit('timeout', { roomId });
    }
  }, 1000);
}

// Canvas input
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Action buttons UI (upgrade/downgrade)
const actionButtons = document.getElementById('actionButtons');
const actionUpgrade = document.getElementById('actionUpgrade');
const actionDowngrade = document.getElementById('actionDowngrade');
let actionHideTimer = null;
let currentActionTile = null; // {x,y}

function showActionButtonsScreen(px, py, gridX, gridY) {
  if (!actionButtons) return;
  actionButtons.style.left = (px - 60) + 'px';
  actionButtons.style.top = (py - 28) + 'px';
  actionButtons.style.display = 'flex';
  currentActionTile = { x: gridX, y: gridY };
  // reset timer
  if (actionHideTimer) clearTimeout(actionHideTimer);
  actionHideTimer = setTimeout(hideActionButtons, 5000);
}

function hideActionButtons() {
  if (!actionButtons) return;
  actionButtons.style.display = 'none';
  currentActionTile = null;
  if (actionHideTimer) { clearTimeout(actionHideTimer); actionHideTimer = null; }
}

// Tap/click on the action buttons
if (actionUpgrade) actionUpgrade.addEventListener('click', e => {
  e.stopPropagation(); if (!currentActionTile) return; socket.emit('action',{roomId,type:'upgrade',payload:{x:currentActionTile.x,y:currentActionTile.y}},(res)=>{ if(res?.ok) flashTile(currentActionTile.x,currentActionTile.y,'#2ecc71'); }); hideActionButtons();
});
if (actionDowngrade) actionDowngrade.addEventListener('click', e => {
  e.stopPropagation(); if (!currentActionTile) return; socket.emit('action',{roomId,type:'downgrade',payload:{x:currentActionTile.x,y:currentActionTile.y}},(res)=>{ if(res?.ok) flashTile(currentActionTile.x,currentActionTile.y,'#e74c3c'); }); hideActionButtons();
});

// Clicking outside should hide action buttons (but not on the canvas or action buttons themselves)
document.addEventListener('click', (e)=>{ if (!actionButtons) return; if (actionButtons.style.display==='none') return; if (!actionButtons.contains(e.target) && !canvas.contains(e.target)) hideActionButtons(); });

// Show camera controls on touch-capable devices
const camControls = document.getElementById('camControls');
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouch && camControls) camControls.style.display = 'grid';
// map keyboard emulation via cam controls
const camUpBtn = document.getElementById('camUp');
const camDownBtn = document.getElementById('camDown');
const camLeftBtn = document.getElementById('camLeft');
const camRightBtn = document.getElementById('camRight');
if (camUpBtn) camUpBtn.addEventListener('touchstart', ()=>{ keys.ArrowUp = true; });
if (camUpBtn) camUpBtn.addEventListener('touchend', ()=>{ keys.ArrowUp = false; });
if (camDownBtn) camDownBtn.addEventListener('touchstart', ()=>{ keys.ArrowDown = true; });
if (camDownBtn) camDownBtn.addEventListener('touchend', ()=>{ keys.ArrowDown = false; });
if (camLeftBtn) camLeftBtn.addEventListener('touchstart', ()=>{ keys.ArrowLeft = true; });
if (camLeftBtn) camLeftBtn.addEventListener('touchend', ()=>{ keys.ArrowLeft = false; });
if (camRightBtn) camRightBtn.addEventListener('touchstart', ()=>{ keys.ArrowRight = true; });
if (camRightBtn) camRightBtn.addEventListener('touchend', ()=>{ keys.ArrowRight = false; });

function showTransientPopup(px, py, text, ms=2000){
  const popup = document.createElement('div');
  popup.style.position='absolute';
  popup.style.left = px+'px';
  popup.style.top = py+'px';
  popup.style.background = 'rgba(255,255,255,0.95)';
  popup.style.border = '1px solid #333';
  popup.style.padding = '4px 6px';
  popup.style.fontSize = '12px';
  popup.style.zIndex = 9999;
  popup.textContent = text;
  mapContainer.appendChild(popup);
  setTimeout(()=>popup.remove(), ms);
}

function eventOverlayStyle(type) {
  if (type === 'destroy') return { stripe: '#222', stripe2: '#f1c40f' }; // Yellow/Black hazard
  if (type === 'obstacle') return { stripe: '#505050', stripe2: '#ffffff' }; // Darker Gray/White
  if (type === 'water') return { stripe: '#5dade2', stripe2: '#ffffff' }; // Light Blue/White
  if (type === 'tile') return { stripe: '#222', stripe2: '#f1c40f' };
  return { stripe:'#000', stripe2:'#fff' };
}

// Mouse click handling
canvas.addEventListener('mousedown', (ev)=>{
  if(!state) return;
  const size = state.size;
  const tSize = baseTile(size)*zoom;
  const rect = canvas.getBoundingClientRect();
  const mapX = (ev.clientX - rect.left) / tSize + offsetX;
  const mapY = (ev.clientY - rect.top) / tSize + offsetY;
  const x = Math.floor(mapX), y = Math.floor(mapY);
  if(x<0||y<0||x>=size||y>=size) return;

  const activePid = state.turnOrder[state.activeIndex];

  // Starter placement
  if(state.startersToPlace && activePid===pid){
    socket.emit('action',{roomId,type:'placeStarter',payload:{x,y}});
    return;
  }

  if(activePid!==pid){
    const cell = state.grid[y][x];
    if(cell && cell.type==='unit' && cell.pid!==pid){
      const owner = state.playersMeta[cell.pid]?.name||`Player ${cell.pid}`;
      const r = canvas.getBoundingClientRect();
      showTransientPopup(ev.clientX-r.left+8, ev.clientY-r.top+8, `Owner: ${owner}`);
    }
    return;
  }

  const cell = state.grid[y][x];
  if(!cell || cell.type!=='unit') return;

  if(cell.pid===pid){
    // For touch devices: show the on-screen action buttons (tap behavior)
    if(isTouch){
      if(ev.button===0){
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left; const py = ev.clientY - rect.top;
        showActionButtonsScreen(px, py, x, y);
        return;
      }
      // ignore right-click on touch devices
    } else {
      // On non-touch (PC/laptop): perform actions directly with mouse buttons
      // Left-click = upgrade, Right-click = downgrade
      if(ev.button===0){
        socket.emit('action',{roomId,type:'upgrade',payload:{x,y}},(res)=>{ if(res?.ok) flashTile(x,y,'#2ecc71'); });
        return;
      }
      if(ev.button===2){
        socket.emit('action',{roomId,type:'downgrade',payload:{x,y}},(res)=>{ if(res?.ok) flashTile(x,y,'#e74c3c'); });
        return;
      }
    }
  } else {
    if(ev.button===0){
      const owner = state.playersMeta[cell.pid]?.name||`Player ${cell.pid}`;
      const r = canvas.getBoundingClientRect();
      showTransientPopup(ev.clientX-r.left+8, ev.clientY-r.top+8, `Owner: ${owner}`);
    }
  }
});

// Touch support: tap behaves like left click
canvas.addEventListener('touchstart', (tev)=>{
  tev.preventDefault();
  const touch = tev.touches[0];
  const rect = canvas.getBoundingClientRect();
  const tSize = baseTile((state && state.size) ? state.size : 10)*zoom;
  const mapX = (touch.clientX - rect.left) / tSize + offsetX;
  const mapY = (touch.clientY - rect.top) / tSize + offsetY;
  const x = Math.floor(mapX), y = Math.floor(mapY);
  if(!state) return; if(x<0||y<0||x>=state.size||y>=state.size) return;
  const activePid = state.turnOrder[state.activeIndex];
  if(state.startersToPlace && activePid===pid){ socket.emit('action',{roomId,type:'placeStarter',payload:{x,y}}); return; }
  const cell = state.grid[y][x]; if(!cell || cell.type!=='unit') return;
  if(cell.pid===pid){ const rectC = canvas.getBoundingClientRect(); const px = touch.clientX - rectC.left; const py = touch.clientY - rectC.top; showActionButtonsScreen(px, py, x, y); }
  else { const owner = state.playersMeta[cell.pid]?.name||`Player ${cell.pid}`; const r = canvas.getBoundingClientRect(); showTransientPopup(touch.clientX-r.left+8, touch.clientY-r.top+8, `Owner: ${owner}`); }
}, { passive: false });

// Camera pan
const keys = {ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false};
const panSpeed = 4;
window.addEventListener('keydown', e=>{if(keys.hasOwnProperty(e.key)){keys[e.key]=true; e.preventDefault();}});
window.addEventListener('keyup', e=>{if(keys.hasOwnProperty(e.key)) keys[e.key]=false;});

let lastFrame = performance.now();
function panLoop(now=performance.now()){
  const dt = (now-lastFrame)/1000; lastFrame=now;
  let dx=0, dy=0;
  if(keys.ArrowUp) dy -= panSpeed*dt/zoom;
  if(keys.ArrowDown) dy += panSpeed*dt/zoom;
  if(keys.ArrowLeft) dx -= panSpeed*dt/zoom;
  if(keys.ArrowRight) dx += panSpeed*dt/zoom;
  if(dx||dy){ offsetX+=dx; offsetY+=dy; clampCamera(); requestDraw(); }
  requestAnimationFrame(panLoop);
}
panLoop();

// Draw helpers
function tileLabel(x,y){return String.fromCharCode(65+x)+(y+1);}
function getContrastOutline(hex){const c=(hex||'#000').replace('#','');const r=parseInt(c.substr(0,2),16);const g=parseInt(c.substr(2,2),16);const b=parseInt(c.substr(4,2),16);return(0.299*r+0.587*g+0.114*b)>140?'#000':'#fff';}
function lightenColor(hex,factor){const c=(hex||'#000').replace('#','');let r=parseInt(c.substr(0,2),16);let g=parseInt(c.substr(2,2),16);let b=parseInt(c.substr(4,2),16);r=Math.min(255,Math.round(r+255*factor));g=Math.min(255,Math.round(g+255*factor));b=Math.min(255,Math.round(b+255*factor));return `rgb(${r},${g},${b})`; }

function drawUnit(px,py,tileSize,c,color){
  const cx=px+tileSize/2, cy=py+tileSize/2;
  
  // Draw color circle beneath the unit (75% of unit texture width)
  const colorCircleRadius = tileSize * 0.27; // roughly 25% less than unit size
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(cx, cy, colorCircleRadius, 0, Math.PI*2);
  ctx.fill();
  // Draw unit appearance using canvas shapes (no textures)
  ctx.save();
  ctx.translate(cx, cy);
  // Foreground color for shapes (contrast with base color)
  const fg = getContrastOutline(color) || '#fff';
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  ctx.lineWidth = Math.max(1, tileSize * 0.04);

  const lvl = Math.max(1, Math.min(3, Number(c.level) || 1));
  if (lvl === 1) {
    // Level 1: small filled circle in center
    const r = tileSize * 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (lvl === 2) {
    // Level 2: shield-like diamond with small inner accent
    const w = tileSize * 0.34, h = tileSize * 0.34;
    ctx.beginPath();
    ctx.moveTo(0, -h/2);
    ctx.lineTo(w/2, 0 - h/8);
    ctx.lineTo(w/4, h/2);
    ctx.lineTo(-w/4, h/2);
    ctx.lineTo(-w/2, 0 - h/8);
    ctx.closePath();
    ctx.fill();
    // inner accent circle
    ctx.fillStyle = lightenColor(color, 0.15);
    ctx.beginPath();
    ctx.arc(0, -h*0.06, tileSize * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Level 3: star / crown emblem
    const outer = tileSize * 0.33;
    const inner = outer * 0.45;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const r = (i % 2 === 0) ? outer : inner;
      const xpt = Math.cos(angle) * r;
      const ypt = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(xpt, ypt); else ctx.lineTo(xpt, ypt);
    }
    ctx.closePath();
    ctx.fill();
    // small center highlight
    ctx.fillStyle = lightenColor(color, 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, tileSize * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Leaderboard
let leaderboardEl = null;
function ensureLeaderboard(){
  if (leaderboardEl) return;
  leaderboardEl = document.createElement('div');
  leaderboardEl.id = 'leaderboard';
  leaderboardEl.style.position = 'absolute';
  leaderboardEl.style.right = '-220px';
  leaderboardEl.style.top = '0';
  leaderboardEl.style.width = '200px';
  leaderboardEl.style.padding = '8px';
  leaderboardEl.style.background = 'rgba(255,255,255,0.95)';
  leaderboardEl.style.border = '1px solid #ccc';
  leaderboardEl.style.zIndex = 20;
  leaderboardEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  mapContainer.appendChild(leaderboardEl);
  updateLeaderboard();
}
function updateLeaderboard(){
  if (!state || !leaderboardEl) return;
  const counts = {};
  for (const pidKey in state.playersMeta) counts[pidKey] = 0;
  for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++){
    const c = state.grid[y][x];
    if (c && c.type === 'unit') counts[c.pid] = (counts[c.pid]||0) + 1;
  }
  const arr = Object.keys(state.playersMeta).map(k => ({ pid: Number(k), name: state.playersMeta[k].name, color: state.playersMeta[k].color, units: counts[k]||0, alive: state.playersMeta[k].alive }));
  arr.sort((a,b)=>b.units - a.units);
  leaderboardEl.innerHTML = `<strong>Leaderboard</strong><hr style="margin:6px 0;">` + arr.map(a => `<div style="margin-bottom:6px"><span style="display:inline-block;width:12px;height:12px;background:${a.color};margin-right:6px;border-radius:3px"></span>${a.name} � ${a.units} ${a.alive===false?'<span style="color:#c0392b">?</span>':''}</div>`).join('');
}

// MAIN DRAW
// Draw request coalescing for performance
let drawRequested = false;
let drawRafId = null;
function requestDraw() {
  if (drawRequested) return;
  drawRequested = true;
  drawRafId = requestAnimationFrame(() => {
    draw();
    drawRequested = false;
  });
}

function draw(){
  document.querySelectorAll('.tileCoord').forEach(el=>el.remove());
  if(!state){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#f9f9f9';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    return;
  }
  const size = state.size;
  const tSize = baseTile(size)*zoom;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const inset = tSize*0.12;

  // Pre-set image quality for entire frame (avoid per-tile overhead)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // draw tiles
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const px=(x-offsetX)*tSize, py=(y-offsetY)*tSize;

      // skip offscreen
      if (px + tSize < -50 || py + tSize < -50 || px > canvas.width + 50 || py > canvas.height + 50) continue;

      // Draw base tile based on terrain layer (terrain may be null -> grass)
      const terr = state.terrain && state.terrain[y] ? state.terrain[y][x] : null;
      // Choose texture: water (poison or normal) | grass variants
      if (terr && terr.type === 'water') {
        // water tile: choose texture based on subtype
        if (terr.subtype === 'poison' && customTextures.poisonWater && customTextures.poisonWater.complete && customTextures.poisonWater.naturalWidth) {
          try { ctx.drawImage(customTextures.poisonWater, px, py, tSize, tSize); }
          catch (e) { ctx.fillStyle = '#6d3b5b'; ctx.fillRect(px, py, tSize, tSize); }
        } else {
          // All water types use plain water texture
          if (customTextures.water && customTextures.water.complete && customTextures.water.naturalWidth) {
            try { ctx.drawImage(customTextures.water, px, py, tSize, tSize); }
            catch (e) { ctx.fillStyle = '#5dade2'; ctx.fillRect(px, py, tSize, tSize); }
          } else { ctx.fillStyle = '#5dade2'; ctx.fillRect(px, py, tSize, tSize); }
        }
      } else {
        // default: grass variant
        let grassTexture = null;
        if (customTextures.grassVariants && customTextures.grassVariants.length > 0) {
          const gKey = `${x},${y}`;
          if (grassVariantCache[gKey] === undefined) {
            // assign uniform random variant 0..3 (25% each)
            grassVariantCache[gKey] = Math.floor(Math.random() * 4);
          }
          grassTexture = customTextures.grassVariants[grassVariantCache[gKey]];
        }
        if (grassTexture && grassTexture.complete && grassTexture.naturalWidth) {
          try { ctx.drawImage(grassTexture, px, py, tSize, tSize); }
          catch (e) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, tSize, tSize); }
        } else { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, tSize, tSize); }
      }

      // Tile borders removed - textures now connect seamlessly

      const cell = state.grid[y][x];

      // overlay event?
      const ev = (state.tileEvents || []).find(e => e.x === x && e.y === y);

      if (ev) {
        const phase = ev.phase || 1;
        let alpha = phase === 1 ? 0.30 : (phase === 2 ? 1.0 : 0); // phase 3 = fully invisible (removed)
        if (alpha > 0) {
          const style = eventOverlayStyle(ev.type);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = style.stripe2;
          ctx.fillRect(px, py, tSize, tSize);
          
          // Draw diagonal stripes (45-degree angle) confined to tile
          ctx.strokeStyle = style.stripe;
          ctx.lineWidth = Math.max(2, tSize * 0.08);
          const stripeSpacing = tSize * 0.25;
          
          // Clip to tile bounds
          ctx.beginPath();
          ctx.rect(px, py, tSize, tSize);
          ctx.clip();
          
          // Draw diagonal lines across the tile
          for (let offset = -tSize; offset < tSize * 2; offset += stripeSpacing) {
            ctx.beginPath();
            ctx.moveTo(px + offset, py);
            ctx.lineTo(px + offset + tSize * 2, py + tSize * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // contents
      if (cell?.type === 'obstacle') {
        const bSize = tSize; // full tile obstacle texture
        
        // Pick random obstacle variant for this tile (cached per coordinate)
        // Weighted distribution: Bush 45%, Rock 40%, Tree 15%
        const bKey = `${x},${y}`;
        if (!obstacleVariantCache[bKey]) {
          // Determine which obstacle textures actually loaded successfully
          const available = [];
          // We're replacing Tree with Bush. Adjust weights so Tree gets 0%:
          // Bush 60% (45 + previous Tree 15), Rock 40%, Tree 0%
          const weights = [60, 40, 0]; // bush, rock, tree
          for (let i = 0; i < 3; i++) {
            const img = customTextures.obstacleVariants[i];
            if (img && img.complete && img.naturalWidth) available.push({ idx: i, w: weights[i] });
          }
          // If none available yet, fallback to indices (will draw placeholder)
          if (available.length === 0) {
            obstacleVariantCache[bKey] = Math.floor(Math.random() * 3);
          } else {
            // Normalize weights among available textures
            const total = available.reduce((s, a) => s + a.w, 0);
            let r = Math.random() * total;
            let chosen = available[0].idx;
            for (const a of available) {
              if (r < a.w) { chosen = a.idx; break; }
              r -= a.w;
            }
            obstacleVariantCache[bKey] = chosen;
          }
        }
        const obstacleVariant = customTextures.obstacleVariants[obstacleVariantCache[bKey]];
        if (obstacleVariant && obstacleVariant.complete && obstacleVariant.naturalWidth) {
          try {
            ctx.drawImage(obstacleVariant, px, py, bSize, bSize);
          } catch (e) { ctx.fillStyle = '#7f8c8d'; ctx.fillRect(px + inset, py + inset, tSize - inset*2, tSize - inset*2); }
        } else {
          ctx.fillStyle = '#7f8c8d';
          ctx.fillRect(px + inset, py + inset, tSize - inset * 2, tSize - inset * 2);
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + inset, py + inset, tSize - inset * 2, tSize - inset * 2);
        }

        // HP bar: segmented fixed pixel points (does not scale with zoom)
        if (typeof cell.hp === 'number') {
          const FIXED_BAR_W = 48; // px total bar width
          const FIXED_BAR_H = 8;  // px segment height
          const padding = 4; // px from tile edge
          const barW = Math.max(12, Math.min(FIXED_BAR_W, tSize - padding * 2));
          const barH = Math.max(4, Math.min(FIXED_BAR_H, tSize * 0.25));
          const bx = px + tSize - padding - barW; // left edge of bar
          const by = py + tSize - padding - barH;

          // outer background
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

          const maxHp = Math.max(1, (cell.maxHp || cell.hp || 1));
          const curHp = Math.max(0, Math.min(maxHp, cell.hp || 0));
          const segments = Math.min(12, maxHp); // cap segments to 12
          const segGap = 2; // px between segments
          const segW = Math.max(2, Math.floor((barW - (segments - 1) * segGap) / segments));
          // adjust start so segments are right-aligned within the bar area
          const totalSegsWidth = segments * segW + (segments - 1) * segGap;
          const startX = bx + (barW - totalSegsWidth);

          for (let s = 0; s < segments; s++) {
            const sx = startX + s * (segW + segGap);
            const isRemaining = s >= (segments - curHp); // right-most segments are remaining
            ctx.fillStyle = isRemaining ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(sx, by, segW, barH);
            // thin separator / outline for each segment
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 0.5, by + 0.5, Math.max(0, segW - 1), Math.max(0, barH - 1));
          }
        }
      }

      // (terrain drawn above) -- grid no longer contains water objects in two-layer world

      if(cell?.type==='unit') drawUnit(px,py,tSize,cell,state.playersMeta[cell.pid]?.color||'#666');

      
    }
  }

  // Render blocked zones overlay (turn 1 spawn blocking - 35% opacity red)
  if (state.blockedZones && state.blockedZones.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff0000';
    for (const zone of state.blockedZones) {
      const zx = (zone.x - offsetX) * baseTile(state.size) * zoom;
      const zy = (zone.y - offsetY) * baseTile(state.size) * zoom;
      ctx.fillRect(zx, zy, baseTile(state.size) * zoom, baseTile(state.size) * zoom);
    }
    ctx.restore();
  }

  // last move highlight
  if(state.lastMove) {
    const lm = state.lastMove;
    const lx = (lm.x - offsetX) * baseTile(state.size) * zoom;
    const ly = (lm.y - offsetY) * baseTile(state.size) * zoom;
    const now = Date.now()/300;
    const a = 0.35 + 0.15 * Math.sin(now);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,235,130,0.9)';
    ctx.fillRect(lx+2, ly+2, baseTile(state.size)*zoom-4, baseTile(state.size)*zoom-4);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f1c40f';
    ctx.strokeRect(lx+3, ly+3, baseTile(state.size)*zoom-6, baseTile(state.size)*zoom-6);

    const name = state.playersMeta[lm.pid]?.name || `P${lm.pid}`;
    lastMoveInfo.textContent = `Last Move: ${name} ${tileLabel(lm.x,lm.y)}`;
  } else {
    lastMoveInfo.textContent = 'Last Move: �';
  }

  // highlights
  for(const h of highlights){
    const px=(h.x-offsetX)*baseTile(state.size)*zoom, py=(h.y-offsetY)*baseTile(state.size)*zoom;
    ctx.fillStyle=h.color; ctx.globalAlpha=0.3; ctx.fillRect(px,py,baseTile(state.size)*zoom,baseTile(state.size)*zoom); ctx.globalAlpha=1;
  }

  // turn info
  if(turnInfo && state) {
    const actPid = state.turnOrder[state.activeIndex];
    const actName = state.playersMeta[actPid]?.name || `Player ${actPid}`;
    turnInfo.textContent = `Turn: ${state.turnNumber || 1} | Active: ${actName} (${actPid})`;
  }
}

// render players list in lobby
function renderPlayersList(players) {
  playersList.innerHTML = '';
  for (const p of players) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.marginBottom = '6px';
    div.style.padding = '4px';
    div.style.background = '#f9f9f9';
    div.style.borderRadius = '4px';
    
    const playerInfo = document.createElement('span');
    playerInfo.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${p.color};border-radius:3px;margin-right:4px"></span>${p.name} (${p.pid}) ${p.alive===false?'?':''}`;
    div.appendChild(playerInfo);
    
    // Add kick button if host and not the host themselves
    if (isHost && p.pid !== 0) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Kick';
      kickBtn.style.padding = '2px 6px';
      kickBtn.style.fontSize = '12px';
      kickBtn.style.background = '#e74c3c';
      kickBtn.style.color = '#fff';
      kickBtn.style.border = 'none';
      kickBtn.style.borderRadius = '3px';
      kickBtn.style.cursor = 'pointer';
      kickBtn.addEventListener('click', () => {
        socket.emit('kickPlayer', { roomId, targetPid: p.pid }, (res) => {
          if (res && res.ok) {
            alert(`Kicked ${p.name}`);
          } else {
            alert(res?.err || 'Kick failed');
          }
        });
      });
      div.appendChild(kickBtn);
    }
    
    playersList.appendChild(div);
  }
}

// minimal client-side AI/demo (keeps old behavior)
function simpleAIMove(){
  if(!state) return;
  const activePid = state.turnOrder[state.activeIndex];
  const playerMeta = state.playersMeta[activePid];
  if(!playerMeta || !playerMeta.isAI) return;

  if(state.startersToPlace && !playerMeta.starPlaced){
    const coords = [];
    for(let y=0;y<state.size;y++) for(let x=0;x<state.size;x++) if(!state.grid[y][x]) coords.push({x,y});
    shuffle(coords);
    if(coords.length) socket.emit('action',{roomId,type:'placeStarter',payload:{x:coords[0].x,y:coords[0].y}});
    return;
  }

  const myUnits = [];
  for(let y=0;y<state.size;y++) for(let x=0;x<state.size;x++){
    const c = state.grid[y][x];
    if(c && c.type==='unit' && c.pid===activePid) myUnits.push({x,y,level:c.level});
  }
  if(!myUnits.length) return;
  let target = myUnits.find(u=>u.level===2) || myUnits[Math.floor(Math.random()*myUnits.length)];
  socket.emit('action',{roomId,type:'upgrade',payload:{x:target.x,y:target.y}});
}
setInterval(simpleAIMove, 1000);

// shuffle helper
function shuffle(arr){ for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// resize handler
window.addEventListener('resize', () => requestDraw());

// Guide Panel Initialization
function initializeGuidePanel(targetPanel) {
  // Define guide sections with new content
  const guideSections = [
    {
      title: "Getting Started",
      content: "Welcome to Colony Conquest! Click sections to expand and learn the basics of the game. Each section contains helpful information about different game mechanics."
    },
    {
      title: "Control Basics",
      content: "Welcome to the basics. Here you will learn how to maneuver around the game.\n\nTo start you off, we will talk about the game layout - when in a match, you will see a Leave game button, a map, a chat on the right of it, and two zoom buttons on the bottom below the map.\n\nWhen you click either of the Zoom Buttons, they will do their intended function. To move the view on the map, use the arrow keys.\n\nThe rest in this section is self-explanatory."
    },
    {
      title: "Map Basics",
      content: "Here you will learn how the map and movement operates.\n\nBy pressing Left Click, you can level up a unit by 1 - this can be done to Level 3. After which if left clicked again, it will activate the unit - resulting in damage to adjacent obstacles.\n\nBy pressing Right Click, the unit will be downgraded by 1. If the unit is Level 1, it will be destroyed entirely.\n\nThere will be different occurrences on the map, which we will put into 2 categories:\n\n1. TILES\n- There are 2 types of tiles - Grass and Water.\n- Each is different. Grass provides movement space, and Water provides an impassable part of the map, granting more strategic advantages and plays.\n\n2. OBSTACLES\n- These will spawn on Grass tiles.\n- They act as walls and surroundings like water, though they can be broken by activating units beside them."
    },
    {
      title: "Game Process and Objective",
      content: "The game starts off with a 2 minute turn for all players and AI to place their starter (left click a spot on the map).\n\nOnce this turn ends, the 2nd turn as well as all others after it will take 30 seconds.\n\nEach turn you can only take one action, whether it is upgrade, downgrade, or activate.\n\nActivation next to enemy units will capture them to your side and level them up.\n\nGoal of the game is to defeat all who stand beside you on the map."
    },
    {
      title: "Tips and Tricks",
      content: "Tip No. 1 - Try not downgrading your unit in the 2nd turn.\n\nTip No. 2 - When you activate a unit next to another Level 3 unit, it will cause a chain reaction which will activate it as well. This works on your units as well as enemy units.\n\nTip No. 3 - If you are in a tight spot and don't see an easy way out, try attacking multiple spots at once with chain reactions. If you spread multiple Level 3 units in different parts of the battle against an opponent, they can only focus on one, giving you the opportunity to strike back strong.\n\nBonus accomplishment if you manage to deal enough damage to separate their land in two. It usually gives you a higher chance of victory.\n\nTip No. 4 - If you are fighting a tough opponent, think about the possibility of cooperation with other players. Diplomacy can beat stronger foes."
    }
  ];

  // Create guide sections
  guideSections.forEach((section, idx) => {
    const sectionEl = document.createElement('div');
    sectionEl.style.borderBottom = '1px solid #ecf0f1';
    sectionEl.style.marginBottom = '0';
    
    const titleEl = document.createElement('div');
    titleEl.textContent = section.title;
    titleEl.style.padding = '8px';
    titleEl.style.background = '#ecf0f1';
    titleEl.style.cursor = 'pointer';
    titleEl.style.fontWeight = 'bold';
    titleEl.style.fontSize = '13px';
    titleEl.style.userSelect = 'none';
    titleEl.style.display = 'flex';
    titleEl.style.justifyContent = 'space-between';
    titleEl.style.alignItems = 'center';
    
    const toggleArrow = document.createElement('span');
    toggleArrow.textContent = '▶';
    toggleArrow.style.fontSize = '11px';
    toggleArrow.style.transition = 'transform 0.2s';
    
    titleEl.appendChild(toggleArrow);
    
    const contentEl = document.createElement('div');
    contentEl.innerHTML = section.content.replace(/\n/g, '<br>');
    contentEl.style.padding = '8px';
    contentEl.style.fontSize = '12px';
    contentEl.style.lineHeight = '1.4';
    contentEl.style.display = 'none';
    contentEl.style.background = '#fafafa';
    contentEl.style.whiteSpace = 'normal';
    contentEl.style.wordWrap = 'break-word';
    
    // Add image if it's section 3 (Map Basics)
    if (idx === 2) {
      const imgContainer = document.createElement('div');
      imgContainer.style.marginTop = '8px';
      imgContainer.style.textAlign = 'center';
      
      const img = document.createElement('img');
      img.src = '/custom_assets/custom/sketch.svg';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.cursor = 'zoom-in';
      img.style.borderRadius = '4px';
      img.style.border = '1px solid #ddd';
      img.style.maxHeight = '200px';
      
      // Click to zoom
      img.onclick = () => {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0,0,0,0.8)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';
        modal.style.cursor = 'pointer';
        
        const zoomedImg = document.createElement('img');
        zoomedImg.src = img.src;
        zoomedImg.style.maxWidth = '80vw';
        zoomedImg.style.maxHeight = '80vh';
        zoomedImg.style.borderRadius = '8px';
        
        modal.appendChild(zoomedImg);
        modal.onclick = () => document.body.removeChild(modal);
        document.body.appendChild(modal);
      };
      
      imgContainer.appendChild(img);
      contentEl.appendChild(imgContainer);
    }
    
    let isOpen = false;
    titleEl.onclick = () => {
      isOpen = !isOpen;
      contentEl.style.display = isOpen ? 'block' : 'none';
      toggleArrow.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    };
    
    sectionEl.appendChild(titleEl);
    sectionEl.appendChild(titleEl);
    sectionEl.appendChild(contentEl);
    targetPanel.appendChild(sectionEl);
  });
}

// Toggle guide panel visibility
if (guidePanelToggle) {
  guidePanelToggle.onclick = () => {
    guidePanelOpen = !guidePanelOpen;
    guidePanelContent.style.display = guidePanelOpen ? 'block' : 'none';
    guidePanelToggle.textContent = guidePanelOpen ? '▲' : '▼';
  };
}

// Initialize guide panel when game starts
socket.on('gameStarted', () => {
  if (guidePanelContent && guidePanelContent.children.length === 0) {
    initializeGuidePanel(guidePanelContent);
  }
});

// Initialize lobby guide panel
if (document.getElementById('lobbyGuidePanelToggle')) {
  const lobbyGuidePanelToggle = document.getElementById('lobbyGuidePanelToggle');
  const lobbyGuidePanelContent = document.getElementById('lobbyGuidePanelContent');
  const lobbyGuidePanelToggleArrow = document.getElementById('lobbyGuidePanelToggleArrow');
  let lobbyGuidePanelOpen = false;
  
  lobbyGuidePanelToggle.onclick = () => {
    lobbyGuidePanelOpen = !lobbyGuidePanelOpen;
    lobbyGuidePanelContent.style.display = lobbyGuidePanelOpen ? 'block' : 'none';
    lobbyGuidePanelToggleArrow.textContent = lobbyGuidePanelOpen ? '▲' : '▼';
    if (lobbyGuidePanelOpen && lobbyGuidePanelContent.children.length === 0) {
      initializeGuidePanel(lobbyGuidePanelContent);
    }
  };
}

// initial leaderboard container
ensureLeaderboard();
updateLeaderboard();