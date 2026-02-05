# Claims System Verification

## Issues Fixed in This Session

### 1. Claiming Logic Clarification
**File:** `server.js` (placeStarter function, line 1635-1648)
- **Issue:** Complex terrain checking logic that was unclear
- **Fix:** Simplified to: "Claim grass tiles (not water)"
- **Logic:** `if (!terrain || terrain.type !== 'water')`

### 2. Gold Generation Counting
**File:** `server.js` (generateResources function, line 611-631)
- **Issue:** Type mismatch when comparing claim PIDs (object keys are strings, stored PIDs might be numeric)
- **Fix:** Convert pid to numeric before comparison: `const pidNum = Number(pid);`
- **Debug:** Added console logging to show gold generation per turn

### 3. Claimed Tile Rendering GlobalAlpha Management
**File:** `public/game-client.js` (draw function, lines 1576-1595)
- **Issue:** globalAlpha not being properly reset after drawing claimed tiles
- **Fix:** Ensure `ctx.globalAlpha = 1;` is set before AND after drawing
- **Impact:** Prevents alpha blending issues affecting subsequent draws

### 4. Texture Loading Status
**File:** `public/game-client.js` (loadTextures function, line 163-169)
- **Added:** Console logging to verify texture load status
- **Shows:** ✓ for loaded textures, ✗ for missing textures

### 5. Debug Logging for Claims
**File:** `public/game-client.js` (draw function, line 1518-1547)
- **Added:** Console output showing:
  - When claims are first received
  - How many tiles are claimed per player
  - When first claimed tile is rendered

## Claims System Architecture

### Server-Side (Claims Storage)
- **Location:** `state.claims` object (format: `{"x,y": playerID}`)
- **Set by:**
  1. `placeStarter()` - Claims 3x3 area around starter (grass only)
  2. `processDUActions()` - Claims destination tile on AU move
  3. `burst()` - Claims 4 adjacent tiles on SU burst

### Server-Side (Gold Generation)
- **Function:** `generateResources()` (line 610-631)
- **Frequency:** Once per turn at start of normal turn phase
- **Calculation:** Count tiles in `state.claims` where value equals player ID
- **Output:** `player.resources.gold += claimedCount`

### Client-Side (Visual Display)
- **Location:** Draw loop (line 1518-1595)
- **Check:** `if (state.claims && state.claims[claimKey] !== undefined)`
- **Render:** 
  1. Try to use claimed texture (Grass_Claimed.png or Water1_Claimed.png)
  2. Colorize red pixels → C1 color, blue pixels → C2 color
  3. Fallback to solid C1 color if texture missing

### Client-Side (Gold Display)
- **Location:** `updateResourcesDisplay()` (line 811-820)
- **Updates:** Called whenever state is received
- **Display:** Updates `#res-gold` element

## Testing Checklist

### Phase 1: Starter Placement
- [ ] Start a 1-player game
- [ ] Place starter at any position
- [ ] **Check Server Logs:**
  - Should see: "🏗️ Player 0 placed starter at (x,y) and claimed X tiles..."
  - Expected: ~9 tiles claimed (3x3 area, less if near water)
- [ ] **Check Browser Console:**
  - Should see: "📍 State has claims: X tiles claimed"
  - Shows breakdown by player

### Phase 2: Gold Generation
- [ ] End your first turn (after placing starter)
- [ ] Next turn should start
- [ ] **Check Server Logs:**
  - Should see: "💰 Player 0: generated X gold from X claimed tiles (0 -> X)"
- [ ] **Check Gold Display:**
  - Should see gold amount equal to number of claimed tiles

### Phase 3: Claimed Tile Visibility
- [ ] Look at the map around your starter
- [ ] **Expected Visual:**
  - Claimed tiles should appear with player's faction colors
  - If textures load: Colored overlay (Grass_Claimed.png or Water1_Claimed.png with C1/C2 colors)
  - If textures fail: Solid color overlay (C1 color)
- [ ] **Check Browser Console:**
  - Should see: "Loaded: Grass_Claimed.png" and/or "Loaded: Water1_Claimed.png"
  - Texture load status should show: `{grass: '✓', water1: '✓', ...}`

### Phase 4: AU Movement Claims
- [ ] Move an AU to a new tile
- [ ] End your turn
- [ ] Next turn:
  - [ ] Gold should increase by 1 additional (new claimed tile)
  - [ ] New tile should show claimed color

### Phase 5: SU Burst Claims
- [ ] Create an SU (right-click AU to convert)
- [ ] Move it next to another player's AU
- [ ] Activate burst
- [ ] End your turn
- [ ] Next turn:
  - [ ] Gold should increase (4 adjacent tiles claimed)
  - [ ] Those tiles should show claimed color

## File Locations

**Textures:**
- `public/custom_assets/custom/Grass_Claimed.png` - Grass claim texture
- `public/custom_assets/custom/Water1_Claimed.png` - Water claim texture
- `public/custom_assets/custom/Swordsman.png` - AU unit texture

**Code Changes:**
- `server.js` - Claiming logic and gold generation
- `public/game-client.js` - Claiming visualization and gold display

## Debug Commands

### Server Console
- Look for lines starting with: 🏗️ (claiming), 💰 (gold generation)

### Browser Console
- Look for lines starting with: 📍 (claims received), 🎨 (first render), 🖼️ (texture load status)
- Check texture paths: Should load from `/custom_assets/custom/`

## Known Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Textures not loading | No color overlay on claimed tiles | Check browser Network tab, verify files exist |
| Claims not showing | Solid color or no color | Textures may not be loading, check console |
| Gold not increasing | Gold stays at 0 | Check server logs for generateResources calls |
| Wrong colors | Claimed tiles wrong color | Check player's C1/C2 colors in playersMeta |

## System Verification

✅ All changes have been made to fix the claims system
✅ Server is running on port 3000
✅ Texture files are in place
✅ Debug logging added for verification
✅ Code is ready for testing

**Next Steps:** Test the game and verify that:
1. Claimed tiles appear with colors
2. Gold increases per turn based on claimed tiles
3. AU movement claims new tiles
4. SU burst claims adjacent tiles
