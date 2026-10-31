# Go-Live: Asoka City

An open-world driving game set in an original, Asoka-themed 8 × 8 km city, delivered as a
Visualforce tab. The whole city is generated from a seed in code, so the bundle is under 400 KB.

**Stage 1 (this build): free roam.** The city, driving, traffic, day and night, minimap and map.
Walking, the Audit patrols, missions and the 25-hour main story come in later stages.

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

## People

Pavement crowds and the player's own character are Microsoft Rocketbox avatars (MIT): 20 casual adults
converted with `tools/convert-people.html` and 11 business avatars shared with Deal Room, packed by
`tools/pack-people.mjs` into `AsokaCityPeople*`. Standing poses are Rocketbox motion capture
(`AsokaCityMoves`); walking and jogging are generated in `people.js` on the Bip01 rig. At the start you
create your character: a name, man / woman / non-binary, the pronouns the story uses, and any of the
31 looks. Press F to get out of the car and walk (Shift to jog), F again by the car to drive.

## Layout

- `force-app/main/default/staticresources/AsokaCity/`: the game, as ES modules
  - `map.js`: world generator (terrain, coast, roads, districts, buildings, props, colliders)
  - `render.js`, `shaders.js`, `geo.js`, `cars.js`: meshes, the procedural look, streaming
  - `vehicle.js`, `traffic.js`: car physics and ambient traffic
  - `main.js`, `hud.js`, `input.js`, `audio.js`: game loop, HUD, controls, synthesised sound
- `pages/AsokaCity.page`, `tabs/AsokaCity.tab-meta.xml`, `permissionsets/Asoka_City`: packaging. No Apex; the game reads no Salesforce data.

## Run and test

```sh
node test/serve.mjs          # http://localhost:8788 mirrors the Visualforce page
node test/world.test.js      # world generation: timing, connectivity, overlaps, decks
node test/drive.test.js      # physics and traffic
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
