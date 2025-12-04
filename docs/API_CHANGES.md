# API Changes & Implementation Details

## Socket.IO Events Documentation

### Room Configuration Schema

```javascript
// Old Schema (Before)
config: {
  maxPlayers: number,      // 2-16
  aiCount: number,         // 0-8
  mapSize: number,         // 10-30 (even)
  bPct: number,            // 0-50 (boulder percentage)
  boulderBreak: boolean,   // DEPRECATED - removed
  boulderHp: number,       // 0-10 (fixed value, no conditional)
  waterOn: boolean,
  waterPct: number,        // 5-50
  riverOn: boolean,
  lakeOn: boolean,
  tileEventsMax: number    // 0-10
}

// New Schema (After)
config: {
  maxPlayers: number,      // 2-16
  aiCount: number,         // 0-8
  mapSize: number,         // 10-30 (even)
  bPct: number,            // 0-50
  boulderOn: boolean,      // NEW: can disable boulders entirely
  boulderHp: number,       // CHANGED: 0 = off (indestructible), 1-10 = HP value
  waterOn: boolean,
  waterPct: number,        // 5-50
  riverOn: boolean,
  lakeOn: boolean,
  tileEventsMax: number,   // 0-10
  private?: boolean,       // NEW: marks lobby as password-protected
  password?: string        // NEW: password for private lobbies (null if public)
}
```

---

## Event Changes

### `createRoom` Event

**Client → Server**

**OLD Payload:**
```javascript
{
  name: string,
  color: string,
  maxPlayers: number,
  aiCount: number,
  mapSize: number,
  bPct: number,
  boulderBreak: boolean,    // DEPRECATED
  boulderHp: number,
  waterOn: boolean,
  waterPct: number,
  riverOn: boolean,
  lakeOn: boolean,
  tileEventsMax: number
}
```

**NEW Payload:**
```javascript
{
  name: string,             // max 30 chars (client enforced)
  color: string,            // hex color
  maxPlayers: number,
  aiCount: number,
  mapSize: number,
  bPct: number,
  boulderOn: boolean,       // NEW: enable/disable boulders
  boulderHp: number,        // NEW: 0-10 (0 = indestructible)
  waterOn: boolean,
  waterPct: number,
  riverOn: boolean,
  lakeOn: boolean,
  tileEventsMax: number,
  isPrivate?: boolean,      // NEW: optional, defaults false
  password?: string         // NEW: optional password if isPrivate true
}
```

**Response:**
```javascript
{
  ok: boolean,
  roomId: string,
  pid: number,
  players: Player[],
  config: Config
}
```

---

### `joinRoom` Event

**Client → Server**

**OLD Payload:**
```javascript
{
  roomId: string,
  name: string,
  color: string
}
```

**NEW Payload:**
```javascript
{
  roomId: string,
  name: string,             // max 30 chars (client enforced)
  color: string,
  password?: string         // NEW: password if joining private lobby
}
```

**Response:**
```javascript
{
  ok: boolean,
  roomId: string,
  pid: number,
  players: Player[],
  config: Config,
  err?: string              // error message if validation fails
}
```

**Error Cases:**
- `"Invalid password"` - Wrong password for private lobby
- `"Room full"` - Max players reached
- `"Room not found"` - Room doesn't exist

---

### `getLobbies` Event (NEW)

**Client → Server**

**Payload:**
```javascript
{}  // No parameters
```

**Callback Response:**
```javascript
{
  lobbies: [
    {
      roomId: string,
      hostName: string,
      players: number,      // current player count
      maxPlayers: number,
      private: boolean
    },
    // ... more lobbies
  ]
}
```

**Also Emits:** `lobbiesList` event with same data

**Filter:** Only includes lobbies where `room.state === null` (not yet started)

**Usage:**
```javascript
socket.emit('getLobbies', {}, (response) => {
  console.log(response.lobbies); // Array of unstarted lobbies
});

// Also listen for broadcast
socket.on('lobbiesList', ({ lobbies }) => {
  // Update UI with lobbies list
});
```

---

### `sendChat` Event (NEW)

**Client → Server**

**Payload:**
```javascript
{
  roomId: string,
  message: string          // max 256 chars (server enforced via substring)
}
```

**Callback Response:**
```javascript
{
  ok: boolean,
  err?: string
}
```

**Broadcast:** Server emits `chatMessage` to all players in room

---

### `chatMessage` Event (NEW - Server Broadcast)

**Server → Client (all players in room)**

**Payload:**
```javascript
{
  sender: string,          // player name
  message: string,         // the chat text
  timestamp: number        // Date.now() - milliseconds since epoch
}
```

**Client Usage:**
```javascript
socket.on('chatMessage', ({ sender, message, timestamp }) => {
  const time = new Date(timestamp).toLocaleTimeString();
  console.log(`[${time}] ${sender}: ${message}`);
});
```

---

### `kickPlayer` Event (NEW)

**Client → Server**

**Payload:**
```javascript
{
  roomId: string,
  targetPid: number        // pid of player to kick
}
```

**Callback Response:**
```javascript
{
  ok: boolean,
  err?: string
}
```

**Validations:**
- Caller must be host (`socket.id === room.hostSid`)
- Target cannot be host themselves (pid !== 0)
- Target must exist in players list

**Side Effects:**
- Removes target player from `room.players` array
- If game active, removes from game state
- Emits `playerKicked` to kicked player
- Broadcasts `lobbyUpdate` to remaining players

---

### `playerKicked` Event (NEW - Server Broadcast)

**Server → Client (kicked player only)**

**Payload:**
```javascript
{
  reason: string           // e.g., "kickedByHost"
}
```

**Client Usage:**
```javascript
socket.on('playerKicked', ({ reason }) => {
  alert(`You were kicked from the game: ${reason}`);
  location.reload();       // Return to lobby
});
```

---

## Function Signature Changes

### `damageAdjacentBoulders()`

**Before:**
```javascript
function damageAdjacentBoulders(st, x, y, amount = 1)
```

**After:**
```javascript
function damageAdjacentBoulders(st, x, y, amount = 1, config = {})
```

**Logic Change:**
- Returns early if `config.boulderHp === 0`
- When 0, no damage applied to adjacent boulders (indestructible)

---

### `activateTile()`

**Before:**
```javascript
function activateTile(st, x, y, ownerPid, hitTracker={})
```

**After:**
```javascript
function activateTile(st, x, y, ownerPid, hitTracker={}, config={})
```

**Changes:**
- Passes `config` to `damageAdjacentBoulders()` calls
- Recursive calls include `config` parameter
- Respects boulder HP setting from config

---

### `burst()`

**Before:**
```javascript
function burst(st, x, y, ownerPid)
```

**After:**
```javascript
function burst(st, x, y, ownerPid, config={})
```

**Changes:**
- Passes `config` to `damageAdjacentBoulders()` call
- Direct boulder damage check: `if (config.boulderHp !== 0)` before reducing HP
- Recursive `activateTile()` call includes `config`

---

## Client-Side HTML Element Changes

### Old IDs (Deprecated)
```html
<!-- REMOVED / RENAMED -->
<input id="boulderBreak" type="checkbox"> <!-- → boulderOn -->
<select id="boulderHpSel">                <!-- → boulderHp -->
  <option value="0">Off</option>
  <option value="1">1 HP</option>
  ...
</select>
```

### New IDs
```html
<!-- NORMAL SECTION -->
<label>
  <input id="boulderOn" type="checkbox"> Boulders
</label>
<select id="boulderPct">
  <option>0%</option>
  <option>5%</option>
  ...
</select>

<label id="boulderHpLabel">
  <input id="boulderHpOn" type="checkbox"> Boulder HP
  <select id="boulderHp">
    <option value="0">Off (0)</option>
    <option value="1">1 HP</option>
    ...
  </select>
</label>

<label>
  <input id="waterOn" type="checkbox"> Water
</label>
<select id="waterPct">...</select>

<label>
  <input id="riverOn" type="checkbox"> River
</label>

<label>
  <input id="lakeOn" type="checkbox"> Lakes
</label>

<!-- ADVANCED SECTION -->
<button id="advancedBtn">Advanced ▼</button>
<div id="advancedOptions" style="display: none;">
  <label>Tile Events Max:</label>
  <select id="tileEventsMax">...</select>
</div>

<!-- JOIN SECTION -->
<input id="joinPassword" type="password" maxlength="30" placeholder="Password (if private)">
<div id="lobbyBrowser">
  <!-- Populated by getLobbies event -->
</div>

<!-- GAME UI -->
<div id="chatPanel" style="display: none;">
  <div id="chatMessages"></div>
  <input id="chatInput" type="text" maxlength="256">
  <button id="chatSend">Send</button>
</div>
```

---

## Client-Side JavaScript Changes

### Form Handlers Updated

```javascript
// OLD: boulderBreak, boulderHpSel
boulderBreakSel = document.getElementById('boulderBreak');     // REMOVED
boulderHpSel = document.getElementById('boulderHpSel');        // REMOVED

// NEW: boulderOn, boulderHpOn, boulderHp
boulderOnSel = document.getElementById('boulderOn');           // NEW
boulderHpOnSel = document.getElementById('boulderHpOn');       // NEW
boulderHpSel = document.getElementById('boulderHp');           // UPDATED ID
```

### Create Button Config

```javascript
// OLD
const cfg = {
  ...
  boulderBreak: boulderBreakSel ? boulderBreakSel.checked : false,
  boulderHp: boulderHpSel ? Number(boulderHpSel.value) : 0,
  ...
};

// NEW
const cfg = {
  ...
  boulderOn: boulderOnSel ? boulderOnSel.checked : false,
  boulderHp: boulderHpOnSel && boulderHpOnSel.checked 
    ? Number(boulderHpSel.value) 
    : 0,
  ...
};
```

### New Event Listeners

```javascript
// Advanced button toggle
advancedBtn.addEventListener('click', () => {
  advancedOptions.classList.toggle('show');
  advancedBtn.classList.toggle('open');
});

// Boulder HP conditional display
boulderHpOnSel.addEventListener('change', () => {
  const label = document.getElementById('boulderHpLabel');
  label.style.display = boulderHpOnSel.checked ? 'block' : 'none';
});

// Name validation (30 chars)
joinName.addEventListener('input', () => {
  if (joinName.value.length > 30) {
    joinName.value = joinName.value.substring(0, 30);
  }
});
```

### New Socket Events

```javascript
// Lobby browser population
socket.on('lobbiesList', ({ lobbies }) => {
  if (!lobbies || lobbies.length === 0) {
    lobbyBrowser.innerHTML = '<div>No lobbies available</div>';
  } else {
    // Build clickable lobby items
  }
});

// Chat messaging
socket.on('chatMessage', ({ sender, message, timestamp }) => {
  // Append to chatMessages div
});

// Player kicked notification
socket.on('playerKicked', ({ reason }) => {
  alert('You were kicked');
  location.reload();
});
```

---

## Server-Side State Changes

### Room Object

```javascript
// OLD
room = {
  roomId: string,
  hostSid: string,
  config: Config,
  players: Player[],
  state: GameState | null,
  timer: null | NodeJS.Timer
}

// NEW
room = {
  roomId: string,
  hostSid: string,
  config: Config,
  players: Player[],
  state: GameState | null,
  timer: null | NodeJS.Timer,
  private: boolean,         // NEW
  password: string | null   // NEW
}
```

### Config Object

```javascript
// Boulder HP System
// OLD: boulderHp could only be enabled with a fixed value
// NEW: 0 means disabled/indestructible, 1-10 means HP value

// When boulderHp === 0:
// - Boulders spawn normally on map
// - Adjacent unit activations DO NOT damage boulders
// - Direct bursts DO NOT damage boulders
// - Boulders are essentially invulnerable

// When boulderHp > 0:
// - Boulders spawn with that HP value
// - Adjacent activations reduce HP by 1
// - Direct bursts reduce HP by 1
// - Boulder removed when HP <= 0
```

---

## Backward Compatibility Notes

### Breaking Changes
1. **`boulderBreak` parameter removed** - Use `boulderOn` instead
2. **`boulderHpSel` HTML ID changed** - Now `boulderHp`
3. **Boulder HP logic inverted** - 0 now means off (indestructible) not a fixed HP value

### Migration Path
If upgrading from old schema:
1. Rename all `boulderBreak` to `boulderOn`
2. If `boulderHp > 0` in old config, keep as-is (1-10 HP values unchanged)
3. Add `boulderOn: true` to enable boulder generation (if not present)
4. Set `boulderHp: 0` to disable boulder damage on legacy configs
5. Lobbies table: Add `private` (boolean) and `password` (string) columns

---

## Testing Scenarios

### Scenario 1: Indestructible Boulders
```
1. Create lobby with:
   - Boulders: ON
   - Boulder HP: OFF (0)
2. Start game
3. Try to break boulders with units
4. Result: Boulders take no damage ✓
```

### Scenario 2: Boulder HP System
```
1. Create lobby with:
   - Boulders: ON
   - Boulder HP: ON (5 HP)
2. Start game
3. Activate adjacent unit 5 times
4. Result: Boulder breaks on 5th activation ✓
```

### Scenario 3: Private Lobby
```
1. Create lobby with:
   - Private: YES
   - Password: "secret123"
2. Open Lobby Browser
3. Click private lobby (lock icon)
4. Prompt appears for password
5. Enter wrong password → Error
6. Enter correct password → Join ✓
```

### Scenario 4: Chat System
```
1. Create and start game
2. Chat panel visible
3. Type message and press Enter
4. Message appears with timestamp
5. Other players see message ✓
```

### Scenario 5: Kick Player
```
1. Host creates game
2. Players join (not started yet)
3. Host clicks Kick on a player
4. Kicked player sees alert
5. Other players see updated player list ✓
```

---

## Performance Considerations

### Lobby Browser Polling
- Default: 3-second interval
- Server filters unstarted lobbies (no game state)
- Could be optimized with Socket.IO rooms/namespaces in future

### Chat Message Limit
- 256 characters per message (server-side enforcement)
- No rate limiting (could cause spam)
- Future: Add rate limiting (e.g., 5 msgs per 10 seconds per player)

### Boulder Damage Check
- `config.boulderHp === 0` check is O(1) per tile event
- No performance impact

---

## Security Considerations

### Password Storage
⚠️ **WARNING**: Passwords stored in plaintext in room object
- Not hashed or encrypted
- Visible in server logs
- **Recommendation for production**: 
  - Use bcryptjs to hash passwords
  - Compare hashes on join
  - Never log full passwords

### Chat Message Truncation
- 256-character limit prevents large payloads
- Could add rate limiting to prevent spam
- No injection protection (XSS safe in modern browsers)

### Kick Authorization
- Only host can kick (server-side validation)
- Prevents players from kicking each other
- Host transfer on disconnect keeps rooms manageable

---

## Future Enhancement Ideas

1. **Chat Features**
   - Private messages between players
   - Chat reactions/emotes
   - Message history persistence

2. **Lobby Management**
   - Rename room (host-only)
   - Change password mid-game (host-only)
   - Lobby search/filter by difficulty

3. **Access Control**
   - Spectator mode
   - Observer chat separate from player chat
   - Blind mode (hide other players' units until reveal)

4. **Analytics**
   - Track average game duration
   - Player stats (wins/losses)
   - Chat frequency analytics

5. **Moderation**
   - Player reporting system
   - Chat message history/audit log
   - Profanity filter

