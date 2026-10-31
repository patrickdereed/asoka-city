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

three.js r170 (MIT, `three.LICENSE.txt`). Space Grotesk and Space Mono (SIL Open Font License,
`fonts/*-OFL.txt`). Everything else is original.
