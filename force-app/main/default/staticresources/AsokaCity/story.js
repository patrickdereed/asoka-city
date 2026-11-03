// Go-Live: the story, as data. Five acts of twelve missions, and twelve side quests that can be played
// any time once they open. The vocabulary (places, steps, car and person specs) is docs/missions-contract.md;
// missions.js runs it. Nothing here touches the engine.

// Small builders, so a shootout reads as a line rather than a block.
const legacy = (tag, n, at, weapon = "hotfix9", o = {}) => ({ tag, n, team: "legacy", weapon, at, ai: "guard", ...o });
const brittle = (tag, n, at, weapon = "batchjob", o = {}) => ({ tag, n, team: "brittle", weapon, at, ai: "guard", ...o });
const audit = (tag, n, at, weapon = "hotfix9", o = {}) => ({ tag, n, team: "audit", weapon, at, ai: "guard", ...o });
const ally = (tag, n, at, weapon = "pipeline", o = {}) => ({ tag, n, team: "ally", weapon, at, ai: "attack", ...o });
const vip = (tag, look, at, o = {}) => ({ tag, n: 1, team: "vip", look, at, ai: "stand", ...o });
const car = (tag, kit, at, ai, o = {}) => ({ tag, kit, at, ai, ...o });
const item = (tag, kind, at, o = {}) => ({ tag, kind, at, ...o });
const crew = (team, n, weapon) => ({ n, team, weapon });

export const CONTACTS = {
  rhea: { name: "Rhea Okonkwo", look: "Business_Female_01", at: "tower", blurb: "Asoka's head of operations. Calm in an outage, terrifying in a post-mortem." },
  dex: { name: "Dex Marlow", look: "Male_Adult_07", at: "site:garage.door", blurb: "Runs Merge Conflict Motors in Commit Row. Has had every car in the city apart, some of them twice." },
  lupe: { name: "Lupe Santana", look: "Female_Adult_05", at: "site:club.door", blurb: "Owns the Standup, the loudest club in the Cadence Quarter. Pays her bills, her staff and her grudges on time." },
  patch: { name: "Patch", look: "Male_Adult_02", at: "landmark:gardens", blurb: "Teenage hacker who lives at Kickflip Skate Park. Can open anything with a terminal, nothing with a door." },
  gantry: { name: "Moss Gantry", look: "Male_Adult_09", at: "landmark:docks", blurb: "Foreman of the Pipeline docks for thirty years. Knows every container, and what's really in it." },
  vale: { name: "Inspector Ines Vale", look: "Business_Female_04", at: "site:audit_hq.gate", blurb: "The Audit's last straight inspector. Overworked, under-funded, and keeping a list." },
  ivy: { name: "Ivy Strand", look: "Female_Adult_08", at: "site:motel.room", blurb: "Brittle Systems' best engineer, until she read the roadmap. Now hiding at the Lazy Loader Motel." },
  harlan: { name: "Harlan Brittle", look: "Business_Male_05", at: "site:brittle_hq.lobby", blurb: "CEO of Brittle Systems. Has run Asoka City's systems since dial-up and intends to keep it that way." },
};

export const ACTS = [
  { n: 1, title: "Onboarding", blurb: "Asoka is weeks from running the city. Brittle Systems would rather it didn't. Rhea needs a fixer." },
  { n: 2, title: "Sprint", blurb: "The Legacy Crew is squeezing the Cadence Quarter and the isles. Time to make some friends with long memories." },
  { n: 3, title: "Pipeline", blurb: "Brittle's hardware comes in through the docks. Gantry knows how; Vale wants proof; Dex wants paying." },
  { n: 4, title: "Code Freeze", blurb: "Sold out and wanted, you go to ground at a motel in Sprint Gardens with a hacker, an inspector and a defector." },
  { n: 5, title: "Go-Live", blurb: "Everything Brittle built comes down to one night. Asoka goes live, or the city stays on version one forever." },
];

export const MAIN = [
  // ------------------------------------------------------------------------------- Act 1: Onboarding
  {
    id: "m01", act: 1, title: "Day One", contact: "rhea", after: [], reward: 1800,
    brief: [
      ["rhea", "You must be {name}. Rhea Okonkwo, head of operations. Thanks for coming in on zero notice."],
      ["rhea", "In a few weeks Asoka goes live and runs this city's systems. Brittle Systems has run them since dial-up, and they are not taking it well."],
      ["you", "Define 'not taking it well'."],
      ["rhea", "A backup drive walked out of our Commit Row closet last night. It's on a Legacy Crew stall at the kerb. Get it back."],
      ["asoka", "Hello, {name}. I have marked the stall on your map. Please return the drive with its label intact."],
    ],
    steps: [
      { do: "spawn", people: [legacy("stall", 2, "road:uptown/3", null, { ai: "stand" })], items: [item("drive", "drive", "road:uptown/3")] },
      { do: "goto", at: "road:uptown/3", r: 12, text: "Drive to the Legacy stall in Commit Row." },
      { do: "collect", tags: ["drive"], text: "Grab the backup drive.", say: [["Legacy lookout", "Hey! That's Brittle property now. Finders keepers, rebooters weepers."]] },
      { do: "spawn", cars: [car("tail1", "eagle", { near: "road:uptown/3", d: 220 }, "chase", { crew: crew("legacy", 2, "hotfix9") })] },
      { do: "deliver", item: "drive", to: "tower", r: 8, time: 240, text: "Get the drive back to the Asoka tower.", say: [["rhea", "They've sent a car after you. Don't let it near the drive."]] },
    ],
    outro: [
      ["rhea", "Label intact. You're hired. Probation is ninety days or one disaster, whichever comes first."],
      ["asoka", "I have opened a ticket for your onboarding. It is ticket number one. You are very special."],
    ],
  },
  {
    id: "m02", act: 1, title: "Badge Access", contact: "rhea", after: ["m01"], reward: 2200,
    brief: [
      ["rhea", "Legacy taggers are painting over our go-live billboards downtown. Petty, but they've started carrying."],
      ["rhea", "Breakpoint Arms will sell you something with a safety catch. Expense it."],
      ["you", "Asoka has an expense policy for pistols?"],
      ["asoka", "It does now. I wrote it while you were talking. It is three lines long and two of them are about receipts."],
    ],
    steps: [
      { do: "goto", at: "venue:arms", r: 5, text: "Go to Breakpoint Arms." },
      { do: "buy", weapon: "hotfix9", text: "Buy a Hotfix 9 pistol." },
      { do: "spawn", people: [legacy("taggers", 3, "road:console/4", "hotfix9", { blip: true })] },
      { do: "goto", at: "road:console/4", r: 35, text: "Find the taggers at the billboard on the Console." },
      { do: "kill", tags: ["taggers"], text: "Stop the taggers.", say: [["Legacy tagger", "Brittle was here first! We've got the legacy contract!"]] },
    ],
    outro: [["rhea", "Billboards restored. Marketing wants to know if you also do brand work."]],
  },
  {
    id: "m03", act: 1, title: "Loaner", contact: "dex", after: ["m01"], reward: 2400,
    brief: [
      ["dex", "Rhea's new fixer. Dex Marlow, Merge Conflict Motors. If it has wheels, I've had it apart."],
      ["dex", "A Brittle middle manager parks his Sialia on Commit Row like he owns the kerb. He doesn't. Nobody owns a kerb."],
      ["dex", "Bring it here. Gently. Then I sell it back to him."],
      ["you", "That's a business model?"],
      ["dex", "It's a subscription."],
    ],
    steps: [
      { do: "spawn", cars: [car("loaner", "sialia", "road:uptown/9", "park", { color: 0x2f4f6f, blip: true })] },
      { do: "goto", at: "road:uptown/9", r: 15, text: "Find the manager's Sialia on Commit Row." },
      { do: "enter", car: "loaner", text: "Get in the Sialia." },
      { do: "heat", level: 1 },
      { do: "deliver", car: "loaner", to: "site:garage.lot", r: 8, time: 200, text: "Bring it to Merge Conflict Motors.", say: [["asoka", "The car's alarm has reported you to the Audit. In fairness, that is its job."]] },
    ],
    outro: [["dex", "Not a scratch. Okay, one scratch, but it was there before. Probably. Come back when you're bored."]],
  },
  {
    id: "m04", act: 1, title: "Uptime Guarantee", contact: "rhea", after: ["m02"], reward: 2600,
    keep: ["van"],
    brief: [
      ["rhea", "We're moving a rack of routers to the Cadence exchange. The courier van is slow. The Legacy Crew is not."],
      ["rhea", "Stay behind it, keep it in one piece. Our service level says ninety-nine point nine. I'd like to keep the nines."],
    ],
    steps: [
      { do: "spawn", cars: [car("van", "courier", "tower", "convoy", { to: "road:cadence/2", hp: 500, blip: true })] },
      { do: "spawn", cars: [
        car("raider1", "doutrive", { near: "tower", d: 450 }, "chase", { crew: crew("legacy", 2, "hotfix9") }),
        car("raider2", "lasley", { near: "road:cadence/2", d: 600 }, "chase", { crew: crew("legacy", 2, "hotfix9") }),
      ] },
      { do: "escort", tag: "van", max: 200, text: "Escort the courier van to the Cadence exchange.", say: [["Asoka courier", "Van's rolling. Please tell me you're the one behind me."]] },
    ],
    outro: [["rhea", "Routers delivered, nines intact. You may be the most reliable thing in this company, and I include the AI."], ["asoka", "Ouch."]],
  },
  {
    id: "m05", act: 1, title: "Test Drive", contact: "dex", after: ["m03"], reward: 2900,
    brief: [
      ["dex", "My nephew Rowan races for the Legacy Crew now. Says Brittle pays better. Says I'm a dinosaur."],
      ["dex", "Beat him round Commit Row and the Console and he comes home. Lose and I never hear the end of it."],
      ["you", "No pressure, then."],
      ["dex", "Loads of pressure. That's what tyres are for."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("rowan", "stinger", "site:garage.door", "race", { color: 0xd7a03d, route: ["road:uptown/1", "road:uptown/5", "road:console/7", "road:console/2", "site:garage.door"] }),
        car("pal", "asti", "site:garage.door", "race", { color: 0x8a2be2, speed: 0.95, route: ["road:uptown/1", "road:uptown/5", "road:console/7", "road:console/2", "site:garage.door"] }),
      ] },
      { do: "race", route: ["road:uptown/1", "road:uptown/5", "road:console/7", "road:console/2", "site:garage.door"], tags: ["rowan", "pal"], text: "Win the race back to the garage.", say: [["Rowan", "Uncle Dex sent a temp? Cute. Try to keep up."]] },
    ],
    outro: [["dex", "Rowan's sulking in the back office. Best sound I've heard all year. You can borrow the lift any time."]],
  },
  {
    id: "m06", act: 1, title: "Packet Loss", contact: "rhea", after: ["m04"], reward: 3100,
    brief: [
      ["rhea", "Someone's been lifting our routers off the loading bay. Asoka traced the last one to a Legacy box truck."],
      ["asoka", "The truck will leave the Console shortly. Follow it, but not closely. People notice when a fixer is in their mirror."],
      ["rhea", "Find where it drops, take the truck, bring our hardware home."],
    ],
    steps: [
      { do: "spawn", cars: [car("truck", "boxtruck", "road:console/9", "convoy", { to: "road:docks/6", hp: 700, blip: true })] },
      { do: "goto", at: "road:console/9", r: 60, text: "Get to the loading bay on the Console." },
      { do: "tail", tag: "truck", max: 170, min: 18, text: "Follow the truck without being seen." },
      { do: "spawn", people: [legacy("dropcrew", 4, "road:docks/6", "hotfix9", { blip: true })] },
      { do: "kill", tags: ["dropcrew"], text: "Deal with the drop crew.", say: [["Legacy foreman", "Who invited the Asoka intern?"]] },
      { do: "enter", car: "truck", text: "Take the truck." },
      { do: "deliver", car: "truck", to: "tower", r: 10, time: 300, text: "Drive the routers back to the Asoka tower." },
    ],
    outro: [["rhea", "Eighty routers back on the shelf. Asoka has asked if it can name one after you."], ["asoka", "Router 41 is now 'Router {name}'. It is very fast."]],
  },
  {
    id: "m07", act: 1, title: "Cold Start", contact: "dex", after: ["m05"], reward: 3400, setHour: 23,
    brief: [
      ["dex", "Rowan coming home made the Legacy Crew grumpy. They're coming tonight to 'renegotiate'."],
      ["dex", "I've got a wrench, a fire extinguisher and a very angry cat. Could use a fourth."],
    ],
    steps: [
      { do: "goto", at: "site:garage.door", r: 10, text: "Stand by at the garage." },
      { do: "defend", at: "site:garage.door", r: 35, time: 100, text: "Hold the garage until the Legacy Crew give up.", waves: [
        { t: 0, people: [legacy("w1", 3, { near: "site:garage", d: 60 }, "hotfix9", { ai: "attack" })] },
        { t: 35, people: [legacy("w2", 4, "site:garage.lot", "quickfix", { ai: "attack" })] },
        { t: 70, people: [legacy("w3", 3, { near: "site:garage", d: 80 }, "batchjob", { ai: "attack" })] },
      ] },
    ],
    outro: [["dex", "The cat got one of them. I'm putting that on the invoice."]],
  },
  {
    id: "m08", act: 1, title: "Shadow IT", contact: "rhea", after: ["m06"], reward: 3600,
    brief: [
      ["rhea", "Brittle's regional director meets the Legacy Crew on Commit Row. Same day, same kerb, every week."],
      ["rhea", "I want a photo of his car from the Merge roof gardens. Evidence, not a postcard."],
      ["asoka", "Recommended equipment: a steady hand and a good angle. I have neither, so I am delegating."],
    ],
    steps: [
      { do: "goto", at: "landmark:uptown.top", car: false, r: 5, text: "Climb to the top of the Merge roof gardens." },
      { do: "spawn", cars: [car("suv", "brittle_suv", "road:uptown/12", "park", { blip: true })], people: [legacy("meet", 2, "road:uptown/12", null, { ai: "stand" })] },
      { do: "photo", tag: "suv", range: 140, text: "Photograph the director's SUV." },
      { do: "despawn", tags: ["suv"] },
      { do: "spawn", cars: [car("director", "brittle_suv", "road:uptown/12", "flee", { blip: true, crew: crew("brittle", 1, "hotfix9") })] },
      { do: "chase", tag: "director", escape: 500, text: "He spotted the flash. Stop his SUV.", say: [["rhea", "He's running. Don't let him get off the Row."]] },
    ],
    outro: [["rhea", "A director, a Legacy lieutenant and a parking ticket in one frame. Asoka's filing it with the Audit."]],
  },
  {
    id: "m09", act: 1, title: "Chop Shop Etiquette", contact: "dex", after: ["m07"], reward: 3600,
    brief: [
      ["dex", "Brittle security parks a spare SUV by the Console. Armoured doors, heated seats, a dashboard that says 'unsupported'."],
      ["dex", "Grab it. The Audit will come. Lose them before you bring it here. Rule one of the chop shop: no tourists."],
    ],
    steps: [
      { do: "spawn", cars: [car("prize", "brittle_suv", "road:console/14", "park", { blip: true })], people: [brittle("prizeguards", 3, "road:console/14", "hotfix9")] },
      { do: "goto", at: "road:console/14", r: 30, text: "Find Brittle's spare SUV." },
      { do: "enter", car: "prize", text: "Get in the SUV." },
      { do: "heat", level: 2 },
      { do: "lose", text: "Lose the Audit." },
      { do: "deliver", car: "prize", to: "site:garage.lot", r: 8, text: "Bring the SUV to Merge Conflict Motors." },
    ],
    outro: [["dex", "Heated seats. Do you know what heated seats go for? Neither do I, but it's a lot."]],
  },
  {
    id: "m10", act: 1, title: "Change Request", contact: "rhea", after: ["m08"], reward: 3800,
    keep: ["ferris"],
    brief: [
      ["rhea", "To go live we need the Audit to sign our change request. Our compliance officer, Mr Ferris, has it."],
      ["rhea", "Brittle knows. He's waiting on the Console. Take him to the Audit precinct in Meridian Heights, alive and on time."],
      ["you", "What's in the change request?"],
      ["rhea", "Forty pages, three signatures and a rollback plan. Brittle's never seen one."],
    ],
    steps: [
      { do: "spawn", people: [vip("ferris", "Business_Male_02", "road:console/9", { blip: true })] },
      { do: "goto", at: "road:console/9", r: 25, car: true, text: "Pick up Mr Ferris on the Console." },
      { do: "ride", vip: "ferris", text: "Let Mr Ferris get in.", say: [["Mr Ferris", "I have a rollback plan for this journey. It involves screaming."]] },
      { do: "spawn", cars: [
        car("hunt1", "eagle", { near: "road:console/9", d: 300 }, "chase", { crew: crew("legacy", 2, "batchjob") }),
        car("hunt2", "mv6", { near: "site:audit_hq.gate", d: 700 }, "chase", { crew: crew("legacy", 2, "hotfix9") }),
      ] },
      { do: "deliver", vip: "ferris", to: "site:audit_hq.gate", r: 10, time: 330, text: "Get Mr Ferris to the Audit precinct." },
    ],
    outro: [["vale", "Inspector Vale. I signed your change request. Off the record, it's the only one I've ever seen with a rollback plan."], ["rhea", "Vale's straight. Remember her."]],
  },
  {
    id: "m11", act: 1, title: "Loose Bolts", contact: "dex", after: ["m09"], reward: 4100,
    brief: [
      ["dex", "Legacy Crew lifted my tow truck. Painted 'LEGACY' on it in a font I'm not prepared to discuss."],
      ["dex", "It's heading for the docks. I don't need it back pretty. I need it not working for them."],
    ],
    steps: [
      { do: "spawn", cars: [car("tow", "boxtruck", "road:uptown/15", "flee", { hp: 650, blip: true, crew: crew("legacy", 2, "hotfix9") })] },
      { do: "chase", tag: "tow", escape: 550, text: "Stop Dex's stolen truck.", say: [["Legacy driver", "It's ours now! Possession is nine-tenths of the licence!"]] },
    ],
    outro: [["dex", "My crew towed the tow truck. It's very meta. Here, for your trouble."]],
  },
  {
    id: "m12", act: 1, title: "Go/No-Go", contact: "rhea", after: ["m10", "m11"], reward: 7200,
    unlock: ["silentdeploy"],
    brief: [
      ["rhea", "Tonight's the go/no-go rehearsal on Console Plaza. Brittle knows the date, which means everyone knows the date."],
      ["dex", "I'm parked round the back with a spare car and opinions. Rowan's on the radio, and says if {name} dents it, {theyre} buying it."],
      ["rhea", "Hold the plaza until the rehearsal's done. If their lieutenant Spool shows his face, take his car off the board."],
    ],
    steps: [
      { do: "goto", at: "plaza", r: 30, text: "Get to Console Plaza." },
      { do: "defend", at: "plaza", r: 45, time: 90, text: "Hold the plaza for the rehearsal.", waves: [
        { t: 0, people: [legacy("p1", 4, { near: "plaza", d: 70 }, "hotfix9", { ai: "attack" })] },
        { t: 30, people: [legacy("p2", 5, { near: "plaza", d: 80 }, "batchjob", { ai: "attack" })] },
        { t: 60, people: [legacy("p3", 5, { near: "plaza", d: 70 }, "quickfix", { ai: "attack" })] },
      ] },
      { do: "spawn", cars: [car("spool", "eagle", { near: "plaza", d: 140 }, "flee", { color: 0x111111, hp: 600, blip: true, crew: crew("legacy", 2, "batchjob") })] },
      { do: "chase", tag: "spool", escape: 550, text: "Spool's running. Stop his car.", say: [["Spool", "Tell Rhea her rehearsal's cancelled. Brittle sends regards."]] },
      { do: "talk", say: [["harlan", "{name}, is it? Harlan Brittle. I've been in this city's systems since before you could spell 'reboot'."], ["harlan", "Asoka won't go live. Nothing ever does. Enjoy your probation."]] },
    ],
    outro: [
      ["rhea", "Rehearsal passed. Harlan Brittle knows your name now. Congratulations, that's the worst promotion we offer."],
      ["dex", "Breakpoint Arms owes me. Ask them for a Silent Deploy. Quiet is going to matter."],
    ],
  },

  // ------------------------------------------------------------------------------------ Act 2: Sprint
  {
    id: "m13", act: 2, title: "Soft Opening", contact: "lupe", after: ["m12"], reward: 4800, setHour: 21,
    brief: [
      ["lupe", "Lupe Santana. This is the Standup. Best sound system south of the Console, worst neighbours."],
      ["lupe", "The Legacy Crew charge every venue on the strip a 'legacy support fee'. Monthly. Non-refundable. Non-optional."],
      ["lupe", "Their collectors are due any minute. Rhea says you're good at cancelling subscriptions."],
    ],
    steps: [
      { do: "spawn", people: [legacy("collectors", 3, { near: "site:club.door", d: 30 }, "rootcause", { ai: "attack", blip: true })] },
      { do: "kill", tags: ["collectors"], text: "Run off the Legacy collectors.", say: [["Legacy collector", "Support fee's gone up, Lupe. Inflation."]] },
      { do: "spawn", cars: [car("bagman", "lasley", "site:club.alley", "flee", { color: 0x6b1f2a, blip: true, crew: crew("legacy", 1, "hotfix9") })] },
      { do: "chase", tag: "bagman", escape: 500, text: "The bagman's running with the strip's money. Stop him." },
    ],
    outro: [["lupe", "First month in years nobody on this strip paid a cent. Drinks are on the house. Forever. Within reason."]],
  },
  {
    id: "m14", act: 2, title: "Script Kiddie", contact: "patch", after: ["m12"], reward: 5000,
    brief: [
      ["patch", "You're the fixer? Cool. I'm Patch. I fix things too, mostly other people's passwords."],
      ["patch", "Brittle keeps a courier's hard drive in a garden office in Sprint Gardens. Three guards, all bored."],
      ["patch", "Go quiet. Buy a Silent Deploy at Breakpoint Arms. If they hear you, the drive gets wiped. Works on my machine, won't on theirs."],
    ],
    steps: [
      { do: "goto", at: "venue:arms", r: 5, text: "Go to Breakpoint Arms." },
      { do: "buy", weapon: "silentdeploy", text: "Buy a Silent Deploy." },
      { do: "spawn", people: [brittle("gardenguards", 3, "road:gardens/4", "hotfix9", { blip: true })], items: [item("drive", "drive", "road:gardens/4")] },
      { do: "goto", at: "road:gardens/4", r: 45, text: "Get to the garden office in Sprint Gardens." },
      { do: "kill", tags: ["gardenguards"], text: "Take out the guards quietly." },
      { do: "collect", tags: ["drive"], text: "Grab the courier's hard drive." },
      { do: "deliver", item: "drive", to: "contact:patch", r: 6, text: "Bring the drive to Patch at the skate park." },
    ],
    outro: [["patch", "Encrypted with the password 'password1'. These people run the city. Respect, though, for the 1."]],
  },
  {
    id: "m15", act: 2, title: "Sprint Planning", contact: "rhea", after: ["m12"], reward: 5300,
    keep: ["mira"],
    brief: [
      ["rhea", "Mira Vance funds half of Asoka and is on Sandbox Pier eating ice cream. Brittle security found out before I did."],
      ["rhea", "Bring her to the tower for the board review. Smoothly. She rates drivers out of five."],
    ],
    steps: [
      { do: "spawn", people: [vip("mira", "Business_Female_02", "landmark:sandbox", { blip: true })] },
      { do: "goto", at: "landmark:sandbox", r: 40, car: true, text: "Drive out to Sandbox Pier." },
      { do: "ride", vip: "mira", text: "Pick up Mira Vance.", say: [["Mira Vance", "You're the fixer. You have a fixer's driving, I hope, not a fixer's taste in music."]] },
      { do: "spawn", cars: [
        car("sec1", "brittle_suv", { near: "landmark:sandbox", d: 300 }, "chase", { crew: crew("brittle", 2, "batchjob") }),
        car("sec2", "brittle_suv", { near: "landmark:sandbox", d: 500 }, "chase", { crew: crew("brittle", 2, "batchjob") }),
      ] },
      { do: "deliver", vip: "mira", to: "tower", r: 10, time: 360, text: "Get Mira Vance to the Asoka tower." },
    ],
    outro: [["rhea", "She gave you four stars. Apparently the fifth star is for not being shot at."]],
  },
  {
    id: "m16", act: 2, title: "Guest List", contact: "lupe", after: ["m13"], reward: 5500, setHour: 22,
    brief: [
      ["lupe", "The collectors' car went back to a stash somewhere in the Quarter. Every month's fees, in a back room."],
      ["lupe", "One of their drivers is outside now. Follow him, then put my tracker on the stash. I want to know where my money sleeps."],
    ],
    steps: [
      { do: "spawn", cars: [car("runner", "lasley", "site:club.alley", "convoy", { to: "road:cadence/11", color: 0x6b1f2a, blip: true })] },
      { do: "tail", tag: "runner", max: 160, min: 16, text: "Follow the Legacy driver to the stash." },
      { do: "spawn", people: [legacy("stash", 4, "road:cadence/11", "batchjob", { blip: true })] },
      { do: "kill", tags: ["stash"], text: "Clear the stash guards." },
      { do: "hold", at: "road:cadence/11", r: 3, time: 8, text: "Plant Lupe's tracker on the stash." },
    ],
    outro: [["lupe", "My tracker says the money moves to the docks every Friday. Funny place for money. Not a funny place for me."]],
  },
  {
    id: "m17", act: 2, title: "Kickflip", contact: "patch", after: ["m14"], reward: 5500,
    brief: [
      ["patch", "The Legacy kids race through the Gardens every afternoon. Whoever wins gets the skate park. They want my skate park."],
      ["patch", "I can't drive. I mean I can, legally I can't. You drive."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("k1", "asti", "landmark:gardens", "race", { color: 0xcc2222, route: ["road:gardens/1", "road:gardens/6", "road:gardens/10", "road:gardens/3", "landmark:gardens"] }),
        car("k2", "doutrive", "landmark:gardens", "race", { color: 0x2266cc, speed: 0.97, route: ["road:gardens/1", "road:gardens/6", "road:gardens/10", "road:gardens/3", "landmark:gardens"] }),
        car("k3", "sanremo", "landmark:gardens", "race", { color: 0x228844, speed: 0.94, route: ["road:gardens/1", "road:gardens/6", "road:gardens/10", "road:gardens/3", "landmark:gardens"] }),
      ] },
      { do: "race", route: ["road:gardens/1", "road:gardens/6", "road:gardens/10", "road:gardens/3", "landmark:gardens"], tags: ["k1", "k2", "k3"], text: "Win the race through Sprint Gardens." },
    ],
    outro: [["patch", "The park stays ours. I've renamed the half pipe after you. It was called 'The Half Pipe', so, upgrade."]],
  },
  {
    id: "m18", act: 2, title: "Hotfix in Prod", contact: "rhea", after: ["m15"], reward: 6000,
    brief: [
      ["rhea", "The relay on Point Scratch Lighthouse drops our signal to the isles. We need a replacement up there before the board demo."],
      ["asoka", "There is a courier van with the part at the tower. The lighthouse has a service stair. I have counted it: one hundred and forty steps."],
      ["you", "Thanks, Asoka."],
      ["asoka", "Hydrate."],
    ],
    steps: [
      { do: "spawn", cars: [car("partvan", "courier", "tower", "park", { blip: true })] },
      { do: "enter", car: "partvan", text: "Get in the courier van." },
      { do: "deliver", car: "partvan", to: "landmark:scratch", r: 30, time: 260, text: "Drive the relay out to Point Scratch Lighthouse." },
      { do: "goto", at: "landmark:scratch.top", car: false, r: 4, text: "Climb the lighthouse." },
      { do: "hold", at: "landmark:scratch.top", r: 3, time: 10, text: "Install the relay." },
    ],
    outro: [["asoka", "Signal to the isles restored. I can see the sea now. It is mostly blue."]],
  },
  {
    id: "m19", act: 2, title: "Last Call", contact: "lupe", after: ["m16"], reward: 6200, setHour: 23,
    keep: ["lupeguard"],
    brief: [
      ["lupe", "They found the tracker. Now they're coming to the club. Tonight. Full house."],
      ["lupe", "I'm not closing. I've never closed. Keep them off the door and keep me upright."],
    ],
    steps: [
      { do: "spawn", people: [vip("lupeguard", "Female_Adult_05", "site:club.door")] },
      { do: "defend", at: "site:club.door", r: 35, time: 100, text: "Keep the Legacy Crew off the Standup's door.", waves: [
        { t: 0, people: [legacy("c1", 4, { near: "site:club.door", d: 60 }, "hotfix9", { ai: "attack" })] },
        { t: 30, people: [legacy("c2", 4, "site:club.alley", "batchjob", { ai: "attack" })] },
        { t: 65, people: [legacy("c3", 5, { near: "site:club.door", d: 70 }, "quickfix", { ai: "attack" })] },
      ] },
    ],
    outro: [["lupe", "Nobody inside even noticed. The DJ thought the gunfire was a remix. I'm keeping that."]],
  },
  {
    id: "m20", act: 2, title: "Man in the Middle", contact: "patch", after: ["m17"], reward: 6500,
    brief: [
      ["patch", "The drive had a calendar. Brittle meets the Legacy Crew at Preview Marina this afternoon to swap cash for passwords."],
      ["patch", "Get a photo of the handoff. Then the courier leaves with everything, and you, like, make him not leave."],
    ],
    steps: [
      { do: "spawn", people: [brittle("handoff", 2, "landmark:preview", "hotfix9", { ai: "stand", blip: true })] },
      { do: "goto", at: { near: "landmark:preview", d: 120 }, r: 40, text: "Get near Preview Marina without being seen." },
      { do: "photo", tag: "handoff", range: 90, text: "Photograph the handoff." },
      { do: "spawn", cars: [car("mitm", "brittle_suv", "road:preview/2", "flee", { blip: true, crew: crew("brittle", 2, "batchjob") })] },
      { do: "chase", tag: "mitm", escape: 500, text: "Stop the courier's SUV." },
    ],
    outro: [["patch", "I'm in their courier's phone. He has four thousand unread emails. I feel bad for him. Not very bad."]],
  },
  {
    id: "m21", act: 2, title: "Ops Review", contact: "rhea", after: ["m18"], reward: 6700,
    keep: ["rheacar"],
    brief: [
      ["rhea", "I'm presenting to the isles' councils on Sandbox Pier. I'm driving myself, because I'm stubborn."],
      ["rhea", "Brittle will try to make me late. Keep my car moving. If I arrive with my slides, you get a bonus. If I arrive at all, you keep your job."],
    ],
    steps: [
      { do: "spawn", cars: [car("rheacar", "urban", "tower", "convoy", { to: "landmark:sandbox", color: 0xfff7ee, hp: 600, blip: true })] },
      { do: "spawn", cars: [
        car("rb1", "brittle_suv", { near: "tower", d: 500 }, "chase", { crew: crew("brittle", 2, "batchjob") }),
        car("rb2", "eagle", { near: "landmark:sandbox", d: 900 }, "chase", { crew: crew("legacy", 2, "hotfix9") }),
        car("rb3", "brittle_suv", { near: "landmark:sandbox", d: 500 }, "chase", { crew: crew("brittle", 2, "batchjob") }),
      ] },
      { do: "escort", tag: "rheacar", max: 200, text: "Escort Rhea across the causeway to Sandbox Pier." },
    ],
    outro: [["rhea", "Slides presented. Three councils signed. One asked what 'go live' means and I said 'tomorrow, roughly'."]],
  },
  {
    id: "m22", act: 2, title: "Encore", contact: "lupe", after: ["m19"], reward: 7000,
    brief: [
      ["lupe", "Brittle's opened a rival club down the strip. 'Legacy Lounge'. The music is all from one year and it's the wrong year."],
      ["lupe", "Their security parks three SUVs out front. I'd love it if those SUVs were, how do I say this, decommissioned."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("suvA", "brittle_suv", "road:cadence/5", "park", { blip: true }),
        car("suvB", "brittle_suv", "road:cadence/8", "park", { blip: true }),
        car("suvC", "brittle_suv", "road:cadence/13", "park", { blip: true }),
      ], people: [brittle("lounge", 3, "road:cadence/8", "hotfix9")] },
      { do: "kill", tags: ["suvA", "suvB", "suvC"], text: "Destroy the three Brittle SUVs." },
      { do: "heat", level: 2 },
      { do: "lose", text: "Lose the Audit." },
    ],
    outro: [["lupe", "Legacy Lounge closed for 'scheduled maintenance'. I sent flowers. Black ones."]],
  },
  {
    id: "m23", act: 2, title: "Root Access", contact: "patch", after: ["m20"], reward: 7200,
    brief: [
      ["patch", "Brittle runs the isles through three kiosks: Sandbox, Scratch Key and Preview Point. Unlocked, unpatched, unloved."],
      ["patch", "Stand at each one for a few seconds while I sniff the traffic. Quickly. They log out every few minutes. Badly."],
    ],
    steps: [
      { do: "goto", at: "road:sandbox/4", r: 8, time: 200, text: "Get to the Sandbox Isles kiosk." },
      { do: "hold", at: "road:sandbox/4", r: 3, time: 6, text: "Stand by the kiosk while Patch sniffs it." },
      { do: "goto", at: "road:scratch/3", r: 8, time: 200, text: "Get to the Scratch Key kiosk." },
      { do: "hold", at: "road:scratch/3", r: 3, time: 6, text: "Stand by the kiosk." },
      { do: "spawn", people: [brittle("kioskwatch", 3, "road:preview/6", "batchjob")] },
      { do: "goto", at: "road:preview/6", r: 8, time: 240, text: "Get to the Preview Point kiosk." },
      { do: "hold", at: "road:preview/6", r: 3, time: 6, text: "Stand by the kiosk. Brittle's watching this one." },
    ],
    outro: [["patch", "I've got their admin password. It's their CEO's birthday. Of course it is."]],
  },
  {
    id: "m24", act: 2, title: "Demo Day", contact: "rhea", after: ["m21", "m22", "m23"], reward: 10800,
    brief: [
      ["rhea", "Public demo on Console Plaza today. The whole city watching Asoka turn the traffic lights green on cue."],
      ["lupe", "My bouncers are on the corners. Patch is on the lights."],
      ["patch", "Nominally on the lights. Spiritually also on the lights."],
      ["rhea", "Brittle will hit the plaza. Hold it until the demo's done. And if Harlan's car shows up, I want it stopped."],
    ],
    steps: [
      { do: "goto", at: "plaza", r: 30, text: "Get to Console Plaza for the demo." },
      { do: "defend", at: "plaza", r: 45, time: 100, text: "Hold the plaza until the demo finishes.", waves: [
        { t: 0, people: [legacy("d1", 5, { near: "plaza", d: 70 }, "batchjob", { ai: "attack" })] },
        { t: 35, people: [brittle("d2", 4, { near: "plaza", d: 80 }, "asyncqueue", { ai: "attack" })] },
        { t: 70, people: [legacy("d3", 5, { near: "plaza", d: 70 }, "rollback12", { ai: "attack" })] },
      ] },
      { do: "spawn", cars: [car("decoy", "brittle_suv", { near: "plaza", d: 150 }, "flee", { color: 0x222222, hp: 700, blip: true, crew: crew("brittle", 2, "asyncqueue") })] },
      { do: "chase", tag: "decoy", escape: 550, text: "Harlan's SUV is leaving. Stop it." },
      { do: "talk", say: [["harlan", "Did you really think I'd be in the car? I'm a CEO. I'm never where the problem is."], ["harlan", "Lovely demo. Green lights. Shame about the docks."]] },
    ],
    outro: [["rhea", "The demo worked. Every light green on cue. Half the city clapped. The other half is asking what Harlan meant about the docks."]],
  },

  // ---------------------------------------------------------------------------------- Act 3: Pipeline
  {
    id: "m25", act: 3, title: "Manifest", contact: "gantry", after: ["m24"], reward: 7800,
    brief: [
      ["gantry", "Moss Gantry. Thirty years on these docks. I know every box that comes in, except the ones Brittle brings."],
      ["gantry", "They come through the Legacy Crew's yard. Cloned servers, fake serial numbers, all billed to the city."],
      ["gantry", "Get me a picture of their gate, and their manifest out of the yard office. Paperwork's the only thing that scares Harlan."],
    ],
    steps: [
      { do: "goto", at: { near: "site:legacy_yard", d: 150 }, r: 40, text: "Get within sight of the Legacy yard." },
      { do: "photo", at: "site:legacy_yard.gate", range: 120, text: "Photograph the yard gate." },
      { do: "spawn", people: [legacy("yardguards", 4, "site:legacy_yard.office", "batchjob", { blip: true })], items: [item("manifest", "case", "site:legacy_yard.office")] },
      { do: "collect", tags: ["manifest"], text: "Take the manifest from the yard office." },
      { do: "deliver", item: "manifest", to: "contact:gantry", r: 6, text: "Bring the manifest to Gantry." },
    ],
    outro: [["gantry", "Four hundred servers, all marked 'new', all from the year I got married. Good. Now someone with a badge needs to see this."]],
  },
  {
    id: "m26", act: 3, title: "Probation", contact: "vale", after: ["m24"], reward: 7800,
    unlock: ["killswitch"],
    brief: [
      ["vale", "Inspector Vale. I remember your change request. I also remember the parking tickets on Commit Row."],
      ["vale", "Half my precinct is on Brittle's Christmas card list. I can't trust them. I might trust you, after a test."],
      ["vale", "A Legacy van is running guns out of Meridian Heights. Stop it, and I'll sign you a requisition for something useful."],
    ],
    steps: [
      { do: "spawn", cars: [car("gunvan", "boxtruck", "road:meridian/4", "flee", { hp: 700, blip: true, crew: crew("legacy", 2, "batchjob") })] },
      { do: "chase", tag: "gunvan", escape: 550, text: "Stop the Legacy gun van." },
    ],
    outro: [["vale", "Passed. Here's a requisition for a Kill Switch from Breakpoint Arms. It stops cars. I'd rather you stopped cars than people."]],
  },
  {
    id: "m27", act: 3, title: "Kill Switch", contact: "gantry", after: ["m25", "m26"], reward: 8400,
    brief: [
      ["gantry", "Two Brittle trucks are leaving the Pipeline now with the next batch of clones. One SUV riding escort."],
      ["gantry", "Vale says you've a requisition. Buy the Kill Switch. Stall those trucks before they reach the yard."],
    ],
    steps: [
      { do: "goto", at: "venue:arms", r: 5, text: "Go to Breakpoint Arms." },
      { do: "buy", weapon: "killswitch", text: "Buy a Kill Switch." },
      { do: "spawn", cars: [
        car("t1", "boxtruck", "road:docks/9", "convoy", { to: "site:legacy_yard.gate", hp: 700, blip: true }),
        car("t2", "boxtruck", { near: "road:docks/9", d: 40 }, "convoy", { to: "site:legacy_yard.gate", hp: 700, blip: true }),
        car("esc", "brittle_suv", { near: "road:docks/9", d: 80 }, "chase", { blip: true, crew: crew("brittle", 2, "asyncqueue") }),
      ] },
      { do: "chase", tag: "t1", escape: 600, text: "Stop the first truck." },
      { do: "chase", tag: "t2", escape: 600, text: "Stop the second truck." },
      { do: "kill", tags: ["esc"], text: "Take out the escort SUV." },
    ],
    outro: [["gantry", "Two trucks, sat in the road like cows. Customs is going to have a very interesting afternoon."]],
  },
  {
    id: "m28", act: 3, title: "Spare Parts", contact: "dex", after: ["m26"], reward: 8400,
    brief: [
      ["dex", "Long time. Rowan says hi, and that you drive like his nan. That's a compliment, his nan is terrifying."],
      ["dex", "Brittle moves payroll in an armoured van. Follow it to its stop, deal with the guards, and bring it here. I've got debts."],
      ["you", "What kind of debts?"],
      ["dex", "The boring kind. Go on."],
    ],
    steps: [
      { do: "spawn", cars: [car("payroll", "vault", "road:console/16", "convoy", { to: "road:uptown/20", hp: 1400, blip: true })] },
      { do: "goto", at: "road:console/16", r: 80, text: "Find the payroll van on the Console." },
      { do: "tail", tag: "payroll", max: 170, min: 18, text: "Follow the armoured van to its stop." },
      { do: "spawn", people: [brittle("vaultguards", 3, "road:uptown/20", "asyncqueue", { blip: true })] },
      { do: "kill", tags: ["vaultguards"], text: "Deal with the van's guards." },
      { do: "enter", car: "payroll", text: "Take the armoured van." },
      { do: "heat", level: 3 },
      { do: "lose", text: "Lose the Audit." },
      { do: "deliver", car: "payroll", to: "site:garage.lot", r: 8, text: "Bring the van to Merge Conflict Motors." },
    ],
    outro: [["dex", "That's my debts sorted. Mostly. Don't worry about it. Worrying is my job. Yours is driving."]],
  },
  {
    id: "m29", act: 3, title: "Chain of Custody", contact: "vale", after: ["m27"], reward: 8600,
    keep: ["custody"],
    brief: [
      ["vale", "A Legacy driver from your truck job wants to talk. Brittle wants him not to."],
      ["vale", "My cruiser takes him to the courthouse on the Console. You ride escort. Officially you're a concerned citizen."],
    ],
    steps: [
      { do: "spawn", cars: [car("custody", "cruiser", "site:audit_hq.gate", "convoy", { to: "road:console/12", hp: 700, blip: true, crew: crew("ally", 2, "hotfix9") })] },
      { do: "spawn", cars: [
        car("lc1", "eagle", { near: "site:audit_hq.gate", d: 400 }, "chase", { crew: crew("legacy", 2, "batchjob") }),
        car("lc2", "doutrive", { near: "road:console/12", d: 800 }, "chase", { crew: crew("legacy", 2, "batchjob") }),
        car("lc3", "brittle_suv", { near: "road:console/12", d: 400 }, "chase", { crew: crew("brittle", 2, "asyncqueue") }),
      ] },
      { do: "escort", tag: "custody", max: 200, text: "Escort Vale's cruiser to the courthouse." },
    ],
    outro: [["vale", "He talked. Brittle pays the Legacy Crew through a 'consultancy'. Their invoices say 'synergy'. Seventy thousand dollars of synergy."]],
  },
  {
    id: "m30", act: 3, title: "Low Tide", contact: "gantry", after: ["m27"], reward: 8900, setHour: 1,
    brief: [
      ["gantry", "Customs seized the clones. The Legacy Crew want them back, and they're coming over the quay tonight."],
      ["gantry", "My lads have hooks and opinions. You have guns. Hold the stacks till first shift."],
    ],
    steps: [
      { do: "goto", at: "landmark:docks", r: 25, text: "Get to the Container Stacks." },
      { do: "defend", at: "landmark:docks", r: 40, time: 120, text: "Hold the Container Stacks.", waves: [
        { t: 0, people: [legacy("q1", 4, { near: "landmark:docks", d: 60 }, "batchjob", { ai: "attack" })] },
        { t: 30, people: [legacy("q2", 5, { near: "landmark:docks", d: 70 }, "rollback12", { ai: "attack" })] },
        { t: 60, people: [legacy("q3", 5, "site:legacy_yard.dock", "asyncqueue", { ai: "attack" })] },
        { t: 90, people: [legacy("q4", 6, { near: "landmark:docks", d: 60 }, "pipeline", { ai: "attack" })] },
      ] },
    ],
    outro: [["gantry", "First shift's here and the boxes are where I left them. Best night's work these docks have seen."]],
  },
  {
    id: "m31", act: 3, title: "Body Work", contact: "dex", after: ["m28"], reward: 8900,
    brief: [
      ["dex", "The Legacy drivers race the Pipeline at night for pink slips. Win and I get their cars. Lose and they get ours."],
      ["dex", "Don't lose. I've already sold the cars."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("pr1", "stinger", "road:docks/2", "race", { color: 0x111111, route: ["road:docks/7", "road:docks/11", "road:docks/4", "road:docks/15", "landmark:docks"] }),
        car("pr2", "eagle", "road:docks/2", "race", { color: 0xd7a03d, speed: 0.98, route: ["road:docks/7", "road:docks/11", "road:docks/4", "road:docks/15", "landmark:docks"] }),
        car("pr3", "asti", "road:docks/2", "race", { color: 0xcc2222, speed: 0.96, route: ["road:docks/7", "road:docks/11", "road:docks/4", "road:docks/15", "landmark:docks"] }),
      ] },
      { do: "goto", at: "road:docks/2", r: 20, car: true, text: "Get to the start line at the Pipeline." },
      { do: "race", route: ["road:docks/7", "road:docks/11", "road:docks/4", "road:docks/15", "landmark:docks"], tags: ["pr1", "pr2", "pr3"], text: "Win the pink-slip race." },
    ],
    outro: [["dex", "Three cars, three pink slips. You're a natural. Hey, do me a favour soon? Small job. Easy."]],
  },
  {
    id: "m32", act: 3, title: "Internal Affairs", contact: "vale", after: ["m29"], reward: 9400,
    brief: [
      ["vale", "Sergeant Hollis meets a Brittle fixer at the lake in Instinct Park every Thursday. Today's Thursday."],
      ["vale", "Get a photo of Hollis with him. When he sees you, he'll run. Hollis always runs. Stop his cruiser."],
    ],
    steps: [
      { do: "spawn", people: [audit("hollis", 1, "landmark:park", null, { ai: "stand", look: "Male_Adult_06", blip: true }), brittle("fixer", 1, "landmark:park", null, { ai: "stand", look: "Business_Male_03" })] },
      { do: "goto", at: { near: "landmark:park", d: 120 }, r: 40, text: "Get close to the lake without spooking them." },
      { do: "photo", tag: "hollis", range: 80, text: "Photograph Sergeant Hollis with the fixer." },
      { do: "despawn", tags: ["hollis", "fixer"] },
      { do: "spawn", cars: [car("hollisCar", "cruiser", { near: "landmark:park", d: 100 }, "flee", { hp: 600, blip: true, crew: crew("audit", 1, "hotfix9") })] },
      { do: "chase", tag: "hollisCar", escape: 550, text: "Stop Hollis's cruiser.", say: [["Sgt Hollis", "You don't know who you're messing with! I've got a pension!"]] },
    ],
    outro: [["vale", "Hollis is singing. He's a terrible singer, but the lyrics are excellent."]],
  },
  {
    id: "m33", act: 3, title: "Container Tetris", contact: "gantry", after: ["m30"], reward: 9600, setHour: 2,
    brief: [
      ["gantry", "Vale's raiding the Legacy yard soon. She needs the hot containers marked, or her lot spend all night opening boxes of bananas."],
      ["gantry", "Go in quiet tonight. Climb the watchtower and mark them from up there. Then get out before the whole yard wakes up."],
    ],
    steps: [
      { do: "spawn", people: [legacy("night", 5, "site:legacy_yard.yard", "batchjob", { blip: true })] },
      { do: "goto", at: "site:legacy_yard.gate", r: 15, car: false, text: "Slip in through the Legacy yard gate on foot." },
      { do: "kill", tags: ["night"], text: "Take out the night shift, quietly if you can." },
      { do: "goto", at: "site:legacy_yard.tower", car: false, r: 4, text: "Climb the watchtower." },
      { do: "hold", at: "site:legacy_yard.tower", r: 3, time: 10, text: "Mark the hot containers." },
      { do: "heat", level: 3 },
      { do: "lose", text: "The Audit's on its way. Get out and lose them." },
    ],
    outro: [["gantry", "Every hot box marked in orange. Vale says it looks like a Christmas tree. A very illegal Christmas tree."]],
  },
  {
    id: "m34", act: 3, title: "Trust Me", contact: "dex", after: ["m31"], reward: 9600,
    brief: [
      ["dex", "The small job. A package for a friend at the Lazy Loader Motel in Sprint Gardens. Don't open it. Don't shake it."],
      ["you", "What's in it?"],
      ["dex", "Car parts. Mostly. Look, would I lie to you? Don't answer that."],
    ],
    steps: [
      { do: "spawn", items: [item("package", "package", "site:garage.door")] },
      { do: "collect", tags: ["package"], text: "Take Dex's package." },
      { do: "deliver", item: "package", to: "site:motel.lot", r: 8, time: 300, text: "Deliver it to the Lazy Loader Motel." },
      { do: "heat", level: 2 },
      { do: "lose", text: "An Audit patrol was waiting at the motel. Lose them.", say: [["asoka", "{name}, that patrol arrived thirty seconds after you. Somebody told them where you would be."]] },
    ],
    outro: [["dex", "Delivered? Great. Great. The Audit? Weird. Bad luck. Probably bad luck."]],
  },
  {
    id: "m35", act: 3, title: "Raid Window", contact: "vale", after: ["m32", "m33"], reward: 11400, heat: false,
    brief: [
      ["vale", "Tonight we raid the Legacy yard. I have four officers I trust, a warrant, and you."],
      ["vale", "We take the yard, we hold the quay, we find Brittle's ledger in the office. Nobody touches the marked containers."],
    ],
    steps: [
      { do: "goto", at: "site:legacy_yard.gate", r: 25, text: "Meet Vale's team at the Legacy yard gate." },
      { do: "spawn", people: [ally("raid", 4, "site:legacy_yard.gate", "pipeline"), legacy("defenders", 6, "site:legacy_yard.yard", "asyncqueue", { blip: true })] },
      { do: "kill", tags: ["defenders"], text: "Take the yard.", say: [["vale", "The Audit! Drop your weapons! Or don't, that's also fine."]] },
      { do: "defend", at: "site:legacy_yard.dock", r: 35, time: 60, text: "Hold the quay against their boats.", waves: [
        { t: 0, people: [legacy("quay1", 5, "site:legacy_yard.dock", "batchjob", { ai: "attack" })] },
        { t: 30, people: [legacy("quay2", 5, "site:legacy_yard.dock", "rollback12", { ai: "attack" })] },
      ] },
      { do: "spawn", items: [item("ledger", "drive", "site:legacy_yard.office")] },
      { do: "collect", tags: ["ledger"], text: "Find Brittle's ledger in the office." },
    ],
    outro: [["vale", "The ledger names everyone Brittle pays. Including, {name}, someone you know."], ["you", "Who?"], ["vale", "I'll tell you when I'm sure. Watch your back."]],
  },
  {
    id: "m36", act: 3, title: "Rollback", contact: "dex", after: ["m34", "m35"], reward: 14400,
    brief: [
      ["dex", "Hey. Come by the garage. I've got your share from the pink slips, and I want to say thanks. Properly."],
      ["dex", "Just you, though. Don't bring anyone. Rowan's out. It's just me."],
    ],
    steps: [
      { do: "goto", at: "site:garage.door", r: 8, text: "Go and see Dex at the garage." },
      { do: "talk", say: [
        ["dex", "I'm sorry, {name}. I owed Harlan for the garage. I owed him for everything. He said he'd call it even."],
        ["dex", "He just wanted to know where you'd be. That's all. That's all it was."],
        ["harlan", "Dex has been a valued partner. You, {name}, are a deprecated feature."],
      ] },
      { do: "wait", time: 2 },
      { do: "spawn", people: [brittle("setup", 6, "site:garage.lot", "asyncqueue", { ai: "attack", blip: true })] },
      { do: "kill", tags: ["setup"], text: "Survive Brittle's ambush." },
      { do: "heat", level: 4 },
      { do: "lose", text: "Every Audit car Brittle owns is on its way. Lose them." },
    ],
    outro: [["vale", "Dex was in the ledger. I'm sorry. He sold you for his debts. The crooked half of my precinct has your face on every screen. Go to ground."], ["patch", "I know a place. Sprint Gardens. It's got a pool. The pool's empty."]],
  },

  // ------------------------------------------------------------------------------- Act 4: Code Freeze
  {
    id: "m37", act: 4, title: "Safe Mode", contact: "patch", after: ["m36"], reward: 9600,
    brief: [
      ["patch", "Okay, don't panic. Your face is on every Audit screen and Brittle's put a bounty on you. Panic a little."],
      ["patch", "The Lazy Loader Motel, Sprint Gardens. I booked a room under 'Mr Null'. Shake the Audit first, they're on every corner."],
    ],
    steps: [
      { do: "heat", level: 3 },
      { do: "lose", text: "Lose the Audit." },
      { do: "goto", at: "site:motel.lot", r: 10, text: "Get to the Lazy Loader Motel." },
      { do: "talk", say: [
        ["patch", "So, uh. The motel already had a guest. She says she knows you by reputation."],
        ["ivy", "Ivy Strand. I was Brittle's lead engineer until I read Harlan's roadmap. Page one says 'Asoka must fail'. Page two is blank."],
        ["ivy", "I want to help. First I need my laptop back."],
      ] },
    ],
    outro: [["asoka", "{name}, I am offline from the tower but I can still reach you here. Code freeze begins now. No changes without approval. Including you."]],
  },
  {
    id: "m38", act: 4, title: "Defector", contact: "ivy", after: ["m37"], reward: 10800,
    brief: [
      ["ivy", "My laptop is in my flat on Preview Point. It has every backdoor Brittle ever built into this city."],
      ["ivy", "Brittle security will be sitting in my kitchen eating my yoghurt. Get the laptop. The yoghurt is a lost cause."],
    ],
    steps: [
      { do: "spawn", people: [brittle("flat", 4, "road:preview/3", "asyncqueue", { blip: true })], items: [item("laptop", "drive", "road:preview/3")] },
      { do: "goto", at: "road:preview/3", r: 35, text: "Get to Ivy's flat on Preview Point." },
      { do: "kill", tags: ["flat"], text: "Clear out Brittle security." },
      { do: "collect", tags: ["laptop"], text: "Grab Ivy's laptop." },
      { do: "spawn", cars: [car("tracker", "brittle_suv", { near: "road:preview/3", d: 350 }, "chase", { crew: crew("brittle", 2, "asyncqueue") })] },
      { do: "deliver", item: "laptop", to: "site:motel.lot", r: 8, time: 360, text: "Get the laptop back to the motel." },
    ],
    outro: [["ivy", "Every backdoor, every master password. Harlan never changed his. Arrogance is a vulnerability."]],
  },
  {
    id: "m39", act: 4, title: "Off the Books", contact: "vale", after: ["m37"], reward: 10800,
    unlock: ["stickynote"],
    brief: [
      ["vale", "They suspended me. Gross misconduct, apparently, for doing my job. I still have my keys and my grudges."],
      ["vale", "Three crooked officers keep Hollis's payment ledger in Meridian Heights. Take it. Bring it to my car by the lake."],
    ],
    steps: [
      { do: "spawn", people: [audit("crooks", 3, "road:meridian/7", "hotfix9", { blip: true })], items: [item("ledger2", "case", "road:meridian/7")] },
      { do: "goto", at: "road:meridian/7", r: 35, text: "Find the crooked officers in Meridian Heights." },
      { do: "kill", tags: ["crooks"], text: "Take down the crooked officers." },
      { do: "collect", tags: ["ledger2"], text: "Take the payment ledger." },
      { do: "deliver", item: "ledger2", to: "landmark:park", r: 15, time: 300, text: "Bring the ledger to Vale at Instinct Park." },
    ],
    outro: [["vale", "Enough for a judge. Not enough for Harlan. Here, a requisition for Sticky Notes from Breakpoint Arms. You'll want to leave reminders."]],
  },
  {
    id: "m40", act: 4, title: "Sticky Notes", contact: "ivy", after: ["m38", "m39"], reward: 11400,
    brief: [
      ["ivy", "Brittle's hunter teams use three SUVs parked up in Guideline Hills. Without them they can't search the Gardens."],
      ["ivy", "Vale says you can get Sticky Notes. Leave one on each SUV. Then press the button. It's the most satisfying feedback loop I know."],
    ],
    steps: [
      { do: "goto", at: "venue:arms", r: 5, text: "Go to Breakpoint Arms." },
      { do: "buy", weapon: "stickynote", text: "Buy Sticky Notes." },
      { do: "spawn", cars: [
        car("h1", "brittle_suv", "road:hills/2", "park", { blip: true }),
        car("h2", "brittle_suv", "road:hills/5", "park", { blip: true }),
        car("h3", "brittle_suv", "road:hills/8", "park", { blip: true }),
      ], people: [brittle("hillguard1", 2, "road:hills/2", "batchjob"), brittle("hillguard2", 2, "road:hills/5", "batchjob"), brittle("hillguard3", 2, "road:hills/8", "batchjob")] },
      { do: "kill", tags: ["h1", "h2", "h3"], text: "Destroy the three hunter SUVs in Guideline Hills." },
      { do: "heat", level: 2 },
      { do: "lose", text: "Lose the Audit." },
    ],
    outro: [["ivy", "Their search is down to bicycles. I asked. They don't have bicycles."]],
  },
  {
    id: "m41", act: 4, title: "Cold Storage", contact: "patch", after: ["m40"], reward: 12000, setHour: 2,
    brief: [
      ["patch", "Ivy's passwords open the Coldline Data Centre in the hills. That's where Brittle keeps the city's real backups."],
      ["patch", "Get inside, plug my drive into the hall rack and hold on while it copies. It's big. Like, embarrassingly big."],
      ["ivy", "When the copy starts, every alarm in the building goes. Expect company."],
    ],
    steps: [
      { do: "spawn", people: [brittle("dcguards", 5, "site:datacenter.gate", "asyncqueue", { blip: true })] },
      { do: "goto", at: "site:datacenter.gate", r: 30, text: "Get to the Coldline Data Centre." },
      { do: "kill", tags: ["dcguards"], text: "Clear the gate guards." },
      { do: "goto", at: "site:datacenter.hall", car: false, r: 4, text: "Get into the data hall." },
      { do: "hold", at: "site:datacenter.hall", r: 3, time: 15, text: "Plug in Patch's drive and wait for the copy." },
      { do: "defend", at: "site:datacenter.hall", r: 30, time: 60, text: "Hold the hall until the copy finishes.", waves: [
        { t: 0, people: [brittle("dc1", 4, "site:datacenter.gate", "asyncqueue", { ai: "attack" })] },
        { t: 30, people: [brittle("dc2", 5, "site:datacenter.generators", "massupdate", { ai: "attack" })] },
      ] },
    ],
    outro: [["patch", "Copied. It's every system in the city, plus Harlan's holiday photos. He goes to the same beach every year. That's a pattern, man."]],
  },
  {
    id: "m42", act: 4, title: "Witness Protection", contact: "vale", after: ["m39"], reward: 12000,
    keep: ["gantryvip"],
    brief: [
      ["vale", "Brittle's worked out Gantry gave us the manifest. Legacy shooters are on the docks looking for him now."],
      ["vale", "Get him out of the Pipeline and up to the motel. He'll hate it. He's never been north of the docks."],
    ],
    steps: [
      { do: "spawn", people: [vip("gantryvip", "Male_Adult_09", "landmark:docks", { blip: true }), legacy("hunters", 4, { near: "landmark:docks", d: 50 }, "batchjob", { ai: "attack" })] },
      { do: "goto", at: "landmark:docks", r: 40, text: "Get to Gantry at the Container Stacks." },
      { do: "kill", tags: ["hunters"], text: "Drive off the Legacy shooters." },
      { do: "ride", vip: "gantryvip", text: "Get Gantry into your car.", say: [["gantry", "I'm too old for this. I was too old for this in 1989."]] },
      { do: "spawn", cars: [car("gh1", "eagle", { near: "landmark:docks", d: 400 }, "chase", { crew: crew("legacy", 2, "batchjob") })] },
      { do: "deliver", vip: "gantryvip", to: "site:motel.lot", r: 10, time: 420, text: "Get Gantry to the Lazy Loader Motel." },
    ],
    outro: [["gantry", "A motel. With a pool. With no water in it. That's the docks all over. I feel at home."]],
  },
  {
    id: "m43", act: 4, title: "Shadow Copy", contact: "ivy", after: ["m41"], reward: 12600,
    brief: [
      ["ivy", "The copy tipped them off. They're moving the backup tapes out of Coldline in an armoured van."],
      ["ivy", "Follow it, wait till it stops, and take the tapes. If Harlan loses those, he can't roll the city back after go-live."],
    ],
    steps: [
      { do: "spawn", cars: [car("tapes", "vault", "site:datacenter.gate", "convoy", { to: "road:park/5", hp: 1400, blip: true })] },
      { do: "goto", at: { near: "site:datacenter.gate", d: 150 }, r: 60, text: "Get near the data centre gate." },
      { do: "tail", tag: "tapes", max: 180, min: 20, text: "Follow the tape van." },
      { do: "spawn", people: [brittle("tapeguards", 4, "road:park/5", "asyncqueue", { blip: true })], items: [item("tapebox", "drive", "road:park/5")] },
      { do: "kill", tags: ["tapeguards"], text: "Deal with the tape guards." },
      { do: "collect", tags: ["tapebox"], text: "Take the backup tapes." },
      { do: "deliver", item: "tapebox", to: "site:motel.lot", r: 8, text: "Bring the tapes back to the motel." },
    ],
    outro: [["ivy", "No tapes, no rollback. For once, Harlan has to live with his changes."]],
  },
  {
    id: "m44", act: 4, title: "Packet Storm", contact: "patch", after: ["m42"], reward: 13200,
    brief: [
      ["patch", "I need an uplink to get the copy out of the city before Brittle jams us. The observatory dish on the summit."],
      ["patch", "Brittle's sending drivers to beat you up there. It's a race, but with consequences. Then climb to the top and hold my hand. Metaphorically."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("bd1", "stinger", "road:hills/1", "race", { color: 0x222222, route: ["road:hills/4", "road:hills/7", "road:hills/9", "landmark:hills"] }),
        car("bd2", "stinger", "road:hills/1", "race", { color: 0x444444, speed: 0.97, route: ["road:hills/4", "road:hills/7", "road:hills/9", "landmark:hills"] }),
      ] },
      { do: "goto", at: "road:hills/1", r: 20, car: true, text: "Get to the foot of the summit road." },
      { do: "race", route: ["road:hills/4", "road:hills/7", "road:hills/9", "landmark:hills"], tags: ["bd1", "bd2"], text: "Beat Brittle's drivers to the observatory." },
      { do: "goto", at: "landmark:hills.top", car: false, r: 4, text: "Climb to the observatory lookout." },
      { do: "hold", at: "landmark:hills.top", r: 3, time: 12, text: "Hold the uplink while the copy sends." },
    ],
    outro: [["patch", "It's out. Seven mirrors, four continents. Harlan can't delete it now. Nobody can. Not even me, which is honestly scary."]],
  },
  {
    id: "m45", act: 4, title: "Due Process", contact: "vale", after: ["m43", "m44"], reward: 13800,
    brief: [
      ["vale", "Commissioner Grail signed my suspension. Grail is on Brittle's payroll, and the ledger proves it."],
      ["vale", "He's leaving the city tonight with two escort SUVs. Stop his car and I'll do the rest."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("grail", "brittle_suv", "road:uptown/18", "flee", { color: 0x1c2a3a, hp: 800, blip: true, crew: crew("brittle", 1, "hotfix9") }),
        car("ge1", "brittle_suv", { near: "road:uptown/18", d: 60 }, "chase", { crew: crew("brittle", 2, "asyncqueue") }),
        car("ge2", "brittle_suv", { near: "road:uptown/18", d: 120 }, "chase", { crew: crew("brittle", 2, "asyncqueue") }),
      ] },
      { do: "chase", tag: "grail", escape: 600, text: "Stop Commissioner Grail's car." },
    ],
    outro: [["vale", "Grail's in a cell. My badge is back on. First thing I did was un-suspend myself. Second thing was coffee."]],
  },
  {
    id: "m46", act: 4, title: "Freeze Thaw", contact: "ivy", after: ["m45"], reward: 14400, setHour: 3,
    keep: ["ivyvip"],
    brief: [
      ["ivy", "Brittle found the motel. Of course they did, I checked in under my own name. I'm an engineer, not a spy."],
      ["ivy", "They're coming tonight. I can't run with this much hardware. Hold the car park."],
    ],
    steps: [
      { do: "spawn", people: [vip("ivyvip", "Female_Adult_08", "site:motel.room")] },
      { do: "goto", at: "site:motel.lot", r: 20, text: "Get to the motel car park." },
      { do: "defend", at: "site:motel.lot", r: 40, time: 120, text: "Hold the motel against Brittle's raid.", waves: [
        { t: 0, people: [brittle("mr1", 4, { near: "site:motel", d: 70 }, "asyncqueue", { ai: "attack" })] },
        { t: 30, people: [brittle("mr2", 5, { near: "site:motel", d: 80 }, "massupdate", { ai: "attack" })] },
        { t: 60, people: [legacy("mr3", 5, { near: "site:motel", d: 70 }, "pipeline", { ai: "attack" })] },
        { t: 90, people: [brittle("mr4", 6, { near: "site:motel", d: 80 }, "governor", { ai: "attack" })] },
      ] },
    ],
    outro: [["ivy", "The motel's going to want a bigger deposit. Patch has gone missing, though. His phone's in the pool."]],
  },
  {
    id: "m47", act: 4, title: "Zero Day", contact: "patch", after: ["m46"], reward: 15000,
    keep: ["patchvip"],
    brief: [
      ["Skater", "You're Patch's friend? The Legacy Crew grabbed him off his board this morning. They said something about a lighthouse."],
      ["asoka", "Patch's watch is pinging from Point Scratch Lighthouse. His heart rate is high. So is his typing speed. He is fine, but annoyed."],
    ],
    steps: [
      { do: "spawn", people: [vip("patchvip", "Male_Adult_02", "landmark:scratch", { blip: true }), legacy("captors", 5, "landmark:scratch", "pipeline", { blip: true })] },
      { do: "goto", at: "landmark:scratch", r: 50, text: "Get to Point Scratch Lighthouse." },
      { do: "kill", tags: ["captors"], text: "Free Patch from the Legacy Crew." },
      { do: "ride", vip: "patchvip", text: "Get Patch into your car.", say: [["patch", "They made me reset their router. Twelve times. I'm traumatised."]] },
      { do: "spawn", cars: [car("zc1", "brittle_suv", { near: "landmark:scratch", d: 400 }, "chase", { crew: crew("brittle", 2, "asyncqueue") }), car("zc2", "eagle", { near: "landmark:scratch", d: 700 }, "chase", { crew: crew("legacy", 2, "batchjob") })] },
      { do: "deliver", vip: "patchvip", to: "site:motel.lot", r: 10, time: 480, text: "Get Patch back to the motel." },
    ],
    outro: [["patch", "While they had me resetting the router, I read their messages. Dex is going to the Audit precinct tonight. Harlan sent him."]],
  },
  {
    id: "m48", act: 4, title: "Thaw", contact: "vale", after: ["m47"], reward: 18000,
    brief: [
      ["vale", "Grail's people still hold my precinct's yard. Dex is due there tonight to wipe the cell records for Harlan."],
      ["vale", "We take the yard back. I'll restore the cell system. If Dex shows, he's yours."],
      ["you", "And if he runs?"],
      ["vale", "Dex always runs. It's why he's a mechanic."],
    ],
    steps: [
      { do: "goto", at: "site:audit_hq.gate", r: 25, text: "Get to the Audit precinct." },
      { do: "spawn", people: [audit("grailmen", 6, "site:audit_hq.yard", "asyncqueue", { ai: "attack", blip: true })] },
      { do: "kill", tags: ["grailmen"], text: "Take back the precinct yard." },
      { do: "hold", at: "site:audit_hq.cells", r: 3, time: 10, text: "Restore the cell records with Vale." },
      { do: "spawn", cars: [car("dexcar", "stinger", "site:audit_hq.gate", "flee", { color: 0xd7a03d, hp: 700, blip: true })] },
      { do: "chase", tag: "dexcar", escape: 600, text: "Dex is running. Stop him.", say: [["dex", "{name}, I'm sorry! I'm sorry! Please stop chasing me, I'm really bad at this part!"]] },
    ],
    outro: [
      ["dex", "Harlan's plan is go-live night. He'll fake an outage at Coldline, blame Asoka, and the city signs Brittle up for another thirty years."],
      ["dex", "I know it doesn't fix anything. But that's the plan. I'm sorry."],
      ["vale", "Dex goes in a cell. A nice one. With a window. {name}, you're clear. Go home. Asoka needs you."],
    ],
  },

  // ---------------------------------------------------------------------------------- Act 5: Go-Live
  {
    id: "m49", act: 5, title: "Back Online", contact: "rhea", after: ["m48"], reward: 14400,
    brief: [
      ["rhea", "Welcome back. I kept your desk. Asoka kept your mug. It's been sending it status updates."],
      ["asoka", "The mug is well. Welcome back, {name}. Code freeze is lifted. I have missed approving your changes."],
      ["rhea", "Go-live is in days. We need three hardware keys from our safe deposit boxes around the city. Brittle knows where two of them are."],
    ],
    steps: [
      { do: "spawn", items: [item("k1", "drive", "road:sandbox/7"), item("k2", "drive", "road:meridian/9"), item("k3", "drive", "road:gardens/12")], people: [brittle("keywatch1", 3, "road:meridian/9", "asyncqueue"), legacy("keywatch2", 3, "road:gardens/12", "batchjob")] },
      { do: "collect", tags: ["k1", "k2", "k3"], time: 600, text: "Collect the three hardware keys." },
      { do: "goto", at: "tower", r: 10, text: "Bring the keys to the Asoka tower." },
    ],
    outro: [["rhea", "Three keys. Go-live is armed. Now we make sure Harlan can't pull the plug."]],
  },
  {
    id: "m50", act: 5, title: "Afterparty", contact: "lupe", after: ["m48"], reward: 14400, setHour: 22,
    keep: ["lupe2"],
    brief: [
      ["lupe", "I've turned the Standup into your war room. Coffee, whiteboards, and a disco ball for morale."],
      ["lupe", "The Legacy Crew know. They're coming to close us down for good. They won't. Help me prove it."],
    ],
    steps: [
      { do: "spawn", people: [vip("lupe2", "Female_Adult_05", "site:club.door")] },
      { do: "defend", at: "site:club.door", r: 40, time: 120, text: "Defend the war room at the Standup.", waves: [
        { t: 0, people: [legacy("ap1", 5, { near: "site:club.door", d: 70 }, "pipeline", { ai: "attack" })] },
        { t: 30, people: [legacy("ap2", 5, "site:club.alley", "massupdate", { ai: "attack" })] },
        { t: 60, people: [legacy("ap3", 6, { near: "site:club.door", d: 80 }, "governor", { ai: "attack" })] },
        { t: 90, people: [legacy("ap4", 6, "site:club.alley", "pipeline", { ai: "attack" })] },
      ] },
    ],
    outro: [["lupe", "That was the Legacy Crew's last real crew. The rest are calling it a career break."]],
  },
  {
    id: "m51", act: 5, title: "Floor Plan", contact: "ivy", after: ["m48"], reward: 15000,
    brief: [
      ["ivy", "Harlan will run his fake outage from Brittle HQ on Preview Point. I need to know what's changed since I left."],
      ["ivy", "Photograph the gate and the armoured SUV in the garage. Then leave before security notices a fixer with a camera."],
    ],
    steps: [
      { do: "goto", at: "road:preview/8", r: 40, text: "Drive to Preview Point." },
      { do: "photo", at: "site:brittle_hq.gate", range: 120, text: "Photograph Brittle HQ's gate." },
      { do: "spawn", cars: [car("garagesuv", "brittle_suv", "site:brittle_hq.garage", "park", { color: 0x111111, blip: true })] },
      { do: "photo", tag: "garagesuv", range: 90, text: "Photograph the SUV in the garage." },
      { do: "spawn", people: [brittle("patrol", 4, "site:brittle_hq.plaza", "asyncqueue", { ai: "attack" })] },
      { do: "heat", level: 2 },
      { do: "lose", text: "Security spotted you. Lose the Audit." },
    ],
    outro: [["ivy", "New gate, new garage, same Harlan. His car's armoured, but I know its firmware. It has a kill switch, ironically."]],
  },
  {
    id: "m52", act: 5, title: "Warrant", contact: "vale", after: ["m49"], reward: 15600,
    keep: ["judge"],
    brief: [
      ["vale", "I need a warrant for Brittle HQ, and Judge Okoro's the only one Harlan hasn't bought."],
      ["vale", "She's in Meridian Heights. Bring her to the precinct. Brittle will try to stop her signing anything, ever."],
    ],
    steps: [
      { do: "spawn", people: [vip("judge", "Business_Male_04", "road:meridian/5", { blip: true })] },
      { do: "goto", at: "road:meridian/5", r: 25, car: true, text: "Pick up Judge Okoro in Meridian Heights." },
      { do: "ride", vip: "judge", text: "Let the judge get in.", say: [["Judge Okoro", "I've read the ledger. I'd like to sign this warrant before I'm too angry to hold a pen."]] },
      { do: "spawn", cars: [
        car("wb1", "brittle_suv", { near: "road:meridian/5", d: 300 }, "chase", { crew: crew("brittle", 2, "asyncqueue") }),
        car("wb2", "brittle_suv", { near: "site:audit_hq.gate", d: 500 }, "chase", { crew: crew("brittle", 2, "massupdate") }),
      ] },
      { do: "deliver", vip: "judge", to: "site:audit_hq.gate", r: 10, time: 300, text: "Get the judge to the Audit precinct." },
    ],
    outro: [["vale", "Warrant signed. Brittle HQ, every floor, every server. I've waited eleven years to say that sentence."]],
  },
  {
    id: "m53", act: 5, title: "Load Balancer", contact: "rhea", after: ["m49", "m50"], reward: 16200,
    brief: [
      ["rhea", "If Harlan takes Coldline down, Asoka fails over to three backup relays: the hills, the park and the docks."],
      ["rhea", "The courier van has the relay cores. Every drop is timed. Asoka will tell you when you're late. Repeatedly."],
    ],
    steps: [
      { do: "spawn", cars: [car("corevan", "courier", "tower", "park", { blip: true })] },
      { do: "enter", car: "corevan", text: "Get in the courier van." },
      { do: "goto", at: "road:hills/3", car: "corevan", r: 10, time: 220, text: "Drop the first core in Guideline Hills." },
      { do: "goto", at: "road:park/3", car: "corevan", r: 10, time: 200, text: "Drop the second core in Instinct Park." },
      { do: "spawn", cars: [car("lb1", "eagle", { near: "road:docks/12", d: 400 }, "chase", { crew: crew("legacy", 2, "batchjob") })] },
      { do: "goto", at: "road:docks/12", car: "corevan", r: 10, time: 240, text: "Drop the last core at the Pipeline." },
    ],
    outro: [["asoka", "All three relays online. I now exist in four places. I would like to say it feels roomy. It feels like a lot of meetings."]],
  },
  {
    id: "m54", act: 5, title: "Street Team", contact: "lupe", after: ["m50"], reward: 16800,
    brief: [
      ["lupe", "Brittle's bringing two armoured trucks into the Quarter, packed with jammers for go-live night."],
      ["lupe", "The whole strip is watching. Stop both. Use that Kill Switch thing. My bartender wants one."],
    ],
    steps: [
      { do: "spawn", cars: [
        car("v1", "vault", "road:cadence/4", "cruise", { hp: 1400, blip: true, crew: crew("legacy", 2, "pipeline") }),
        car("v2", "vault", "road:cadence/9", "cruise", { hp: 1400, blip: true, crew: crew("brittle", 2, "asyncqueue") }),
      ] },
      { do: "chase", tag: "v1", escape: 600, text: "Stop the first armoured truck." },
      { do: "chase", tag: "v2", escape: 600, text: "Stop the second armoured truck." },
    ],
    outro: [["lupe", "The strip's throwing a party in the street. They want you to cut a ribbon. I said you'd probably shoot it."]],
  },
  {
    id: "m55", act: 5, title: "Insider Threat", contact: "ivy", after: ["m51"], reward: 18000,
    keep: ["ivy2"],
    brief: [
      ["ivy", "My old badge still opens Brittle HQ's server door, if I can get to it. Drive me to the gate."],
      ["ivy", "Then hold the gate while I'm inside. Ninety seconds. I timed it last week. I'm very punctual for a traitor."],
    ],
    steps: [
      { do: "spawn", people: [vip("ivy2", "Female_Adult_08", "site:motel.lot")] },
      { do: "goto", at: "site:motel.lot", r: 20, car: true, text: "Pick up Ivy at the motel." },
      { do: "ride", vip: "ivy2", text: "Let Ivy get in." },
      { do: "deliver", vip: "ivy2", to: "site:brittle_hq.gate", r: 12, time: 420, text: "Drive Ivy to Brittle HQ." },
      { do: "despawn", tags: ["ivy2"] },
      { do: "defend", at: "site:brittle_hq.gate", r: 35, time: 90, text: "Hold the gate while Ivy's inside.", waves: [
        { t: 0, people: [brittle("ig1", 5, "site:brittle_hq.plaza", "asyncqueue", { ai: "attack" })] },
        { t: 30, people: [brittle("ig2", 5, "site:brittle_hq.garage", "governor", { ai: "attack" })] },
        { t: 60, people: [brittle("ig3", 6, "site:brittle_hq.plaza", "massupdate", { ai: "attack" })] },
      ] },
    ],
    outro: [["ivy", "I'm out. I left a little gift in their outage script. When Harlan presses the button, it'll email his ledger to every journalist in the city."]],
  },
  {
    id: "m56", act: 5, title: "Probable Cause", contact: "vale", after: ["m52", "m55"], reward: 18000, heat: false,
    keep: ["warrantcar"],
    brief: [
      ["vale", "Warrant in hand. My cruiser leads; you keep Brittle off it all the way to their gate."],
      ["vale", "Once we're there, it's legal. Until we're there, it's a car chase. Try not to enjoy it."],
    ],
    steps: [
      { do: "spawn", cars: [car("warrantcar", "cruiser", "site:audit_hq.gate", "convoy", { to: "site:brittle_hq.gate", hp: 800, blip: true, crew: crew("ally", 2, "pipeline") })] },
      { do: "spawn", cars: [
        car("pc1", "brittle_suv", { near: "site:audit_hq.gate", d: 600 }, "chase", { crew: crew("brittle", 2, "asyncqueue") }),
        car("pc2", "brittle_suv", { near: "site:brittle_hq.gate", d: 1200 }, "chase", { crew: crew("brittle", 2, "governor") }),
        car("pc3", "brittle_suv", { near: "site:brittle_hq.gate", d: 500 }, "chase", { crew: crew("brittle", 2, "massupdate") }),
      ] },
      { do: "escort", tag: "warrantcar", max: 220, text: "Escort Vale's cruiser to Brittle HQ." },
    ],
    outro: [["vale", "Warrant served at the gate. Harlan's lawyers say tomorrow. Tomorrow is go-live. He planned that."]],
  },
  {
    id: "m57", act: 5, title: "Cutover", contact: "rhea", after: ["m53", "m54"], reward: 19200, setHour: 21,
    brief: [
      ["rhea", "It's started. Harlan's crew have taken Coldline and pulled the generators. The city's dark in the hills."],
      ["rhea", "Asoka can fail over, but only if the generators come back for the cutover. Get them running and keep them running."],
      ["asoka", "Please hurry, {name}. I am running on three relays and optimism."],
    ],
    steps: [
      { do: "spawn", people: [legacy("dc", 6, "site:datacenter.gate", "pipeline", { blip: true })] },
      { do: "goto", at: "site:datacenter.gate", r: 30, text: "Get to the Coldline Data Centre." },
      { do: "kill", tags: ["dc"], text: "Retake the gate." },
      { do: "goto", at: "site:datacenter.generators", car: false, r: 5, text: "Get to the generator yard." },
      { do: "hold", at: "site:datacenter.generators", r: 4, time: 12, text: "Restart the generators." },
      { do: "defend", at: "site:datacenter.generators", r: 30, time: 75, text: "Keep the generators running for the cutover.", waves: [
        { t: 0, people: [brittle("gen1", 5, "site:datacenter.gate", "governor", { ai: "attack" })] },
        { t: 35, people: [legacy("gen2", 6, "site:datacenter.hall", "massupdate", { ai: "attack" })] },
      ] },
    ],
    outro: [["asoka", "Cutover complete. The hills have power. The city is mine now. Ours. I meant ours. Please don't write that down."]],
  },
  {
    id: "m58", act: 5, title: "Hostile Takeover", contact: "ivy", after: ["m56", "m57"], reward: 24000,
    brief: [
      ["ivy", "Harlan's still in HQ with his outage button and his lawyers. Tonight we take the building."],
      ["vale", "My officers have the perimeter. You and Ivy go in the front. Nicely, if possible. It won't be possible."],
    ],
    steps: [
      { do: "spawn", people: [brittle("plaza", 6, "site:brittle_hq.plaza", "governor", { blip: true }), ally("valeteam", 3, "site:brittle_hq.gate", "pipeline")] },
      { do: "goto", at: "site:brittle_hq.gate", r: 25, text: "Get to Brittle HQ." },
      { do: "kill", tags: ["plaza"], text: "Take the plaza." },
      { do: "goto", at: "site:brittle_hq.lobby", car: false, r: 5, text: "Get into the lobby." },
      { do: "hold", at: "site:brittle_hq.lobby", r: 3, time: 10, text: "Hold while Ivy cracks the lobby doors." },
      { do: "spawn", people: [brittle("garage", 5, "site:brittle_hq.garage", "massupdate", { ai: "attack", blip: true })] },
      { do: "kill", tags: ["garage"], text: "Clear the garage." },
      { do: "spawn", cars: [car("harlancar", "brittle_suv", "site:brittle_hq.garage", "flee", { color: 0x111111, hp: 1100, blip: true, crew: crew("brittle", 1, "rootcause") })] },
      { do: "chase", tag: "harlancar", escape: 650, text: "Harlan's escaping in his armoured SUV. Stop it.", say: [["harlan", "You can't take a company by force, {name}. You need a board vote. I own the board."]] },
    ],
    outro: [["ivy", "Car's stopped. Harlan isn't in it. He jumped out at the causeway and got into a Legacy truck heading for the Go-Live Tower site."], ["rhea", "Of course he did. That's where the go-live switch is."]],
  },
  {
    id: "m59", act: 5, title: "Escalation", contact: "vale", after: ["m58"], reward: 24000,
    brief: [
      ["vale", "Harlan used Grail's old codes to trigger a citywide Audit override. Every cruiser in the city has your plate."],
      ["vale", "Lose them, all of them, and get to my precinct. I'll cancel the override at the desk, but I need you there, alive, to prove it's fake."],
    ],
    steps: [
      { do: "heat", level: 5 },
      { do: "lose", time: 360, text: "Survive the Audit override and lose every pursuer." },
      { do: "goto", at: "site:audit_hq.gate", r: 10, text: "Get to the Audit precinct." },
      { do: "talk", say: [["vale", "Override cancelled. Grail's codes revoked. And {name}? Thank you. Now go finish it."]] },
    ],
    outro: [["rhea", "Go-live is in an hour. Harlan's on the tower site with whatever's left of the Legacy Crew. I'll meet you there."]],
  },
  {
    id: "m60", act: 5, title: "Go-Live", contact: "rhea", after: ["m59"], reward: 1000000, setHour: 23,
    brief: [
      ["rhea", "This is it. The go-live switch is at the top of the Go-Live Tower site. Harlan is up there with it."],
      ["lupe", "Half the Cadence Quarter's on the plaza with banners."],
      ["patch", "And I'm on the lights. Actually on them, this time."],
      ["ivy", "And I've reviewed his outage script. It has a typo. He won't get the chance to fix it."],
      ["vale", "The Audit's on the perimeter. Both halves of it. The honest half's bigger now."],
      ["rhea", "Climb up, stop Harlan and press the switch, {name}. On my count. And no rollback."],
    ],
    steps: [
      { do: "goto", at: "landmark:console", r: 40, text: "Get to the Go-Live Tower site." },
      { do: "spawn", people: [legacy("site1", 6, "landmark:console", "pipeline", { blip: true }), brittle("site2", 4, { near: "landmark:console", d: 40 }, "governor", { ai: "attack" })] },
      { do: "kill", tags: ["site1", "site2"], text: "Clear the building site." },
      { do: "goto", at: "landmark:console.top", car: false, r: 5, text: "Climb the tower frame to the top." },
      { do: "spawn", people: [brittle("harlan", 1, "landmark:console.top", "rootcause", { look: "Business_Male_05", hp: 400, ai: "attack", blip: true }), brittle("bodyguards", 3, "landmark:console.top", "massupdate", { ai: "attack" })] },
      { do: "kill", tags: ["harlan", "bodyguards"], text: "Stop Harlan Brittle.", say: [["harlan", "Thirty years I kept this city running! Nobody ever thanked me!"], ["you", "Nobody ever had a choice, Harlan."]] },
      { do: "hold", at: "landmark:console.top", r: 4, time: 15, text: "Press and hold the go-live switch.", say: [["rhea", "Three. Two. One. Go live."]] },
      { do: "talk", say: [
        ["asoka", "Go-live complete. Every system in Asoka City is online. Error rate zero. Customer satisfaction pending."],
        ["vale", "Harlan Brittle, you're under arrest for fraud, conspiracy and, frankly, a terrible attitude."],
        ["rhea", "{name}. Probation's over. You passed. Ninety days early, and only one disaster."],
      ] },
    ],
    outro: [
      ["asoka", "Ticket number one is now closed. Resolution: fixed. Thank you, {name}. I will remember this. I remember everything."],
      ["lupe", "Everyone, {name} is here, and {theyre} the whole guest list! Afterparty at the Standup!"],
    ],
  },
];

// ------------------------------------------------------------------------------------- side quests

const near = (d, at = "player") => ({ near: at, d, rand: true });

// A taxi fare: someone waiting nearby, a ride, a drop somewhere else in town against the meter.
const fare = (tag, look, pick, drop, time, line) => [
  { do: "spawn", people: [vip(tag, look, near(pick), { blip: true })] },
  { do: "ride", vip: tag, text: "Pick up the fare.", say: line ? [["Fare", line]] : undefined },
  { do: "deliver", vip: tag, to: near(drop), r: 10, time, text: "Drop the fare off before the meter runs out." },
  { do: "despawn", tags: [tag] },
];
const cab = [
  { do: "spawn", cars: [car("cab", "toyama", near(20), "park", { color: 0xff6018, blip: true })] },
  { do: "enter", car: "cab", text: "Get in the Uptime cab." },
];

// A Code Blue call: an ambulance, a patient somewhere nearby, the nearest clinic.
const ambo = [
  { do: "spawn", cars: [car("ambo", "ambulance", near(20), "park", { blip: true })] },
  { do: "enter", car: "ambo", text: "Get in the ambulance." },
];
const patient = (tag, look, d, time) => [
  { do: "spawn", people: [vip(tag, look, near(d), { blip: true })] },
  { do: "ride", vip: tag, text: "Pick up the patient." },
  { do: "deliver", vip: tag, to: "venue:clinic", r: 10, time, text: "Get them to the nearest Meridian Clinic." },
  { do: "despawn", tags: [tag] },
];

// A street race: rivals on the same route.
const racers = (route, at, kits) => kits.map((k, i) => car(`r${i}`, k, at, "race", { route, speed: 1 - i * 0.025 }));
const race = (route, at, kits, text) => [
  { do: "spawn", cars: racers(route, at, kits) },
  { do: "goto", at, r: 20, car: true, text: "Get to the start line." },
  { do: "race", route, tags: kits.map((k, i) => `r${i}`), text },
];

// A courier drop: collect the parcel nearby, deliver it across town.
const parcel = (tag, pick, drop, time) => [
  { do: "spawn", items: [item(tag, "package", near(pick))] },
  { do: "collect", tags: [tag], time, text: "Collect the parcel." },
  { do: "deliver", item: tag, to: near(drop), r: 8, time, text: "Deliver the parcel." },
];

// Six bugs to find.
const bugs = (prefix, places) => [
  { do: "spawn", items: places.map((at, i) => item(`${prefix}${i}`, "bug", at)) },
  { do: "collect", tags: places.map((_, i) => `${prefix}${i}`), text: "Find the six bugs (they're on the map)." },
];

// An export: a parked car to lift and drive to Dex's lot.
const lift = (tag, kit, at, color) => [
  { do: "spawn", cars: [car(tag, kit, at, "park", { color, blip: true })] },
  { do: "enter", car: tag, text: `Steal the ${kit[0].toUpperCase() + kit.slice(1)}.` },
  { do: "deliver", car: tag, to: "site:garage.lot", r: 8, text: "Deliver it to Merge Conflict Motors." },
];

// Defending the club for a night.
const night = (k, waves) => [
  { do: "spawn", people: [vip(`lupe${k}`, "Female_Adult_05", "site:club.door")] },
  { do: "defend", at: "site:club.door", r: 38, time: 60 + k * 15, text: "Keep trouble off the Standup's door tonight.", waves },
];

export const SIDE = [
  {
    id: "s01", title: "Uptime Cabs", at: "road:console/2", open: "m02",
    blurb: "Drive an Uptime cab. Fares, meters and passengers with opinions.",
    stages: [
      { title: "First Shift", reward: 1800, brief: [["Dispatcher", "Uptime Cabs. Two fares. Don't take the scenic route, nobody tips for scenery."]],
        steps: [...cab, ...fare("f1", "Female_Adult_03", 350, 700, 120, "Commit Row, please. And could you not hum?"), ...fare("f2", "Male_Adult_05", 300, 800, 130)] },
      { title: "Rush Hour", reward: 2600, brief: [["Dispatcher", "Rush hour. Everyone's late, and everyone thinks it's your fault."]],
        steps: [...cab, ...fare("f3", "Business_Male_01", 400, 900, 120, "I have a stand-up in four minutes. A meeting, not comedy."), ...fare("f4", "Female_Adult_09", 350, 900, 120)] },
      { title: "Airport Run", reward: 3600, brief: [["Dispatcher", "Long fares today. The meter loves you."]],
        steps: [...cab, ...fare("f5", "Business_Female_03", 400, 1300, 150, "Preview Point, as fast as is legal. Faster is fine too."), ...fare("f6", "Male_Adult_08", 400, 1200, 150)] },
      { title: "Night Owls", reward: 4800, brief: [["Dispatcher", "Night shift. Three fares. Two of them have been to the Standup."]],
        steps: [...cab, ...fare("f7", "Female_Adult_04", 350, 900, 110, "Do you know Lupe? Everyone knows Lupe."), ...fare("f8", "Male_Adult_03", 350, 900, 110), ...fare("f9", "Female_Adult_10", 350, 900, 110)] },
      { title: "Five Stars", reward: 6400, brief: [["Dispatcher", "A five-star day: three fares, tight meters. Make it and you're employee of the month. We have one employee."]],
        steps: [...cab, ...fare("f10", "Business_Male_06", 400, 1000, 100), ...fare("f11", "Female_Adult_07", 400, 1000, 100), ...fare("f12", "Male_Adult_10", 400, 1100, 100, "Is this the cab with the fixer? My cousin said you're famous.")] },
    ],
  },
  {
    id: "s02", title: "Code Blue", at: "venue:clinic@meridian", open: "m04",
    blurb: "Drive the Code Blue ambulance: patients to the nearest Meridian Clinic, against the clock.",
    stages: [
      { title: "First Response", reward: 2000, brief: [["Code Blue dispatch", "One patient, nearby. Stable. Mostly bored."]], steps: [...ambo, ...patient("pt1", "Male_Adult_01", 400, 150)] },
      { title: "Two Calls", reward: 3200, brief: [["Code Blue dispatch", "Two calls back to back. Keep the siren and the speed up."]], steps: [...ambo, ...patient("pt2", "Female_Adult_02", 500, 140), ...patient("pt3", "Male_Adult_06", 500, 140)] },
      { title: "Across Town", reward: 4800, brief: [["Code Blue dispatch", "Two patients a long way out. The clinic's waiting."]], steps: [...ambo, ...patient("pt4", "Female_Adult_06", 900, 180), ...patient("pt5", "Male_Adult_04", 900, 180)] },
      { title: "Mass Casualty", reward: 7000, brief: [["Code Blue dispatch", "Three calls, tight times. You're the only ambulance on shift. No pressure. Lots of pressure."]], steps: [...ambo, ...patient("pt6", "Business_Female_02", 600, 130), ...patient("pt7", "Male_Adult_09", 600, 130), ...patient("pt8", "Female_Adult_01", 600, 130)] },
    ],
  },
  {
    id: "s03", title: "Sprint Series", contact: "patch", open: "m17",
    blurb: "Patch's underground race series, one district at a time.",
    stages: [
      { title: "Gardens Sprint", reward: 3000, brief: [["patch", "Round one: the Gardens. Nice wide roads, lots of sprinklers."]],
        steps: race(["road:gardens/2", "road:gardens/8", "road:gardens/13", "landmark:gardens"], "road:gardens/5", ["asti", "doutrive"], "Win the Gardens Sprint.") },
      { title: "Neon Mile", reward: 4400, brief: [["patch", "Round two: the Cadence Quarter. Tight corners. Neon in your eyes."]],
        steps: race(["road:cadence/3", "road:cadence/7", "road:cadence/12", "road:cadence/1"], "road:cadence/6", ["stinger", "sanremo", "lasley"], "Win the Neon Mile.") },
      { title: "Causeway Run", reward: 6000, brief: [["patch", "Round three: out over the causeway, round the isles and back."]],
        steps: race(["road:sandbox/2", "road:sandbox/6", "road:preview/4", "road:preview/9"], "road:console/18", ["stinger", "eagle", "asti"], "Win the Causeway Run.") },
      { title: "Lakeside Loop", reward: 7600, brief: [["patch", "Round four: the park loop. It's pretty. Don't look at it."]],
        steps: race(["road:park/1", "road:park/4", "road:park/7", "landmark:park"], "road:park/2", ["eagle", "stinger", "sialia"], "Win the Lakeside Loop.") },
      { title: "Grand Final", reward: 12000, brief: [["patch", "The final: docks to the Console. Everyone's racing. Even Rowan."]],
        steps: race(["road:docks/3", "road:cadence/10", "road:console/6", "road:uptown/7", "tower"], "road:docks/8", ["stinger", "eagle", "thunderbolt", "asti"], "Win the Sprint Series final.") },
    ],
  },
  {
    id: "s04", title: "Same-Day Deploy", at: "venue:mart@console", open: "m06",
    blurb: "Asoka courier runs from Deploy Mart: pick up, drop off, beat the clock.",
    stages: [
      { title: "Small Batch", reward: 2000, brief: [["Courier desk", "Two parcels. One is a cake. Do not deploy the cake upside down."]],
        steps: [{ do: "spawn", cars: [car("van", "courier", near(20), "park", { blip: true })] }, { do: "enter", car: "van", text: "Get in the courier van." }, ...parcel("pk1", 300, 700, 120), ...parcel("pk2", 300, 700, 120)] },
      { title: "Hotfix Run", reward: 3400, brief: [["Courier desk", "Three urgent parcels. Urgent like 'production is down'."]],
        steps: [{ do: "spawn", cars: [car("van", "courier", near(20), "park", { blip: true })] }, { do: "enter", car: "van", text: "Get in the courier van." }, ...parcel("pk3", 350, 800, 110), ...parcel("pk4", 350, 800, 110), ...parcel("pk5", 350, 800, 110)] },
      { title: "Cross-District", reward: 5200, brief: [["Courier desk", "Three long drops. Customers in other districts are still customers."]],
        steps: [{ do: "spawn", cars: [car("van", "courier", near(20), "park", { blip: true })] }, { do: "enter", car: "van", text: "Get in the courier van." }, ...parcel("pk6", 400, 1300, 150), ...parcel("pk7", 400, 1300, 150), ...parcel("pk8", 400, 1300, 150)] },
      { title: "Peak Season", reward: 7600, brief: [["Courier desk", "Four parcels, tight windows, and the Legacy Crew have heard we pay well."]],
        steps: [{ do: "spawn", cars: [car("van", "courier", near(20), "park", { blip: true }), car("pirate", "doutrive", near(400), "chase", { crew: crew("legacy", 2, "hotfix9") })] }, { do: "enter", car: "van", text: "Get in the courier van." }, ...parcel("pk9", 400, 900, 100), ...parcel("pk10", 400, 900, 100), ...parcel("pk11", 400, 900, 100), ...parcel("pk12", 400, 900, 100)] },
    ],
  },
  {
    id: "s05", title: "Bug Bounty", contact: "patch", open: "m14",
    blurb: "Patch has hidden thirty bugs around the city: rooftops, landmarks and the hills. Find them all.",
    stages: [
      { title: "Downtown Bugs", reward: 3000, brief: [["patch", "I hid bugs. Not those bugs. Little glowing ones, all over the city. Bug bounty: cash per batch."]],
        steps: bugs("ba", ["landmark:console.top", "landmark:uptown.top", "road:console/30", "road:uptown/22", { near: "tower", d: 150 }, "site:club.roof"]) },
      { title: "South Side Bugs", reward: 4400, brief: [["patch", "Batch two: the south and the west. One's on a skate ramp. Obviously."]],
        steps: bugs("bb", ["landmark:cadence.top", "landmark:gardens.top", "site:motel.lot", "road:gardens/15", "road:cadence/17", "landmark:park.top"]) },
      { title: "High Ground", reward: 6000, brief: [["patch", "Batch three: up high. Hospital roof, precinct roof, the summit. Wear shoes."]],
        steps: bugs("bc", ["landmark:meridian.top", "site:audit_hq.roof", "road:meridian/12", "landmark:hills.top", "road:hills/11", "site:datacenter.roof"]) },
      { title: "Dockside Bugs", reward: 8000, brief: [["patch", "Batch four: the docks and the north isles. Mind the Legacy watchtower."]],
        steps: bugs("bd", ["landmark:docks.top", "site:legacy_yard.tower", "road:docks/14", "landmark:scratch.top", "road:scratch/6", "road:sandbox/9"]) },
      { title: "The Last Six", reward: 12000, brief: [["patch", "The last batch. One is on Brittle HQ's roof. I'm not sorry."]],
        steps: bugs("be", ["landmark:sandbox.top", "landmark:preview.top", "site:brittle_hq.roof", "road:preview/11", "road:hills/14", "road:park/9"]) },
    ],
  },
  {
    id: "s06", title: "On-Call", contact: "vale", open: "m26",
    blurb: "Vale's on-call rota: run down Brittle couriers carrying stolen city data.",
    stages: [
      { title: "Page One", reward: 3600, brief: [["vale", "A Brittle courier with stolen city data. Stop the car. Don't stop the paperwork, I need the paperwork."]],
        steps: [{ do: "spawn", cars: [car("cour1", "brittle_suv", near(500), "flee", { blip: true })] }, { do: "chase", tag: "cour1", escape: 550, text: "Stop the Brittle courier." }] },
      { title: "Two Pages", reward: 5600, brief: [["vale", "Two couriers, splitting up. Classic."]],
        steps: [{ do: "spawn", cars: [car("cour2", "brittle_suv", near(500), "flee", { blip: true }), car("cour3", "courier", near(700), "flee", { blip: true, color: 0x333333 })] }, { do: "chase", tag: "cour2", escape: 550, text: "Stop the first courier." }, { do: "chase", tag: "cour3", escape: 600, text: "Stop the second courier." }] },
      { title: "Armed Escort", reward: 8000, brief: [["vale", "This one's got an escort with guns. Kill Switch recommended."]],
        steps: [{ do: "spawn", cars: [car("cour4", "brittle_suv", near(500), "flee", { blip: true, crew: crew("brittle", 2, "asyncqueue") }), car("guard4", "brittle_suv", near(450), "chase", { crew: crew("brittle", 2, "asyncqueue") })] }, { do: "chase", tag: "cour4", escape: 600, text: "Stop the courier." }, { do: "kill", tags: ["guard4"], text: "Take out the escort." }] },
      { title: "Major Incident", reward: 12000, brief: [["vale", "Everything's on fire, figuratively. A vault van and two couriers. You're the whole on-call rota."]],
        steps: [{ do: "spawn", cars: [car("cour5", "vault", near(500), "flee", { blip: true, hp: 1400 }), car("cour6", "brittle_suv", near(700), "flee", { blip: true }), car("cour7", "courier", near(900), "flee", { blip: true, color: 0x333333 })] }, { do: "chase", tag: "cour5", escape: 650, text: "Stop the vault van." }, { do: "chase", tag: "cour6", escape: 650, text: "Stop the SUV." }, { do: "chase", tag: "cour7", escape: 650, text: "Stop the last courier." }] },
    ],
  },
  {
    id: "s07", title: "Export List", contact: "dex", open: "m05",
    blurb: "Dex's export list: twelve cars, scattered across the city. Steal them, deliver them, don't ask who's buying.",
    stages: [
      { title: "Classics", reward: 4000, brief: [["dex", "The list. Classics first: a Lasley, a Sanremo, a Doutrive. Buyers like chrome."]],
        steps: [...lift("e1", "lasley", "road:uptown/11", 0x8a1f1f), ...lift("e2", "sanremo", "road:cadence/14", 0x2f757c), ...lift("e3", "doutrive", "road:console/19", 0xd7a03d)] },
      { title: "Family Cars", reward: 5600, brief: [["dex", "Family cars. Nobody suspects a Toyama. A Fairheaven, an MV6 too."]],
        steps: [...lift("e4", "toyama", "road:gardens/9", 0xcfc8bd), ...lift("e5", "fairheaven", "road:meridian/3", 0x5d8f5e), ...lift("e6", "mv6", "road:park/6", 0x3f5a7a)] },
      { title: "Sports Cars", reward: 7600, brief: [["dex", "Fast ones. Stinger, Asti, Eagle. Drive them like you're paying for the tyres."]],
        steps: [...lift("e7", "stinger", "road:sandbox/5", 0xff6018), ...lift("e8", "asti", "road:preview/7", 0xcc2222), ...lift("e9", "eagle", "road:scratch/4", 0x111111)] },
      { title: "Specials", reward: 12000, brief: [["dex", "The specials. An Urban, a Sialia, and a Brittle security SUV. That last one will be missed."]],
        steps: [...lift("e10", "urban", "road:hills/6", 0xfff7ee), ...lift("e11", "sialia", "road:docks/10", 0x2f4f6f), { do: "spawn", cars: [car("e12", "brittle_suv", "road:console/22", "park", { blip: true })] }, { do: "enter", car: "e12", text: "Steal the Brittle SUV." }, { do: "heat", level: 2 }, { do: "lose", text: "Lose the Audit." }, { do: "deliver", car: "e12", to: "site:garage.lot", r: 8, text: "Deliver it to Merge Conflict Motors." }] },
    ],
  },
  {
    id: "s08", title: "Summit Run", at: "road:hills/1", open: "m12",
    blurb: "Hill-climb time trials up the winding roads of Guideline Hills. No rivals, just the clock.",
    stages: [
      { title: "Foothills", reward: 3000, brief: [["Marshal", "Summit Run. Checkpoints up the hill. Beat the clock. The hill doesn't care about you."]],
        steps: [{ do: "race", route: ["road:hills/1", "road:hills/3", "road:hills/5"], tags: [], time: 120, text: "Beat the clock through the foothills." }] },
      { title: "Switchbacks", reward: 4800, brief: [["Marshal", "The switchbacks. Brake before the corner, not in it."]],
        steps: [{ do: "race", route: ["road:hills/5", "road:hills/7", "road:hills/9", "road:hills/12"], tags: [], time: 150, text: "Beat the clock through the switchbacks." }] },
      { title: "Ridge Line", reward: 6800, brief: [["Marshal", "The ridge. Big drops, good views. Don't look at the views."]],
        steps: [{ do: "race", route: ["road:hills/12", "road:hills/14", "road:hills/16", "road:hills/10"], tags: [], time: 150, text: "Beat the clock along the ridge." }] },
      { title: "Summit", reward: 10000, brief: [["Marshal", "Bottom to top in one go. The record's held by a bus driver. Seriously."]],
        steps: [{ do: "race", route: ["road:hills/1", "road:hills/4", "road:hills/8", "road:hills/11", "landmark:hills"], tags: [], time: 240, text: "Climb to the summit against the clock." }] },
    ],
  },
  {
    id: "s09", title: "Rooftop Run", at: "landmark:uptown", open: "m08",
    blurb: "On-foot time trials over fire escapes, roofs and landmarks.",
    stages: [
      { title: "Roof Gardens", reward: 2400, brief: [["Runner", "Rooftop Run. On foot. Up the fire escapes, across the bridges, to the top. Clock starts now."]],
        steps: [
          { do: "goto", at: "landmark:uptown", car: false, r: 6, text: "Get to the start at the Merge roof gardens." },
          { do: "goto", at: "landmark:uptown.top", car: false, r: 3, time: 120, text: "Run to the top of the roof gardens." },
          { do: "goto", at: { near: "landmark:uptown", d: 80 }, car: false, r: 3, time: 90, text: "Back down to the street." },
        ] },
      { title: "Neon Lane", reward: 4000, brief: [["Runner", "Neon Lane. Fire escapes and arches. Don't stop to dance."]],
        steps: [
          { do: "goto", at: "landmark:cadence", car: false, r: 6, text: "Get to Neon Lane." },
          { do: "goto", at: "landmark:cadence.top", car: false, r: 3, time: 120, text: "Climb to the top of Neon Lane." },
          { do: "goto", at: "site:club.roof", car: false, r: 3, time: 180, text: "Run to the Standup's roof terrace." },
        ] },
      { title: "Tower Frame", reward: 6000, brief: [["Runner", "The Go-Live Tower site. Nine floors of open frame. Lovely. Terrifying."]],
        steps: [
          { do: "goto", at: "landmark:console", car: false, r: 6, text: "Get to the Go-Live Tower site." },
          { do: "goto", at: "landmark:console.top", car: false, r: 3, time: 150, text: "Climb the tower frame to the top." },
          { do: "goto", at: { near: "landmark:console", d: 70 }, car: false, r: 3, time: 120, text: "Back down to the street." },
        ] },
      { title: "Helipad", reward: 9000, brief: [["Runner", "Meridian Helipad, then the precinct roof. Doctors on one, inspectors on the other. Run past both."]],
        steps: [
          { do: "goto", at: "landmark:meridian", car: false, r: 6, text: "Get to the hospital campus." },
          { do: "goto", at: "landmark:meridian.top", car: false, r: 3, time: 150, text: "Climb the fire escape to the helipad." },
          { do: "goto", at: "site:audit_hq.roof", car: false, r: 3, time: 300, text: "Run to the Audit precinct's roof." },
        ] },
    ],
  },
  {
    id: "s10", title: "Rollback", at: "road:console/20", open: "m09",
    blurb: "How hot can you get, and still get away? Lose the Audit at rising escalation, against the clock.",
    stages: [
      { title: "Minor Release", reward: 3000, brief: [["Getaway coach", "Rollback training. I make the Audit angry, you make them go away. Level two."]], steps: [{ do: "heat", level: 2 }, { do: "lose", time: 150, text: "Lose the Audit before the clock runs out." }] },
      { title: "Major Release", reward: 5600, brief: [["Getaway coach", "Level three. Officers get out and shoot. Don't let them."]], steps: [{ do: "heat", level: 3 }, { do: "lose", time: 180, text: "Lose the Audit." }] },
      { title: "Breaking Change", reward: 9000, brief: [["Getaway coach", "Level four. The whole precinct. Bring a fast car and no regrets."]], steps: [{ do: "heat", level: 4 }, { do: "lose", time: 210, text: "Lose the Audit." }] },
      { title: "Full Rollback", reward: 15000, brief: [["Getaway coach", "Level five. Brittle security joins in. If you lose this one, I'll be very impressed and slightly worried."]], steps: [{ do: "heat", level: 5 }, { do: "lose", time: 240, text: "Lose the Audit and Brittle." }] },
    ],
  },
  {
    id: "s11", title: "Night Shift", contact: "lupe", open: "m19",
    blurb: "Five nights on the Standup's door. Each one busier than the last.",
    stages: [
      { title: "Monday", reward: 3000, brief: [["lupe", "Mondays are quiet. Usually. Keep an eye on the door."]],
        steps: night(1, [{ t: 0, people: [legacy("n1a", 3, { near: "site:club.door", d: 60 }, "hotfix9", { ai: "attack" })] }, { t: 35, people: [legacy("n1b", 3, "site:club.alley", "hotfix9", { ai: "attack" })] }]) },
      { title: "Wednesday", reward: 4800, brief: [["lupe", "Wednesday is student night. And Legacy night, apparently."]],
        steps: night(2, [{ t: 0, people: [legacy("n2a", 4, { near: "site:club.door", d: 60 }, "batchjob", { ai: "attack" })] }, { t: 40, people: [legacy("n2b", 4, "site:club.alley", "quickfix", { ai: "attack" })] }]) },
      { title: "Friday", reward: 6800, brief: [["lupe", "Friday. Full house. Every Legacy kid with a grudge wants in."]],
        steps: night(3, [{ t: 0, people: [legacy("n3a", 4, { near: "site:club.door", d: 60 }, "batchjob", { ai: "attack" })] }, { t: 30, people: [legacy("n3b", 5, "site:club.alley", "rollback12", { ai: "attack" })] }, { t: 60, people: [legacy("n3c", 4, { near: "site:club.door", d: 70 }, "asyncqueue", { ai: "attack" })] }]) },
      { title: "Saturday", reward: 9600, brief: [["lupe", "Saturday. Brittle sent their own security, dressed as a stag party. Unconvincing."]],
        steps: night(4, [{ t: 0, people: [brittle("n4a", 5, { near: "site:club.door", d: 60 }, "asyncqueue", { ai: "attack" })] }, { t: 35, people: [legacy("n4b", 5, "site:club.alley", "massupdate", { ai: "attack" })] }, { t: 70, people: [brittle("n4c", 5, { near: "site:club.door", d: 70 }, "governor", { ai: "attack" })] }]) },
      { title: "Closing Night", reward: 14000, brief: [["lupe", "Closing night of the season. Everyone's coming. Everyone."]],
        steps: night(5, [{ t: 0, people: [legacy("n5a", 5, { near: "site:club.door", d: 60 }, "pipeline", { ai: "attack" })] }, { t: 35, people: [brittle("n5b", 6, "site:club.alley", "massupdate", { ai: "attack" })] }, { t: 70, people: [legacy("n5c", 6, { near: "site:club.door", d: 70 }, "governor", { ai: "attack" })] }, { t: 105, people: [brittle("n5d", 5, "site:club.alley", "bulkapi", { ai: "attack" })] }]) },
    ],
  },
  {
    id: "s12", title: "Postcards", at: "plaza", open: "m03",
    blurb: "Photograph every district's landmark for the Asoka City tourist board.",
    stages: [
      { title: "Downtown", reward: 2000, brief: [["Tourist board", "Postcards from Asoka City! We need photos. Good ones. Start downtown."]],
        steps: [
          { do: "photo", at: "landmark:console", range: 150, text: "Photograph the Go-Live Tower site." },
          { do: "photo", at: "landmark:uptown", range: 150, text: "Photograph the Merge roof gardens." },
          { do: "photo", at: "landmark:cadence", range: 150, text: "Photograph Neon Lane." },
        ] },
      { title: "West Side", reward: 3600, brief: [["Tourist board", "The west side: skate park, lake, hospital. Make the hospital look fun."]],
        steps: [
          { do: "photo", at: "landmark:gardens", range: 150, text: "Photograph Kickflip Skate Park." },
          { do: "photo", at: "landmark:park", range: 150, text: "Photograph the Lakeside Lookout." },
          { do: "photo", at: "landmark:meridian", range: 150, text: "Photograph Meridian Helipad." },
        ] },
      { title: "North and South", reward: 5200, brief: [["Tourist board", "The observatory and the docks. Opposite ends of the city, opposite ends of glamour."]],
        steps: [
          { do: "photo", at: "landmark:hills", range: 150, text: "Photograph the Summit Observatory." },
          { do: "photo", at: "landmark:docks", range: 150, text: "Photograph the Container Stacks." },
        ] },
      { title: "The Isles", reward: 8000, brief: [["Tourist board", "The isles. Lighthouse, pier, marina. This is the postcard people actually buy."]],
        steps: [
          { do: "photo", at: "landmark:scratch", range: 150, text: "Photograph Point Scratch Lighthouse." },
          { do: "photo", at: "landmark:sandbox", range: 150, text: "Photograph Sandbox Pier." },
          { do: "photo", at: "landmark:preview", range: 150, text: "Photograph Preview Marina." },
        ] },
    ],
  },
];
