# Missions: the contract between the story, the engine and the assets

The story (`story.js`) is pure data. The engine (`missions.js`, `actors.js`, `audit.js`) runs it. New
buildings (`sites.js`, planned in `map.js`), vehicles (`fleet.js`) and weapons (`weapons.js`) supply what
the story names. Everything below is the full vocabulary: the story may only use what is listed here.

## Story file

```js
export const CONTACTS = { rhea: { name, look, at, blurb }, ... };
export const ACTS = [{ n: 1, title: "Onboarding", blurb }, ...];   // 5 acts
export const MAIN = [mission, ...];   // 60, in story order
export const SIDE = [quest, ...];     // 12
```

### Contacts

| id | Name | Role | Look (Rocketbox id) | Where (place) |
|---|---|---|---|---|
| rhea | Rhea Okonkwo | Asoka's head of operations; hires you | Business_Female_01 | `tower` |
| dex | Dex Marlow | Runs Merge Conflict Motors, a garage and chop shop | Male_Adult_07 | `site:garage.door` |
| lupe | Lupe Santana | Owns the Standup club in the Cadence Quarter | Female_Adult_05 | `site:club.door` |
| patch | Patch | Teenage hacker at Kickflip Skate Park | Male_Adult_02 | `landmark:gardens` |
| gantry | Moss Gantry | Dock foreman at the Pipeline | Male_Adult_09 | `landmark:docks` |
| vale | Inspector Ines Vale | The Audit (the city's enforcers); straight, but stretched | Business_Female_04 | `site:audit_hq.gate` |
| ivy | Ivy Strand | Brittle Systems engineer who defects in Act 4 | Female_Adult_08 | `site:motel.room` |
| harlan | Harlan Brittle | CEO of Brittle Systems, the antagonist (never gives missions) | Business_Male_05 | `site:brittle_hq.lobby` |

Speakers in dialogue are contact ids, `"you"` (the player, shown with their chosen name), `"asoka"` (the
Asoka AI, heard over the phone), or any other short string, shown as written ("Guard", "Legacy driver").
Lines may use `{name}`, and the player's pronouns `{they}`, `{them}`, `{their}`, `{theyre}` (lower case;
the engine capitalises at the start of a line). Keep lines under about 140 characters; 2–8 lines per
briefing.

### A mission

```js
{
  id: "m07", act: 1, title: "Cold Start", contact: "dex",
  after: ["m06"],          // optional: missions that must be done first (default: the previous main mission)
  reward: 2500,            // cash on passing
  setHour: 22,             // optional: the clock jumps here when the mission starts (night jobs)
  brief: [["dex", "..."], ["you", "..."]],   // spoken when you walk into the contact's marker
  steps: [step, ...],
  outro: [["dex", "..."]], // optional, after passing
  keep: ["vip"],           // optional: tags that must not be lost (VIP knocked out, car destroyed) or it fails
  unlock: ["silentdeploy"],// optional: weapons that appear in Breakpoint Arms after this mission
  heat: false,             // optional: false = the Audit ignores crimes during this mission
}
```

Several main missions may be open at once: a mission opens when everything in `after` is done. Each act
should let the player choose between two or three contacts for most of its length, then close with a
finale that needs them all.

### Places

A place is a string (or a `{ near, d }` object) the engine resolves to a point on the ground:

| Place | Means |
|---|---|
| `tower`, `plaza`, `spawn` | The Asoka tower's front door, Console Plaza's centre, the start point |
| `contact:<id>` | Where that contact stands |
| `site:<id>` / `site:<id>.<anchor>` | A mission building, or a named point on it (table below) |
| `landmark:<district>` / `landmark:<district>.top` | A district landmark's centre, or its highest point (the cash prize spot) |
| `venue:<kind>` / `venue:<kind>@<district>` | Nearest shop of a kind (`arms`, `mart`, `threads`, `clinic`), or the first in a district |
| `road:<district>/<n>` | Road point number `n` (any integer ≥ 0) in a district, on a main road; different n, different spot |
| `{ near: <place>, d: 300 }` | A main-road point about `d` metres from that place (`near: "player"` = where the player is) |

Districts: `console` (The Console, downtown centre), `uptown` (Commit Row, north), `cadence` (Cadence Quarter,
south centre, pastel deco and neon), `gardens` (Sprint Gardens, south-west suburbs), `park` (Instinct Park,
west, lake), `meridian` (Meridian Heights, north-west, hospital), `hills` (Guideline Hills, far north,
winding roads, observatory), `docks` (The Pipeline, south, containers), `scratch` (Scratch Key, north-east
island, lighthouse), `sandbox` (Sandbox Isles, east island, pier), `preview` (Preview Point, south-east
island, marina). Three causeways cross east to the islands.

### Sites (new buildings) and their anchors

| Site | District | What it is | Anchors |
|---|---|---|---|
| `brittle_hq` | preview | Brittle Systems HQ: a 110 m glass tower over a walled plaza, a car ramp down to a garage, roof helipad reached by an outside stair | `gate`, `plaza`, `lobby`, `garage`, `roof` |
| `audit_hq` | meridian | The Audit's precinct: a blocky three-storey building, a fenced yard of cruisers (the impound) | `gate`, `yard`, `roof`, `cells` |
| `legacy_yard` | docks | The Legacy Crew's yard: walled, two warehouses, container stacks, a watchtower, a quay | `gate`, `yard`, `office`, `tower`, `dock` |
| `datacenter` | hills | Coldline Data Centre: long low halls, cooling units on the roof, a fenced generator yard | `gate`, `hall`, `roof`, `generators` |
| `garage` | uptown | Merge Conflict Motors: a workshop with roller doors and a lot of cars | `door`, `lot` |
| `club` | cadence | The Standup: a deco nightclub with a neon front, a back alley and a roof terrace | `door`, `alley`, `roof`, `stage` |
| `motel` | gardens | The Lazy Loader Motel: two storeys of rooms round a car park, an office | `office`, `room`, `lot` |

### Steps

Every step can have `text` (the objective line on screen), `say` (dialogue played as the step starts),
and `time` (seconds; fails when it runs out). A step passes, then the next starts.

| `do` | Fields | Passes when |
|---|---|---|
| `talk` | `say` | The lines have played |
| `goto` | `at`, `r` (default 6), `car` (true = in any car, false = on foot, or a car tag) | The player is within `r` |
| `spawn` | `cars: [car]`, `people: [person]`, `items: [item]` | At once (things appear) |
| `enter` | `car` (tag) | The player is driving that car |
| `kill` | `tags: [...]` | Every person with those tags is down and every car with them destroyed |
| `collect` | `tags: [...]` | Every item with those tags has been picked up (walk or drive over it) |
| `deliver` | `car` or `item` or `vip` (tag), `to`, `r` (default 6) | The player arrives with it (driving the car / carrying the item / with the VIP aboard) |
| `ride` | `vip` (tag) | The VIP is in the player's car (drive up close; they walk over and get in) |
| `tail` | `tag` (a car with a `to`), `max` (default 160), `min` (default 15) | The car reaches its `to`; fails if further than `max`, or closer than `min` for 4 s (spotted) |
| `chase` | `tag`, `escape` (default 500) | The car is destroyed or disabled; fails if it gets `escape` metres away |
| `escort` | `tag` (an ally car with a `to`), `max` (default 200) | The car reaches its `to`; fails if it's destroyed or you fall `max` behind |
| `race` | `route: [place...]`, `tags` (rival cars, spawned with `ai: "race"` and the same route) | The player passes every checkpoint in order first; fails if a rival finishes first |
| `defend` | `at`, `r` (default 35), `time`, `waves: [{ t, people: [person] }]` | `time` runs out with the player inside `r` and anything in `keep` alive (t = seconds into the step) |
| `hold` | `at`, `r` (default 3), `time` | The player stays inside `r` for `time` seconds in total (planting, hacking, loading) |
| `photo` | `tag` or `at`, `range` (default 60) | The player aims at it on foot from within `range` for 1.5 s |
| `heat` | `level` (0–5) | At once: the Audit's escalation level is set |
| `lose` | | The escalation level is back to 0 |
| `wait` | `time` | The time passes |
| `buy` | `weapon` (id) | The player owns that weapon (Breakpoint Arms sells it) |
| `despawn` | `tags` | At once |

Car spec: `{ tag, kit, color, at, yaw?, ai, to, speed, hp, crew, blip }`
- `kit`: any modelled car (`thunderbolt` the player's Asoka car, `toyama` a taxi-style saloon, `mv6`,
  `asti`, `lasley`, `eagle`, `doutrive`, `stinger`, `urban`, `sialia`, `fairheaven`, `sanremo`) or a fleet
  vehicle: `cruiser` (Audit patrol car), `brittle_suv` (Brittle security SUV), `boxtruck` (freight truck),
  `vault` (armoured transport), `ambulance` (Code Blue van), `courier` (Asoka courier van).
- `ai`: `park` (sits there), `cruise` (drives the roads), `route` (drives to `to` and stops), `flee` (runs
  from the player), `chase` (hunts and rams the player), `race` (follows the race route), `convoy` (like
  route, at a steady pace).
- `speed`: multiplier on its pace (default 1). `hp`: toughness (default 400; vault 1400). `blip`: on the map.
- `crew`: `{ n, team, weapon }`: people inside who get out and fight when it stops or is disabled.

Person spec: `{ tag, n, team, look, weapon, hp, at, spread, ai, accuracy, blip }`
- `team`: `legacy` (Brittle's street crew, hostile), `brittle` (Brittle security, hostile), `audit` (the
  Audit; hostile), `ally` (fights beside you), `vip` (someone to protect), `civil` (bystander).
- `ai`: `guard` (holds the spot, fights when they see you), `attack` (comes for you), `stand`, `follow`
  (follows the player on foot), `flee` (runs).
- `weapon`: a weapon id (table below) or none. `n` people spread over `spread` metres (default 5).

Item spec: `{ tag, kind, at, value }` with `kind` `case` (briefcase), `package`, `drive` (hard drive),
`bug` (a collectible bug), `cash`.

### Side quests

```js
{ id: "s03", title: "Sprint Series", contact: "patch" | at: place, blurb, open: "m05" (main mission that unlocks it),
  stages: [{ title, reward, brief, steps, outro }, ...] }
```
Stages run in order; the quest is done after the last. Steps may use places with `{ near: "player", d,
rand: true }` (rand picks a fresh point each attempt).

## Weapons

The existing arsenal (ids): `fists`, `debugger` (bat), `patchblade` (machete), `hotfix9` (pistol),
`rootcause` (revolver), `burstmode` (machine pistol), `batchjob` (micro SMG), `asyncqueue` (SMG), `quickfix`
(sawn-off), `rollback12` (pump shotgun), `massupdate` (auto shotgun), `pipeline` (carbine), `governor`
(battle rifle), `longquery` (sniper), `fieldaudit` (marksman), `bulkapi` (LMG), `cascade` (grenade
launcher), `harddelete` (rocket launcher), `dataloader` (minigun), `mergeconflict` (grenade).

New for the story, sold once unlocked by a mission's `unlock`:
- `silentdeploy`: Silent Deploy, suppressed pistol. Shots raise no alarm and no escalation.
- `killswitch`: Kill Switch, EMP launcher. Its shell stalls every car within 8 m for 8 s.
- `stickynote`: Sticky Note, remote charge. Throw it (it sticks to cars and walls), fire again to set it off.

## Engine facts the story can rely on

- The Audit: escalation 0–5 shown as pips. Crimes raise it (shots near people, people knocked out, cars
  wrecked, Audit hit); out of sight it falls away. At 1–2 cruisers chase; at 3+ officers get out and shoot;
  at 5 Brittle security joins. A mission with `heat: false` suspends it.
- The player can be knocked out (hp 0) or the car destroyed: the mission fails, with a retry from its start.
- Night: `setHour` 20–4 for night jobs.
