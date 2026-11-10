# Construction Site Survivors – Game Design

Status: version 1 · Target device: phone (portrait, touch joystick) · Stack: TypeScript, three.js, Vite

> **Asset rule:** The only frames that exist are those in `public/sprites/atlas.json` (characters, enemies, weapons, items, FX) and
> `public/sprites/props.json` (construction-site props, prefixes `v_ o_ b_ s_ m_ t_ d_`). Every mechanic in this document names its sprite.
> Variety comes from code only: tinting (`tint` + `mix`), scaling, rotation, mirroring, alpha, blinking,
> particles from `fx_*`, and procedural shapes from `Atlas.extras` (`white`, `shadow`, `disc`, `bar`, `tape`, `digits`).
> If an idea has no sprite, it is cut or marked **[needs asset]**.

Units: `u` = world unit (1 u ≈ 1 CSS px at zoom 1). The short screen side shows **400 u** (like `viewW` in `src/game/game.ts`). Times are in seconds; `m` = game time in minutes (decimal).

---

## 0. Core idea in one sentence

An endless construction site at night with softly blending zones (dirt, sand, storage, wasteland). Undead workers and animated construction equipment attack. Crates and red barrels can be smashed. You only walk. Your tool attacks automatically. Survive a **15-minute shift** and defeat the **Demolition Grab** at 15:00.

Design pillars:
1. **One thumb is enough.** Movement is the only input. All decisions happen in the level-up menu, and the game is paused while you decide.
2. **Readable on 6 inches.** Few enemy types with clear silhouettes. Danger is tinted red. Rewards are gold or green.
3. **Fewer, but good.** 13 weapons, 13 passives, 7 enemies, 3 bosses, and 8 evolutions. Every element has a clear role.

---

## 1. Core loop and round flow

### 1.1 Loops

```
Seconds:  walk → weapons fire automatically → enemies die → collect XP bolts
Minutes:  level-up → pick 1 of 3 cards → build grows → elite/boss → chest → evolution
Runs:     shift ends (win or death) → coins → Site Yard upgrades / unlocks → new run
```

### 1.2 Round flow

| Phase | Time | Feel | Player goal |
|---|---|---|---|
| Warm-up | 0:00–3:00 | few, slow zombies | collect 2–3 weapons, reach level 8–10 |
| Build-up | 3:00–6:00 | first events, first elite, boss 1 at 5:00 | first chest, settle on a build |
| Pressure | 6:00–10:00 | tanks, kamikaze and ranged enemies, boss 2 at 10:00 | weapons to Lv 8, first evolution |
| Final push | 10:00–15:00 | enemy cap reached, dense events | 2–4 evolutions |
| Quitting time | from 15:00 | final boss, no more normal spawns | defeat the Demolition Grab = **win** |

Rules:
- **Win:** The Demolition Grab is defeated. If you die after 15:00, it still counts as "shift survived" and you get the time bonus, but not the boss bonus.
- **Defeat:** HP = 0. The results screen follows.
- **Pause:** pause button or `visibilitychange` (the app goes to the background).

### 1.3 Schedule per minute

Between two rows, `target` and `rate` are linearly interpolated. The weights apply to normal spawns.

| Minute | target (min. active) | rate (spawns/s) | zombie | cone | zombie2 | barrel | barrier | brute | mixer | Event / Boss |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 15 | 1.5 | 100 | – | – | – | – | – | – | – |
| 1 | 30 | 2.5 | 80 | 20 | – | – | – | – | – | – |
| 2 | 45 | 3.0 | 60 | 15 | 25 | – | – | – | – | 2:00 Cone Swarm |
| 3 | 60 | 3.5 | 50 | 15 | 35 | – | – | – | – | 3:00 Elite (zombie2) |
| 4 | 75 | 4.0 | 40 | 10 | 35 | 15 | – | – | – | 4:00 Barricade Ring |
| 5 | 60 | 3.0 | 40 | 10 | 35 | 15 | – | – | – | **5:00 Boss: The Mixing Machine** |
| 6 | 100 | 5.0 | 30 | 10 | 35 | 15 | – | 10 | – | 6:30 Barrel Rain |
| 7 | 120 | 5.5 | 25 | – | 30 | 15 | 15 | 15 | – | 7:00 Elite (brute), 7:30 Cone Swarm |
| 8 | 140 | 6.0 | 15 | – | 30 | 15 | 15 | 15 | 10 | – |
| 9 | 160 | 7.0 | 10 | – | 30 | 15 | 15 | 15 | 15 | 9:00 Shift Change |
| 10 | 140 | 6.0 | 10 | – | 30 | 15 | 15 | 15 | 15 | **10:00 Boss: Site Manager** |
| 11 | 190 | 8.0 | – | – | 35 | 15 | 15 | 20 | 15 | 11:00 Barricade Ring (with brutes) |
| 12 | 210 | 9.0 | – | – | 30 | 15 | 20 | 20 | 15 | 12:00 2× Elite (mixer) |
| 13 | 240 | 10.0 | – | – | 30 | 15 | 15 | 25 | 15 | 13:00 Cone Swarm, 13:30 3× Elite (Speeder) |
| 14 | 270 | 11.0 | – | – | 25 | 20 | 15 | 25 | 15 | 14:00 Quitting-Time Rush (30 s) |
| 15 | 0 | 0 | – | – | – | – | – | – | – | **15:00 Final boss: Demolition Grab** |

From 15:00: Normal enemies on screen run away (alpha fades to 0 over 1 s), then the final boss appears. The boss only calls its own helpers.

### 1.4 Events (enemy and prop sprites only)

| Event | Time | Sprite | Sequence | Values |
|---|---|---|---|---|
| Cone Swarm | 2:00, 7:30, 13:00 | `e_cone` | A line of cones crosses the screen from a random direction. The cones run straight, without targeting, and vanish after 8 s. Warning: red arrows at the edge, built from `bar` frames with tint `0xFF3A2A` and 1 s of blinking. | count 30 / 40 / 60, speed 110 u/s, HP ×1 |
| Barricade Ring | 4:00, 11:00 | `e_barrier` (+ `e_brute` at 11:00) | A closed ring forms with a 300 u radius around the player. It shrinks at 22 u/s down to 90 u, after which the barriers behave normally. | 24 / 36 barriers, barrier HP ×0.5, at 11:00 every 4th position is an `e_brute` |
| Barrel Rain | 6:30 | `e_barrel` | 20 barrels arrive as a pack from one direction. Chain explosions are intended. | 20 units, spacing 30 u |
| Shift Change | 9:00 | `e_zombie`, `e_zombie2` | A wedge of 60 zombies arrives from one side. | 60 units, speed ×1.3 |
| Quitting-Time Rush | 14:00–14:30 | pool of minute 14 | The spawn rate doubles. The screen edge pulses orange: 4 `bar` frames with `0xFF8A1E` and alpha 0.25↔0.5. | rate ×2 |
| Dump Truck Pass | 8:00, 12:30 | `v_dump_truck` (props) | A dump truck drives across the screen, on the nearest road or on a straight line. Telegraph 1.5 s: `s_trafficlight` blinks at the edge at 3 Hz, the lane shows `tape` (α 0.6). Mirrored by driving direction. | 420 u/s; enemies take 200 damage + knockback 400; player takes 15 damage + knockback 250 |
| Fence Arena | 15:00 | `b_fence`, `b_fence_sign` (props) | A ring of 16 fence segments drops around the player (r 360 u). Each segment falls from above (y −40 → 0, 0.3 s, staggered) with `fx_dust`. Indestructible. Normal enemies stay outside. After the boss dies, the fences fade out. | collision for player and enemies |
| Crane Delivery *(phase 3)* | every 4 min | `o_crane`, `m_pallet` + `m_crate` (props) | A shadow (`shadow`, grows over 2 s) shows the landing point 300–450 u away, an edge arrow shows the direction. A pallet with a crate drops (`fx_dust`, camera shake 3 u). The crate is destructible and contains a chest reward. | 1 delivery |

Banner text for each event: existing `g.banner(...)`.

### 1.5 Bosses

All bosses are immune to knockback and never despawn. A boss HP bar built from `bar` with `0xFF4A2E` appears at the top. If the boss is off screen, an arrow (`bar`, red) points to it. While a boss is alive, the normal spawn rate is ×0.6.

| Time | Name | Sprite | Scale / tint | HP | Speed | Contact | Attacks | Drop |
|---|---|---|---|---|---|---|---|---|
| 5:00 | The Mixing Machine | `e_mixer` | ×2.2, no tint | 2 000 | 30 | 15 | **Concrete Ring:** every 4 s 12 × `proj_rock` radially, 130 u/s, 10 damage. **Cone Call:** every 8 s 6 × `e_cone` | chest, magnet, 25 coins |
| 10:00 | The Site Manager | `e_brute` | ×2.6, `0xFFC83D` mix 0.25 | 7 000 | 42 | 22 | **Charge** every 5 s: 0.8 s telegraph (line made of `tape`, blinking), then 260 u/s for 0.7 s. **Stomp** every 7 s: `fx_ring` shockwave r 140, 15 damage, knockback on the player 120 | chest, magnet, 40 coins |
| 15:00 | The Demolition Grab (in the Fence Arena, phase 2) | `e_claw` | ×2.8, no tint | 22 000 | 36 | 25 | **Grab** every 4 s: red `disc` telegraph circle (r 70, 1.0 s), then a strike with 30 damage + `fx_spikes` + `fx_rubble`. **Barrel Throw** every 9 s: 3 × `e_barrel`. **Suction** every 12 s: pulls the player in for 1.5 s at 40 u/s, `fx_dust` on the player | win, 60 coins |

Boss HP is fixed and not tied to `hpMul`. Only the meta upgrade "Night Shift" (phase 3) scales it.

---

## 2. Characters

The values are aligned with `src/game/characters.ts`. Names and starting weapons stay. Weakness and passive are new. The portrait is the frame `*_walk_0` (the atlas has no dedicated portrait).

```ts
// Base values of all characters
const PLAYER_BASE = { hp: 100, speed: 110, magnet: 70, armor: 0, regen: 0, radius: 12 };
```

| id | Name | Sprite | Starting weapon | HP | Speed | Strength | Weakness | Passive |
|---|---|---|---|---|---|---|---|---|
| `wrench` | Fitter Susi | `p_wrench_walk` / `_attack` | Wrench (orbit) | 90 | 122 | fast, reliable close protection | low HP, hardly any reach | **Maintenance:** cooldown −10 % |
| `hammer` | Foreman Hans | `p_hammer_walk` / `_attack` | Sledgehammer (ground slam) | 140 | 100 | tough, armor +1 | slow, short reach | **Thick Skin:** below 30 % HP damage +25 % (character blinks red, `tint 0xFF4A3A` mix 0.3 every 0.5 s) |
| `driller` | Drillmaster Kalle | `p_driller_walk` / `_attack` | Power Drill (aimed shot) | 100 | 112 | ranged, piercing | weak in melee | **Precision:** all projectiles +1 pierce |
| `engineer` | Engineer Ida | `p_engineer_walk` / `_attack` | Combat Drone | 95 | 112 | fast leveling, flexible builds | low damage at the start (−10 %) | **Planning:** XP +15 % and 4 instead of 3 cards on level-up |

```json
[
  {"id":"wrench",  "hp":90,  "speed":122, "weapon":"wrench", "cd":0.90},
  {"id":"hammer",  "hp":140, "speed":100, "weapon":"hammer", "armor":1, "rageBelow":0.30, "rageDmg":1.25},
  {"id":"driller", "hp":100, "speed":112, "weapon":"drill",  "pierceBonus":1},
  {"id":"engineer","hp":95,  "speed":112, "weapon":"drone",  "dmg":0.90, "xp":1.15, "cards":4}
]
```

Animation: `*_walk` plays at 8 fps while the character moves. Standing still holds frame 0. `*_attack` (3 frames, 12 fps) plays for 0.25 s on every weapon trigger (existing: `player.attackT`). Mirrored by the x walking direction. A death frame is missing. **Code workaround:** The character tips over to 90° rotation, turns gray (`0x777777` mix 0.6), and fades out, with `fx_smoke_big`. *(A real death animation is [needs asset]; it exists in `assets/sprites/characters.png` but not in the atlas.)*

---

## 3. Weapons

General rules:
- **Slots:** 6 weapons, 6 passives.
- **Damage** = base × `mods.dmg` × character bonus. **Cooldown** = base × max(0.5, `mods.cd`). **Radius/size** = base × `mods.area`. **Duration** = base × `mods.duration`. **Amount** = base + `mods.amount`. **Projectile speed** = base × `mods.projSpeed`.
- Hit effect unless stated otherwise: `fx_spark` at 18 u and 22 fps (existing).
- `size` = target height of the sprite in u. `rot` = rotation toward the flight direction, `spin` = own rotation in rad/s.

### 3.1 Overview

| id | Name | Icon | Role | Behavior | Projectile/visual | Hit FX |
|---|---|---|---|---|---|---|
| `drill` | Power Drill | `w_drill` | single target, pierce | aimed shot at the nearest enemy (≤ 330 u) | `proj_drillbit`, size 18, rot | `fx_spark` |
| `nailgun` | Nail Gun | `w_nailgun` | fast volleys | fan in the **walking direction** (last direction) | `proj_nail`, size 12, rot | `fx_spark` (14 u) |
| `saw` | Circular Saw | `w_saw` | boomerang | throw toward the nearest enemy, return to the player, infinite pierce | `w_saw`, size 26, spin 14 | `fx_spark` |
| `hammer` | Sledgehammer | `w_hammer` | close range, knockback | ground-slam circle around the player | zone + `fx_ring` + `fx_dust` | `fx_rubble` |
| `jackhammer` | Jackhammer | `w_jackhammer` | random hits on screen | spikes under random enemies | telegraph `disc` → `fx_spikes` | `fx_rubble` |
| `chainsaw` | Chainsaw | `w_chainsaw` | melee arc | 100° arc in aim direction | `fx_slash`, stretched + rotated | `fx_spark` |
| `wrench` | Wrench | `w_wrench` | orbit | wrenches orbit permanently | `w_wrench`, size 28, spin 1 | `fx_spark` |
| `pipewrench` | Pipe Wrench | `w_pipewrench` | area damage | lobbed in an arc at a random enemy, explodes | `w_pipewrench`, size 24, spin 10, shadow `shadow` | `fx_explosion` |
| `caulkgun` | Caulk Gun | `w_caulkgun` | control (slow) | blob in an arc, sticky puddle | flight `proj_pellet` `0xF2EEDC`; puddle `disc` `0xE8E2C8` α 0.45 + `fx_smoke_small` α 0.3 | – |
| `turret` | Gun Turret | `w_turret` | stationary | places turrets at the player | turret `w_turret` size 30; shot `proj_bullet` | muzzle `fx_spark_4` |
| `drone` | Combat Drone | `w_drone` | companion | drones orbit (60 u) and shoot lasers | `w_drone` size 26, hovers (sin ±3 u); `proj_laser` | `fx_spark` |
| `mixer` | Cement Mixer | `w_mixer` | all-around volley | chunks in all directions | `proj_rock` (2 frames alternating), spin 6 | `fx_dust` (20 u) |
| `barrier` | Barricade | `w_barrier` | aura | damage ring around the player, knockback, slow from Lv 4 | `fx_ring` `0xFF8A1E` α 0.45 scaled to the radius + 6 × `w_barrier` (size 16), rotate slowly (0.4 rad/s) | – |

### 3.2 Values per level (absolute values, not deltas)

**drill – Power Drill** · speed 380 u/s · lifetime 1.0 s · knockback 40 · volley interval 0.08 s
| Lv | dmg | cd | amount | pierce |
|---|---|---|---|---|
| 1 | 10 | 1.00 | 1 | 1 |
| 2 | 13 | 1.00 | 1 | 1 |
| 3 | 13 | 1.00 | 2 | 1 |
| 4 | 13 | 0.90 | 2 | 2 |
| 5 | 17 | 0.90 | 2 | 2 |
| 6 | 17 | 0.85 | 3 | 2 |
| 7 | 21 | 0.80 | 3 | 3 |
| 8 | 25 | 0.75 | 4 | 3 |

**nailgun – Nail Gun** · speed 520 u/s · lifetime 0.7 s · fan 10° per nail · knockback 20
| Lv | dmg | cd | amount | pierce |
|---|---|---|---|---|
| 1 | 6 | 0.55 | 1 | 0 |
| 2 | 6 | 0.55 | 2 | 0 |
| 3 | 8 | 0.55 | 2 | 0 |
| 4 | 8 | 0.50 | 3 | 0 |
| 5 | 8 | 0.50 | 3 | 1 |
| 6 | 10 | 0.45 | 4 | 1 |
| 7 | 10 | 0.45 | 4 | 1 |
| 8 | 13 | 0.40 | 5 | 2 |

**saw – Circular Saw** · flight speed 300 u/s · re-hit per enemy every 0.4 s · knockback 50
| Lv | dmg | cd | amount | range |
|---|---|---|---|---|
| 1 | 12 | 1.8 | 1 | 200 |
| 2 | 16 | 1.8 | 1 | 200 |
| 3 | 16 | 1.8 | 2 | 200 |
| 4 | 20 | 1.8 | 2 | 240 |
| 5 | 20 | 1.5 | 2 | 240 |
| 6 | 20 | 1.5 | 3 | 240 |
| 7 | 26 | 1.5 | 3 | 260 |
| 8 | 32 | 1.3 | 3 | 280 |

**hammer – Sledgehammer** · telegraph 0.15 s · knockback 200 · follow-up slam after 0.35 s · camera shake 3 u
| Lv | dmg | cd | radius | slams |
|---|---|---|---|---|
| 1 | 20 | 2.2 | 70 | 1 |
| 2 | 26 | 2.2 | 78 | 1 |
| 3 | 32 | 2.2 | 86 | 1 |
| 4 | 32 | 2.0 | 86 | 2 |
| 5 | 40 | 2.0 | 94 | 2 |
| 6 | 46 | 1.8 | 94 | 2 |
| 7 | 46 | 1.8 | 104 | 3 |
| 8 | 58 | 1.6 | 110 | 3 |

**jackhammer – Jackhammer** · targets: random enemies on screen · telegraph 0.35 s (`disc` `0xFFC83D` α 0.35)
| Lv | dmg | cd | fields | radius |
|---|---|---|---|---|
| 1 | 14 | 2.0 | 2 | 34 |
| 2 | 18 | 2.0 | 2 | 34 |
| 3 | 18 | 2.0 | 3 | 34 |
| 4 | 22 | 2.0 | 3 | 40 |
| 5 | 22 | 1.8 | 4 | 40 |
| 6 | 28 | 1.8 | 4 | 40 |
| 7 | 28 | 1.8 | 5 | 46 |
| 8 | 36 | 1.6 | 6 | 46 |

**chainsaw – Chainsaw** · arc 100° · target: nearest enemy, otherwise facing direction · 1 hit per swing · knockback 60
| Lv | dmg | cd | range | sides |
|---|---|---|---|---|
| 1 | 12 | 1.1 | 90 | 1 |
| 2 | 15 | 1.1 | 100 | 1 |
| 3 | 18 | 1.1 | 100 | 1 |
| 4 | 18 | 1.1 | 100 | 2 (front + back) |
| 5 | 22 | 1.0 | 115 | 2 |
| 6 | 26 | 1.0 | 115 | 2 |
| 7 | 26 | 0.9 | 130 | 2 |
| 8 | 34 | 0.9 | 140 | 2 |

**wrench – Wrench** · rotation speed 3.4 rad/s · re-hit 0.35 s · knockback 110 · permanently active
| Lv | dmg | count | radius | Note |
|---|---|---|---|---|
| 1 | 8 | 2 | 54 | – |
| 2 | 10 | 2 | 54 | – |
| 3 | 10 | 3 | 58 | – |
| 4 | 13 | 3 | 58 | – |
| 5 | 13 | 4 | 62 | – |
| 6 | 16 | 4 | 66 | – |
| 7 | 16 | 5 | 70 | – |
| 8 | 20 | 5 | 75 | rotation speed +30 % |

**pipewrench – Pipe Wrench** · arc flight 0.6 s (height 60 u, shadow `shadow` on the ground) · camera shake 2 u
| Lv | dmg | cd | amount | blast |
|---|---|---|---|---|
| 1 | 16 | 2.0 | 1 | 40 |
| 2 | 22 | 2.0 | 1 | 46 |
| 3 | 22 | 2.0 | 2 | 46 |
| 4 | 22 | 2.0 | 2 | 54 |
| 5 | 30 | 1.8 | 2 | 54 |
| 6 | 30 | 1.8 | 3 | 54 |
| 7 | 30 | 1.6 | 3 | 60 |
| 8 | 40 | 1.6 | 3 | 66 |

**caulkgun – Caulk Gun** · damage per tick, tick every 0.5 s · slow 40 %
| Lv | tickDmg | cd | puddles | radius | duration |
|---|---|---|---|---|---|
| 1 | 5 | 3.0 | 1 | 40 | 3.0 |
| 2 | 5 | 3.0 | 1 | 48 | 3.0 |
| 3 | 7 | 3.0 | 1 | 48 | 3.0 |
| 4 | 7 | 3.0 | 2 | 48 | 3.0 |
| 5 | 7 | 3.0 | 2 | 48 | 4.0 |
| 6 | 9 | 2.7 | 2 | 48 | 4.0 |
| 7 | 9 | 2.7 | 3 | 48 | 4.0 |
| 8 | 12 | 2.7 | 3 | 56 | 4.5 |

**turret – Gun Turret** · range 260 u · bullet 500 u/s · the oldest turret is replaced when `max` is reached · in the last 2 s the turret blinks (α 1↔0.4)
| Lv | dmg | shots/s | duration | max | cd | pierce |
|---|---|---|---|---|---|---|
| 1 | 6 | 2.0 | 8 | 1 | 10 | 0 |
| 2 | 8 | 2.0 | 8 | 1 | 10 | 0 |
| 3 | 8 | 2.0 | 12 | 1 | 10 | 0 |
| 4 | 8 | 2.0 | 12 | 2 | 10 | 0 |
| 5 | 8 | 3.0 | 12 | 2 | 9 | 0 |
| 6 | 11 | 3.0 | 12 | 2 | 9 | 0 |
| 7 | 11 | 3.0 | 12 | 2 | 9 | 1 |
| 8 | 11 | 3.5 | 14 | 3 | 8 | 1 |

**drone – Combat Drone** · range 300 u · laser 600 u/s
| Lv | dmg | interval | drones | pierce |
|---|---|---|---|---|
| 1 | 8 | 0.80 | 1 | 0 |
| 2 | 11 | 0.80 | 1 | 0 |
| 3 | 11 | 0.65 | 1 | 0 |
| 4 | 11 | 0.65 | 2 | 0 |
| 5 | 14 | 0.65 | 2 | 0 |
| 6 | 14 | 0.65 | 2 | 1 |
| 7 | 14 | 0.55 | 3 | 1 |
| 8 | 18 | 0.55 | 3 | 1 |

**mixer – Cement Mixer** · speed 220 u/s · lifetime 1.2 s · random start angle · knockback 80
| Lv | dmg | cd | rocks | pierce |
|---|---|---|---|---|
| 1 | 14 | 2.4 | 4 | 0 |
| 2 | 14 | 2.4 | 5 | 0 |
| 3 | 18 | 2.4 | 5 | 0 |
| 4 | 18 | 2.4 | 6 | 0 |
| 5 | 18 | 2.4 | 6 | 1 |
| 6 | 18 | 2.2 | 7 | 1 |
| 7 | 23 | 2.2 | 7 | 1 |
| 8 | 23 | 2.0 | 8 | 2 |

**barrier – Barricade (aura)** · hits every enemy in the radius per tick
| Lv | tickDmg | tick | radius | knockback | slow |
|---|---|---|---|---|---|
| 1 | 4 | 0.60 | 52 | 40 | 0 |
| 2 | 4 | 0.60 | 60 | 40 | 0 |
| 3 | 6 | 0.60 | 60 | 50 | 0 |
| 4 | 6 | 0.55 | 68 | 50 | 0.10 |
| 5 | 8 | 0.55 | 68 | 60 | 0.10 |
| 6 | 8 | 0.50 | 76 | 60 | 0.15 |
| 7 | 10 | 0.50 | 84 | 70 | 0.15 |
| 8 | 12 | 0.45 | 90 | 80 | 0.20 |

> Role change for `barrier`: The barrier is now an **aura**, not a second orbit. This sets it clearly apart from the wrench. On a phone, an aura is the most important survival weapon.

---

## 4. Passive items and evolutions

### 4.1 Passives (13 total)

`i_bolt`, `i_gear`, `i_energy`, `i_beacon`, `i_magnet`, and `i_toolbox` are **pickups only**. `i_coffee` is only the Site Yard icon for "Second Shift". None of them is a passive, and no `i_*` lies on the ground as decoration. This keeps every icon unambiguous (see section 6). Max level 5, except `grate` (max 2).

| id | Name | Icon | Effect per level | Max | Mod field |
|---|---|---|---|---|---|
| `helmet` | Hard Hat | `i_helmet` | +20 max HP | 5 | `maxHp += 20` |
| `vest` | Hi-Vis Vest | `i_vest` | +1 armor | 5 | `armor += 1` |
| `boots` | Safety Boots | `i_boots` | +8 % walking speed | 5 | `move += 0.08` |
| `gloves` | Work Gloves | `i_gloves` | +10 % damage | 5 | `dmg += 0.10` |
| `clipboard` | Clipboard | `i_clipboard` | −8 % cooldown | 5 | `cd -= 0.08` (floor 0.5) |
| `blueprint` | Blueprint | `i_blueprint` | +10 % area | 5 | `area += 0.10` |
| `steelbar` | Rebar | `i_steelbar` | +15 % effect duration | 5 | `duration += 0.15` |
| `hook` | Crane Hook | `i_hook` | +30 % pickup radius | 5 | `magnet *= 1 + 0.30·lvl` |
| `cementbag` | Cement Bag | `i_cementbag` | +10 % XP | 5 | `xp += 0.10` |
| `grate` | Steel Grate | `i_grate` | +1 amount (projectiles, fields, puddles, orbit objects; `mixer` +2) | 2 | `amount += 1` |
| `ibeam` | I-Beam | `i_ibeam` | +12 % projectile speed, +10 % knockback | 5 | `projSpeed += 0.12; kb += 0.10` |
| `brick` | Brick | `i_brick` | +0.3 HP/s regeneration | 5 | `regen += 0.3` |
| `cone` | Traffic Cone | `i_cone` | +10 % luck | 5 | `luck += 0.10` |

**Luck** (`luck`, base 1.0) works like this: chance for 3 or 5 items in chests, drop chance of the rare pickups, and at `luck ≥ 1.3` a 25 % chance for a 4th level-up card.

### 4.2 Evolutions (8 total)

Condition: weapon at **Lv 8** + matching passive at **Lv ≥ 1** + a chest from an elite or boss that is opened **from 5:00**. The evolution replaces the weapon in the same slot.
Visual: the same sprites with gold tint `0xFFD54A` mix 0.35 plus ±10 % scaling. In the HUD the icon carries a ★ (text). There are no new images.

| Evolution | Weapon | + Passive | Effect (replaces Lv 8 values) | Visual from existing frames |
|---|---|---|---|---|
| **Wrecking Ball** | `hammer` | `gloves` | dmg 90, radius 140, 3 slams, cd 1.5, enemies stunned 0.5 s | `fx_ring` gold ×1.5, camera shake 6 u |
| **Torque** | `wrench` | `cone` | 7 wrenches, dmg 26, radius 80, 15 % chance for double damage | `w_wrench` gold; double hit: gold number, ×1.4 |
| **Tunnel Borer** | `drill` | `ibeam` | dmg 35, amount 4, pierce ∞, size ×2, cd 0.6 | `proj_drillbit` gold, trail of `fx_dust` |
| **Drone Swarm** | `drone` | `cementbag` | 5 drones, dmg 20, interval 0.45, drones collect XP bolts within 120 u | `w_drone` gold, `proj_laser` gold |
| **Diamond Blade** | `saw` | `blueprint` | amount 4, dmg 40, size ×1.6, re-hit 0.2 s; at the end it circles the player for 1 s | `w_saw` `0xBFF4FF` mix 0.4 (diamond blue) |
| **Earthquake** | `jackhammer` | `boots` | 10 fields, dmg 40, cd 1.4; additionally a spike field every 40 u of walking distance (dmg 20) | `fx_spikes` gold |
| **Expanding Foam** | `caulkgun` | `steelbar` | 3 puddles, grow from r 56 to 90 over 7 s, slow 60 %, tickDmg 15 | `disc` `0xFFF6D0`, `fx_smoke_small` |
| **Exclusion Zone** | `barrier` | `hook` | radius 110, tick 0.35, tickDmg 16, slow 35 %, pulls XP within the radius | `fx_ring` + 8 × `w_barrier`, gold |

Without evolution, deliberately cut (reduced content): `nailgun`, `chainsaw`, `pipewrench`, `turret`, `mixer`. *Optional in phase 3, if testing shows that these weapons are too weak late.*

---

## 5. Enemies

All enemies have **only 1 frame**. Movement comes from code:
- **Waddle:** rotation `sin(t·8)·0.10 rad` and Y bob `|sin(t·8)|·2 u`
- **Squash:** y scale `1 ± 0.06`, in sync
- **Mirroring:** by x walking direction
- Shadow `shadow` under every enemy

Death: white flash (existing `flash`) → 0.15 s shrink to ×0.6 and fade out → `fx_smoke_small` (+ `fx_rubble` for machines).

### 5.1 Normal enemies

| id | Name | Sprite | Height u | Radius | HP | Speed | Contact | XP | KB factor | from | Behavior |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `zombie` | Construction Zombie | `e_zombie` | 40 | 11 | 10 | 40 | 5 | 1 | 1.0 | 0:00 | walks straight at the player |
| `cone` | Cone Crawler | `e_cone` | 34 | 10 | 6 | 70 | 4 | 1 | 1.2 | 1:00 | fast, zigzag ±20° (period 0.8 s); straight during the event |
| `zombie2` | Foreman Zombie | `e_zombie2` | 43 | 12 | 22 | 48 | 7 | 2 | 0.9 | 2:00 | like zombie, tougher |
| `barrel` | Barrel Crawler | `e_barrel` | 42 | 14 | 24 | 45 | – | 3 | 0.8 | 4:00 | **Kamikaze:** Within < 120 u it blinks red for 0.5 s (`0xFF3A2A`, 10 Hz), then rushes at 130 u/s for 1 s. On contact it explodes: r 48, 12 damage to the player. If it dies to weapons, it explodes as well: r 48, **30 damage to enemies only** (chain reaction). `fx_explosion` + `fx_smoke_big` |
| `barrier` | Barrier | `e_barrier` | 42 | 15 | 70 | 26 | 10 | 5 | 0.2 | 7:00 (event 4:00) | tank, pushes other enemies away (double separation force) |
| `brute` | Brute | `e_brute` | 60 | 19 | 160 | 38 | 14 | 12 | 0.3 | 6:00 | **Charge** every 6 s at < 220 u: 0.6 s telegraph (tinted red + `fx_dust` at the feet), then 200 u/s for 0.7 s straight ahead |
| `mixer` | Mixer Spider | `e_mixer` | 60 | 22 | 60 | 32 | 8 | 6 | 0.5 | 8:00 | **Ranged:** keeps 180–220 u distance, shoots `proj_rock` every 3.5 s (140 u/s, 8 damage, lifetime 2.5 s, tint `0xFF8A6A`). Same sprite as boss 1, but small |
| `claw` | Demolition Grab | `e_claw` | – | – | – | – | – | – | – | 15:00 | final boss only |

```json
{
  "zombie":  {"anim":"e_zombie",  "height":40, "r":11, "hp":10,  "speed":40, "dmg":5,  "xp":1,  "kb":1.0, "from":0},
  "cone":    {"anim":"e_cone",    "height":34, "r":10, "hp":6,   "speed":70, "dmg":4,  "xp":1,  "kb":1.2, "from":60},
  "zombie2": {"anim":"e_zombie2", "height":43, "r":12, "hp":22,  "speed":48, "dmg":7,  "xp":2,  "kb":0.9, "from":120},
  "barrel":  {"anim":"e_barrel",  "height":42, "r":14, "hp":24,  "speed":45, "dmg":12, "xp":3,  "kb":0.8, "from":240, "ai":"kamikaze"},
  "barrier": {"anim":"e_barrier", "height":42, "r":15, "hp":70,  "speed":26, "dmg":10, "xp":5,  "kb":0.2, "from":420},
  "brute":   {"anim":"e_brute",   "height":60, "r":19, "hp":160, "speed":38, "dmg":14, "xp":12, "kb":0.3, "from":360, "ai":"charge"},
  "mixer":   {"anim":"e_mixer",   "height":60, "r":22, "hp":60,  "speed":32, "dmg":8,  "xp":6,  "kb":0.5, "from":480, "ai":"ranged"}
}
```

Enemy projectiles: at most 40 at the same time. They are always tinted reddish so that you can tell them from your own.

### 5.2 Variants (tint and scale only)

| Variant | Tint (tint, mix) | Scale | HP | Speed | Damage | XP | KB factor | Recognition | Drop |
|---|---|---|---|---|---|---|---|---|---|
| **Elite** | `0xFFC83D`, 0.45 | ×1.5 | ×12 | ×1.0 | ×1.5 | ×10 | 0 (immune) | golden `fx_ring` on the ground, arrow at the edge | chest (`i_toolbox`) |
| **Tank** | `0x7F9BB5`, 0.40 | ×1.25 | ×3 | ×0.85 | ×1.2 | ×3 | ×0.3 | blue-gray | – |
| **Speeder** | `0xFF4A3A`, 0.40 | ×0.9 | ×0.8 | ×1.5 | ×1.0 | ×2 | ×1.0 | red, `fx_dust` trail every 0.3 s | – |

- Elite: only at fixed times (table 1.3) and as boss escorts.
- Tank/Speeder: chance per normal spawn of `clamp((m − 5) · 0.01, 0, 0.08)` each. They never appear for `cone`/`barrel`.

---

## 6. Pickups and drops

Pickups float (Y bob ±2 u, 1.5 Hz) and have a shadow `shadow`. Rare pickups also have a pulsing `fx_ring` in their color.

| Pickup | Sprite | Tint / size | Effect | Source |
|---|---|---|---|---|
| XP blue | `i_bolt` | `0x5AE0FF`, 12 u | value 1–4 | enemies (value = XP) |
| XP green | `i_bolt` | `0x6AFF6A`, 15 u | value 5–24 | enemies, merging |
| XP red | `i_bolt` | `0xFF5A5A`, 18 u | value 25–99 | elite, merging |
| XP gold | `i_bolt` | `0xFFD54A`, 22 u, `fx_ring` | value ≥ 100 | boss |
| Coin | `i_gear` | `0xFFC83D` mix 0.5, 14 u | +1 coin (elite: stack of 5, 18 u) | 2 % per kill × luck |
| First aid | `m_medkit` (props) | normal, 22 u | +30 HP, `fx_heal` on the player | 0.4 % per kill × luck; elite 100 %; destructible objects (6b) |
| Magnet | `i_magnet` | normal, 22 u, `fx_ring` red | pulls all XP and coins on the map (600 u/s) | 0.2 % per kill × luck; boss 100 %; max. 1 on the map |
| Energy drink *(phase 2)* | `i_energy` | normal, 22 u | 10 s "Overtime": speed +30 %, cooldown −25 %, player blinks yellow (`0xFFE14A` mix 0.25) | 0.15 % per kill × luck |
| Beacon *(phase 2)* | `i_beacon` | normal, 24 u, blinks orange | 5 s "Work Stoppage": all enemies stand still (`0x9AD8FF` mix 0.5), no contact damage | 0.08 % per kill × luck |
| Chest | `i_toolbox` | `0xFFC400` mix 0.2, 30 u, `fx_ring` gold, arrow at the edge | reward (see below) | elite, boss |

**Collecting:** radius `mods.magnet` (base 70 u). Collected objects fly to the player with acceleration 1200 u/s² (max. 700 u/s).

**Merging:** With > 350 XP bolts, the oldest 50 that lie farthest away are merged into **one** bolt. It gets the sum as its value and the matching tint.

**Chest contents:**
```ts
function chestRoll(luck: number) {
  const r = Math.random();
  const count = r < 0.03 * luck ? 5 : r < 0.10 * luck ? 3 : 1;
  // Priority per slot: 1) evolution, if possible (from 5:00)  2) upgrade of an owned weapon/passive (nothing new)
  // If nothing is left: 25 coins + 30 HP
  return count;
}
```
Opening: The chest pops open (scale 1→1.3→0, 0.3 s), with `fx_levelup` + `fx_ring` gold. Then the UI shows the icons one after another (0.25 s each). A tap skips.

---

## 6b. Map, obstacles, and destructible objects (props)

Source: `public/sprites/props.json` (105 frames). All names below appear exactly like this in the file.
Prefixes: `v_` vehicles · `o_` large objects/lamps · `b_` barriers · `s_` signs · `m_` material · `t_` ground tiles · `d_` decoration.

### 6b.1 Ground: procedural base surface + soft patches

The `t_*` tiles (64 × 64) are **not seamless**. Therefore there is **no** tile grid made of `t_*`. The ground consists of 3 layers:

| Layer | Technique | Content |
|---|---|---|
| 1 Base surface | procedural, seamless canvas texture (like today in `src/render/ground.ts`: sand + gravel dots), repeated | identical everywhere |
| 2 Zone tint | small **zone color map**: 1 texel per 256 u (e.g. 8 × 8 texels around the camera), `LinearFilter`, multiplied with the base surface in the ground shader | soft color transitions between zones, without seams |
| 3 Patches | individual `t_*` frames as **soft patches**: Once on load, copy them into the atlas canvas with a radial alpha mask (Canvas 2D: `destination-in` with a radial gradient, α 1 inside, down to 0 from 60 % of the radius). This produces `t_*_soft`. The patches lie individually, never edge to edge | accents per zone |

Rules for patches: 0–2 per 256 u chunk, size 80–140 u (scale 1.25–2.2, nearest), rotation only in 90° steps plus mirroring (pixel art), alpha 0.85. Distance between two patches ≥ 1.2 × patch size.

**Zones** (1024 u, via `hash2(zx, zy, seed)`, seed random per run):

| Zone | Weight | Base surface tint (multiplier) | Patches (`t_*_soft`) | Obstacles (6b.2) | Destructible (6b.3) | Decoration (6b.4) |
|---|---|---|---|---|---|---|
| Dirt field | 40 | `0xC8A27A` (brown) | `t_dirt`, rarely `t_mud_puddle` | `m_pipes`, `m_cable_spool`, `m_tires` | `m_crate`, `m_crate_small` | `d_pebbles`, `d_rocks_dark`, `d_plank` |
| Sand pit | 20 | `0xF0DCA8` (light) | `t_sand` | `m_sand`, `m_gravel`, `m_wheelbarrow_red` | `m_crate` | `d_pebble_small`, `d_stone_block` |
| Material yard | 20 | `0xB4B0A8` (gray) | `t_rubble` | `m_pallet`, `m_bricks`, `m_blocks`, `m_cinder`, `m_planks`, `m_rebar`, `m_cement_sacks`, `m_ibc_tank`, `m_barrel_blue` | `m_crate`, `m_barrel_red`, `m_toolbox_red` | `m_paint_blue`, `m_paint_orange`, `m_jerrycan`, `d_brick_red` |
| Wasteland | 20 | `0xA8C090` (greenish) | `t_grass`, `t_grass_rock` | `d_wall_corner_stone`, `d_wall_corner_stone2`, `d_wall_corner_wood`, `d_rock_big` | `m_crate_small` | `d_grass_tuft`, `d_bush`, `d_flower`, `d_clover`, `d_sprout`, `d_post_mossy` |

**Roads (phase 2):** Every 2048 u a road runs in x and one in y, 128 u wide. It is **procedural**: a band of `white` with `0x4A4A50`, yellow center dashes of `white` with `0xE8C020` (24 × 4 u, spacing 24 u), plus white edge lines. At intersections, 1 patch `t_asphalt_dark_soft` as wear. `t_asphalt_line` is not tiled, because the seam would be visible. At the edge stand `b_jersey_concrete`, `b_jersey_red`, `b_jersey_graffiti`, `b_jersey_broken`, and `b_jersey_hazard` in rows with gaps (≥ 96 u), plus `s_roadwork`, `s_detour`, `s_noentry`, `s_warning`, `s_post_0`, and `s_post_1`. **On the road the player has +10 % speed.**

**Starting area "Site Office":** At the origin, radius 300 u, no obstacles. At the edge: `o_container`, `o_toilet`, `o_generator`, 2 × `o_floodlight`, and `d_sign_caution`.

**Landmarks (phase 2):** Per zone, a 20 % chance for one large object near the zone center: `v_excavator`, `v_mixer_truck`, `v_forklift`, `o_scaffold`, or `o_crane`.

### 6b.2 Obstacles (collision, phase 2)

Rules so that swarms flow and the phone stays smooth:
- Collision only as a **circle or capsule** at the foot (anchor point = foot point, `ay` = bottom edge). No pixel masks.
- **Projectiles fly through all props**, except destructible ones (6b.3).
- Between two obstacles there is always a gap of **≥ 80 u**.
- Enemies push out along the normal and keep sliding tangentially. If an enemy is stuck for longer than 1.0 s, it ignores props for 1.5 s (α 0.6). This means no pathfinding is needed.
- Spawn point inside an obstacle: 3 new attempts, then skip.
- Depth sorting by foot y (like the units). Tall props (height > 90 u) become α 0.5 when the player stands behind them.
- Static props live in their own grid (cell 128 u), separate from the enemy hash.

| Role | Sprite | Height u | Collision | Note |
|---|---|---|---|---|
| Excavator | `v_excavator` | 110 | capsule 90 × 40 | landmark |
| Mixer truck | `v_mixer_truck` | 95 | capsule 100 × 36 | landmark |
| Dump truck | `v_dump_truck` | 80 | capsule 100 × 36 | event only (drives, 1.4) |
| Forklift | `v_forklift` | 70 | circle 26 | landmark |
| Scaffold | `o_scaffold` | 130 | 2 circles r 12 (legs) | player walks through, α 0.5 |
| Container | `o_container` | 70 | capsule 96 × 30 | starting area |
| Portable toilet | `o_toilet` | 80 | circle 16 | starting area, rare in the dirt field |
| Generator | `o_generator` | 50 | circle 18 | starting area |
| Floodlight | `o_floodlight` | 110 | circle 8 | light cone: `disc` `0xFFF2B0`, α 0.12, r 120 |
| Crane | `o_crane` | 220 | circle 26 (base) | landmark; Crane Delivery (phase 3) |
| Jersey barriers | `b_jersey_concrete`, `b_jersey_red`, `b_jersey_graffiti`, `b_jersey_broken`, `b_jersey_hazard` | 40 | capsule 60 × 14 | roadside |
| Construction fences | `b_fence`, `b_fence_warning`, `b_fence_sign`, `b_fence_wire`, `b_fence_wood` | 60 | capsule (width − 10) × 8 | L shapes in the yard; boss arena (`b_fence`, `b_fence_sign`) |
| Sandbags, tank trap | `m_sandbags`, `b_hedgehog` | 45 / 40 | capsule 80 × 18 / circle 18 | wasteland, road |
| Material | `m_sand`, `m_gravel`, `m_pallet`, `m_bricks`, `m_blocks`, `m_cinder`, `m_pipes`, `m_planks`, `m_rebar`, `m_cable_spool`, `m_spool_small`, `m_cement_sacks`, `m_ibc_tank`, `m_tires`, `m_barrel_blue`, `m_wheelbarrow_red`, `m_wheelbarrow_blue`, `m_saw_table` | 30–50 | circle 14–26 | by zone |
| Wall corners | `d_wall_corner_stone`, `d_wall_corner_stone2`, `d_wall_corner_wood`, `d_wall_slab` | 36 | circle 18 | wasteland |

### 6b.3 Destructible objects (MVP)

All weapons hit them, including auras and zones. A hit makes the object flash white briefly and wobble by ±0.1 rad. When it breaks, there is `fx_rubble` + `fx_dust`, and the sprite shrinks over 0.15 s and fades out. **At most 12 active at the same time.** A destroyed object respawns after 120 s at the earliest (remember the chunk ID). In the MVP, destructible objects do not block the player (no collision needed).

| Object | Sprite | Height u | HP | Frequency | Effect on destruction | Drop table |
|---|---|---|---|---|---|---|
| Wooden crate | `m_crate` | 40 | 15 | 1 per 2 chunks (dirt field, sand pit, yard) | – | 45 % XP bolt (value 5) · 25 % coins ×3 · 15 % `m_medkit` · 10 % `i_magnet` · 5 % `i_energy` |
| Small crate | `m_crate_small` | 32 | 8 | wasteland, dirt field | – | like wooden crate, but 60 % XP bolt (value 2) |
| Red barrel | `m_barrel_red` | 40 | 10 | yard: groups of 2–4 | **Explosion** r 70: 40 damage to enemies (fixed, without `hpMul`), 10 damage to the player in the radius. Chain reaction to barrels in the radius after 0.12 s. `fx_explosion` ×1.4, `fx_smoke_big`, camera shake 4 u | none |
| Toolbox | `m_toolbox_red` | 28 | 25 | 1 per yard zone; blinks gold (`0xFFD54A`, 2 Hz) | – | 40 % `i_beacon` · 30 % `i_magnet` · 30 % coins ×10 |

**Game idea:** The red barrels are a tool. Whoever lures enemies to a group of barrels clears large crowds. Barrel **enemies** (`e_barrel`, orange with legs) and barrel **props** (`m_barrel_red`, red with a hazard sign) look clearly different. `m_barrel_blue` does **not** explode (obstacle). This teaches the player: red means danger.

### 6b.4 Decoration (no collision, no function)

At most 2 per chunk. Randomly mirrored, scale 0.9–1.1, shadow `shadow` for objects above 30 u.
- Ground clutter: `d_pebbles`, `d_pebble_small`, `d_rocks_dark`, `d_rock_big`, `d_stone_block`, `d_brick_red`, `d_plank`, `d_can_red`, `d_tin_can`, `d_pipe_elbow`
- Plants: `d_grass_tuft`, `d_bush`, `d_flower`, `d_clover`, `d_sprout`
- Posts and signs: `d_bollard_white`, `d_post_wood`, `d_post_steel`, `d_post_thin`, `d_post_mossy`, `d_ladder`, `d_pole_lamp`, `d_sign_caution`
- Barrier decoration: `b_cone_0`, `b_cone_1`, `b_drum`, `b_drum_1`, `b_barricade`, `b_barrier_yellow`, `b_barrier_lights` (lamps blink: α 1↔0.6, 1 Hz)
- Lamps: `o_lamp_small`, `o_lamp_double`, `o_lamp_box`, each with `disc` `0xFFE08A`, α 0.10, r 60 (additive)
- Small material: `m_paint_blue`, `m_paint_orange`, `m_jerrycan`, `m_barrel_blue_small`, `m_hand_truck`, `m_ammo_box`, `m_box_green`, `m_toolbox_open`

---

## 7. Meta progression (simple)

**Currency:** coins (icon `i_gear` gold). Stored in `localStorage` under the key `bs_meta_v1`.

At the end of a run you get: collected coins + **10 per survived minute** + boss bonuses (25/40/60).
Goal: a full run ≈ 350–400 coins. Maxing everything ≈ 20–25 runs.

### 7.1 Site Yard (permanent upgrades)

Cost for level n = `base × n`.

| id | Name | Icon | Effect per level | Max | base |
|---|---|---|---|---|---|
| `might` | Strength Training | `i_gloves` | +5 % damage | 5 | 100 |
| `maxhp` | Health Check | `i_helmet` | +10 max HP | 3 | 100 |
| `armor` | Safety Gear | `i_vest` | +1 armor | 2 | 200 |
| `regen` | Break Room | `i_brick` | +0.1 HP/s | 3 | 150 |
| `speed` | Good Shoes | `i_boots` | +5 % speed | 2 | 150 |
| `area` | Bigger Plans | `i_blueprint` | +5 % area | 2 | 200 |
| `cd` | Routine | `i_clipboard` | −3 % cooldown | 2 | 300 |
| `magnet` | Long Hook | `i_hook` | +20 % pickup radius | 2 | 100 |
| `growth` | Training Course | `i_cementbag` | +5 % XP | 3 | 150 |
| `luck` | Lucky Cone | `i_cone` | +5 % luck | 3 | 150 |
| `revive` | Second Shift | `i_coffee` | 1× revive with 50 % HP, `fx_heal` + `fx_shield` | 1 | 1500 |

Selling: All upgrades can be reset for free, with a full refund.

### 7.2 Unlocks

| Content | Condition | Hint in the menu |
|---|---|---|
| Susi, Hans | from the start | – |
| Kalle | 1,000 enemies defeated in total | portrait gray (`0x333333` mix 0.8) + text |
| Ida | survived 10:00 once | same |
| Weapon `drone` | Ida unlocked | not in the level-up pool before that |
| Weapon `turret` | reached level 25 once | – |
| Weapon `mixer` | defeated The Mixing Machine | – |
| Weapon `pipewrench` | 500 kills in one run | – |
| Night Shift *(phase 3)* | won once | enemy HP ×1.5, speed ×1.1, coins ×1.5; darker ground (ground tile tint) |

The other 9 weapons and all 13 passives are available from the start.

---

## 8. Balancing formulas

```ts
// --- XP curve: requirement for level L → L+1
function xpFor(L: number): number {
  let n = 5;
  for (let l = 2; l <= L; l++) n += l < 20 ? 10 : l < 40 ? 13 : 16;
  return n;            // L1:5  L5:45  L10:95  L20:198  L30:328  L40:458
}

// --- Enemy scaling (m = game time in minutes, decimal)
const hpMul    = (m: number) => 1 + 0.08 * m + 0.01 * m * m; // 5:1.65  10:2.80  15:4.45
const dmgMul   = (m: number) => 1 + 0.04 * m;                // 15: 1.60
const speedMul = (m: number) => 1 + 0.01 * m;                // 15: 1.15

// --- Damage to the player
const taken = (enemyDmg: number, m: number, armor: number) =>
  Math.max(1, Math.round(enemyDmg * dmgMul(m) - armor));
// Contact damage: at most once per 0.5 s per enemy.

// --- Spawner (per frame)
// target, rate, weights: from table 1.3, linear between the minutes
acc += rate * dt * (alive < 0.5 * target ? 2 : 1) * (bossAlive ? 0.6 : 1);
while (acc >= 1 && alive < cap) { acc--; spawnOne(); }
// spawnOne: distance = 0.5 * hypot(viewW, viewH) + rand(30, 90)
//           angle: 60 % in the half circle of the walking direction (±90°), 40 % all around
// Relocating: enemies farther than spawnR + 300 u → move to the spawn ring in front of the player (HP stays)

// --- Knockback
// v = kb * mods.kb * enemy.kbFactor; v *= Math.exp(-10 * dt)
```

### 8.1 Caps (phone first)

| Resource | Phone | Desktop | Action on overflow |
|---|---|---|---|
| active enemies (`cap`) | **300** | 450 | no spawn |
| own projectiles | 300 | 500 | remove the oldest |
| enemy projectiles | 40 | 60 | do not fire |
| XP bolts | 350 | 500 | merge (section 6) |
| effects (`fx`) | 120 | 250 | skip hit FX |
| damage numbers | 50 | 100 | per enemy only every 0.15 s, otherwise add up |
| visible props (without ground) | 60 | 120 | drop decoration first |
| active destructible objects | 12 | 20 | no new object |
| ground patches (`t_*_soft`) | 30 | 60 | drop patches first; base surface stays 1 mesh |

**Adaptive:** FPS average over 3 s. Below 50 fps: `cap` −15 % (minimum 150) and half the hit FX. Above 58 fps for 10 s: `cap` +10 % (up to the maximum). `devicePixelRatio` at most 2.

### 8.2 Reference values for playtests

These values come from the simulation with schedule 1.3, 85 % kill rate, and no XP bonuses. If a test deviates by more than ±3 levels, adjust `rate` first, then `xpFor`.

| Minute | 1 | 2 | 3 | 5 | 7 | 10 | 12 | 15 |
|---|---|---|---|---|---|---|---|---|
| expected level | 4 | 7 | 9 | 14 | 19 | 32 | 39 | ~52 |

Tuning knobs, by priority: `rate` (table) → `hpMul` → `xpFor` steps → weapon `dmg`.

---

## 9. Juice, feedback, and mobile UX

### 9.1 Juice (code + existing `fx_*` only)

| Moment | Feedback | Sprite / technique |
|---|---|---|
| Hit | white flash 0.08 s, knockback, damage number (`digits`) | `flash`, `fx_spark` |
| Kill | shrink + fade out 0.15 s | `fx_smoke_small`; machines additionally `fx_rubble` |
| Explosion | camera shake 2–6 u for 0.15 s | `fx_explosion`, `fx_smoke_big` |
| Player hit | player red (`0xFF3A2A` mix 0.6, 0.12 s), red screen edge (`bar`, α 0.35 → 0) | `bar` |
| low HP (< 30 %) | red edge pulses (1 Hz) | `bar` |
| Collecting XP | bolt flies to the player with suction; the XP bar flashes white briefly | `i_bolt` |
| Level-up | 0.3 s slow motion → pause → cards; arrows rise | `fx_levelup`, `fx_ring` gold |
| Chest | pops open, golden ring, icons one after another | `i_toolbox`, `fx_levelup`, `fx_ring` |
| Healing | green crosses on the player | `fx_heal` |
| Object hit / destroyed | white flash, wobble / splinters and dust | `fx_rubble`, `fx_dust` |
| Red barrel explodes | chain reaction with 0.12 s spacing, camera shake 4 u | `fx_explosion`, `fx_smoke_big` |
| Dump truck arrives | traffic light blinks at the edge, barrier tape over the lane | `s_trafficlight`, `tape` |
| Revive, work stoppage | dome on the player | `fx_shield` |
| Boss appears | banner, camera shake 4 u, boss HP bar slides in | `bar` |
| Boss hit ≥ 50 damage | hit stop 40 ms (at most once per 0.3 s) | – |

**Sound (phase 2):** There are no audio files. Short tones are produced by WebAudio synthesis (noise + envelope): hit, kill, pickup (pitch rises on quick succession), level-up, explosion. Volume slider in the settings.
**Haptics:** `navigator.vibrate` (10 ms when the player is hit, 30 ms on level-up), can be turned off. It does not exist on iOS, so there is no error.

### 9.2 Mobile UX

- **Joystick:** appears where the thumb lands (existing, radius 56 px). Dead zone 8 px. Joystick semi-transparent, knob opaque.
- **HUD at the top:** XP bar across the full width (6 px), below it time (center, large), level (left), kills and coins (right). Pause button at the top right with **at least 44 × 44 px**.
- **HP bar** directly under the player (`bar`, 32 × 4 u). That is where the player looks anyway.
- **Safe area:** `env(safe-area-inset-*)` for the notch and the home bar.
- **Level-up cards:** stacked in portrait across the full width, each at least 72 px tall: icon, name, "NEW" or "Lv x → y", one line of text. **0.4 s input lock**, so that a tap from the joystick does not select a card.
- **Legibility:** font ≥ 14 px. Danger is red, reward is gold or green, own projectiles are warm/neutral.
- **Edge arrows** for boss, elite, chest, and magnet (`bar` triangle in the object's color).
- **Pause:** automatic on `visibilitychange` and `blur`. No pinch zoom, no context menu, `touch-action: none` on the canvas.
- **Portrait and landscape:** The short side always shows 400 u. So landscape shows more area to the side.
- **Saving:** meta state after every run. A run in progress is not saved (deliberately simple).

---

## 10. Asset usage

Every frame from `atlas.json` and where it appears. After `→` comes the reuse with tint or scale.

### 10.1 Characters and enemies

| Sprite | Usage | Reuse (tint / scale) |
|---|---|---|
| `p_driller_walk`, `_attack` | Kalle | portrait = `walk_0`; locked → `0x333333` mix 0.8; death → gray + rotation 90° |
| `p_wrench_walk`, `_attack` | Susi | as above |
| `p_hammer_walk`, `_attack` | Hans | as above; rage → blinking red `0xFF4A3A` |
| `p_engineer_walk`, `_attack` | Ida | as above |
| `e_zombie` | Construction Zombie | Elite / Tank / Speeder (5.2); Shift Change event |
| `e_zombie2` | Foreman Zombie | variants; elite at 3:00 |
| `e_cone` | Cone Crawler | Cone Swarm; boss 1 helpers |
| `e_barrel` | Barrel Crawler | blinks red before the rush; Barrel Rain; boss 3 helpers |
| `e_barrier` | Barrier | Barricade Ring event (HP ×0.5) |
| `e_brute` | Brute | **Boss 2 "Site Manager"**: ×2.6, `0xFFC83D` mix 0.25; elite at 7:00 |
| `e_mixer` | Mixer Spider (small, ranged) | **Boss 1 "The Mixing Machine"**: ×2.2; elite at 12:00 |
| `e_claw` | **Final boss "Demolition Grab"** ×2.8 | – |

### 10.2 Weapons, projectiles, and passives

| Sprite | Usage | Reuse |
|---|---|---|
| `w_drill` … `w_barrier` (13) | icons in level-up, HUD, chest | evolution: same icon, gold `0xFFD54A` mix 0.35 + ★ |
| `w_saw` | circular saw projectile (spin 14) | Diamond Blade `0xBFF4FF` |
| `w_wrench` | orbit object | Torque gold |
| `w_pipewrench` | thrown object (spin 10) | – |
| `w_turret` | placed turret | blinks before it expires |
| `w_drone` | drone next to the player | Drone Swarm gold |
| `w_barrier` | 6–8 small barriers of the aura (16 u) | Exclusion Zone gold |
| `proj_drillbit` | Power Drill | Tunnel Borer ×2, gold |
| `proj_nail` | Nail Gun | – |
| `proj_bullet` | Gun Turret | – |
| `proj_laser` | Combat Drone | gold on evolution |
| `proj_pellet` | Caulk Gun in flight | `0xF2EEDC` |
| `proj_rock` | Cement Mixer (weapon) | **enemy:** Mixer Spider and boss 1, `0xFF8A6A` |
| `proj_hammer`, `proj_spikes`, `proj_saw_slash`, `proj_wrench_slash`, `proj_shot`, `proj_beam`, `proj_ember`, `proj_arrow`, `proj_spark` | **free**: reserve for phase 3 (e.g. evolutions of the 5 weapons without an evolution) | – |
| `i_helmet`, `i_vest`, `i_boots`, `i_gloves`, `i_clipboard`, `i_blueprint`, `i_steelbar`, `i_hook`, `i_cementbag`, `i_grate`, `i_ibeam`, `i_brick`, `i_cone` | 13 passives | same icons in the Site Yard (7.1) |

### 10.3 Pickups and effects

| Sprite | Usage | Reuse |
|---|---|---|
| `i_bolt` | **XP bolt** | 4 tiers: `0x5AE0FF` 12 u, `0x6AFF6A` 15 u, `0xFF5A5A` 18 u, `0xFFD54A` 22 u |
| `i_gear` | **Coin** | `0xFFC83D` mix 0.5; stack of 5 18 u; coin icon in the HUD and the Site Yard |
| `i_coffee` | only the Site Yard icon "Second Shift" | – (healing now comes from `m_medkit`) |
| `i_magnet` | Magnet | – |
| `i_energy` | Energy drink (phase 2) | – |
| `i_beacon` | Beacon / work stoppage (phase 2) | – |
| `i_toolbox` | Chest | `0xFFC400` mix 0.2, 30 u |
| `fx_spark` | standard hit | turret muzzle flash (`fx_spark_4`) |
| `fx_slash` | chainsaw arc (stretched + rotated) | – |
| `fx_explosion` | Pipe Wrench, barrel, bosses | gold on evolution |
| `fx_smoke_small` | kill cloud, puddle haze | α 0.3 for puddles |
| `fx_smoke_big` | large explosions, player death | – |
| `fx_dust` | hammer, brute telegraph, speeder trail, mixer hit, suction | – |
| `fx_rubble` | kill on machines, spikes, hammer | – |
| `fx_spikes` | Jackhammer, grabber strike | Earthquake gold |
| `fx_ring` | hammer, aura, magnet, elite marker, chest, stomp | aura `0xFF8A1E`, elite gold, magnet red |
| `fx_heal` | healing | – |
| `fx_shield` | revive, work stoppage | – |
| `fx_levelup` | level-up, chest | – |

### 10.4 Props (`props.json`)

| Prefix | Sprite(s) | Usage | Reuse (tint / scale / technique) |
|---|---|---|---|
| `t_` | `t_dirt`, `t_sand`, `t_rubble`, `t_grass`, `t_grass_rock`, `t_mud_puddle`, `t_asphalt_dark` | **soft patches only** on the procedural base surface (6b.1) | runtime copy with radial alpha mask → `t_*_soft`; scale 1.25–2.2; 90° rotation + mirroring; Night Shift: `0x6A7A9A` mix 0.35 |
| `t_` | `t_asphalt_line` | not used (seam visible) | roads are procedural |
| `v_` | `v_excavator`, `v_mixer_truck`, `v_forklift` | landmarks with collision | mirroring |
| `v_` | `v_dump_truck` | Dump Truck Pass (event) | mirrored by driving direction, Y jitter ±1 u |
| `o_` | `o_container`, `o_toilet`, `o_generator`, `o_floodlight` | starting area, obstacles | floodlight + `disc` (additive) as light cone |
| `o_` | `o_scaffold`, `o_crane` | landmarks; Crane Delivery (phase 3) | α 0.5 when occluding |
| `o_` | `o_lamp_small`, `o_lamp_double`, `o_lamp_box` | decoration with a light spot | `disc` `0xFFE08A` α 0.10 |
| `b_` | `b_jersey_concrete`, `b_jersey_red`, `b_jersey_graffiti`, `b_jersey_broken`, `b_jersey_hazard` | roadside, collision | mirroring |
| `b_` | `b_fence`, `b_fence_sign` | **Fence Arena** (15:00) | fall animation via y offset, `fx_dust` |
| `b_` | `b_fence_warning`, `b_fence_wire`, `b_fence_wood`, `b_hedgehog` | obstacles (L walls, wasteland) | mirroring |
| `b_` | `b_cone_0`, `b_cone_1`, `b_drum`, `b_drum_1`, `b_barricade`, `b_barrier_yellow`, `b_barrier_lights` | decoration without collision | `b_barrier_lights` blinks; `b_cone_0/1` alternating |
| `s_` | `s_trafficlight` | telegraph of the Dump Truck Pass (blinks at the screen edge) | scale ×0.6, blinking 3 Hz |
| `s_` | `s_roadwork`, `s_noentry`, `s_detour`, `s_warning`, `s_post_0`, `s_post_1` | roadside decoration | mirroring |
| `m_` | `m_medkit` | **healing pickup** +30 HP | 22 u, Y bob, `fx_heal` |
| `m_` | `m_crate`, `m_crate_small`, `m_barrel_red`, `m_toolbox_red` | **destructible** with drops / explosion (6b.3) | white flash; toolbox blinks gold |
| `m_` | `m_pallet` | obstacle; Crane Delivery (phase 3) | – |
| `m_` | `m_sand`, `m_gravel`, `m_bricks`, `m_blocks`, `m_cinder`, `m_pipes`, `m_planks`, `m_rebar`, `m_cable_spool`, `m_spool_small`, `m_cement_sacks`, `m_ibc_tank`, `m_tires`, `m_barrel_blue`, `m_sandbags`, `m_wheelbarrow_red`, `m_wheelbarrow_blue`, `m_saw_table` | obstacles of the zones | scale 0.9–1.1, mirroring |
| `m_` | `m_paint_blue`, `m_paint_orange`, `m_jerrycan`, `m_barrel_blue_small`, `m_hand_truck`, `m_ammo_box`, `m_box_green`, `m_toolbox_open` | decoration | – |
| `d_` | all 31 `d_*` | decoration (6b.4); wall corners `d_wall_*` as obstacles in the wasteland | mirroring, scale 0.9–1.1 |

### 10.5 Procedural shapes (`Atlas.extras`)

| Extra | Usage |
|---|---|
| `shadow` | shadow under all units, pickups, and thrown objects |
| `disc` | telegraph circles (red = enemy, gold = own weapon), puddles |
| `bar` | HP, XP, and boss bars, edge arrows, red screen edge, rush edge |
| `tape` | telegraph line for the charge (barrier-tape look) |
| `digits` | damage numbers, timers in the world |
| `white` | flash, dimming on pause |

### 10.6 Cut or [needs asset]

| Idea | Status | Reason |
|---|---|---|
| Destructible props | **implemented** with `props.json` (6b.3) | – |
| Dedicated XP crystals, heart, coin, clover, hourglass, bomb | **[needs asset]** | only in `assets/sprites/pickups.png`; substitute see 10.3 (healing is now `m_medkit`) |
| Death and hit animation of the characters, portraits | **[needs asset]** | only in `assets/sprites/characters.png`; substitute via code (section 2) |
| Walk animation of the enemies | **[needs asset]** | 1 frame per enemy; substitute: waddle via code |
| Second setting (different map) | cut | zones on **one** map are enough; Night Shift only via tint |
| Ground as a grid of `t_*` tiles | cut | tiles are not seamless; substitute: base surface + zone color map + soft patches (6b.1) |
| Driving excavators/forklifts as enemies | cut | 1 frame, no wheel animation; only the dump truck drives (briefly, fast) |
| Jerrycans as fire area, paint buckets as slime | cut | fewer systems; only red barrels explode |
| Evolutions for `nailgun`, `chainsaw`, `pipewrench`, `turret`, `mixer` | cut (optional phase 3) | less content, better tested |
| Hourglass (time stop) | replaced by the beacon `i_beacon` | – |
| Bomb (clear the screen) | cut | no sprite, overlaps with the barrel |

> Note: If `assets/sprites/pickups.png` and `props.png` are added to the atlas later (`tools/extract-atlas.mjs`), the marked ideas can be retrofitted. The design works without them.

---

## 11. Implementation list (prioritized)

### MVP – playable 15-minute shift
1. Take over the values from sections 3, 4.1, and 5.1 as data (tables → `weapons.ts`, `passives.ts`, `enemies.ts`).
2. Make pickups unambiguous: XP only `i_bolt` (4 tints), healing `m_medkit`, chest `i_toolbox`, magnet `i_magnet`. Replace the passives `gear`, `bolt`, and `coffee` with `grate`, `ibeam`, `brick`, and `cone`. No `i_*` decoration on the ground.
2a. Ground: procedural base surface + zone color map + soft `t_*_soft` patches (6b.1, without roads). Destructible `m_crate` and `m_barrel_red` with drops and chain explosion (6b.3). Decoration from `d_*`, `b_cone_0/1`, and `b_drum` (6b.4) replaces today's `i_*` decoration in `ground.ts`.
3. Spawner per table 1.3 (`target`, `rate`, weights), `hpMul` and `dmgMul` from section 8, `cap` 300 on the phone.
4. `xpFor` per section 8.
5. Enemy AI: kamikaze (`barrel`), charge (`brute`), ranged (`mixer` small).
6. Bosses at 5:00 (The Mixing Machine) and 15:00 (Demolition Grab, = win). Elite variant (gold) with chest.
7. Rebuild `barrier` as an aura. `nailgun` fires in the walking direction.
8. Core juice: flash, knockback, damage numbers, kill FX, waddle, shadows, level-up slow motion, input lock 0.4 s.
9. Results screen (time, level, kills).

### Phase 2 – depth and replay value
1. 8 evolutions and chest logic with luck.
2. Boss at 10:00 (Site Manager), Tank and Speeder variants.
2a. Obstacles with collision (6b.2), procedural roads with a speed bonus, starting area, landmarks.
2b. Dump Truck Pass and Fence Arena for the final boss.
3. Events: Cone Swarm, Barricade Ring, Barrel Rain, Shift Change, Quitting-Time Rush.
4. Coins, Site Yard, unlocks, `localStorage`.
5. Energy drink and beacon pickups. Edge arrows.
6. WebAudio tones, haptics, settings (sound, vibration, damage numbers on/off).
7. Adaptive caps (8.1).

### Phase 3 – polish
1. Night Shift (hard mode), endless mode after 15:00 (`target = min(cap, 270 + 10·(m−15))`).
2. Reroll, skip, banish as Site Yard upgrades.
3. "Site Log": collection of all found weapons, passives, enemies, and evolutions.
4. Crane Delivery (`o_crane`, `m_pallet`), statistics screen after the run (damage per weapon).
5. PWA/offline.
6. Only with new atlas frames: real pickups, death animations (10.6).
