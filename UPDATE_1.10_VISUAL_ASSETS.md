# Update 1.10 - Visual Assets Checklist

## Resources (7 Types)
- [ ] Stone icon
- [ ] Coal icon
- [ ] Copper icon
- [ ] Iron icon
- [ ] Gold icon
- [ ] Forest/Wood icon
- [ ] Coins/Money icon

## Structure Units (SU) - Stationary Buildings

### Resource Buildings
- [ ] Generic Resource Building base model/texture
- [ ] Stone Extractor visual
- [ ] Coal Extractor visual
- [ ] Copper Extractor visual
- [ ] Iron Extractor visual
- [ ] Gold Mine visual
- [ ] Lumber Mill visual

### Military Buildings
- [ ] Defense Structure visual
- [ ] Offense Structure visual
- [ ] Catapult (ranged attacker) visual
- [ ] Resource Spot marker (small SU for land claim spread)

## Army Units (AU) - Mobile Units

### Infantry Units
- [ ] Infantry unit model/sprite (2 Action Points)
- [ ] Infantry idle animation
- [ ] Infantry moving animation
- [ ] Infantry attacking animation

### Cavalry Units
- [ ] Cavalry unit model/sprite (4 Action Points)
- [ ] Cavalry idle animation
- [ ] Cavalry moving animation
- [ ] Cavalry attacking animation

### Other AU Types (To be defined)
- [ ] (TBD)

## Map/Terrain Elements
- [ ] Claimed land indicator/overlay
- [ ] Build plot marker (shows where structures can be placed)
- [ ] Resource extraction range indicator (radius visualization)
- [ ] Movement range indicator for AU units
- [ ] Attack range indicator

## UI Icons & Indicators
- [ ] Action Point indicator (visual representation of remaining AP)
- [ ] Command queue icon (showing unit has commands queued)
- [ ] Resource production indicator (per turn output icon)
- [ ] Unit selection highlight
- [ ] Building placement preview (valid/invalid placement)
- [ ] Diplomacy icon/indicator

## Status/HUD Elements
- [ ] Resource counter display (per resource type)
- [ ] Money/Coins counter
- [ ] Unit command queue display
- [ ] Building construction progress bar
- [ ] Land claim counter (total tiles owned)
- [ ] Production status indicator

## Animations Needed
- [ ] Resource production effect
- [ ] Building construction animation
- [ ] Unit movement animation
- [ ] Combat/attack animation
- [ ] Unit death animation
- [ ] Land claim effect (when spreading territory)
- [ ] Resource collection/carrying animation

## Color Coding
- [ ] Per-player color scheme for structures
- [ ] Per-player color scheme for units
- [ ] Neutral/unclaimed territory color
- [ ] Enemy territory highlight color
- [ ] Friendly territory highlight color

---

## Implementation Priority
1. **Phase 1 (Core):** Basic SU & AU models, resource icons, land claim visual
2. **Phase 2 (Gameplay):** Action points indicator, command queue, resource counter
3. **Phase 3 (Polish):** Animations, effects, detailed building models
4. **Phase 4 (Advanced):** Diplomacy UI, advanced range indicators, status displays

---

## Notes
- Keep track of all sprite dimensions and animation frame counts
- Maintain consistent art style across all units/buildings
- Consider performance for large maps (many structures/units)
- Resource carrying state needs visual feedback (unit with items looks different)
