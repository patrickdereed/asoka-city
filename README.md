# Go-Live: Asoka City

An open-world driving game set in an original, Asoka-themed 8 × 8 km city, delivered as a
Visualforce tab. The whole city is generated from a seed in code, so the bundle is under 400 KB.

**This build: free roam with an economy.** The city, driving, traffic, day and night, walking, money,
weapons, and buildings you walk into. The Audit patrols, missions and the 25-hour main story come next.

## Climbing and landmarks

About a quarter of the walk-ups downtown, in Commit Row, Cadence, the docks, Meridian and on the isles
carry a fire escape, and a few have scaffolding; every one climbs to the roof, and roofs are walkable
(fall off one and it hurts). Each district has a landmark to explore, with cash waiting at its highest
point; they appear on the map as stars once found.

| District | Landmark |
|---|---|
| The Console | Go-Live Tower site: nine open floors, a stair core and a tower crane |
| Commit Row | The Merge roof gardens: four roofs joined by bridges, a rooftop bar |
| Cadence Quarter | Neon Lane: a market lane under neon arches, a stage, fire escapes |
| Sprint Gardens | Kickflip Skate Park: half pipe, funbox, quarter pipes, bleachers |
| Instinct Park | Lakeside Lookout: a boardwalk to a pavilion on the lake, a lookout tower |
| Meridian Heights | Meridian Helipad: a hospital tower's fire escape up to the air ambulance |
| Guideline Hills | Summit Observatory: dome, lookout, radio mast and a 30 m Asoka mark |
| The Pipeline | Container Stacks: stairs and catwalks over the containers, a gantry |
| Scratch Key | Point Scratch Lighthouse, climbed by its service stair |
| Sandbox Isles | Sandbox Pier: big wheel, carousel and stalls over the ocean |
| Preview Point | Preview Marina: jetties and yachts you can step aboard |

`structures.js` builds them as primitive parts plus walk surfaces (decks and stairs); `walker.js`
walks on those surfaces and on roofs. `node test/climb.test.js` walks fire escapes up and down.

## Money, shops, weapons and homes

You start with $2,500. Ninety envelopes of unclaimed expenses lie on the pavements (more out in the hills
and the park); the story missions will be the main income. Everything you own is saved in the browser.

| Place | How many | What it's for |
|---|---|---|
| Breakpoint Arms | 30 | 19 weapons in 7 classes, ammunition, body armour |
| Deploy Mart | 24 | Food and first aid; scratch cards |
| Sandbox Threads | 10 | All 31 looks for sale; a mirror to try them on |
| Meridian Clinic | 8 | Healing; you wake at the nearest one if you're knocked out |
| Homes for sale | 16 | $12,000 bungalows to a $150,000 penthouse; the bed saves and passes the night, the wardrobe holds your outfits |

All of them are on the map (M) and the minimap. Walk up to a door and press E. Interiors are built in
`interiors.js`; venues are planned in `map.js` (`planVenues`), so every one is placed deterministically.

The arsenal (`weapons.js`) runs from a bat to a rotary minigun: pistols, SMGs, shotguns, rifles, scoped
rifles, a light machine gun, grenade and rocket launchers, and grenades. Hold a mouse button to look around
(on foot or in the car); let go and the camera swings back behind you. The right button aims over the
shoulder and the left fires only while aiming, Q or the wheel changes weapon, R reloads. Each model is built from a few hundred to two thousand parts in `weapons.js`: slide serrations, sights, ejection ports, toothed rails, slotted handguards, curved magazines, red-dot and holographic sights with glowing reticles, scopes with turrets and lenses, muzzle brakes, checkered wood grips, a fluted revolver cylinder with its chambers, shells in a side saddle, an LMG belt feeding from its box, a six-chamber launcher cylinder and a minigun's clamps and feed chute. Metal parts are glossier than polymer and wood, and the muzzle flash comes from the end of each barrel as built. People
hit hard enough are knocked down (no blood); everyone nearby runs. Cars can be disabled and set alight.

## The city

| District | Where | Character |
|---|---|---|
| The Console | Centre | Downtown towers around Console Plaza and the Asoka tower |
| Commit Row | North and centre | Mid-rise offices and deco blocks |
| Cadence Quarter | South centre | Pastel deco streets with neon cornices |
| Sprint Gardens | South-west | Suburbs, lawns and pools |
| Instinct Park | West | Lake, woods and a loop road |
| Meridian Heights | North-west | The hospital campus |
| Guideline Hills | North | Winding roads, villas, the summit lookout |
| The Pipeline | South | Docks, container yards, cranes |
| Scratch Key, Sandbox Isles, Preview Point | East, over three causeways | Beach islands with deco hotels |

About 358 km of road, 21,500 buildings and 19 bridges. The river runs north to south through the
hills and the docks.

Buildings are boxes dressed in the shader and with a little geometry. The building shader gives towers
and offices shopfronts and lobbies at street level (bays with doors, signs and lit interiors), houses front
doors with porch lights, and every other floor recessed windows: the glass sits back from the wall, so the
reveals, sills and the lintel's shadow move with the view. Walls are painted brick or stone coursing, with
rain streaks under the sills, broad weathering and grime washed down from the parapet. Glass reflects a
skyline of other towers (with their windows lit at night) rather than open sky, each pane a hair off true
so the reflections break up; curtain walls have spandrel panels over each floor slab and aluminium
mullions. Homes have curtains and the odd window air-con unit, pitched roofs have tile courses and flat
roofs membrane strips. Windows that would be cut by a roofline or parapet are left out. `detailBuilding` in `render.js` adds corner piers and pilasters, art deco
crowns, steel fins and a lit crown line on the glass towers, balconies and cornices on houses, chimneys
on pitched roofs, and air-con units, vents, stair housings and masts on flat roofs. Pedestrians collide
with the same building, lamp and tree colliders as the player, walk round corners on the pavement they are on, and never move faster than they walk. They only dive out of the way of a car they can see coming; anyone looking the other way gets hit. A minor knock puts them down for a couple of seconds before they get up and run; a bad one (or being shot or blown down) knocks them out, and they drop their cash and, if they were carrying, their gun or a box of its ammo. Walk or drive over the drops to take them.

Streets: the road shader adds aggregate, cracks, patched trenches, an oil strip down each lane, a
concrete gutter with storm drains, manhole covers and turn arrows before the stop lines. Pavements are
concrete flags with stains, gum and the odd crack, edged with granite kerbstones. Along them: street
trees in grated pits, parking meters beside the kerbside parking, bus shelters with lit adverts on the
avenues and street-name signs on junction corners. Traffic and parked cars spin and steer their wheels. Car light glows sit on each model's own lamps (measured when the kit is baked), and cars rest on the kerb-high paving when they mount a pavement. Cars ride on springs: kerbs and steps compress the suspension (stiff and short on light sports cars, soft and long on vans and pickups) instead of throwing the car; only a sustained rise, a ramp or a crest, carries into a jump.

## People

Pavement crowds and the player's own character are Microsoft Rocketbox avatars (MIT): 20 casual adults
converted with `tools/convert-people.html` and 11 business avatars shared with Deal Room, packed by
`tools/pack-people.mjs` into `AsokaCityPeople*`. Standing poses are Rocketbox motion capture
(`AsokaCityMoves`); walking and jogging are generated in `people.js` on the Bip01 rig. At the start you
create your character: a name, man / woman / non-binary, the pronouns the story uses, and any of the
31 looks. Press F to get out of the car and walk (Shift to jog), F again by the car to drive. F next to
any other car takes it: traffic drivers get dragged out (and the pavement scatters), parked cars get
hot-wired, and the car you were in stays at the kerb until it's shunted or left behind. Getting in and out
goes through the driver's door (the left, as traffic drives on the right): `splitDoor` cuts each model's
front door out of the baked body once, by whole triangles inside the panel behind the front wheel arch, and
it swings on its front hinge while you open it, haul the driver out by the collar (they go down on the road,
get up and run off down the pavement) and climb in. Press ? any time for every control (keyboard, mouse and
gamepad); Esc pauses, with the same list and brightness and contrast sliders, saved per player and applied
in the final pass (`post.js`). Each avatar is
turned to face square to its hips and shoulders, not its splayed feet, so it runs straight.

After dark the ten nearest lights are real: street lamps as point lights and headlights as spots
(`lamps()` in `shaders.js`, picked each frame by `pickLamps` in `main.js`), lighting the street, the
buildings, the cars and the people. The glow sprites only paint the bulbs and, further off, the pools.
Roads sit `ROAD_LIFT` (8 cm) above the terrain, and every car rides on that surface.

Your own features go on top of whichever look you wear, and can be changed any time from the pause menu
(Change your character). `looks.js` bakes them into the player's own copies of the avatar's geometry and
textures, in the rig's bind pose, using the Rocketbox facial bones and skin weights to find each feature:

| Tab | What you can change |
|---|---|
| Look & skin | the look (outfit and face), and 10 skin tones from very light to deep |
| Hair | 30 styles (the look's own, buzz cut, shaved, or any other avatar's hair fitted to your skull); 16 colours, which also dye the brows |
| Face | 7 eye colours; eye size and tilt; nose size, length and width; ear size and how far they stick out |
| Tattoos | 12 original designs (Asoka mark, anchor, swallow, rose, nautical star, heart & banner, dagger, wave, `{ }`, lightning, compass, arm band) on 11 spots, in black or colour; they show on bare skin only, so some outfits cover them |

Avatar textures are decoded twice on the way to the screen (sRGB texture, then the shader's own gamma), so
swatch colours go in through the inverse to look right in game.

## Layout

- `force-app/main/default/staticresources/AsokaCity/`: the game, as ES modules
  - `map.js`: world generator (terrain, coast, roads, districts, buildings, props, colliders)
  - `render.js`, `shaders.js`, `geo.js`, `cars.js`: meshes, the procedural look, streaming
  - `vehicle.js`, `traffic.js`: car physics and ambient traffic
  - `main.js`, `hud.js`, `input.js`, `audio.js`: game loop, HUD, controls, synthesised sound
  - `weapons.js`, `arsenal.js`, `combat.js`: the arsenal, holding and firing, hit tests and explosions
  - `interiors.js`, `shops.js`: the rooms you walk into and what the shops sell
  - `people.js`, `looks.js`: the Rocketbox crowd and your character's hair, skin, eyes, nose, ears and tattoos
- `pages/AsokaCity.page`, `tabs/AsokaCity.tab-meta.xml`, `permissionsets/Asoka_City`: packaging. No Apex; the game reads no Salesforce data.

## Run and test

```sh
node test/serve.mjs          # http://localhost:8788 mirrors the Visualforce page
node test/world.test.js      # world generation: timing, connectivity, overlaps, decks
node test/drive.test.js      # physics and traffic
node test/climb.test.js      # fire escapes up and down, landmark prizes reachable
```

## Deploy

```sh
sf project deploy start --source-dir force-app --target-org meridian10 --test-level NoTestRun
sf org assign permset --name Asoka_City --target-org meridian10
```

## Credits

three.js r170 and its GLTFLoader (MIT, `three.LICENSE.txt`). Space Grotesk and Space Mono (SIL Open Font
License, `fonts/*-OFL.txt`). The 12 car models are Creative Commons Attribution 4.0 models from Sketchfab
(11 by Daniel Zhabotinsky, one by mk2design), converted by Rally Legends' build tool; each
`AsokaCityCars*/CREDITS.txt` names the model, author and source. People and their standing animations are
Microsoft Rocketbox (MIT, `ROCKETBOX-LICENSE.md` in each pack). Everything else is original.
