# Quick Start Guide - Burst Line Online

## 🚀 Starting the Server

```bash
cd burstline-online
npm install    # if dependencies not installed
node server.js
```

Server runs on `http://localhost:3000`

---

## 🎮 Playing the Game

### Step 1: Create a Lobby (Host)

1. **Enter your name** (max 30 characters)
2. **Configure game settings**:
   
   **Normal Section** (Always Visible):
   - ✅ **Boulders**: Toggle on/off
     - Percentage: Choose 5%-50% (if enabled)
   - ✅ **Boulder HP**:
     - Toggle ON to enable → Select 1-10 HP value
     - Toggle OFF → Boulders become indestructible
   - ✅ **Water**: Toggle on/off
     - Percentage: Choose 5%-50% (if enabled)
     - River: Generate connected river runs
     - Lakes: Generate blob-shaped water areas
   
   **Advanced Section** (Click to Expand):
   - 🔧 **Tile Events Max**: 0-10 (concurrent dynamic events)

3. **Click CREATE LOBBY**
4. **Share the room code** with other players

---

### Step 2: Join a Lobby (Players)

#### Option A: Lobby Browser (Recommended)
1. Click lobby in **Lobby Browser**
2. If locked 🔒, enter password
3. Auto-joins the game

#### Option B: Enter Code Manually
1. Paste **room code** in join field
2. Enter **password** if required (private lobby)
3. Click **JOIN BY CODE**

---

### Step 3: Start the Game (Host Only)

1. Wait for players to join
2. Click **START GAME** button
3. Game begins with starter placement phase (120 seconds per player)
4. **Chat panel appears** on right side → ready to communicate

---

## 💬 Chat During Game

- **Send message**: Type in chat input, press **Enter** or click **Send**
- **Message format**: `[TIME] PLAYER_NAME: message`
- **Max message length**: 256 characters
- **Visible to**: All players in the room

---

## 👋 Kicking Players (Host Only - Lobby Phase)

1. Locate player in player list
2. Click **KICK** button (red, right of player name)
3. Player gets notified and returns to lobby
4. Player list updates for all players

---

## 🎯 Game Mechanics

### Unit Upgrades
- **Left Click** on unit → Upgrade (1 → 2 → 3)
- **Level 3** + Left Click → **Activate** (spread to adjacent tiles)
- **Right Click** on unit → Downgrade (3 → 2 → 1)

### Boulders
- **With HP**: Adjacent activations damage boulders (reduces HP)
  - Boulder breaks when HP = 0
- **Without HP (Off)**: Boulders are **indestructible**
  - Cannot be damaged by any unit action

### Water & Rivers
- **Cannot build units on water**
- **Rivers**: Straight-line water patterns
- **Lakes**: Blob-shaped water areas
- Can traverse via bridges (when water creates natural gaps)

### Tile Events (If Enabled)
- **Phase 1** (30% visible): Diamond pattern overlay, event spawning
- **Phase 2** (100% visible): Ready to apply
- **Phase 3** (applies): 
  - **Destroy**: Clears tile
  - **Boulder**: Spawns boulder
  - **Water/River**: Adds water
- Then disappears

---

## ⚙️ Configuration Options Explained

### Boulder Settings
| Setting | Effect |
|---------|--------|
| Boulders: OFF | No boulders on map |
| Boulders: ON, HP: OFF | Boulders spawn, indestructible |
| Boulders: ON, HP: 1-10 | Boulders spawn with X health points |

### Water Settings
| Setting | Effect |
|---------|--------|
| Water: OFF | No water on map |
| Water: ON, 5% | 5% water coverage (random ponds) |
| + River: ON | Adds river generation (25% becomes rivers) |
| + Lakes: ON | Adds lake generation (25% becomes lakes) |
| Both ON | Mix of rivers + lakes + remaining as ponds |

### Tile Events
| Setting | Effect |
|---------|--------|
| 0 | Disabled (no dynamic events) |
| 1-10 | Max concurrent events, 10% = destroy, 30% = boulder, 30% = water, 30% = river |

---

## 🔒 Private Lobbies

### Creating a Private Lobby
1. During lobby creation, note the password field
2. Check "Private" (if available in future update)
3. Enter password for access
4. Share code + password with trusted players only

### Joining Private Lobby
1. Click private lobby (🔒 lock icon) in browser
2. Enter password when prompted
3. Click enter or confirm
4. Joins if password correct, error if wrong

---

## 🎨 Customization

### Player Colors
- Default color palette: Red, Green, Blue, Purple, Yellow, Orange, Teal, Gray
- Pick any color from color picker or use default
- Each player gets unique color (auto-assigned if taken)

### Map Size
- 10×10 to 30×30 tiles
- Larger maps = longer games = more strategic depth

### AI Players
- Host can add 0-8 AI opponents
- AI performs automatic moves each turn
- Fills remaining player slots

---

## 🐛 Troubleshooting

### Can't Connect to Server
```
Error: Connection refused
→ Make sure server is running: node server.js
→ Check port 3000 is not blocked
```

### Can't Join Lobby
```
Error: Room not found
→ Verify room code is correct (case-insensitive)
→ Room may have already started or ended
```

```
Error: Invalid password
→ Check password is correct (case-sensitive)
→ Ask host to confirm password
```

```
Error: Room full
→ Wait for player to leave or join different lobby
```

### Chat Not Sending
```
→ Make sure you're in active game (not lobby)
→ Check message is not empty
→ Verify server is still running
```

### Boulders Taking Damage When They Shouldn't
```
→ Check Boulder HP setting
→ OFF (0) = indestructible ✓
→ If set to 1-10, boulders take damage (normal)
```

---

## 📊 Turn Timing

### Starter Placement Phase
- **120 seconds per player** to place starting unit
- All players must place before game begins
- Timeout = automatic elimination

### Normal Game Rounds
- **30 seconds per turn**
- Turns cycle through all alive players
- Timeout = auto-pass to next player
- Game ends when 1 or 0 players remain

### Leaderboard
- Shows player rankings by unit count
- Updates each turn
- Dead players marked with ❌

---

## 🏁 Winning the Game

1. **Eliminate all opponents** (reduce their units to 0)
2. **Last player standing wins** (or draw if simultaneous)
3. **Victory screen** shows winner or draw result
4. **Auto-reload** returns to lobby

---

## 💡 Pro Tips

1. **Scout early**: Explore map during starter placement
2. **Form alliances**: Use chat to coordinate temporary truces
3. **Manage water carefully**: 
   - Use rivers as natural barriers
   - Lakes provide defensive positions
4. **Boulder strategy**:
   - Indestructible boulders = great for defense
   - Destructible boulders = create new pathways
5. **Tile events** (if enabled):
   - Monitor the board for event spawns
   - Use destroys to clear obstacles
   - New boulders can trap enemies
6. **Chat efficiency**: Quick callouts win games ("LEFT FLANK PUSH!")

---

## 📋 Feature Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Lobby Creation | ✅ | Advanced collapsible section |
| Lobby Browser | ✅ | Shows unstarted lobbies, auto-refreshes |
| Private Lobbies | ✅ | Password-protected access |
| In-Game Chat | ✅ | Real-time messaging |
| Player Kick | ✅ | Host-only, pre-game only |
| Boulder HP | ✅ | Configurable 0-10 or indestructible |
| Water Types | ✅ | Rivers, Lakes, Random ponds |
| Tile Events | ✅ | Dynamic spawning (optional) |
| AI Players | ✅ | Configurable count |
| Leaderboard | ✅ | Real-time unit count tracking |
| Spectator Mode | ❌ | Future enhancement |
| Chat History | ❌ | Future enhancement |
| Replays | ❌ | Future enhancement |

---

## 🔗 Server Status

Check server health:
```bash
# In terminal where server is running
# You should see: "Colony Conquest server running on :3000"
# If port already in use, kill existing process:
taskkill /PID <PID> /F
```

---

## 📞 Support

### Common Commands

**Create lobby with specific config:**
- Set name, color, player limit, map size
- Configure boulders, water, events
- Note: Password protection can be added via config in future

**Switch lobbies:**
- Leave current lobby
- Browse available lobbies
- Join new lobby

**Replay recent game:**
- Create new lobby with same settings
- Invite same players
- Game mechanics now support stored configs

---

## 🎓 Learning Path

1. **Beginner**: Create simple game (default settings, no events)
2. **Intermediate**: Add boulders + water terrain
3. **Advanced**: Enable tile events, manage boulder HP strategically
4. **Expert**: Master multi-terrain strategy with events

---

**Version**: 2.0 (Day 2 Major Update)  
**Last Updated**: [Current Session]  
**Server**: Running on :3000

Enjoy the game! 🎮

