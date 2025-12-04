// public/index.js
// Lobby UI + create/join logic. Use the shared `window.socket` instance (do not redeclare it).
if (!window.socket) window.socket = io();

// DOM refs
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const startBtn = document.getElementById('startBtn');
const leaveBtn = document.getElementById('leaveBtn');

const hostNameInput = document.getElementById('hostName');
const hostColorInput = document.getElementById('hostColor');
const maxPlayersSel = document.getElementById('maxPlayers');
const aiCountSel = document.getElementById('aiCount');
const aiNormalSel = document.getElementById('aiNormal');
const aiAdvancedSel = document.getElementById('aiAdvanced');
const aiGrandmasterSel = document.getElementById('aiGrandmaster');
const mapSizeSel = document.getElementById('mapSize');
const obstaclePctSel = document.getElementById('obstaclePct');
const obstacleBreakSel = document.getElementById('obstacleBreak');
const obstacleHpSel = document.getElementById('obstacleHp');
const waterOnSel = document.getElementById('waterOn');
const waterPctSel = document.getElementById('waterPct');
const scatteredWaterOnSel = document.getElementById('scatteredWaterOn');
const riverOnSel = document.getElementById('riverOn');
const lakeOnSel = document.getElementById('lakeOn');
const poisonWaterOnSel = document.getElementById('poisonWaterOn');
const tileEventsMaxSel = document.getElementById('tileEventsMax');

const joinInput = document.getElementById('joinInput');
const joinName = document.getElementById('joinName');
const joinColor = document.getElementById('joinColor');

const roomLabel = document.getElementById('roomLabel');
const playersList = document.getElementById('playersList');

let localRoom = null;
let myPid = null;

// Local name & color persistence
(function loadLocal() {
  try {
    const n = localStorage.getItem('cc_name'); if (n) { hostNameInput.value = n; joinName.value = n; }
    const c = localStorage.getItem('cc_color'); if (c) { hostColorInput.value = c; joinColor.value = c; }
  } catch (e) {}
})();

function saveLocal() {
  try { localStorage.setItem('cc_name', hostNameInput.value || joinName.value || 'Guest'); localStorage.setItem('cc_color', hostColorInput.value || joinColor.value || '#3498db'); } catch(e){}
}

// populate selects
function populateHostSelects() {
  maxPlayersSel.innerHTML = ''; for (let i = 2; i <= 16; i++) maxPlayersSel.appendChild(new Option(i,i));
  if (aiCountSel) { aiCountSel.innerHTML=''; for (let i = 0; i <= 8; i++) aiCountSel.appendChild(new Option(i,i)); }
  aiNormalSel.innerHTML=''; aiAdvancedSel.innerHTML=''; aiGrandmasterSel.innerHTML='';
  for (let i = 0; i <= 8; i++) {
    aiNormalSel.appendChild(new Option(i,i));
    aiAdvancedSel.appendChild(new Option(i,i));
    aiGrandmasterSel.appendChild(new Option(i,i));
  }
  mapSizeSel.innerHTML=''; for (let i = 8; i <= 24; i+=2) mapSizeSel.appendChild(new Option(i,i));
  obstaclePctSel.innerHTML=''; for (let i=0;i<=50;i+=5) obstaclePctSel.appendChild(new Option(i,i+'%'));
  obstacleHpSel.innerHTML=''; obstacleHpSel.appendChild(new Option(0,'Off (0)')); for (let i=1;i<=10;i++) obstacleHpSel.appendChild(new Option(i,i+' HP'));
  waterPctSel.innerHTML=''; for (let i=0;i<=50;i+=5) waterPctSel.appendChild(new Option(i,i+'%'));
  tileEventsMaxSel.innerHTML=''; for (let i=0;i<=10;i++) tileEventsMaxSel.appendChild(new Option(i,i));
}
populateHostSelects();

// render players in lobby
function renderPlayersList(players) {
  playersList.innerHTML = '';
  for (const p of players) {
    const d = document.createElement('div');
    const color = document.createElement('span'); color.className = 'colorBox'; color.style.background = p.color || '#999';
    const txt = document.createElement('span'); txt.textContent = `${p.name} (${p.pid}) ${p.alive===false ? '❌' : ''}`;
    d.appendChild(color); d.appendChild(txt);
    playersList.appendChild(d);
  }
}

// create lobby
createBtn.onclick = () => {
  saveLocal();
  const cfg = {
    name: hostNameInput.value || 'Host',
    color: hostColorInput.value || '#e74c3c',
    maxPlayers: Number(maxPlayersSel.value),
    // AI config: counts per difficulty
    aiConfig: {
      normal: Number(aiNormalSel ? aiNormalSel.value : aiCountSel.value),
      advanced: Number(aiAdvancedSel ? aiAdvancedSel.value : 0),
      grandmaster: Number(aiGrandmasterSel ? aiGrandmasterSel.value : 0)
    },
    mapSize: Number(mapSizeSel.value),
    bPct: Number(obstaclePctSel.value),
    obstacleBreak: obstacleBreakSel.checked,
    obstacleHp: Number(obstacleHpSel.value),
    waterOn: waterOnSel.checked,
    waterPct: Number(waterPctSel.value),
    scatteredWaterOn: scatteredWaterOnSel.checked,
    riverOn: riverOnSel.checked,
    lakeOn: lakeOnSel.checked,
    poisonWaterOn: poisonWaterOnSel.checked,
    tileEventsMax: Number(tileEventsMaxSel.value)
  };
  window.socket.emit('createRoom', cfg, (res) => {
    if (!res || !res.ok) return alert(res ? res.err : 'Create failed');
    localRoom = res.roomId;
    myPid = res.pid;
    roomLabel.textContent = `Room: ${res.roomId}`;
    renderPlayersList(res.players || []);
    startBtn.style.display = 'inline-block';
    leaveBtn.style.display = 'inline-block';
  });
};

// join lobby
joinBtn.onclick = () => {
  saveLocal();
  const code = (joinInput.value || '').trim();
  if (!code) return alert('Enter room code');
  const name = joinName.value || 'Guest';
  const color = joinColor.value || '#3498db';
  window.socket.emit('joinRoom', { roomId: code, name, color }, (res) => {
    if (!res || !res.ok) return alert(res ? res.err : 'Join failed');
    localRoom = res.roomId;
    myPid = res.pid;
    roomLabel.textContent = `Room: ${res.roomId}`;
    renderPlayersList(res.players || []);
    leaveBtn.style.display = 'inline-block';
    startBtn.style.display = (res.players && res.players[0] && res.players[0].sid === window.socket.id) ? 'inline-block' : 'none';
  });
};

// start game (host only)
startBtn.onclick = () => {
  if (!localRoom) return alert('No room');
  window.socket.emit('startGame', { roomId: localRoom }, (res) => {
    if (!res || !res.ok) return alert(res ? res.err : 'Start failed');
  });
};

// leave room
leaveBtn.onclick = () => {
  if (!localRoom) return;
  window.socket.emit('leaveRoom', { roomId: localRoom }, (res) => {
    if (res && res.ok) {
      localRoom = null; myPid = null;
      roomLabel.textContent = 'Room: —';
      playersList.innerHTML = '';
      leaveBtn.style.display = 'none';
      startBtn.style.display = 'none';
    }
  });
};

// socket listeners
window.socket.on('lobbyUpdate', ({ players, config }) => {
  renderPlayersList(players || []);
  // update room label if we're not set
  if (!localRoom && players && players.length) {
    // infer room id from first player's room via server: server uses upper-case roomId - store if available via players[0]
    // we rely on server to have sent a create/join callback earlier, but keep label if we already have it
  }
  // show start button if we're host (first player in list with matching sid)
  if (players && players.length && window.socket.id === players[0]?.sid) startBtn.style.display = 'inline-block';
});

// persist name/color changes to local storage when inputs change
hostNameInput.addEventListener('change', saveLocal);
hostColorInput.addEventListener('change', saveLocal);
joinName.addEventListener('change', saveLocal);
joinColor.addEventListener('change', saveLocal);

