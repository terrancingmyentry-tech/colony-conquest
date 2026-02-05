// Minimal lobby helper: only manage socket and available lobbies list without redeclaring shared DOM refs
if (!window.socket) window.socket = io();

// Lightweight nav handlers for Home / Multiplayer / Settings / Credits
document.addEventListener('DOMContentLoaded', () => {
  const navHome = document.getElementById('navHome');
  const navMultiplayer = document.getElementById('navMultiplayer');
  const navSettings = document.getElementById('navSettings');
  const navCredits = document.getElementById('navCredits');
  const discordLink = document.getElementById('discordLink');
  const homeMulti = document.getElementById('homeMulti');
  const homeSettingsBtn = document.getElementById('homeSettingsBtn');
  const homeCreditsBtn = document.getElementById('homeCreditsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettings = document.getElementById('closeSettings');

  function hideAllTopPanels() {
    ['homePanel','lobby','gameUI'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'none';
    });
  }

  function showHome() { hideAllTopPanels(); const h = document.getElementById('homePanel'); if (h) h.style.display = ''; }
  function showLobby() { hideAllTopPanels(); const l = document.getElementById('lobby'); if (l) l.style.display = ''; }
  function showCredits() { const c = document.getElementById('creditsModal'); if (c) c.style.display = 'flex'; }
  const topNav = document.getElementById('topNav');

  if (navHome) navHome.addEventListener('click', () => { showHome(); if (topNav) topNav.style.display = 'none'; });
  if (navMultiplayer) navMultiplayer.addEventListener('click', () => { showLobby(); if (topNav) topNav.style.display = ''; });
  if (navSettings) navSettings.addEventListener('click', () => { if (settingsModal) settingsModal.style.display = 'flex'; });
  if (navCredits) navCredits.addEventListener('click', showCredits);

  if (homeMulti) homeMulti.addEventListener('click', () => { showLobby(); if (topNav) topNav.style.display = ''; });
  if (homeSettingsBtn) homeSettingsBtn.addEventListener('click', () => { if (settingsModal) settingsModal.style.display = 'flex'; });
  if (homeCreditsBtn) homeCreditsBtn.addEventListener('click', () => { showCredits(); });
  const closeCredits = document.getElementById('closeCredits');
  if (closeCredits) closeCredits.addEventListener('click', () => { const c = document.getElementById('creditsModal'); if (c) c.style.display = 'none'; });
  if (closeSettings) closeSettings.addEventListener('click', () => { if (settingsModal) settingsModal.style.display = 'none'; });

  // default show home and hide top nav initially
  showHome();
  if (topNav) {
    topNav.style.display = 'none';
    // reset any pinned positioning in case we returned from a match
    topNav.style.position = '';
    topNav.style.top = '';
    topNav.style.right = '';
    topNav.style.zIndex = '';
  }
});

window.socket.on('connect', () => {
  window.socket.emit('requestAvailableLobbies');
});

setInterval(() => window.socket.emit('requestAvailableLobbies'), 2000);

let lastLobbiesList = [];

window.socket.on('availableLobbies', (lobbies) => {
  const lobbyBrowser = document.getElementById('lobbyBrowser');
  if (!lobbyBrowser) return;
  
  // filter out singleplayer / private rooms from the public lobby list
  const visibleLobbies = (lobbies || []).filter(l => {
    if (!l) return false;
    if (l.private) return false; // skip private rooms (singleplayer/local)
    if (l.maxPlayers === 1) return false; // skip singleplayer matches
    // also skip obvious singleplayer naming
    if ((l.lobbyName || '').toLowerCase().includes('singleplayer')) return false;
    return true;
  });

  if (!visibleLobbies || visibleLobbies.length === 0) {
    if (lastLobbiesList.length > 0) {
      lobbyBrowser.innerHTML = '<div style="text-align: center; color: #999;">No lobbies available</div>';
      lastLobbiesList = [];
    }
    return;
  }
  // Check if visible lobbies have actually changed
  const lobbiesChanged = lastLobbiesList.length !== visibleLobbies.length || visibleLobbies.some((lobby, idx) => {
    const prev = lastLobbiesList[idx];
    if (!prev) return true;
    return prev.roomId !== lobby.roomId || prev.players !== lobby.players || prev.lobbyName !== lobby.lobbyName || prev.mapSize !== lobby.mapSize;
  });

  if (!lobbiesChanged) return;

  lobbyBrowser.innerHTML = '';
  lastLobbiesList = visibleLobbies;

  visibleLobbies.forEach(lobby => {
    const div = document.createElement('div');
    div.className = 'lobbyItem';
    div.textContent = `${lobby.lobbyName} - ${lobby.players}/${lobby.maxPlayers} | Map: ${lobby.mapSize}`;
    if (lobby.roomId && document.getElementById('joinInput') && document.getElementById('joinBtn')) {
      div.onclick = () => { document.getElementById('joinInput').value = lobby.roomId; document.getElementById('joinBtn').click(); };
    }
    lobbyBrowser.appendChild(div);
  });
});

