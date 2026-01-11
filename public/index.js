// Minimal lobby helper: only manage socket and available lobbies list without redeclaring shared DOM refs
if (!window.socket) window.socket = io();

window.socket.on('connect', () => {
  window.socket.emit('requestAvailableLobbies');
});

setInterval(() => window.socket.emit('requestAvailableLobbies'), 2000);

window.socket.on('availableLobbies', (lobbies) => {
  const lobbyBrowser = document.getElementById('lobbyBrowser');
  if (!lobbyBrowser) return;
  lobbyBrowser.innerHTML = '';
  if (!lobbies || lobbies.length === 0) {
    lobbyBrowser.innerHTML = '<div style="text-align: center; color: #999;">No lobbies available</div>';
    return;
  }
  lobbies.forEach(lobby => {
    const div = document.createElement('div');
    div.className = 'lobbyItem';
    div.textContent = `${lobby.lobbyName} - ${lobby.players}/${lobby.maxPlayers} | Map: ${lobby.mapSize}` + (lobby.private ? ' [Private]' : '');
    if (lobby.roomId && document.getElementById('joinInput') && document.getElementById('joinBtn')) {
      div.onclick = () => { document.getElementById('joinInput').value = lobby.roomId; document.getElementById('joinBtn').click(); };
    }
    lobbyBrowser.appendChild(div);
  });
});

