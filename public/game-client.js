// client.js - full updated client (tile events, obstacle HP, lobby fixed)
// Avoid redeclaring `socket` if another script already created it (e.g., `public/index.js`).
console.log('📁 game-client.js loaded');
const socket = window.socket || (window.socket = io());
console.log('🔌 Socket instance:', socket.id, 'connected:', socket.connected);
let roomId = null;
let pid = null;
let mySid = socket.id;
let isHost = false;
let state = null;
let zoom = 1.0;

// Variant caches for per-tile random selection (obstacle, grass)
let grassVariantCache = {};

// Coordinate visibility toggle
let showCoordinates = false;

// Claims visibility toggle (on by default)
let showClaims = true;

// Last clicked tile for texture display
let lastClickedTile = null;  // {x, y} of last clicked tile

// Camera / viewport
let offsetX = 0;
let offsetY = 0;

// Unit spawning UI state
let selectedUnitSpawnSource = null;  // {x, y} of unit being spawned from
let spawnHighlightTiles = [];        // Array of {x, y} tiles highlighted for spawning

// Building placement UI state
let selectedBuildingSource = null;   // {x, y, buildingType} for building placement
let buildHighlightTiles = [];        // Array of {x, y} tiles highlighted for building placement

// AU action UI state
let selectedAUActionSource = null;   // {x, y} of AU being commanded
let auActionMode = null;             // 'move' or 'attack'
let auActionHighlights = [];         // Array of {x, y, actionNum} for action tiles
let auActionsQueued = [];            // Actions queued: [{type, direction}, ...]

// AU structure placement state
let selectedAUStructurePlacement = null;  // {x, y} of AU placing structure
let structurePlacementHighlights = [];    // Array of {x, y} tiles for placement

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
   
   sand: null,
   obstacleVariants: [null], // Single obstacle texture
   // Unit textures by level
   unitLevels: [null, null, null], // Unit_Lvl_1, Unit_Lvl_2, Unit_Lvl_3
   // Unit type textures
   unitTypes: {
     swordsman: null  // Swordsman base texture
   },
   // Claimed land textures
   claimed: {
     grass: null,
     water1: null
   }
};

// Track texture loading completion
let texturesLoadedPromise = null;
let texturesLoadedResolve = null;

function loadTextures() {
  console.log('Loading simplified textures...');
  
  texturesLoadedPromise = new Promise(resolve => {
    texturesLoadedResolve = resolve;
  });

  async function tryFetchToBlob(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      return null;
    }
  }

  async function loadImage(name) {
    const urls = [
      `/custom_assets/custom/${name}`,
      `/custom_assets/custom/${encodeURIComponent(name)}`
    ];
    
    for (const url of urls) {
      try {
        const blobUrl = await tryFetchToBlob(url);
        if (blobUrl) {
          const img = new Image();
          img.onload = () => { console.log(`Loaded: ${name}`); requestDraw(); };
          img.src = blobUrl;
          return img;
        }
      } catch (e) {}
    }
    
    // Fallback: direct URL
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { console.log(`Loaded: ${name}`); requestDraw(); };
    img.onerror = () => { console.warn(`Failed to load: ${name}`); };
    img.src = `/custom_assets/custom/${name}`;
    return img;
  }

  // Load textures: Water (W1/W2 with adjacency), Grass, Stone (obstacle), and Units
  (async () => {
    customTextures.water = await loadImage('Water1.png') || await loadImage('water1.png');
    customTextures.waterVariants.mid = await loadImage('Water2.png') || await loadImage('Water2.png') || customTextures.water;
    customTextures.grassVariants[0] = await loadImage('Grass.png') || await loadImage('grass.png');
    customTextures.obstacleVariants[0] = await loadImage('Obstacle.png') || await loadImage('obstacle.png');
    
    // Load unit textures by level
    customTextures.unitLevels[0] = await loadImage('Unit_L1.png') || await loadImage('unit_l1.png');
    customTextures.unitLevels[1] = await loadImage('Unit_L2.png') || await loadImage('unit_l2.png');
    customTextures.unitLevels[2] = await loadImage('Unit_L3.png') || await loadImage('unit_l3.png');
    
    // Load unit type textures (Swordsman, etc.)
    customTextures.unitTypes.swordsman = await loadImage('Swordsman.png') || await loadImage('swordsman.png');
    
    // Load claimed land textures
    customTextures.claimed.grass = await loadImage('Grass_Claimed.png') || await loadImage('grass_claimed.png');
    customTextures.claimed.water1 = await loadImage('Water1_Claimed.png') || await loadImage('water1_claimed.png');
    
    // Log texture load status
    console.log('🖼️ Claimed textures loaded:', {
      grass: customTextures.claimed.grass ? '✓' : '✗',
      water1: customTextures.claimed.water1 ? '✓' : '✗',
      swordsman: customTextures.unitTypes.swordsman ? '✓' : '✗'
    });
    
    texturesLoadedResolve?.();
  })();
}

// UI refs
const createBtn = document.getElementById('createBtn');
const gameModeSel = document.getElementById('gameMode');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const startBtn = document.getElementById('startBtn');
const roomLabel = document.getElementById('roomLabel');
const playersList = document.getElementById('playersList');
const botsList = document.getElementById('botsList');
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
const hostUnitC1 = document.getElementById('hostUnitC1');
const hostUnitC2 = document.getElementById('hostUnitC2');
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
const inMatchPlayersBar = document.getElementById('inMatchPlayersBar');
const guidePanelContent = document.getElementById('guidePanelContent');
let guidePanelOpen = false;
const advancedBtn = document.getElementById('advancedBtn');
const advancedOptions = document.getElementById('advancedOptions');
const joinPassword = document.getElementById('joinPassword');
const joinName = document.getElementById('joinName');
const joinInput = document.getElementById('joinInput');
const joinUnitC1 = document.getElementById('joinUnitC1');
const joinUnitC2 = document.getElementById('joinUnitC2');
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

// Show/hide obstacle controls when obstacles toggled
function updateObstacleControls() {
  const obstaclePctLabel = document.querySelector('label[for="obstaclePct"]') || document.getElementById('obstaclePct')?.parentElement;
  const obstacleHpLabel = document.getElementById('obstacleHpLabel');
  if (!obstacleOnSel) return;
  const enabled = obstacleOnSel.checked;
  if (obstaclePctSel) obstaclePctSel.parentElement.style.display = enabled ? 'block' : 'none';
  if (obstacleHpOnSel) obstacleHpOnSel.parentElement.style.display = enabled ? 'block' : 'none';
  if (obstacleHpLabel) obstacleHpLabel.style.display = (enabled && obstacleHpOnSel && obstacleHpOnSel.checked) ? 'block' : 'none';
}
if (obstacleOnSel) {
  obstacleOnSel.addEventListener('change', updateObstacleControls);
  updateObstacleControls();
}

// Show/hide water controls when water toggled
function updateWaterControls() {
  if (!waterOnSel) return;
  const enabled = waterOnSel.checked;
  if (waterPctSel) waterPctSel.parentElement.style.display = enabled ? 'block' : 'none';
  if (riverOnSel) riverOnSel.parentElement.style.display = enabled ? 'block' : 'none';
  if (lakeOnSel) lakeOnSel.parentElement.style.display = enabled ? 'block' : 'none';
  // scattered water checkbox
  const scattered = document.getElementById('scatteredWaterOn');
  if (scattered) scattered.parentElement.style.display = enabled ? 'block' : 'none';
}
if (waterOnSel) {
  waterOnSel.addEventListener('change', updateWaterControls);
  updateWaterControls();
}

// Random color defaults
(function setRandomDefaultColors() {
  const palette = ['#e74c3c','#2ecc71','#3498db','#9b59b6','#f1c40f','#e67e22','#1abc9c','#95a5a6'];
  try {
    if (hostUnitC2) hostUnitC2.value = palette[Math.floor(Math.random()*palette.length)];
    if (joinUnitC2) joinUnitC2.value = palette[Math.floor(Math.random()*palette.length)];
  } catch (e) {}
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
  const opt7 = document.createElement('option'); opt7.value = 7; opt7.text = '7'; mapSizeSel.appendChild(opt7);
  // Sort numerically
  Array.from(mapSizeSel.options).sort((a, b) => Number(a.value) - Number(b.value)).forEach(opt => mapSizeSel.appendChild(opt));
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
    for (let i = 0; i <= 30; i += 2) {
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
  const c1 = document.getElementById('hostUnitC1')?.value || '#ffffff';
  const c2 = document.getElementById('hostUnitC2')?.value || '#e74c3c';
  const cfg = {
    name,
    color: c2, // Use C2 as the primary color for compatibility
    c1, // Unit inner color
    c2, // Unit background color
    mode: gameModeSel ? gameModeSel.value : 'domination',
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
      playersList.innerHTML = `<div><span style="display:inline-block;width:12px;height:12px;background:${c2};border-radius:3px;margin-right:6px"></span>${name} (0)</div>`;
    } else alert(res?.err || 'Create failed');
  });
};

joinBtn.onclick = () => {
  const code = joinInput.value.trim().toUpperCase();
  const name = joinName.value || 'Guest';
  const c1 = document.getElementById('joinUnitC1')?.value || '#ffffff';
  const c2 = document.getElementById('joinUnitC2')?.value || '#3498db';
  const password = joinPassword.value || '';
  if (!code) return alert('Enter room code');
  socket.emit('joinRoom', { roomId: code, name, color: c2, c1, c2, password }, (res) => {
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

document.getElementById('leaveGameBtn')?.addEventListener('click', () => {
  if (state && roomId) {
    // Game is active - emit game leave event
    socket.emit('leaveGame', { roomId: roomId }, (res) => {
      if (res && res.ok) {
        alert('Left the game.');
        location.reload();
      } else {
        console.error('Leave game error:', res);
        alert('Failed to leave game');
      }
    });
  } else {
    // Not in active game, use regular leave
    leaveBtn.onclick();
  }
});

// Coordinate toggle listener (for game UI)
const coordToggle = document.getElementById('showCoordinatesToggle');
if (coordToggle) {
  coordToggle.addEventListener('change', () => {
    showCoordinates = coordToggle.checked;
    if (socket && roomId) {
      socket.emit('setShowCoordinates', { show: coordToggle.checked });
    }
    requestDraw();
  });
}

// Claims toggle listener (for game UI)
const claimsToggle = document.getElementById('showClaimsToggle');
if (claimsToggle) {
  claimsToggle.addEventListener('change', () => {
    showClaims = claimsToggle.checked;
    requestDraw();
  });
}

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

console.log('📋 Registering gameStarted listener...');
socket.on('gameStarted', ({ state: st }) => {
  console.log('🎮 gameStarted event received!', st);
  state = st;
  offsetX = offsetY = 0;
  // Reset variant caches for new game
  grassVariantCache = {};
  
  // Resize canvas now that game is starting
  setTimeout(() => resizeCanvas(), 50);
  
  // Initialize resources display
  updateResourcesDisplay();
  
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
  
  const lobbyDiv = document.getElementById('lobby');
  const gameUIDiv = document.getElementById('gameUI');
  const hostControlsDiv = document.getElementById('hostControls');
  
  if (lobbyDiv) {
    lobbyDiv.style.display = 'none';
    console.log('✅ Hidden lobby div');
  } else {
    console.error('❌ Could not find lobby div');
  }
  
  if (gameUIDiv) {
    gameUIDiv.style.display = 'block';
    console.log('✅ Showed gameUI div');
  } else {
    console.error('❌ Could not find gameUI div');
  }

  // Ensure top navigation is hidden during active matches
  try {
    const topNav = document.getElementById('topNav');
    if (topNav) {
      topNav.style.display = 'none';
      // clear any pinned positioning in case it was changed
      topNav.style.position = '';
      topNav.style.top = '';
      topNav.style.right = '';
      topNav.style.left = '';
      topNav.style.zIndex = '';
    }
  } catch (e) {
    console.warn('Could not adjust topNav for game UI', e);
  }
  
  if (hostControlsDiv) {
    hostControlsDiv.style.display = 'none';
    console.log('✅ Hidden hostControls div');
  } else {
    console.error('❌ Could not find hostControls div');
  }
  
  createBtn.disabled = true; joinBtn.disabled = true;
  if (chatPanel) chatPanel.style.display = 'block'; // show chat panel
  ensureLeaderboard();
  
  // Initialize guide panel when game starts
  const guidePanelContent = document.getElementById('guidePanelContent');
  if (guidePanelContent && guidePanelContent.children.length === 0) {
    initializeGuidePanel(guidePanelContent);
  }
});

socket.on('gameEnded', ({ reason }) => {
  alert(`Game ended: ${reason || 'Unknown reason'}`);
  location.reload();
});

socket.on('state', (st) => { 
  state = st; 
  // Log AU count for debugging
  if (st && st.grid) {
    let auCount = 0;
    for (let y = 0; y < st.size; y++) {
      for (let x = 0; x < st.size; x++) {
        if (st.grid[y][x] && st.grid[y][x].type === 'au') {
          auCount++;
        }
      }
    }
    if (auCount > 0) {
      console.log(`📡 State received with ${auCount} AU units`);
    }
  }
  updateResourcesDisplay(); 
  requestDraw(); 
  updateLeaderboard(); 
  // Update in-match players/bots bar (inline)
  if (inMatchPlayersBar) renderInMatchPlayers(state);
});
function computeClaimCounts(st) {
  const counts = {};
  if (!st || !st.claims) return counts;
  for (const key in st.claims) {
    const pid = st.claims[key];
    if (pid == null) continue;
    counts[pid] = (counts[pid] || 0) + 1;
  }
  return counts;
}

function renderInMatchPlayers(st) {
  if (!st || !st.playersMeta || !inMatchPlayersBar) return;
  const counts = computeClaimCounts(st);
  inMatchPlayersBar.innerHTML = '';

  const players = Object.keys(st.playersMeta).map(k => ({ pid: Number(k), ...st.playersMeta[k] }));
  // Render human and bot entries inline
  players.forEach(p => {
    const entry = document.createElement('div');
    entry.style.display = 'flex';
    entry.style.alignItems = 'center';
    entry.style.justifyContent = 'space-between';
    entry.style.padding = '6px 8px';
    entry.style.borderRadius = '3px';
    entry.style.background = 'rgba(0,0,0,0.0)';
    entry.style.color = '#fff';
    entry.style.width = '100%';
    entry.style.boxSizing = 'border-box';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    // color dots similar to chat (C1/C2 or fallback to color)
    if (p.c1 && p.c2) {
      const d1 = document.createElement('span');
      d1.style.display = 'inline-block'; d1.style.width = '8px'; d1.style.height = '8px'; d1.style.background = p.c1; d1.style.borderRadius = '50%';
      const d2 = document.createElement('span');
      d2.style.display = 'inline-block'; d2.style.width = '8px'; d2.style.height = '8px'; d2.style.background = p.c2; d2.style.borderRadius = '50%';
      left.appendChild(d1); left.appendChild(d2);
    } else {
      const d = document.createElement('span');
      d.style.display = 'inline-block'; d.style.width = '10px'; d.style.height = '10px'; d.style.background = p.color || '#3498db'; d.style.borderRadius = '3px';
      left.appendChild(d);
    }

    const nameText = document.createElement('span');
    nameText.style.color = '#fff';
    nameText.style.fontWeight = '700';
    nameText.textContent = `${p.name || 'Player'} (${p.pid})`;
    left.appendChild(nameText);

    const claimText = document.createElement('span');
    claimText.style.color = '#e6e6e6';
    claimText.style.fontWeight = '600';
    claimText.textContent = `Claims = ${counts[p.pid] || 0}`;
    left.appendChild(claimText);

    entry.appendChild(left);

    if (isHost && typeof socket !== 'undefined') {
      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '6px';

      const btn = document.createElement('button');
      btn.textContent = p.isAI ? 'Kick Bot' : 'Kick';
      btn.className = 'kickBtn';
      btn.addEventListener('click', () => {
        socket.emit('kickPlayer', { roomId, targetPid: p.pid }, (res) => {
          if (res && res.ok) {
            alert(`${p.isAI ? 'Bot' : 'Player'} ${p.name} kicked`);
          } else {
            alert(res?.err || 'Kick failed');
          }
        });
      });
      right.appendChild(btn);
      entry.appendChild(right);
    }

    inMatchPlayersBar.appendChild(entry);
  });
}

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
  // Custom leaderboard popup logic
  const leaderboardPopup = document.getElementById('leaderboardPopup');
  const leaderboardContent = document.getElementById('leaderboardContent');
  const leaveGameBtnPopup = document.getElementById('leaveGameBtnPopup');

  if (!leaderboardPopup || !leaderboardContent || !leaveGameBtnPopup) {
    // Fallback to alert if popup elements are missing
    alert(winner != null ? `Winner: ${state.playersMeta[winner]?.name || 'Unknown'}` : 'Draw!');
    location.reload();
    return;
  }

  // Determine mode and leaderboard data
  let html = '';
  if (state && state.mode === 'development' && state.leaderboard) {
    // Development mode: show full leaderboard with alive/dead status
    html += '<h3>Leaderboard</h3>';
    html += '<table style="margin:0 auto; border-collapse:collapse; min-width:320px;">';
    html += '<tr><th style="padding:6px 12px; border-bottom:1px solid #ccc;">Rank</th><th style="padding:6px 12px; border-bottom:1px solid #ccc;">Player</th><th style="padding:6px 12px; border-bottom:1px solid #ccc;">Score</th><th style="padding:6px 12px; border-bottom:1px solid #ccc;">Status</th></tr>';
    state.leaderboard.forEach((entry, idx) => {
      const player = state.playersMeta[entry.pid];
      const alive = player && player.alive;
      const statusDot = `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${alive ? '#27ae60' : '#c0392b'};margin-left:8px;vertical-align:middle;"></span>`;
      html += `<tr><td style="padding:6px 12px; text-align:center;">${idx+1}</td><td style="padding:6px 12px; color:${player?.color || '#222'};">${player?.name || 'Unknown'}</td><td style="padding:6px 12px; text-align:center; font-weight:bold;">${entry.score}</td><td style="padding:6px 12px; text-align:center;">${statusDot}</td></tr>`;
    });
    html += '</table>';
  } else if (state && state.mode === 'domination') {
    // Domination mode: show winner
    if (winner != null && state.playersMeta[winner]) {
      html += `<h3 style="color:${state.playersMeta[winner].color};">Winner: ${state.playersMeta[winner].name}</h3>`;
    } else {
      html += '<h3>Draw!</h3>';
    }
  } else {
    html += '<h3>Game Over</h3>';
  }
  leaderboardContent.innerHTML = html;
  leaderboardPopup.style.display = 'flex';

  // Prevent background interaction
  document.body.style.overflow = 'hidden';

  leaveGameBtnPopup.onclick = () => {
    leaderboardPopup.style.display = 'none';
    document.body.style.overflow = '';
    // Return to menu (reload page or show lobby)
    location.reload();
  };
});

socket.on('playerKicked', ({ reason }) => {
  clearInterval(turnTimer);
  alert('You have been kicked from the game.');
  location.reload();
});

socket.on('playerTimedOut', ({ pid: timedPid, reason }) => {
  if (timedPid === pid) {
    alert('You timed out during starter placement. You were not disconnected, but your starter was skipped.');
  } else {
    // notify host/players that someone timed out
    console.info('Player timed out:', timedPid, reason);
  }
});

socket.on('lobbyKicked', ({ reason }) => {
  alert(reason || 'You have been removed from the lobby.');
  location.reload();
});

// Chat handlers
socket.on('chatMessage', ({ sender, senderColor, senderC1, senderC2, message, timestamp }) => {
  if (!chatMessages) return;
  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '6px';
  msgDiv.style.fontSize = '12px';
  msgDiv.style.lineHeight = '1.4';
  msgDiv.style.wordWrap = 'break-word';
  msgDiv.style.overflowWrap = 'break-word';
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Create color dots for C1 and C2
  let colorDots = '';
  if (senderC1 && senderC2) {
    // C1 first (inner), then C2 (outer)
    colorDots = `<span style="display:inline-block;width:8px;height:8px;background:${senderC1};border-radius:50%;margin-left:4px;vertical-align:middle;"></span><span style="display:inline-block;width:8px;height:8px;background:${senderC2};border-radius:50%;margin-left:2px;vertical-align:middle;"></span>`;
  } else {
    colorDots = `<span style="display:inline-block;width:8px;height:8px;background:${senderColor || '#3498db'};border-radius:50%;margin-left:4px;vertical-align:middle;"></span>`;
  }
  
  // Check if this is the current player's message
  const isOwnMessage = (state && state.playersMeta && state.playersMeta[pid] && state.playersMeta[pid].name === sender);
  const messageColor = isOwnMessage ? '#fff' : '#34495e';
  
  msgDiv.innerHTML = `<strong style="color:#fff">${sender}</strong>${colorDots} <span style="color:#7f8c8d;font-size:11px">${time}</span><br><span style="color:${messageColor};margin-left:4px;display:inline-block;">${message}</span>`;
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

// Canvas input and responsive sizing
function resizeCanvas() {
  const container = document.getElementById('mapContainer');
  if (!container) {
    console.warn('⚠️ mapContainer not found, retrying in 100ms');
    setTimeout(resizeCanvas, 100);
    return;
  }
  const rect = container.getBoundingClientRect();
  let size = Math.min(rect.width, rect.height);
  
  // Fallback: if container has no size yet, use a default
  if (size <= 0) {
    console.warn('⚠️ Container has 0 size, using fallback 600px');
    size = 600;
  }
  
  canvas.width = size;
  canvas.height = size;
  console.log(`📐 Canvas resized to ${size}x${size}`);
  requestDraw();
}

window.addEventListener('resize', resizeCanvas);

canvas.addEventListener('contextmenu', e => e.preventDefault());

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
  popup.style.color = '#000';
  popup.textContent = text;
  mapContainer.appendChild(popup);
  setTimeout(()=>popup.remove(), ms);
}

// Flash gold display red when not enough resources
function flashGoldRed() {
  const goldElement = document.getElementById('res-gold');
  if (!goldElement) return;
  
  const originalColor = goldElement.style.color;
  let flashes = 0;
  const flashInterval = setInterval(() => {
    flashes++;
    goldElement.style.color = flashes % 2 === 1 ? '#ff4444' : originalColor;
    if (flashes >= 4) {
      clearInterval(flashInterval);
      goldElement.style.color = originalColor;
    }
  }, 150); // 150ms per flash (gentler than default)
}

// Update resource display
function updateResourcesDisplay() {
  if (!state || !state.playersMeta[pid]) return;
  const resources = state.playersMeta[pid].resources || { stone: 0, wood: 0, coal: 0, copper: 0, iron: 0, gold: 0 };
  
  let goldAmount = resources.gold || 0;
  
  // Clamp gold to reasonable range (0.1 to 999.9)
  if (goldAmount > 999.9) goldAmount = 999.9;
  if (goldAmount < 0.1 && goldAmount > 0) goldAmount = 0.1;
  if (goldAmount < 0) goldAmount = 0;
  
  const goldElement = document.getElementById('res-gold');
  
  // Log gold updates for debugging
  if (window.lastGoldAmount !== undefined && window.lastGoldAmount !== goldAmount) {
    console.log(`💰 Gold updated: ${window.lastGoldAmount} → ${goldAmount}`);
  }
  window.lastGoldAmount = goldAmount;
  
  if (goldElement) {
    // Format to 1 decimal place
    goldElement.textContent = goldAmount.toFixed(1);
  }
  
  // Calculate income from claimed tiles
  // Income is 0.1 gold per claimed tile per turn
  if (!state.claims) state.claims = {};
  let claimedTileCount = 0;
  for (const claimKey in state.claims) {
    if (state.claims[claimKey] === pid) {
      claimedTileCount++;
    }
  }
  const incomePerTurn = claimedTileCount * 0.1;
  
  const incomeElement = document.getElementById('res-income');
  if (incomeElement) {
    incomeElement.textContent = `+${incomePerTurn.toFixed(1)}g`;
  }
}

// Get spawn positions for a unit (cardinal directions - only valid/empty tiles)
function getSpawnPositions(x, y) {
  const positions = [];
  const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];  // up, down, left, right
  
  if (!state || !state.grid || !state.terrain) return positions;
  const size = state.size;
  
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      // Check if tile is empty (no unit, building, or obstacle)
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      if (!gridCell) {
        // Also check terrain - don't include deep water
        const terrain = state.terrain[ny] && state.terrain[ny][nx];
        const isDeepWater = terrain && terrain.type === 'water';
        
        // For movement, exclude deep water surrounded by water
        let canMove = true;
        if (isDeepWater) {
          const adjDirs = [[0,-1],[0,1],[-1,0],[1,0]];
          let surroundedCount = 0;
          for (const [ddx, ddy] of adjDirs) {
            const nnx = nx + ddx, nny = ny + ddy;
            if (nnx >= 0 && nny >= 0 && nnx < size && nny < size) {
              const adjTerr = state.terrain[nny] && state.terrain[nny][nnx];
              if (adjTerr && adjTerr.type === 'water') surroundedCount++;
            }
          }
          canMove = surroundedCount < 4;  // Only block if surrounded on all 4 sides
        }
        
        if (canMove) {
          positions.push({ x: nx, y: ny });
        }
      }
    }
  }
  
  return positions;
}

// Get attack positions for Swordsman (cardinal directions only, show all tiles with isOwn flag)
function getSwordsmanAttackPositions(x, y) {
  const positions = [];
  if (!state || !state.grid) return positions;
  const size = state.size;
  const playerPid = pid;
  
  // Swordsman attack: cardinal directions (up, down, left, right)
  const cardinalDirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0]  // up, down, left, right
  ];
  
  for (const [dx, dy] of cardinalDirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      // Mark own tiles for different display, but include all tiles
      const isOwn = gridCell && gridCell.pid === playerPid;
      positions.push({ x: nx, y: ny, isOwn });
    }
  }
  
  return positions;
}

function getHorsemenMovementPositions(x, y) {
  const positions = [];
  if (!state || !state.grid) return positions;
  const size = state.size;
  
  // Horseman movement: all 8 adjacent tiles (cardinal + diagonal)
  const allDirections = [
    [0, -1], [0, 1], [-1, 0], [1, 0],  // cardinal
    [-1, -1], [-1, 1], [1, -1], [1, 1]  // diagonal
  ];
  
  for (const [dx, dy] of allDirections) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      // Empty or enemy tile only
      if (!gridCell || (gridCell.type !== 'building' && gridCell.pid !== pid)) {
        positions.push({ x: nx, y: ny });
      }
    }
  }
  
  return positions;
}

function getHorsemenAttackPositions(x, y) {
  const positions = [];
  if (!state || !state.grid) return positions;
  const size = state.size;
  const playerPid = pid;
  
  // Horseman attack: all 8 adjacent tiles (cardinal + diagonal)
  const allDirections = [
    [0, -1], [0, 1], [-1, 0], [1, 0],  // cardinal
    [-1, -1], [-1, 1], [1, -1], [1, 1]  // diagonal
  ];
  
  for (const [dx, dy] of allDirections) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      // Mark own tiles for different display, but include all tiles
      const isOwn = gridCell && gridCell.pid === playerPid;
      positions.push({ x: nx, y: ny, isOwn });
    }
  }
  
  return positions;
}

function getArcherAttackPositions(x, y) {
  const positions = [];
  if (!state || !state.grid) return positions;
  const size = state.size;
  const auUnit = state.grid[y] && state.grid[y][x];
  const playerPid = pid;
  
  // Archer attack pattern:
  // Range 1: all 8 adjacent tiles (up, down, left, right + all 4 diagonals) - attacks THROUGH water
  const allDirections = [
    [0, -1], [0, 1], [-1, 0], [1, 0],  // up, down, left, right
    [-1, -1], [-1, 1], [1, -1], [1, 1]  // diagonal corners
  ];
  
  for (const [dx, dy] of allDirections) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      // Check if there's a valid target
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      // Mark own tiles for different display, but include all tiles
      const isOwn = gridCell && gridCell.pid === playerPid;
      positions.push({ x: nx, y: ny, isOwn });
    }
  }
  
  // Range 2: straight directions only (up, down, left, right) - attacks THROUGH water
  const cardinalDirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
  for (const [dx, dy] of cardinalDirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      // Check if there's a valid target
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      const isOwn = gridCell && gridCell.pid === playerPid;
      positions.push({ x: nx, y: ny, isOwn });
    }
  }
  
  return positions;
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
  ev.stopPropagation();  // Prevent event from bubbling to document
  const size = state.size;
  const tSize = baseTile(size)*zoom;
  const rect = canvas.getBoundingClientRect();
  const mapX = (ev.clientX - rect.left) / tSize + offsetX;
  const mapY = (ev.clientY - rect.top) / tSize + offsetY;
  const x = Math.floor(mapX), y = Math.floor(mapY);
  if(x<0||y<0||x>=size||y>=size) return;

  // Track last clicked tile for texture indicator
  lastClickedTile = {x, y};

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

  // Check if clicking on a spawn highlight position
  if (selectedUnitSpawnSource && spawnHighlightTiles.length > 0) {
    // Check if clicking on the source unit itself to cancel
    if (x === selectedUnitSpawnSource.x && y === selectedUnitSpawnSource.y) {
      selectedUnitSpawnSource = null;
      spawnHighlightTiles = [];
      requestDraw();
      return;
    }
    const isSpawnTile = spawnHighlightTiles.some(t => t.x === x && t.y === y);
    if (isSpawnTile) {
      // Check if this is barracks spawn, regular SU spawn, or tower attack
      if (selectedUnitSpawnSource.type === 'barracks') {
        // Barracks spawn - use barracksSpawn action
        socket.emit('action', {
          roomId,
          type: 'barracksSpawn',
          payload: {
            barracksX: selectedUnitSpawnSource.x,
            barracksY: selectedUnitSpawnSource.y,
            spawnX: x,
            spawnY: y,
            auType: selectedUnitSpawnSource.auType || 'swordsman'
          }
        }, (res) => {
          if (res?.ok) {
            flashTile(x, y, '#2ecc71');
            selectedUnitSpawnSource = null;
            spawnHighlightTiles = [];
            requestDraw();
          } else {
            showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, res?.err || 'Spawn failed');
          }
        });
      } else if (selectedUnitSpawnSource.type === 'tower') {
        // Tower attack - check for friendly fire first
        const targetTile = spawnHighlightTiles.find(t => t.x === x && t.y === y);
        if (targetTile && targetTile.isOwn) {
          showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, "It's yours - no friendly fire!");
          selectedUnitSpawnSource = null;
          spawnHighlightTiles = [];
          requestDraw();
          return;
        }
        
        // Tower attack - use towerAttack action
        socket.emit('action', {
          roomId,
          type: 'towerAttack',
          payload: {
            towerX: selectedUnitSpawnSource.x,
            towerY: selectedUnitSpawnSource.y,
            targetX: x,
            targetY: y
          }
        }, (res) => {
          if (res?.ok) {
            flashTile(x, y, '#e74c3c');
            selectedUnitSpawnSource = null;
            spawnHighlightTiles = [];
            requestDraw();
          } else {
            showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, res?.err || 'Attack failed');
          }
        });
      } else {
        // Regular SU spawn
        socket.emit('action', {
          roomId,
          type: 'spawnUnit',
          payload: {
            fromX: selectedUnitSpawnSource.x,
            fromY: selectedUnitSpawnSource.y,
            toX: x,
            toY: y,
            auType: selectedUnitSpawnSource.auType || 'swordsman'
          }
        }, (res) => {
          if (res?.ok) {
            flashTile(x, y, '#2ecc71');
            selectedUnitSpawnSource = null;
            spawnHighlightTiles = [];
            requestDraw();
          } else {
            showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, res?.err || 'Spawn failed');
          }
        });
      }
      return;
    } else {
      // Clicked elsewhere - cancel spawn mode
      selectedUnitSpawnSource = null;
      spawnHighlightTiles = [];
      requestDraw();
      return;
    }
  }

  // Check if clicking on a building highlight position (NOT USED - buildings build on unit tile)
  // This code can be removed as buildings are built immediately when selected from menu

  // Check if clicking on an AU action highlight (Move/Attack)
  if (selectedAUActionSource && auActionHighlights.length > 0) {
    const actionTile = auActionHighlights.find(t => t.x === x && t.y === y);
    if (actionTile) {
      // For attack mode, check if tile is own (friendly fire check)
      if (auActionMode === 'attack' && actionTile.isOwn) {
        showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, "It's yours - no friendly fire!");
        selectedAUActionSource = null;
        auActionMode = null;
        auActionHighlights = [];
        requestDraw();
        return;
      }
      
      // Calculate direction
      const dx = x - selectedAUActionSource.x;
      const dy = y - selectedAUActionSource.y;
      
      // Send single action to server
      const action = {
        type: auActionMode,  // 'move' or 'attack'
        direction: [dx, dy]
      };
      
      socket.emit('action', {
        roomId,
        type: 'setAUActions',
        payload: {
          x: selectedAUActionSource.x,
          y: selectedAUActionSource.y,
          action: action
        }
      }, (res) => {
        if (res?.ok) {
          // Optimistic update: immediately show checkmark on AU
          const auTile = state.grid[selectedAUActionSource.y][selectedAUActionSource.x];
          if (auTile && !auTile.actionQueue) auTile.actionQueue = [];
          if (auTile) auTile.actionQueue.push(action);
          
          flashTile(selectedAUActionSource.x, selectedAUActionSource.y, '#2ecc71');
          selectedAUActionSource = null;
          auActionMode = null;
          auActionHighlights = [];
          requestDraw();
        } else {
          showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, res?.err || 'Action failed');
        }
      });
      return;
    } else {
      // Clicked on non-action tile - cancel action mode
      selectedAUActionSource = null;
      auActionMode = null;
      auActionHighlights = [];
      requestDraw();
      return;
    }
  }

  // Check if clicking on a structure placement highlight
  if (selectedAUStructurePlacement && structurePlacementHighlights.length > 0) {
    const isPlacementTile = structurePlacementHighlights.some(t => t.x === x && t.y === y);
    if (isPlacementTile) {
      // Try to place structure unit at the clicked placement tile (converts AU -> SU at that tile)
      socket.emit('action', {
        roomId,
        type: 'placeStructureFromAU',
        payload: {
          x: x,
          y: y
        }
      }, (res) => {
        if (res?.ok) {
          flashTile(x, y, '#3498db');
          selectedAUStructurePlacement = null;
          structurePlacementHighlights = [];
          requestDraw();
        } else {
          showTransientPopup(ev.clientX-rect.left+8, ev.clientY-rect.top+8, res?.err || 'Placement failed');
        }
      });
      return;
    } else {
      // Clicked on non-placement tile - cancel placement mode
      selectedAUStructurePlacement = null;
      structurePlacementHighlights = [];
      requestDraw();
      return;
    }
  }

  const cell = state.grid[y][x];
  if(!cell) return;

  // Handle AU (Advanced Unit) interactions
  if(cell.type === 'au') {
    if(cell.pid === pid) {
      // Left click on own AU: show Move/Attack menu
      showAUContextMenu(x, y, ev.clientX, ev.clientY);
    }
    return;
  }

  // Handle structure units and buildings
  if(cell.type === 'unit') {
    if(cell.pid === pid) {
      // Left click: show menu (upgrade, spawn)
      showUnitContextMenu(x, y, ev.clientX, ev.clientY);
    } else {
      if(ev.button === 0){
        const owner = state.playersMeta[cell.pid]?.name||`Player ${cell.pid}`;
        const r = canvas.getBoundingClientRect();
        showTransientPopup(ev.clientX-r.left+8, ev.clientY-r.top+8, `Owner: ${owner}`);
      }
    }
  } 
  // Handle buildings - show menu or info
  else if(cell.type === 'building') {
    if(ev.button === 0){
      // Check if this is the player's barracks
      if(cell.buildingType === 'barracks' && cell.pid === pid) {
        showBarracksSpawnMenu(x, y, ev.clientX, ev.clientY);
      } else if(cell.buildingType === 'tower' && cell.pid === pid) {
        // Tower attack - show attack position highlights
        showTowerAttackMenu(x, y, ev.clientX, ev.clientY);
      } else {
        // Show info popup for other buildings or enemy buildings
        const owner = state.playersMeta[cell.pid]?.name||`Player ${cell.pid}`;
        const r = canvas.getBoundingClientRect();
        const buildingName = cell.buildingType.charAt(0).toUpperCase() + cell.buildingType.slice(1);
        showTransientPopup(ev.clientX-r.left+8, ev.clientY-r.top+8, `${buildingName} (${owner}) - HP: ${cell.hp}/${cell.maxHp}`);
      }
    }
  }
});

// Show spawn menu for Barracks (manual spawning with tile selection)
function showBarracksSpawnMenu(x, y, clientX, clientY) {
  const existing = document.getElementById('barracksSpawnMenu');
  if (existing) existing.remove();
  
  // Calculate spawn positions (all 8 adjacent tiles - range 1)
  const adjDirs = [
    [0,-1],[0,1],[-1,0],[1,0],        // Cardinal (N, S, W, E)
    [-1,-1],[1,-1],[-1,1],[1,1]       // Diagonal (NW, NE, SW, SE)
  ];
  const validSpawnTiles = [];
  
  for (const [dx, dy] of adjDirs) {
    const nx = x + dx, ny = y + dy;
    // Check if position is within bounds and empty
    if (nx >= 0 && ny >= 0 && nx < (state?.size || 20) && ny < (state?.size || 20)) {
      if (!state.grid[ny] || !state.grid[ny][nx]) {
        validSpawnTiles.push({x: nx, y: ny});
      }
    }
  }
  
  if (validSpawnTiles.length === 0) {
    const r = canvas.getBoundingClientRect();
    showTransientPopup(clientX-r.left+8, clientY-r.top+8, 'No empty adjacent tiles for spawning');
    return;
  }
  
  // Show highlighted tiles
  spawnHighlightTiles = validSpawnTiles.map((t, i) => ({...t, actionNum: 9999}));
  selectedUnitSpawnSource = {x, y, type: 'barracks'};
  requestDraw();
  
  const menu = document.createElement('div');
  menu.id = 'barracksSpawnMenu';
  menu.style.position = 'fixed';
  menu.style.left = clientX + 'px';
  menu.style.top = clientY + 'px';
  menu.style.background = '#fff';
  menu.style.border = '2px solid #8b6f47';
  menu.style.borderRadius = '4px';
  menu.style.padding = '8px 0';
  menu.style.zIndex = '10001';
  menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  menu.style.minWidth = '180px';
  
  const units = [
    { name: 'Swordsman', type: 'swordsman', cost: 10, emoji: '⚔️' },
    { name: 'Archer', type: 'archer', cost: 20, emoji: '🏹' },
    { name: 'Shieldman', type: 'shieldman', cost: 30, emoji: '🛡️' },
    { name: 'Horseman', type: 'horseman', cost: 30, emoji: '🐴' }
  ];
  
  // Add title
  const title = document.createElement('div');
  title.textContent = 'Select Unit Type';
  title.style.padding = '8px 12px';
  title.style.background = '#8b6f47';
  title.style.color = '#fff';
  title.style.fontSize = '12px';
  title.style.fontWeight = 'bold';
  title.style.textAlign = 'center';
  menu.appendChild(title);
  
  units.forEach((unit) => {
    const btn = document.createElement('button');
    btn.textContent = `${unit.emoji} ${unit.name} | ${unit.cost}g`;
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.padding = '8px 12px';
    btn.style.border = 'none';
    btn.style.background = '#f5f5f5';
    btn.style.color = '#333';
    btn.style.cursor = 'pointer';
    btn.style.textAlign = 'left';
    btn.style.fontSize = '12px';
    btn.style.borderTop = '1px solid #ecf0f1';
    btn.style.transition = 'background 0.2s';
    
    btn.onmouseover = () => { btn.style.background = '#e8e8e8'; };
    btn.onmouseout = () => { btn.style.background = '#f5f5f5'; };
    
    btn.onclick = (e) => {
      e.stopPropagation();
      
      // Check if player has enough gold
      if (!state || !state.playersMeta || !state.playersMeta[pid]) {
        showTransientPopup(clientX+8, clientY+8, 'Game state not ready');
        menu.remove();
        selectedUnitSpawnSource = null;
        spawnHighlightTiles = [];
        requestDraw();
        return;
      }
      
      const currentGold = (state.playersMeta[pid].resources && state.playersMeta[pid].resources.gold) || 0;
      if (currentGold < unit.cost) {
        flashGoldRed();
        showTransientPopup(clientX+8, clientY+8, `Need ${unit.cost}g for ${unit.name}, have ${currentGold.toFixed(1)}g`);
        menu.remove();
        selectedUnitSpawnSource = null;
        spawnHighlightTiles = [];
        requestDraw();
        return;
      }
      
      // Store unit type in selectedUnitSpawnSource so we know which unit to spawn
      selectedUnitSpawnSource.auType = unit.type;
      selectedUnitSpawnSource.unitName = unit.name;
      
      // Close menu and wait for player to click on highlighted tile
      menu.remove();
      
      // Update menu to show instruction
      const r = canvas.getBoundingClientRect();
      showTransientPopup(clientX-r.left+8, clientY-r.top+8, `Click on highlighted tile to spawn ${unit.name}`);
    };
    menu.appendChild(btn);
  });
  
  document.body.appendChild(menu);
  
  const closeMenu = (e) => {
    if (menu.parentNode && !menu.contains(e.target) && !spawnHighlightTiles.some(t => {
      const canvasRect = canvas.getBoundingClientRect();
      const tileX = (e.clientX - canvasRect.left) / tileSize;
      const tileY = (e.clientY - canvasRect.top) / tileSize;
      return Math.floor(tileX) === t.x && Math.floor(tileY) === t.y;
    })) {
      menu.remove();
      selectedUnitSpawnSource = null;
      spawnHighlightTiles = [];
      requestDraw();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  document.addEventListener('mousedown', closeMenu);
}

// Show tower attack menu with tile selection
function showTowerAttackMenu(x, y, clientX, clientY) {
  const existing = document.getElementById('towerAttackMenu');
  if (existing) existing.remove();
  
  // Calculate tower attack positions (5x5 box: all adjacent + next layer)
  // Chebyshev distance 1-2: all tiles within 2 steps in any direction
  const attackDirs = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (dx === 0 && dy === 0) continue;  // Skip tower's own position
      const maxDist = Math.max(Math.abs(dx), Math.abs(dy));
      if (maxDist >= 1 && maxDist <= 2) {
        attackDirs.push([dx, dy]);
      }
    }
  }
  
  const validAttackTiles = [];
  
  for (const [dx, dy] of attackDirs) {
    const nx = x + dx, ny = y + dy;
    // Check if position is within bounds
    if (nx >= 0 && ny >= 0 && nx < (state?.size || 20) && ny < (state?.size || 20)) {
      const gridCell = state.grid[ny] && state.grid[ny][nx];
      // Include all tiles, but mark own for different display
      const isOwn = gridCell && gridCell.pid === pid;
      validAttackTiles.push({x: nx, y: ny, isOwn});
    }
  }
  
  if (validAttackTiles.length === 0) {
    const r = canvas.getBoundingClientRect();
    showTransientPopup(clientX-r.left+8, clientY-r.top+8, 'No tiles in range');
    return;
  }
  
  // Show highlighted attack tiles (no menu popup, just highlights)
  spawnHighlightTiles = validAttackTiles.map((t, i) => ({...t, actionNum: 9998}));
  selectedUnitSpawnSource = {x, y, type: 'tower'};
  requestDraw();
  
  // Auto-close highlights after 10 seconds if no attack is made
  setTimeout(() => {
    if (selectedUnitSpawnSource && selectedUnitSpawnSource.type === 'tower') {
      selectedUnitSpawnSource = null;
      spawnHighlightTiles = [];
      requestDraw();
    }
  }, 10000);
}

// Show context menu for unit (upgrade or spawn)
function showUnitContextMenu(x, y, clientX, clientY) {
  // Remove any existing menu
  const existing = document.getElementById('unitContextMenu');
  if (existing) existing.remove();
  
  const menu = document.createElement('div');
  menu.id = 'unitContextMenu';
  menu.style.position = 'fixed';
  menu.style.left = clientX + 'px';
  menu.style.top = clientY + 'px';
  menu.style.background = '#fff';
  menu.style.border = '2px solid #34495e';
  menu.style.borderRadius = '4px';
  menu.style.padding = '8px 0';
  menu.style.zIndex = '10000';
  menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  menu.style.minWidth = '120px';
  
  // Upgrade button - renamed to "Activate" for L3 units
  const upgradeBtn = document.createElement('button');
  upgradeBtn.textContent = 'Activate';
  upgradeBtn.style.display = 'block';
  upgradeBtn.style.width = '100%';
  upgradeBtn.style.padding = '8px 12px';
  upgradeBtn.style.border = 'none';
  upgradeBtn.style.background = '#3498db';
  upgradeBtn.style.color = '#fff';
  upgradeBtn.style.cursor = 'pointer';
  upgradeBtn.style.textAlign = 'left';
  upgradeBtn.style.fontSize = '12px';
  upgradeBtn.onclick = (e) => {
    e.stopPropagation();
    socket.emit('action', {roomId, type: 'upgrade', payload: {x, y}}, (res) => {
      if (res?.ok) flashTile(x, y, '#2ecc71');
      menu.remove();
    });
  };
  
  menu.appendChild(upgradeBtn);
  
  // Build button (only for L3 units)
  const unit = state.grid[y][x];
  if (unit && unit.level === 3) {
    const buildBtn = document.createElement('button');
    buildBtn.textContent = 'Build';
    buildBtn.style.width = '100%';
    buildBtn.style.padding = '8px 12px';
    buildBtn.style.border = 'none';
    buildBtn.style.background = '#e67e22';
    buildBtn.style.color = '#fff';
    buildBtn.style.cursor = 'pointer';
    buildBtn.style.textAlign = 'left';
    buildBtn.style.fontSize = '12px';
    buildBtn.style.borderTop = '1px solid #ecf0f1';
    buildBtn.onclick = (e) => {
      e.stopPropagation();
      showBuildingMenu(x, y, clientX, clientY + 40);
      menu.remove();
    };
    menu.appendChild(buildBtn);
  }
  
  // Downgrade button - convert back to SU
  const downgradeBtn = document.createElement('button');
  downgradeBtn.textContent = 'Downgrade';
  downgradeBtn.style.width = '100%';
  downgradeBtn.style.padding = '8px 12px';
  downgradeBtn.style.border = 'none';
  downgradeBtn.style.background = '#e74c3c';
  downgradeBtn.style.color = '#fff';
  downgradeBtn.style.cursor = 'pointer';
  downgradeBtn.style.textAlign = 'left';
  downgradeBtn.style.fontSize = '12px';
  downgradeBtn.style.borderTop = '1px solid #ecf0f1';
  downgradeBtn.onclick = (e) => {
    e.stopPropagation();
    socket.emit('action', {roomId, type: 'downgrade', payload: {x, y}}, (res) => {
      if (res?.ok) flashTile(x, y, '#e74c3c');
      menu.remove();
    });
  };
  menu.appendChild(downgradeBtn);
  document.body.appendChild(menu);
  
  // Close menu when clicking outside of it
  const closeMenu = (e) => {
    // Only close if the click target is not the menu or a child of the menu
    if (menu.parentNode && !menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  // Use mousedown instead and add immediately (will skip the initial click)
  document.addEventListener('mousedown', closeMenu);
}

// Show context menu for AU (Move or Attack)
// Find adjacent enemy units (cardinal directions)
function getAdjacentEnemies(x, y, playerPid) {
  const enemies = [];
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // up, down, left, right
  
  if (!state || !state.grid) return enemies;
  const size = state.size;
  
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
      const tile = state.grid[ny] && state.grid[ny][nx];
      // Enemy if it's a unit/AU and belongs to different player
      if (tile && (tile.type === 'unit' || tile.type === 'au') && tile.pid !== playerPid) {
        enemies.push({ x: nx, y: ny, tile });
      }
    }
  }
  return enemies;
}

function showAUContextMenu(x, y, clientX, clientY) {
  // Remove any existing menu
  const existing = document.getElementById('auContextMenu');
  if (existing) existing.remove();
  
  const menu = document.createElement('div');
  menu.id = 'auContextMenu';
  menu.style.position = 'fixed';
  menu.style.left = clientX + 'px';
  menu.style.top = clientY + 'px';
  menu.style.background = '#fff';
  menu.style.border = '2px solid #34495e';
  menu.style.borderRadius = '4px';
  menu.style.padding = '8px 0';
  menu.style.zIndex = '10000';
  menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  menu.style.minWidth = '120px';
  
  const auUnit = state.grid[y][x];
  const adjacentEnemies = getAdjacentEnemies(x, y, pid);
  
  // Immediate attack button (only if enemy adjacent)
  if (adjacentEnemies.length > 0) {
    const immediateAttackBtn = document.createElement('button');
    immediateAttackBtn.textContent = `⚡ Attack (${adjacentEnemies.length})`;
    immediateAttackBtn.style.display = 'block';
    immediateAttackBtn.style.width = '100%';
    immediateAttackBtn.style.padding = '8px 12px';
    immediateAttackBtn.style.border = 'none';
    immediateAttackBtn.style.background = '#e67e22';
    immediateAttackBtn.style.color = '#fff';
    immediateAttackBtn.style.cursor = 'pointer';
    immediateAttackBtn.style.textAlign = 'left';
    immediateAttackBtn.style.fontSize = '12px';
    immediateAttackBtn.style.fontWeight = 'bold';
    immediateAttackBtn.onclick = (e) => {
      e.stopPropagation();
      // Show which enemy to attack
      const canvas = document.getElementById('canvas');
      const r = canvas.getBoundingClientRect();
      const firstEnemy = adjacentEnemies[0];
      socket.emit('action', {
        roomId,
        type: 'auAttackAdjacent',
        payload: { x, y, targetX: firstEnemy.x, targetY: firstEnemy.y }
      }, (res) => {
        if (res?.ok) {
          flashTile(firstEnemy.x, firstEnemy.y, '#e67e22');
        } else {
          showTransientPopup(clientX, clientY, res?.err || 'Attack failed');
        }
      });
      menu.remove();
    };
    menu.appendChild(immediateAttackBtn);
  }
  
  // Move button
  const moveBtn = document.createElement('button');
  moveBtn.textContent = auUnit?.auType === 'horseman' ? 'Move (8 dir)' : 'Move';
  moveBtn.style.display = 'block';
  moveBtn.style.width = '100%';
  moveBtn.style.padding = '8px 12px';
  moveBtn.style.border = 'none';
  moveBtn.style.background = '#95a5a6';
  moveBtn.style.color = '#fff';
  moveBtn.style.cursor = 'pointer';
  moveBtn.style.textAlign = 'left';
  moveBtn.style.fontSize = '12px';
  moveBtn.style.borderTop = adjacentEnemies.length > 0 ? '1px solid #ecf0f1' : 'none';
  moveBtn.onclick = (e) => {
    e.stopPropagation();
    // Start move selection - show appropriate tiles based on unit type
    selectedAUActionSource = { x, y };
    auActionMode = 'move';
    const auUnit = state.grid[y][x];
    const actionNum = (auUnit.actionQueue && auUnit.actionQueue.length) || 0;
    const nextActionNum = actionNum + 1;
    if (nextActionNum > 1) {
      alert('This AU already has its action queued (max 1 action)');
      menu.remove();
      return;
    }
    // Horseman can move in 8 directions; others cardinal only
    const moveTiles = auUnit?.auType === 'horseman' ? 
      getHorsemenMovementPositions(x, y) : getSpawnPositions(x, y);
    auActionHighlights = moveTiles.map(pos => ({...pos, actionNum: nextActionNum}));
    requestDraw();
    menu.remove();
  };
  
  // Attack button
  const attackBtn = document.createElement('button');
  attackBtn.textContent = 'Attack AU';
  attackBtn.style.display = 'block';
  attackBtn.style.width = '100%';
  attackBtn.style.padding = '8px 12px';
  attackBtn.style.border = 'none';
  attackBtn.style.background = '#e74c3c';
  attackBtn.style.color = '#fff';
  attackBtn.style.cursor = 'pointer';
  attackBtn.style.textAlign = 'left';
  attackBtn.style.fontSize = '12px';
  attackBtn.style.borderTop = '1px solid #ecf0f1';
  attackBtn.onclick = (e) => {
    e.stopPropagation();
    // Start attack selection - show appropriate attack tiles based on AU type
    selectedAUActionSource = { x, y };
    auActionMode = 'attack';
    const auUnit = state.grid[y][x];
    const actionNum = (auUnit.actionQueue && auUnit.actionQueue.length) || 0;
    const nextActionNum = actionNum + 1;
    if (nextActionNum > 1) {
      alert('This AU already has its action queued (max 1 action)');
      menu.remove();
      return;
    }
    
    // Different units have different attack ranges
    if (auUnit && auUnit.auType === 'archer') {
      auActionHighlights = getArcherAttackPositions(x, y).map(pos => ({...pos, actionNum: nextActionNum}));
    } else if (auUnit && auUnit.auType === 'horseman') {
      // Horseman: all 8 adjacent tiles (cardinal + diagonal)
      auActionHighlights = getHorsemenAttackPositions(x, y).map(pos => ({...pos, actionNum: nextActionNum}));
    } else {
      // Swordsman/Shieldman: only adjacent cardinal tiles (can attack empty or enemy tiles)
      auActionHighlights = getSwordsmanAttackPositions(x, y).map(pos => ({...pos, actionNum: nextActionNum}));
    }
    
    requestDraw();
    menu.remove();
  };
  
  menu.appendChild(moveBtn);
  menu.appendChild(attackBtn);
  
  // Convert to SU button
  const convertBtn = document.createElement('button');
  convertBtn.textContent = 'Convert to SU';
  convertBtn.style.display = 'block';
  convertBtn.style.width = '100%';
  convertBtn.style.padding = '8px 12px';
  convertBtn.style.border = 'none';
  convertBtn.style.background = '#3498db';
  convertBtn.style.color = '#fff';
  convertBtn.style.cursor = 'pointer';
  convertBtn.style.textAlign = 'left';
  convertBtn.style.fontSize = '12px';
  convertBtn.style.borderTop = '1px solid #ecf0f1';
  convertBtn.onclick = (e) => {
    e.stopPropagation();
    socket.emit('action', {
      roomId,
      type: 'placeStructureFromAU',
      payload: { x, y }
    }, (res) => {
      if (res?.ok) {
        flashTile(x, y, '#3498db');
        requestDraw();
      } else {
        showTransientPopup(clientX, clientY, res?.err || 'Conversion failed');
      }
    });
    menu.remove();
  };
  menu.appendChild(convertBtn);
  
  document.body.appendChild(menu);
  
  // Close menu when clicking outside of it
  const closeMenu = (e) => {
    if (menu.parentNode && !menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  document.addEventListener('mousedown', closeMenu);
}

// Show building selection menu
function showBuildingMenu(x, y, clientX, clientY) {
  // Remove any existing menu
  const existing = document.getElementById('buildingMenu');
  if (existing) existing.remove();
  
  const menu = document.createElement('div');
  menu.id = 'buildingMenu';
  menu.style.position = 'fixed';
  menu.style.left = clientX + 'px';
  menu.style.top = clientY + 'px';
  menu.style.background = '#fff';
  menu.style.border = '2px solid #d4af37';
  menu.style.borderRadius = '4px';
  menu.style.padding = '8px 0';
  menu.style.zIndex = '10001';
  menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  menu.style.minWidth = '140px';
  
  // Building options: Barracks, Wall, Tower
  const buildings = [
    { name: 'Barracks', type: 'barracks', cost: 20, emoji: '🏛️' },
    { name: 'Wall', type: 'wall', cost: 20, emoji: '🧱' },
    { name: 'Tower', type: 'tower', cost: 50, emoji: '🗼' }
  ];
  
  buildings.forEach((building) => {
    const buildBtn = document.createElement('button');
    buildBtn.textContent = `${building.emoji} ${building.name} | ${building.cost}g`;
    buildBtn.style.width = '100%';
    buildBtn.style.padding = '8px 12px';
    buildBtn.style.border = 'none';
    buildBtn.style.background = '#e67e22';
    buildBtn.style.color = '#fff';
    buildBtn.style.cursor = 'pointer';
    buildBtn.style.textAlign = 'left';
    buildBtn.style.fontSize = '12px';
    buildBtn.style.borderTop = '1px solid #ecf0f1';
    buildBtn.onclick = (e) => {
      e.stopPropagation();
      
      // Check if player has enough gold BEFORE attempting to build
      if (!state || !state.playersMeta || !state.playersMeta[pid]) {
        showTransientPopup(clientX+8, clientY+8, 'Game state not ready');
        menu.remove();
        return;
      }
      
      const currentGold = (state.playersMeta[pid].resources && state.playersMeta[pid].resources.gold) || 0;
      if (currentGold < building.cost) {
        // Flash gold red - not enough resources
        flashGoldRed();
        showTransientPopup(clientX+8, clientY+8, `Need ${building.cost}g for ${building.name}, have ${currentGold.toFixed(1)}g`);
        menu.remove();
        return;
      }
      
      // Immediately build on the unit's tile (replacing the unit)
      socket.emit('action', {
        roomId,
        type: 'buildBuilding',
        payload: {
          fromX: x,
          fromY: y,
          buildingType: building.type
        }
      }, (res) => {
        if (res?.ok) {
          flashTile(x, y, '#f39c12');
          selectedBuildingSource = null;
          buildHighlightTiles = [];
          requestDraw();
        } else {
          showTransientPopup(clientX+8, clientY+8, res?.err || 'Build failed');
        }
      });
      menu.remove();
    };
    menu.appendChild(buildBtn);
  });
  
  document.body.appendChild(menu);
  
  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (menu.parentNode && !menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}


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
function hexToRgb(hex){const c=(hex||'#000').replace('#','');const r=parseInt(c.substr(0,2),16);const g=parseInt(c.substr(2,2),16);const b=parseInt(c.substr(4,2),16);return {r,g,b};}

// Draw a regular hexagon at (x,y) with given radius, fill, stroke, and optional rotation in degrees
function drawHexagon(x, y, radius, fillColor, strokeColor = null, strokeWidth = 1, rotationDegrees = 0) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 - 90 + rotationDegrees) * (Math.PI / 180);
    const hx = x + radius * Math.cos(angle);
    const hy = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }
}

function drawUnit(px,py,tileSize,c,color,c1,c2){
  const cx=px+tileSize/2, cy=py+tileSize/2;
  
  // Get unit colors: use custom C1/C2 if available, otherwise use single color
  const unitC1 = c1 || color; // Inner color (C1) - fills the hexagons or inner square
  const unitC2 = c2 || color; // Background color (C2) - outer ring circle or outer square
  
  // If this is a square unit (converted from AU), render as square with yellow hp bar
  if (c.isSquareUnit) {
    const squareSize = tileSize * 0.75;
    const squarePadding = (tileSize - squareSize) / 2;
    const squarePx = px + squarePadding;
    const squarePy = py + squarePadding;
    
    // Draw C2 background square
    ctx.fillStyle = unitC2;
    ctx.fillRect(squarePx, squarePy, squareSize, squareSize);
    
    // Draw C1 inner square (80% size)
    const innerSize = squareSize * 0.8;
    const innerPadding = (squareSize - innerSize) / 2;
    ctx.fillStyle = unitC1;
    ctx.fillRect(squarePx + innerPadding, squarePy + innerPadding, innerSize, innerSize);
    
    // Draw border
    ctx.strokeStyle = unitC2;
    ctx.lineWidth = 2;
    ctx.strokeRect(squarePx, squarePy, squareSize, squareSize);
    
    // Draw level indicator (yellow bar with segments inside bottom of square)
    const hpBarWidth = squareSize * 0.9;
    const hpBarHeight = 6;
    const hpBarX = squarePx + (squareSize - hpBarWidth) / 2;
    const hpBarY = squarePy + squareSize - hpBarHeight - 2;  // Inside bottom of square
    const maxLevel = 3;
    const curLevel = c.level || 1;
    const segmentCount = 3;
    const segmentWidth = hpBarWidth / segmentCount;
    
    // Draw background (dark)
    ctx.fillStyle = '#333';
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    
    // Draw level fill (yellow) - each level fills one segment
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < curLevel; i++) {
      ctx.fillRect(hpBarX + i * segmentWidth, hpBarY, segmentWidth - 1, hpBarHeight);
    }
    
    // Draw segment separators
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let i = 1; i < segmentCount; i++) {
      ctx.beginPath();
      ctx.moveTo(hpBarX + i * segmentWidth, hpBarY);
      ctx.lineTo(hpBarX + i * segmentWidth, hpBarY + hpBarHeight);
      ctx.stroke();
    }
    
    // Draw outer border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    
    return;  // Don't continue with hexagon rendering
  }
  
  
  // Draw large C2 (background color) circle as outer ring
  const ringRadius = tileSize * 0.28;
  ctx.beginPath();
  ctx.fillStyle = unitC2;
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Determine number of gems based on unit level
  const numGems = c.level || 1; // Level 1 = 1 gem, Level 2 = 2 gems, Level 3 = 3 gems
  
  // Gem layout: arrange gems around center based on level
  // Offsets chosen so gems do not touch and sit inside texture outlines
  let gemPositions = [];
  if (numGems === 1) {
    gemPositions = [[0, 0]]; // Single gem in center
  } else if (numGems === 2) {
    // Two gems stacked vertically - adjusted spacing for better alignment
    gemPositions = [[0, -tileSize * 0.095], [0, tileSize * 0.095]];
  } else if (numGems === 3) {
    // Three gems in triangle
    gemPositions = [
      [0, -tileSize * 0.12],
      [-tileSize * 0.11, tileSize * 0.06],
      [tileSize * 0.11, tileSize * 0.06]
    ];
  }
  
  // Draw hexagon gems with C1 (inner color) fill - BEFORE texture so it's visible on top of C2
  let hexRadius;
  if (numGems === 2) hexRadius = tileSize * 0.088;
  else hexRadius = tileSize * 0.095;
  const hexStrokeWidth = 2;
  
  // Draw C1 gems (these should be visible regardless of texture)
  for (const [offsetX, offsetY] of gemPositions) {
    const gemX = cx + offsetX;
    const gemY = cy + offsetY;
    const rotation = 90;
    drawHexagon(gemX, gemY, hexRadius, unitC1, unitC2, hexStrokeWidth, rotation);
  }
  
  // Try to draw unit texture on top of everything
  let unitTexture = null;
  if (customTextures.unitLevels && numGems >= 1 && numGems <= 3) {
    unitTexture = customTextures.unitLevels[numGems - 1];
  }
  if (unitTexture && unitTexture.complete && unitTexture.naturalWidth) {
    const unitSize = tileSize * 0.6;
    ctx.drawImage(unitTexture, cx - unitSize / 2, cy - unitSize / 2, unitSize, unitSize);
  }

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

// Initialize canvas size after drawRequested is declared
resizeCanvas();

// Check if a water tile has only water in straight directions (up, down, left, right)
function isWaterSurroundedByWater(x, y, terrain) {
  if (!terrain || !state) return false;
  
  const size = state.size;
  const directions = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 }   // right
  ];
  
  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    
    // Out of bounds counts as non-water
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) return false;
    
    const neighbor = terrain[ny] && terrain[ny][nx];
    // If neighbor is not water, this tile is adjacent to non-water
    if (!neighbor || neighbor.type !== 'water') return false;
  }
  
  return true;
}

function draw(){
  document.querySelectorAll('.tileCoord').forEach(el=>el.remove());
  if(!state){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#f9f9f9';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    return;
  }
  
  // Log claims count if they exist (debug)
  if (state.claims && Object.keys(state.claims).length > 0 && !window.claimsLogged) {
    console.log(`📍 State has claims:`, Object.keys(state.claims).length, `tiles claimed`);
    console.log(`Claims by player:`, Object.values(state.claims).reduce((acc, pid) => {
      acc[pid] = (acc[pid] || 0) + 1;
      return acc;
    }, {}));
    window.claimsLogged = true;
  }
  
  const size = state.size;
  const tSize = baseTile(size)*zoom;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const inset = tSize*0.12;

  // Pre-set image quality for entire frame (avoid per-tile overhead)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  let auRenderCount = 0;

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
        // Normal water: use Water2 if surrounded by water, Water1 if adjacent to non-water
        let waterTexture = null;
        if (isWaterSurroundedByWater(x, y, state.terrain)) {
          waterTexture = customTextures.waterVariants.mid || customTextures.water; // Water2 if surrounded
        } else {
          waterTexture = customTextures.water; // Water1 if adjacent to non-water
        }
          
          if (waterTexture && waterTexture.complete && waterTexture.naturalWidth) {
            try { ctx.drawImage(waterTexture, px, py, tSize, tSize); }
            catch (e) { ctx.fillStyle = '#5dade2'; ctx.fillRect(px, py, tSize, tSize); }
          } else { ctx.fillStyle = '#5dade2'; ctx.fillRect(px, py, tSize, tSize); }
      } else {
        // default: grass (single unified texture)
        let grassTexture = null;
        if (customTextures.grassVariants && customTextures.grassVariants.length > 0) {
          grassTexture = customTextures.grassVariants[0]; // Use single grass texture
        }
        if (grassTexture && grassTexture.complete && grassTexture.naturalWidth) {
          try { ctx.drawImage(grassTexture, px, py, tSize, tSize); }
          catch (e) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, tSize, tSize); }
        } else { ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, tSize, tSize); }
      }

      // Draw claimed land overlay (event-style with diagonal stripes using both C1 and C2)
      const claimKey = `${x},${y}`;
      if (showClaims && state.claims && state.claims[claimKey] !== undefined) {
        const claimedByPid = state.claims[claimKey];
        const claimedByMeta = state.playersMeta[claimedByPid];
        const c1Color = claimedByMeta ? claimedByMeta.c1 : '#fff';
        const c2Color = claimedByMeta ? claimedByMeta.c2 : '#000';
        
        // Draw claim overlay with event-style diagonal stripes (40% alpha)
        ctx.save();
        ctx.globalAlpha = 0.4;
        
        // Fill background with C2 color
        ctx.fillStyle = c2Color;
        ctx.fillRect(px, py, tSize, tSize);
        
        // Draw diagonal stripes (45-degree angle) with C1 color
        ctx.strokeStyle = c1Color;
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
        
        // Use single obstacle texture
        const obstacleTexture = customTextures.obstacleVariants[0];
        if (obstacleTexture && obstacleTexture.complete && obstacleTexture.naturalWidth) {
          try {
            ctx.drawImage(obstacleTexture, px, py, bSize, bSize);
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

      if(cell?.type==='unit') {
        const playerMeta = state.playersMeta[cell.pid] || {};
        // Debug C1/C2 colors
        if (!window.colorDebugLogged) {
          console.log(`🎨 Player ${cell.pid} colors - color: ${playerMeta.color}, c1: ${playerMeta.c1}, c2: ${playerMeta.c2}`);
          window.colorDebugLogged = true;
        }
        drawUnit(px, py, tSize, cell, playerMeta.color || '#666', playerMeta.c1, playerMeta.c2);
      }

      // Draw AU (Advanced Unit) - Colored square with sword emoji and HP bar
      if(cell?.type === 'au') {
        auRenderCount++;
        const playerMeta = state.playersMeta[cell.pid] || {};
        console.log(`🎖️ Rendering AU at (${x},${y}) for player ${cell.pid}`);
        const c2Color = playerMeta.c2 || '#000';  // C2 color for background
        const c1Color = playerMeta.c1 || '#fff';  // C1 color for inner
        const cx = px + tSize / 2;
        const cy = py + tSize / 2;
        
        // Draw C2 background square (larger, matching SU size approximately)
        const squareSize = tSize * 0.75;
        const squarePadding = (tSize - squareSize) / 2;
        const squarePx = px + squarePadding;
        const squarePy = py + squarePadding;
        
        ctx.fillStyle = c2Color;
        ctx.fillRect(squarePx, squarePy, squareSize, squareSize);
        
        // Draw C1 inner square (80% of outer square size)
        const innerSize = squareSize * 0.8;
        const innerPadding = (squareSize - innerSize) / 2;
        ctx.fillStyle = c1Color;
        ctx.fillRect(squarePx + innerPadding, squarePy + innerPadding, innerSize, innerSize);
        
        // Draw border around AU
        ctx.strokeStyle = c2Color;
        ctx.lineWidth = 2;
        ctx.strokeRect(squarePx, squarePy, squareSize, squareSize);
        
        // Draw symbol in the middle
        ctx.save();
        ctx.font = `bold ${Math.floor(tSize * 0.5)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c2Color;
        
        // Choose symbol based on AU type
        let symbol = '⚔';  // Default: Swordsman
        if (cell.auType === 'archer') symbol = '🏹';
        else if (cell.auType === 'shieldman') symbol = '🛡️';
        else if (cell.auType === 'horseman') symbol = '🐴';
        
        ctx.fillText(symbol, cx, cy - 2);
        ctx.restore();
        
        // Draw HP bar - max HP depends on AU type
        const auMaxHp = {
          swordsman: 3,
          archer: 2,
          shieldman: 5,
          horseman: 3
        };
        const maxHp = auMaxHp[cell.auType] || 3;
        const curHp = Math.max(0, Math.min(maxHp, cell.hp || maxHp));
        
        const hpBarWidth = squareSize * 0.9;
        const hpBarHeight = 5;
        const hpBarX = squarePx + (squareSize - hpBarWidth) / 2;
        const hpBarY = squarePy + squareSize + 4;
        const segmentCount = maxHp;
        const segmentWidth = hpBarWidth / segmentCount;
        
        // Draw background (dark)
        ctx.fillStyle = '#333';
        ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
        
        // Draw health fill (green) - hp represents full segments
        ctx.fillStyle = '#00cc00';
        for (let i = 0; i < curHp; i++) {
          ctx.fillRect(hpBarX + i * segmentWidth, hpBarY, segmentWidth - 1, hpBarHeight);
        }
        
        // Draw segment separators
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        for (let i = 1; i < segmentCount; i++) {
          ctx.beginPath();
          ctx.moveTo(hpBarX + i * segmentWidth, hpBarY);
          ctx.lineTo(hpBarX + i * segmentWidth, hpBarY + hpBarHeight);
          ctx.stroke();
        }
        
        // Draw outer border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
        
        // Draw action indicator (checkmark if has action, X if idle) below the sword
        const hasActions = cell.actionQueue && cell.actionQueue.length > 0;
        const actionSymbol = hasActions ? '✓' : '✕';
        
        ctx.save();
        ctx.font = `bold ${Math.floor(tSize * 0.1)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw white fill with black outline below the sword, with padding from bottom
        const symbolX = cx;
        const symbolY = cy + tSize * 0.22;
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(actionSymbol, symbolX, symbolY);
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.strokeText(actionSymbol, symbolX, symbolY);
        
        ctx.restore();
      }

      // Draw Building (Barracks, Wall, Tower)
      if(cell?.type === 'building') {
        const playerMeta = state.playersMeta[cell.pid] || {};
        const c1Color = playerMeta.c1 || '#fff';  // C1 accent color
        const c2Color = playerMeta.c2 || '#000';  // C2 accent color
        const cx = px + tSize / 2;
        const cy = py + tSize / 2;
        
        // Draw building core square in center
        const buildingSize = tSize * 0.65;
        const buildingPadding = (tSize - buildingSize) / 2;
        const buildingX = px + buildingPadding;
        const buildingY = py + buildingPadding;
        
        // Fill with background color based on building type
        ctx.fillStyle = c2Color;
        ctx.fillRect(buildingX, buildingY, buildingSize, buildingSize);
        
        // Draw building-specific texture using C1 and C2
        if (cell.buildingType === 'tower') {
          // TOWER: 5x5 grid showing range with center in C2
          const innerSize = buildingSize * 0.85;
          const innerPad = (buildingSize - innerSize) / 2;
          const innerX = buildingX + innerPad;
          const innerY = buildingY + innerPad;
          
          const gridSize = 5;
          const cellSize = innerSize / gridSize;
          
          for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
              const x0 = innerX + col * cellSize;
              const y0 = innerY + row * cellSize;
              
              const distFromCenter = Math.max(Math.abs(col - 2), Math.abs(row - 2));
              
              if (distFromCenter === 0) {
                // Center square is C2
                ctx.fillStyle = c2Color;
                ctx.fillRect(x0, y0, cellSize, cellSize);
              } else if (distFromCenter === 1) {
                ctx.fillStyle = c1Color;
                ctx.fillRect(x0, y0, cellSize, cellSize);
              } else if (distFromCenter === 2) {
                ctx.fillStyle = c2Color;
                ctx.fillRect(x0, y0, cellSize, cellSize);
              }
              
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 0.5;
              ctx.strokeRect(x0, y0, cellSize, cellSize);
            }
          }
          
          // Draw center circle in C2 color
          ctx.fillStyle = c2Color;
          ctx.beginPath();
          ctx.arc(buildingX + buildingSize / 2, buildingY + buildingSize / 2, cellSize * 0.35, 0, Math.PI * 2);
          ctx.fill();
          
        } else if (cell.buildingType === 'barracks') {
          // BARRACKS: Vertical stripes of C1 and C2 (soldiers standing in formation)
          const stripeWidth = buildingSize / 6;
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = i % 2 === 0 ? c1Color : c2Color;
            ctx.fillRect(buildingX + i * stripeWidth, buildingY, stripeWidth, buildingSize);
          }
          
          // Add horizontal accent bars
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(buildingX, buildingY + buildingSize * 0.33);
          ctx.lineTo(buildingX + buildingSize, buildingY + buildingSize * 0.33);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(buildingX, buildingY + buildingSize * 0.66);
          ctx.lineTo(buildingX + buildingSize, buildingY + buildingSize * 0.66);
          ctx.stroke();
          
        } else if (cell.buildingType === 'wall') {
          // WALL: Simple diagonal diamond pattern (same for all walls, no connection visuals)
          const diamondSize = buildingSize / 4;

          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
              const x_pos = buildingX + col * diamondSize;
              const y_pos = buildingY + row * diamondSize;
              
              // Checkerboard pattern
              if ((row + col) % 2 === 0) {
                ctx.fillStyle = c1Color;
              } else {
                ctx.fillStyle = c2Color;
              }
              
              // Draw normal diamond (same for all walls)
              ctx.beginPath();
              ctx.moveTo(x_pos + diamondSize * 0.5, y_pos);
              ctx.lineTo(x_pos + diamondSize, y_pos + diamondSize * 0.5);
              ctx.lineTo(x_pos + diamondSize * 0.5, y_pos + diamondSize);
              ctx.lineTo(x_pos, y_pos + diamondSize * 0.5);
              ctx.closePath();
              ctx.fill();
              
              ctx.strokeStyle = '#000';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        
        // Darker border for definition (use 1px stroke and align to pixel grid)
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(buildingX + 0.5, buildingY + 0.5, buildingSize - 1, buildingSize - 1);
        
        // Draw HP bar
        if (typeof cell.hp === 'number') {
          const hpBarWidth = buildingSize * 0.8;
          const hpBarHeight = 4;
          const hpBarX = buildingX + (buildingSize - hpBarWidth) / 2;
          const hpBarY = buildingY + buildingSize + 3;
          const maxHp = cell.maxHp || 5;
          const curHp = Math.max(0, Math.min(maxHp, cell.hp));
          const segmentCount = maxHp;
          const segmentWidth = hpBarWidth / segmentCount;
          
          // Draw background
          ctx.fillStyle = '#333';
          ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
          
          // Draw health
          ctx.fillStyle = '#00cc00';
          for (let i = 0; i < curHp; i++) {
            ctx.fillRect(hpBarX + i * segmentWidth, hpBarY, segmentWidth - 0.5, hpBarHeight);
          }
          
          // Draw border
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
        }
      }

      // coordinate box top-right (only if enabled)
      if (showCoordinates) {
        const coordText = tileLabel(x,y);
        const boxSize = Math.min(28, tSize*0.35);
        ctx.fillStyle='rgba(255,255,255,0.95)';
        ctx.fillRect(px+tSize-boxSize-2, py+2, boxSize, boxSize);
        ctx.strokeStyle='#000'; ctx.lineWidth=1;
        ctx.strokeRect(px+tSize-boxSize-2, py+2, boxSize, boxSize);
        ctx.fillStyle='#000'; ctx.font=`bold ${Math.floor(boxSize*0.55)}px Arial`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(coordText, px+tSize-boxSize/2-2, py+boxSize/2+2);
      }
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

  // Render spawn highlight tiles (green overlay for spawn positions, or red/white for tower attacks)
  if (spawnHighlightTiles && spawnHighlightTiles.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    
    // Check if this is a tower attack highlight (selectedUnitSpawnSource.type === 'tower')
    const isTowerAttack = selectedUnitSpawnSource && selectedUnitSpawnSource.type === 'tower';
    
    for (const tile of spawnHighlightTiles) {
      const sx = (tile.x - offsetX) * baseTile(state.size) * zoom;
      const sy = (tile.y - offsetY) * baseTile(state.size) * zoom;
      const tSize = baseTile(state.size) * zoom;
      
      // Determine color: red for tower attack enemies, white for own, green for spawn
      let fillColor = '#27ae60'; // Default green for spawn
      if (isTowerAttack) {
        fillColor = tile.isOwn ? '#ffffff' : '#e74c3c'; // White for own, red for enemy
      }
      
      ctx.fillStyle = fillColor;
      ctx.fillRect(sx, sy, tSize, tSize);
      
      // Border around tile
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = fillColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, tSize - 4, tSize - 4);
      ctx.globalAlpha = 0.4;
    }
    ctx.restore();
  }

  // Render building highlight tiles (orange overlay for building positions)
  if (buildHighlightTiles && buildHighlightTiles.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#f39c12';  // Orange for building
    for (const tile of buildHighlightTiles) {
      const sx = (tile.x - offsetX) * baseTile(state.size) * zoom;
      const sy = (tile.y - offsetY) * baseTile(state.size) * zoom;
      ctx.fillRect(sx, sy, baseTile(state.size) * zoom, baseTile(state.size) * zoom);
      
      // Border around build tile
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, baseTile(state.size) * zoom - 4, baseTile(state.size) * zoom - 4);
      ctx.globalAlpha = 0.4;
    }
    ctx.restore();
  }

  // Render AU action highlights (Move/Attack)
  if (auActionHighlights && auActionHighlights.length > 0) {
    ctx.save();
    
    // Render each tile with appropriate color (blue for move, red for attack, white for own)
    for (const tile of auActionHighlights) {
      const sx = (tile.x - offsetX) * baseTile(state.size) * zoom;
      const sy = (tile.y - offsetY) * baseTile(state.size) * zoom;
      const tSize = baseTile(state.size) * zoom;
      
      // Determine color based on mode and ownership
      let color;
      if (auActionMode === 'move') {
        color = '#3498db'; // blue for move
      } else {
        // Attack mode: red for enemy, white for own
        color = tile.isOwn ? '#ffffff' : '#e74c3c';
      }
      
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, tSize, tSize);
      
      // Border
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, tSize - 4, tSize - 4);
    }
    
    // Draw action numbers
    for (const tile of auActionHighlights) {
      const sx = (tile.x - offsetX) * baseTile(state.size) * zoom;
      const sy = (tile.y - offsetY) * baseTile(state.size) * zoom;
      const tSize = baseTile(state.size) * zoom;
      
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#000';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tile.actionNum || '?', sx + tSize / 2, sy + tSize / 2);
    }
    
    ctx.restore();
  }

  // Render structure placement highlights (blue for AU placement)
  if (structurePlacementHighlights && structurePlacementHighlights.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#3498db';  // blue
    for (const tile of structurePlacementHighlights) {
      const sx = (tile.x - offsetX) * baseTile(state.size) * zoom;
      const sy = (tile.y - offsetY) * baseTile(state.size) * zoom;
      ctx.fillRect(sx, sy, baseTile(state.size) * zoom, baseTile(state.size) * zoom);
      
      // Border
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, baseTile(state.size) * zoom - 4, baseTile(state.size) * zoom - 4);
      ctx.globalAlpha = 0.35;
    }
    ctx.restore();
  }
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

  // Log AU render count  
  if (auRenderCount > 0) {
    console.log(`🎖️ Drew ${auRenderCount} AU units in this frame`);
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
  playersList.innerHTML = '<h4 style="margin:0 0 6px 0;color:var(--accent-gold)">Players</h4>';
  botsList.innerHTML = '<h4 style="margin:0 0 6px 0;color:var(--accent-gold)">Bots</h4>';

  const humans = players.filter(p => !p.isAI);
  const bots = players.filter(p => p.isAI);

  for (const p of humans) {
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

  for (const p of bots) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.marginBottom = '6px';
    div.style.padding = '4px';
    div.style.background = '#f3f3f3';
    div.style.borderRadius = '4px';

    const botInfo = document.createElement('span');
    botInfo.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${p.color};border-radius:3px;margin-right:4px"></span>${p.name} (bot ${p.pid})`;
    div.appendChild(botInfo);

    if (isHost) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Kick Bot';
      kickBtn.style.padding = '2px 6px';
      kickBtn.style.fontSize = '12px';
      kickBtn.style.background = '#c0392b';
      kickBtn.style.color = '#fff';
      kickBtn.style.border = 'none';
      kickBtn.style.borderRadius = '3px';
      kickBtn.style.cursor = 'pointer';
      kickBtn.addEventListener('click', () => {
        socket.emit('kickPlayer', { roomId, targetPid: p.pid }, (res) => {
          if (res && res.ok) {
            alert(`Kicked bot ${p.name}`);
          } else {
            alert(res?.err || 'Kick failed');
          }
        });
      });
      div.appendChild(kickBtn);
    }

    botsList.appendChild(div);
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