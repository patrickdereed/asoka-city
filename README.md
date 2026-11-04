# Go-Live: Asoka City

An open-world driving game set in an original, Asoka-themed 8 × 8 km city, delivered as a
Visualforce tab. The whole city is generated from a seed in code, so the bundle is under 400 KB.

**This build: the story.** Go-Live is a 60-mission main story in five acts, with 12 side quests you can do
any time, on top of the free-roam city: driving, traffic, day and night, walking, money, weapons, the shops
and homes you walk into, and the Audit, the city's enforcers, who come after you when you make a scene.

## Missions

Contacts wait on the map (orange circles with their initial for the story, teal for side jobs) and in
the street under a beam of light. Walk up and press E to hear the job. The objective is at the top of the
screen, the route is drawn on the minimap and the full map (M), and whatever matters (the people to stop,
the car to follow, the case to grab) has a marker over it. Fail and a banner says why: press Y to try again.

| Act | Title | Contacts | Where |
|---|---|---|---|
| 1 | Onboarding | Rhea Okonkwo (Asoka's head of operations), Dex Marlow (Merge Conflict Motors) | The Console, Commit Row |
| 2 | Sprint | Lupe Santana (the Standup club), Patch (Kickflip Skate Park), Rhea | Cadence Quarter, Sprint Gardens, the isles |
| 3 | Pipeline | Moss Gantry (the docks), Inspector Ines Vale (the Audit), Dex | The Pipeline |
| 4 | Code Freeze | Ivy Strand (a Brittle engineer who defects), Vale, Patch | Guideline Hills, the motel hideout |
| 5 | Go-Live | Rhea, Ivy, Lupe, Vale | Brittle Systems HQ on Preview Point, the Go-Live Tower |

The plot and every mission are summarised in `docs/story.md`. Side quests: Uptime Cabs (fares), Code Blue
(patients to the clinic), Sprint Series (street races), Same-Day Deploy (courier runs), Bug Bounty (30 hidden
bugs), On-Call (stop Brittle couriers), Export List (cars for Dex), Summit Run (hill climbs), Rooftop Run (on
foot over the roofs), Rollback (lose the Audit against the clock), Night Shift (hold the club) and Postcards
(photograph every landmark).

Steps the story is built from: drive or walk somewhere (some against the clock), talk, pick things up and
deliver them, give someone a ride, get into a particular car, tail a car without being spotted, chase one
down, escort one, race, take out a crew, hold a spot against waves, stand still to plant or hack, photograph
something (aim at it and hold), raise or lose the Audit, and buy a weapon. The vocabulary is fixed in
`docs/missions-contract.md`; `story.js` is pure data in it, run by `missions.js`.

**The people and cars in them** (`actors.js`) live in the crowd and the traffic, so everything you can do to a
passer-by or a car you can do to them. The Legacy Crew and Brittle security stand guard until they see or hear
you, then fight from a sensible range, in bursts, with a beat to react; allies follow you and shoot back;
VIPs walk to your car and climb in. Mission cars drive themselves on the road network (A* over the junctions):
they cruise, drive a route, flee, chase and ram (then back off), and race; crews climb out to fight when the
car stops. Shots from other people can hit you, and your car: it smokes when it's badly hurt and burns out at
the end, and Asoka's fleet service leaves you a replacement down the road.

**The Audit** (`audit.js`): crimes it hears about raise an escalation level, shown as five pips under your
health. Cruisers chase and ram at 1 and 2, and their officers will audit you (a fine) if they catch you on
foot or boxed in; at 3 they're armed, at 4 with SMGs, and at 5 Brittle security joins in. Stay out of sight of
every unit and the level steps down. They have to see you: each unit needs you in range with nothing in
the way (or to be right beside you), and what one sees the rest hear on the radio. A crime is reported where
it happened, so cruisers drive to the scene, not to you; once they lose sight of you they search round where
you were last seen (the blue circle on the minimap). How long that takes to shake varies each time, and goes
faster the further you get from the search. Hurting bystanders draws far more attention than fighting the
Legacy Crew.

**Money:** the story pays about $1.6M (the finale alone is $1,000,000), side quests about $315,000 and the
envelopes and landmarks $64,000: enough to own every weapon, home and outfit. Finished side jobs stay open
at half pay for running costs; the bug hunt and the postcards are one-offs.

**New for the story:** seven buildings (`sites.js`): Brittle Systems HQ, the Audit's precinct, the Legacy Crew's
yard, the Coldline data centre, Merge Conflict Motors, the Standup club and the Lazy Loader Motel. Six vehicles
(`fleet.js`): the Audit cruiser, a Brittle security SUV, a freight box truck, an armoured vault van, a Code Blue
ambulance and an Asoka courier van. Three weapons, sold at Breakpoint Arms once the story unlocks them: Silent
Deploy (a suppressed pistol: no alarm, no escalation), Kill Switch (an EMP launcher that stalls every car near
the shell) and Sticky Note (a remote charge that sticks to cars and walls; fire again to set it off).

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
and the park); the story missions will be the main income. Everything you own is saved in the browser, along with where you are: the game saves every 10 seconds, when you pause, and when you switch away from or close the tab. Each save records whether you're on foot or driving, which car and how damaged it is, the time of day and the way you're facing (in a shop or a home, the street door). Next time, the title screen offers "Play · where you left off" and builds the city round that spot before you start. A mission that was under way starts again from its contact, and the Audit forgets about you.

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
with the same building, lamp and tree colliders as the player, and cars are solid to them too: someone who walks into a parked or stopped car goes round it by its corners (or turns back if it blocks the pavement). They walk round corners on the pavement they are on, and never move faster than they walk. They only dive out of the way of a car they can see coming; anyone looking the other way gets hit. A minor knock puts them down for a couple of seconds before they get up and run; a bad one (or being shot or blown down) knocks them out, and they drop their cash (it floats up over the body) and, if they were carrying, their gun or a box of its ammo. Walk or drive over the drops to take them.

Every district has an age (oldest at the Pipeline docks, then the Cadence Quarter, Sprint Gardens and Scratch Key; newest downtown in the Console and at Preview Point), and each building varies round it. Age drives sparse, procedural wear in the shaders: faded paint, hairline cracks, render fallen away from the brick or blockwork behind (rust through metal cladding), rust and damp running down from fixings, damp and moss at the foot of walls, the odd spray-painted tag, boarded-up or cracked windows and a closed-down shop's shutter; slipped tiles and moss on pitched roofs, patched membrane on flat ones; sunken and broken paving flags, weeds in the joints, stains and chipped kerbs; cracked and re-laid plaza slabs and worn grass; crazed asphalt, potholes that hold rain, more patching and faded road markings. The Console stays close to new. Wear is only drawn within a couple of hundred metres.

Buildings and props are immovable for everything, not just the player: traffic shunted out of its lane, sliding wrecks and mission cars are pushed back out of walls and lose the speed they had going into them, and a car shoved into a wall stops there (the player's car with it). Squeezed between a car and a wall, the player ends up against the wall, never in it. The camera is swept from the player to where it wants to be and stops short of any building or car in the way (kept clear of the 0.8 m near plane), including while it eases back in; backed right up against a wall, the player's body is hidden rather than seen from the inside.

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
turned to face square to its hips and shoulders, not its splayed feet, so it runs straight. The gait (`Person.update` in `people.js`) solves the planted leg's
hip angle every frame so the foot stays where it landed, then measures the real ankle heights on the skeleton and
sets the hips from the planted one, so a planted foot is always on the ground and a swinging one never goes
through it. Walking, each foot is down 60% of the cycle: heel strike, roll, push off the toes. Running is its
own gait, not fast walking: about 170–190 steps a minute (the stride lengthens with speed, scaled to the
avatar's leg length), each foot down only 24–34% of the cycle, landing just ahead of the hips with the knee
already bent and sinking into mid-stance, then pushing off as the heel lifts; the swing knee folds to about
110° (heel up towards the seat) while the thigh drives forward to about 47°, and the lower leg reaches out
just before the landing. Between steps both feet leave the ground and the body rises; the hips bob 7–11 cm.
The arms hold the elbows near 90° and drive more forward than back; the chest leans into the run and turns
against the hips. (The lean and twist go on `Bip01_Spine1`: in these Biped rigs the thighs hang off
`Bip01_Spine`, so turning that swings the legs too.)

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
  - `story.js`, `missions.js`, `actors.js`, `audit.js`: the story as data, the mission engine, mission people and cars, the Audit
  - `sites.js`, `fleet.js`: the mission buildings and the fleet vehicles
- `pages/AsokaCity.page`, `tabs/AsokaCity.tab-meta.xml`, `permissionsets/Asoka_City`: packaging. No Apex; the game reads no Salesforce data.

## Run and test

```sh
node test/serve.mjs          # http://localhost:8788 mirrors the Visualforce page
node test/world.test.js      # world generation: timing, connectivity, overlaps, decks
node test/drive.test.js      # physics and traffic
node test/climb.test.js      # fire escapes up and down, landmark prizes reachable
node test/sites.test.js      # the mission buildings and their anchors
node test/story.test.js      # every place in every mission resolves; routes; dialogue for every pronoun
```

`test/autoplay.js` is a browser smoke test for the story: load it into the local page and run
`autoplay()` to play every mission and side-quest stage by cheating through each step.

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
