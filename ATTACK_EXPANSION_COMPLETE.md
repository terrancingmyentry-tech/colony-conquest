# Attack Positioning Expansion - Complete

## Changes Made

### Client-Side (game-client.js)

1. **New Function: `getSwordsmanAttackPositions(x, y)`**
   - Added new function for swordsman/shieldman attack positioning
   - Allows attacks in 4 cardinal directions (up, down, left, right)
   - Filter: `!gridCell || (gridCell.pid !== playerPid)`
   - This allows attacking:
     - Empty tiles
     - Enemy units/AUs
     - Enemy buildings
   - Blocks:
     - Own units/AUs
     - Own buildings

2. **Updated Attack Button Logic**
   - Swordsman/Shieldman: Now uses `getSwordsmanAttackPositions()` instead of `getSpawnPositions()`
   - Archer: Uses `getArcherAttackPositions()` (range 1 all directions + range 2 cardinal)
   - Horseman: Uses `getHorsemenAttackPositions()` (all 8 adjacent directions)

### Server-Side (server.js) - No Changes Needed

The `processQueuedAUActions()` function already correctly handles:
- Attacks on enemy units/AUs: 1 damage dealt
- Attacks on enemy buildings: 1 HP damage dealt  
- Attacks on empty tiles: No effect (enables trap mechanic)
- Attacks on own tiles: No effect (owner check prevents damage)

## Trap Mechanic Enabled

AUs can now queue attacks on any tile (empty, enemy building, enemy unit) to set up "traps":

**Example:**
1. Swordsman at (5, 5) queues attack on empty tile (6, 5)
2. Attack executes in 2 turns
3. If enemy unit moves to (6, 5) before execution, they take 1 damage when the attack triggers
4. If no enemy is at (6, 5), the attack still executes but deals no damage

## Attack Range Summary

| Unit Type | Move Range | Attack Range | Attack Mode |
|-----------|-----------|--------------|-------------|
| Swordsman | 1 cardinal | 1 cardinal | Any tile except own units |
| Shieldman | 1 cardinal | 1 cardinal | Any tile except own units |
| Archer | 1 cardinal | Range 1 (8 dir) + Range 2 (4 cardinal) | Any tile except own units |
| Horseman | 1-8 adjacent | 1-8 adjacent (all 8 directions) | Any tile except own units |

## Damage Values

- All AU attacks (queued): 1 damage to units/AUs, 1 HP to buildings
- AU immediate adjacent attack: 1 damage to adjacent enemy units/AUs only
- Towers: 2 damage to units/AUs, 1 damage to buildings

## Testing Notes

- Attack positioning now shows valid tiles for traps
- Empty tiles are highlighted when selecting attack targets
- Queued attacks execute correctly on any terrain
- Trap mechanic allows strategic positioning for future damage
