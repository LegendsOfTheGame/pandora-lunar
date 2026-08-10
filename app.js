/* Adventurer's Ledger — Pandora Lunar
   Self-serve, per-browser FFXIV progression tracker. Nothing here talks to a server —
   everything lives in this browser's localStorage. Up to 3 characters per browser;
   more than that, use a second browser (separate storage origin). */

const COMBAT_JOBS = [
  ["Paladin","Tank"],["Warrior","Tank"],["Dark Knight","Tank"],["Gunbreaker","Tank"],
  ["White Mage","Healer"],["Scholar","Healer"],["Astrologian","Healer"],["Sage","Healer"],
  ["Monk","Melee"],["Dragoon","Melee"],["Ninja","Melee"],["Samurai","Melee"],["Reaper","Melee"],["Viper","Melee"],
  ["Bard","Phys R"],["Machinist","Phys R"],["Dancer","Phys R"],
  ["Black Mage","Mag R"],["Summoner","Mag R"],["Red Mage","Mag R"],["Pictomancer","Mag R"],
  ["Blue Mage","Limited",80],["Beastmaster","Limited",50]
];
const CRAFT_JOBS = ["Carpenter","Blacksmith","Armorer","Goldsmith","Leatherworker","Weaver","Alchemist","Culinarian"];
const GATHER_JOBS = ["Miner","Botanist","Fisher"];

// Physical Data Center -> Logical Data Center -> World. Structure only — deliberately no
// Standard/Preferred/Preferred+ creation-congestion tags, since those are live status that
// shifts as worlds fill up, not a fixed fact about a world. Baking them in would go stale
// within weeks; the PDC/LDC/world hierarchy itself is what's actually stable.
const SERVER_DATA = {
  "North America": {
    Aether: ["Adamantoise","Cactuar","Faerie","Gilgamesh","Jenova","Midgardsormr","Sargatanas","Siren"],
    Crystal: ["Balmung","Brynhildr","Coeurl","Diabolos","Goblin","Malboro","Mateus","Zalera"],
    Dynamis: ["Cuchulainn","Golem","Halicarnassus","Kraken","Maduin","Marilith","Rafflesia","Seraph"],
    Primal: ["Behemoth","Excalibur","Exodus","Famfrit","Hyperion","Lamia","Leviathan","Ultros"]
  },
  Europe: {
    Chaos: ["Cerberus","Louisoix","Moogle","Omega","Phantom","Ragnarok","Sagittarius","Spriggan"],
    Light: ["Alpha","Lich","Odin","Phoenix","Raiden","Shiva","Twintania","Zodiark"]
  },
  Oceania: {
    Materia: ["Bismarck","Ravana","Sephirot","Sophia","Zurvan"]
  },
  Japan: {
    Elemental: ["Aegis","Atomos","Carbuncle","Garuda","Gungnir","Kujata","Tonberry","Typhon"],
    Gaia: ["Alexander","Bahamut","Durandal","Fenrir","Ifrit","Ridill","Tiamat","Ultima"],
    Mana: ["Anima","Asura","Chocobo","Hades","Ixion","Masamune","Pandaemonium","Titan"],
    Meteor: ["Belias","Mandragora","Ramuh","Shinryu","Unicorn","Valefor","Yojimbo","Zeromus"]
  }
};

// Beast tribe / allied society reputation. Rank resets to 0 points on every rank-up — NOT
// cumulative from Neutral — confirmed against a real in-game screenshot (three different
// Friendly-rank societies all showing "X/510" regardless of total lifetime points earned).
// Quota is fixed per rank, same for every society. ARR societies plus Moogle and Vanu Vanu
// start at rank 1 (Neutral); Vath and everything Stormblood-onward starts at rank 3
// (Friendly), skipping Neutral/Recognized entirely. Rank 8 is the point-based cap for
// everyone ("Allied" for ARR societies, "Bloodsworn" for HW+); HW+ societies have a further
// rank 9 "Allied" reachable only via that expansion's Intersocietal Quests, not points —
// quota 0 for both terminal ranks, same as the wiki shows "0/0".
const SOCIETY_RANKS = [
  {rank:1, name:'Neutral',    quota:150},
  {rank:2, name:'Recognized', quota:360},
  {rank:3, name:'Friendly',   quota:510},
  {rank:4, name:'Trusted',    quota:720},
  {rank:5, name:'Respected',  quota:990},
  {rank:6, name:'Honored',    quota:1320},
  {rank:7, name:'Sworn',      quota:1730},
  {rank:8, name:'Allied/Bloodsworn', quota:0},
  {rank:9, name:'Allied',     quota:0}
];
// Which MSQ progress (same patch-number stand-in as the header field and routine gating)
// unlocks each expansion's societies. Ungated entirely if MSQ progress is blank, same as
// routine gating's default.
const SOCIETY_EXP_GATE = {
  "A Realm Reborn": 2.1, "Heavensward": 3.1, "Stormblood": 4.1,
  "Shadowbringers": 5.1, "Endwalker": 6.1, "Dawntrail": 7.1
};
// Per-expansion Intersocietal Quests — the actual gate on reaching the terminal "Allied"/
// "Bloodsworn" rank. Require having every listed society at its own point-earning cap first
// (Trusted for the four ARR societies below, Sworn for everyone else). Shadowbringers never
// got an Intersocietal Quests chain at all — Bloodsworn is the true max for Pixie/Qitari/Dwarf,
// there's no rank 9 for them.
const INTERSOCIETAL_QUESTS = {
  "A Realm Reborn": "A Realm Reborn Intersocietal Quests",
  "Heavensward": "Heavensward Intersocietal Quests",
  "Stormblood": "Stormblood Intersocietal Quests",
  "Endwalker": "Endwalker Intersocietal Quests",
  "Dawntrail": "Dawntrail Intersocietal Quests"
  // Shadowbringers deliberately has no entry — no chain exists, Bloodsworn is the cap.
};
// [name, expansion group, starting rank, last rank reachable purely by points, has a rank-9
// "Allied" tier]. Amalj'aa/Kobold/Sahagin/Sylph stop earning points at Trusted(4) — Ixal is
// the one ARR society that goes all the way to Sworn(7), same as every non-ARR society. Every
// society's points stop entirely at rank 8 (Allied for ARR, Bloodsworn for HW+); a further
// rank 9 "Allied" only exists where an Intersocietal Quests chain exists for that expansion.
const ALLIED_SOCIETIES = [
  ["Amalj'aa","A Realm Reborn",1,4,false], ["Sylph","A Realm Reborn",1,4,false],
  ["Kobold","A Realm Reborn",1,4,false], ["Sahagin","A Realm Reborn",1,4,false],
  ["Ixal","A Realm Reborn",1,7,false],
  ["Vanu Vanu","Heavensward",1,7,true], ["Moogle","Heavensward",1,7,true], ["Vath","Heavensward",3,7,true],
  ["Kojin","Stormblood",3,7,true], ["Ananta","Stormblood",3,7,true], ["Namazu","Stormblood",3,7,true],
  ["Pixie","Shadowbringers",3,7,false], ["Qitari","Shadowbringers",3,7,false], ["Dwarf","Shadowbringers",3,7,false],
  ["Arkasodara","Endwalker",3,7,true], ["Omicron","Endwalker",3,7,true], ["Loporrit","Endwalker",3,7,true],
  ["Pelupelu","Dawntrail",3,7,true], ["Mamool Ja","Dawntrail",3,7,true], ["Yok Huy","Dawntrail",3,7,true]
];
// Time Memoria sends societies keyed by the game's own BeastTribe row id, because at least
// four spellings of each society are in circulation — the sheet says "sylphs", the wiki says
// "Sylphs", this page says "Sylph". The id cannot drift; the wording can.
//
// Note 6/7/8: the plugin's ids run Vanu, Vath, Moogle while ALLIED_SOCIETIES above runs
// Vanu Vanu, Moogle, Vath. Matching by position would quietly swap two societies, which is
// exactly the kind of wrong-but-plausible result that never gets noticed.
const TM_SOCIETY_IDS = {
  1:"Amalj'aa", 2:"Sylph", 3:"Kobold", 4:"Sahagin", 5:"Ixal",
  6:"Vanu Vanu", 7:"Vath", 8:"Moogle",
  9:"Kojin", 10:"Ananta", 11:"Namazu",
  12:"Pixie", 13:"Qitari", 14:"Dwarf",
  15:"Arkasodara", 16:"Omicron", 17:"Loporrit",
  18:"Pelupelu", 19:"Mamool Ja", 20:"Yok Huy"
};
function rankInfo(rankNum){ return SOCIETY_RANKS.find(r=>r.rank===rankNum) || SOCIETY_RANKS[0]; }
function socId(name){ return name.replace(/[^a-zA-Z0-9]/g,''); }
// The actual selectable ranks for a society — not a plain range, since the four early-cap
// ARR societies skip straight from Trusted(4) to Allied(8) with no 5/6/7 in between.
function validRanksFor(name){
  const [, , startRank, capAt, hasRank9] = ALLIED_SOCIETIES.find(a=>a[0]===name);
  const ranks = [];
  for(let r=startRank; r<=capAt; r++) ranks.push(r);
  ranks.push(8);
  if(hasRank9) ranks.push(9);
  return ranks;
}

// Sourced from ffxiv.consolegameswiki.com's per-job "X_Quests" pages (fetched directly,
// not from memory). All 11 DoH/DoL jobs share the same level pattern through level 70:
// 1, 1, 5, 10, 15, ..., 50, 50, 53, ..., 70. Two entries share level 1 (class unlock, then
// first job quest) and level 50/60 (class capstone, then the next expansion's opener) —
// that's real, not a data error. DoH/DoL stop at 70 — their post-70 hub questlines
// (Crystalline Mean/The Studium/Wachumeqimeqi) aren't sourced yet.
//
// Combat jobs go all the way to 100. Past level 70 each job still has its own handful of
// private "capstone" quests (one at the top of each bracket, e.g. Paladin's "Worth Fighting
// For" at 80) but the bulk of 71-100 is ROLE quests — one shared chain per role (tank/melee/
// ranged/caster/healer), same NPCs and same quest regardless of which job in that role you're
// on. Those live in ROLE_QUESTS below, tracked separately per-role rather than duplicated into
// every job's array, so clearing "Vengeance in Defeat" on Dragoon also clears it for Ninja.
const JOB_QUESTS = {
  Carpenter: [
    {level:1,name:"Way of the Carpenter"},{level:1,name:"My First Saw"},{level:5,name:"To Be the Wood"},
    {level:10,name:"Supplies for the Sick"},{level:15,name:"A Carpenter in Need"},{level:20,name:"The Lance's Lesson"},
    {level:25,name:"A Crisis of Confidence"},{level:30,name:"Between Captain and Conjurer"},{level:35,name:"Growing Apart"},
    {level:40,name:"Memento Mori"},{level:45,name:"Gone till the Sixth Astral Moon"},{level:50,name:"Saving Captain Gairhard"},
    {level:50,name:"Lance of a Lifetime"},{level:53,name:"A-hunting He Will Go"},{level:55,name:"Ministers of Grace Defend Him"},
    {level:58,name:"The Son Also Rises"},{level:60,name:"More Fierce than Fire"},{level:60,name:"Uncharted Territory"},
    {level:63,name:"The Game of Confidence"},{level:65,name:"A Lesson in Listening"},{level:68,name:"Live and Let Dine"},
    {level:70,name:"Tea Party Rules"}
  ],
  Blacksmith: [
    {level:1,name:"Way of the Blacksmith"},{level:1,name:"My First Cross-pein Hammer"},{level:5,name:"Hammer Time"},
    {level:10,name:"Riveting Ramblings"},{level:15,name:"The Business of Blacksmithing"},{level:20,name:"By the Sweat of Your Brow"},
    {level:25,name:"True as Steel"},{level:30,name:"As Iron Sharpens Iron"},{level:35,name:"Set Faezahr to Stun"},
    {level:40,name:"Forging Ahead"},{level:45,name:"Beauty and the Bardiche"},{level:50,name:"Waiting in the Winglet"},
    {level:50,name:"Forging Northwards"},{level:53,name:"Leave It to Fremondain"},{level:55,name:"The Good Fight"},
    {level:58,name:"Blade That Was Broken"},{level:60,name:"Integrity"},{level:60,name:"A Missive from the Far East"},
    {level:63,name:"The Client is King"},{level:65,name:"Blood Ties"},{level:68,name:"The Missing Piece"},
    {level:70,name:"The Final Face-off"}
  ],
  Armorer: [
    {level:1,name:"Way of the Armorer"},{level:1,name:"My First Doming Hammer"},{level:5,name:"From Thigh to Neck"},
    {level:10,name:"The Base Fundamentals"},{level:15,name:"One's Own Worst Critic"},{level:20,name:"An Armorer's Pride"},
    {level:25,name:"Showing Your Steel"},{level:30,name:"May the Best Armorer Win"},{level:35,name:"Pans of Steel"},
    {level:40,name:"Best of Three"},{level:45,name:"For the Good of the Guild"},{level:50,name:"Rivalry and Respect"},
    {level:50,name:"The Breaking of Blanstyr"},{level:53,name:"Light-headed"},{level:55,name:"Fancy Lancer"},
    {level:58,name:"The Reforging of Blanstyr"},{level:60,name:"The Pride of Vymelli"},{level:60,name:"Original Blanstyr"},
    {level:63,name:"Eastern Apprentice"},{level:65,name:"Forging with Scales"},{level:68,name:"Head-to-head Contest"},
    {level:70,name:"A Confluence of Style"}
  ],
  Goldsmith: [
    {level:1,name:"Way of the Goldsmith"},{level:1,name:"My First Chaser Hammer"},{level:5,name:"Gorgets Rising"},
    {level:10,name:"Throw Some Rings on It"},{level:15,name:"Objectively Speaking"},{level:20,name:"A Melding of the Minds"},
    {level:25,name:"Or Ever the Silver Cord Be Loosed"},{level:30,name:"Serendipity Now"},{level:35,name:"Mammets on Fire"},
    {level:40,name:"The Horns of the Green"},{level:45,name:"The Fox in the Hen House"},{level:50,name:"Jaded"},
    {level:50,name:"Form to the Formless"},{level:53,name:"Elegance and Artistry"},{level:55,name:"Double Trouble"},
    {level:58,name:"A Masterclass"},{level:60,name:"Two Hearts Beat as One"},{level:60,name:"A Royal Request"},
    {level:63,name:"Gemworks in Progress"},{level:65,name:"Blindsided"},{level:68,name:"The Perfect Tribute"},
    {level:70,name:"Sultana Dreaming"}
  ],
  Leatherworker: [
    {level:1,name:"Way of the Leatherworker"},{level:1,name:"My First Head Knife"},{level:5,name:"A Test of Technique"},
    {level:10,name:"Geva's Gambit"},{level:15,name:"Working Hells for Leather"},{level:20,name:"Aldgoat Everything"},
    {level:25,name:"Skin in the Game"},{level:30,name:"Toadskins of the Father"},{level:35,name:"Lead by Example"},
    {level:40,name:"Brand Loyalty"},{level:45,name:"Dissension in the Ranks"},{level:50,name:"Accept No Imitations"},
    {level:50,name:"Turndown Service"},{level:53,name:"By Your Bootstraps"},{level:55,name:"Perfect Pitch"},
    {level:58,name:"From the Hoplon to the Brume"},{level:60,name:"A Winter's Sale"},{level:60,name:"A Taxing Request"},
    {level:63,name:"Mounting Expectations"},{level:65,name:"The Value of Life"},{level:68,name:"The Trouble with Taxidermy"},
    {level:70,name:"True to Life"}
  ],
  Weaver: [
    {level:1,name:"Way of the Weaver"},{level:1,name:"My First Needle"},{level:5,name:"Once More unto the Breeches"},
    {level:10,name:"Alternative Applications"},{level:15,name:"Practical Needs"},{level:20,name:"Materia Concerns"},
    {level:25,name:"That Velveteen Dress"},{level:30,name:"Miner on a Mission"},{level:35,name:"Designed by Committee"},
    {level:40,name:"A Subtle Inquiry"},{level:45,name:"The Intervention"},{level:50,name:"A Miner Reborn"},
    {level:50,name:"The Social Knitwork"},{level:53,name:"Tomboy Foolery"},{level:55,name:"For Lover and Country"},
    {level:58,name:"Spinning the Truth"},{level:60,name:"Never Leave without a Good-bye"},{level:60,name:"When East Meets West"},
    {level:63,name:"The Butterfly Effect"},{level:65,name:"The Crane's Caveat"},{level:68,name:"A Geiko for All Seasons"},
    {level:70,name:"Send Me an Angel"}
  ],
  Alchemist: [
    {level:1,name:"Way of the Alchemist"},{level:1,name:"My First Alembic"},{level:5,name:"The Second Principle"},
    {level:10,name:"All of Your Beeswax"},{level:15,name:"For Fair Love"},{level:20,name:"The Arcanist's Tome"},
    {level:25,name:"Practical Alchemy"},{level:30,name:"Baleful Brews"},{level:35,name:"Cease and Assist"},
    {level:40,name:"Might Made Right"},{level:45,name:"Ultimate Alchemy"},{level:50,name:"Momentary Miracle"},
    {level:50,name:"Without a Trace"},{level:53,name:"Magic Marks the Spot"},{level:55,name:"From Hells"},
    {level:58,name:"Burden of Proof"},{level:60,name:"What Death Can Join Together"},{level:60,name:"Not Quite Dead Yet"},
    {level:63,name:"The Forbidden Blade"},{level:65,name:"Do Goldsmiths Dream of Gilded Sheep"},{level:68,name:"No Sin Unpunished"},
    {level:70,name:"A Love Beyond Lifetimes"}
  ],
  Culinarian: [
    {level:1,name:"Way of the Culinarian"},{level:1,name:"My First Skillet"},{level:5,name:"A Treat of Trout"},
    {level:10,name:"Dodo It Yourself"},{level:15,name:"On a Skewer Tip"},{level:20,name:"Releasing a Burden"},
    {level:25,name:"Winning Friends with Aldgoat"},{level:30,name:"The Chefsbane Cometh"},{level:35,name:"Of Cooks and Books"},
    {level:40,name:"Diplomacy of the Skillet"},{level:45,name:"A Taste of Home"},{level:50,name:"Revenge of the Chefsbane"},
    {level:50,name:"Wait on Me"},{level:53,name:"A Spoonful Less Sugar"},{level:55,name:"Looking for Some Hot Stuff"},
    {level:58,name:"Love Meat Tender"},{level:60,name:"The Spirit of Hospitality"},{level:60,name:"Flavors of the Far East"},
    {level:63,name:"Rice to the Occasion"},{level:65,name:"A Broth from the Brine"},{level:68,name:"Teach a Man to Make Fish"},
    {level:70,name:"The Way to a Father's Heart"}
  ],
  Miner: [
    {level:1,name:"Way of the Miner"},{level:1,name:"My First Pickaxe"},{level:5,name:"Know Thy Land"},
    {level:10,name:"The Cutting Edge"},{level:15,name:"Getting in Deep"},{level:20,name:"Old Wisdom, New Ways"},
    {level:25,name:"Water from Stone"},{level:30,name:"Obsidian Race"},{level:35,name:"Amethysts Are Forever"},
    {level:40,name:"To Die For"},{level:45,name:"Gulley of Woes"},{level:50,name:"Canyon of Regret"},
    {level:50,name:"Breaking New Ground"},{level:53,name:"Sellspade"},{level:55,name:"The Same Vein"},
    {level:58,name:"Digging Deeper"},{level:60,name:"The Hole Truth"},{level:60,name:"Gift of the Gob"},
    {level:63,name:"Thick Skin"},{level:65,name:"Pedal to the Metal"},{level:68,name:"Where the Money Takes You"},
    {level:70,name:"A Miner Success"}
  ],
  Botanist: [
    {level:1,name:"Way of the Botanist"},{level:1,name:"My First Hatchet"},{level:5,name:"Sap for Smiles"},
    {level:10,name:"Weapons of a Feather"},{level:15,name:"Haste Makes Waste"},{level:20,name:"Dressed to Harvest"},
    {level:25,name:"Aromatic Aspirations"},{level:30,name:"What Nature Giveth"},{level:35,name:"A Feast to Say the Least"},
    {level:40,name:"Crisis of Faith"},{level:45,name:"Botanist in a Bind"},{level:50,name:"Seeds of Hope"},
    {level:50,name:"Call from the Clouds"},{level:53,name:"Onions of Life Bestowing"},{level:55,name:"Two Nations, One Seed"},
    {level:58,name:"Love for Harmony"},{level:60,name:"Seeds Know No Borders"},{level:60,name:"Never Meet Your Heroes"},
    {level:63,name:"You Say Popoto, I Say..."},{level:65,name:"Walking for Walker's"},{level:68,name:"The White Death"},
    {level:70,name:"Edgyth's Winning Streak"}
  ],
  Fisher: [
    {level:1,name:"Way of the Fisher"},{level:1,name:"My First Fishing Rod"},{level:5,name:"Bigger Fish to Fry"},
    {level:10,name:"The Princess and the Fish"},{level:15,name:"Every Fish Has a Silver Lining"},{level:20,name:"A Fish in Hot Water"},
    {level:25,name:"A Game of Cat and Fish"},{level:30,name:"Like Fish Passing in the Night"},{level:35,name:"A Fish out of Water"},
    {level:40,name:"Fishing in the Rain"},{level:45,name:"I Believe Fish Can Fly"},{level:50,name:"So Long, and Thanks for All the Fish"},
    {level:50,name:"Plenty More Fish in the Sea"},{level:53,name:"The Icepick Challenge"},{level:55,name:"Invasion of the Supper Snatchers"},
    {level:58,name:"One Man's Fish Is Another Man's Poison"},{level:60,name:"Carpe Diem"},{level:60,name:"Whither Wawalago Wanders"},
    {level:63,name:"A Rousing Reunion"},{level:65,name:"Search for the Spawning Grounds"},{level:68,name:"Always a Bigger Fish"},
    {level:70,name:"Farewell, and Thanks for the Fish"}
  ],

  // Combat jobs, sourced from ffxiv.consolegameswiki.com's Class_Quests / Job_Quests index
  // pages plus per-job pages for the ones the aggregate fetch truncated before reaching
  // (Machinist, Dancer, White Mage, Scholar, Astrologian, Sage, Black Mage, Summoner, Red
  // Mage, Blue Mage, and the back half of Arcanist/Bard). Ten jobs carry their ARR base
  // class's 1-30 chain first (Gladiator→Paladin, Marauder→Warrior, Conjurer→White Mage,
  // Thaumaturge→Black Mage, Arcanist→Scholar/Summoner, Pugilist→Monk, Lancer→Dragoon,
  // Archer→Bard, Rogue→Ninja) — Haven's call, since the game gates them that way regardless.
  // Scoped to level ≤70 only, same as crafting/gathering; Sage and Reaper unlock AT 70 so
  // only their level-70 entries are in scope yet. Viper, Pictomancer, Beastmaster have no
  // data here (Viper/Pictomancer are 80+ jobs, Beastmaster wasn't sourced) — the checklist
  // panel already shows "No quest data loaded for this job yet" for anything missing.
  Paladin: [
    {level:1,name:"Way of the Gladiator"},{level:1,name:"My First Gladius"},{level:5,name:"Kicking the Hornet's Nest"},
    {level:10,name:"Ul'dah's Most Wanted"},{level:15,name:"That Old Familiar Feeling"},{level:20,name:"The Face of Thal"},
    {level:25,name:"On Holy Ground"},{level:30,name:"The Rematch"},
    {level:30,name:"Paladin's Pledge"},{level:35,name:"Honor Lost"},{level:40,name:"Power Struggles"},
    {level:45,name:"Poisoned Hearts"},{level:45,name:"Parley in the Sagolii"},{level:50,name:"Keeping the Oath"},
    {level:50,name:"An Exemplary Example"},{level:52,name:"The Paladin Who Cried Wolf"},{level:54,name:"Big Sollerets to Fill"},
    {level:56,name:"Hey Soul Crystal"},{level:58,name:"All According to Plan"},{level:60,name:"This Little Sword of Mine"},
    {level:60,name:"Tournament of the Century"},{level:63,name:"In Thal's Name"},{level:65,name:"In Nald's Name"},
    {level:68,name:"Fade to Black Lotus"},{level:70,name:"Raising the Sword"},{level:80,name:"Worth Fighting For"}
  ],
  Warrior: [
    {level:1,name:"Way of the Marauder"},{level:1,name:"My First Axe"},{level:5,name:"Axe in the Stone"},
    {level:10,name:"Wake of Destruction"},{level:15,name:"Brutal Strength"},{level:20,name:"The Mountain That Strides"},
    {level:25,name:"Bleeder of the Pack"},{level:30,name:"Bringing Down the Mountain"},
    {level:30,name:"Pride and Duty (Will Take You from the Mountain)"},{level:35,name:"Embracing the Beast"},
    {level:40,name:"Curious Gorge Goes to Wineport"},{level:45,name:"Looking the Part"},{level:45,name:"Proof Is the Pudding"},
    {level:50,name:"How to Quit You"},{level:50,name:"Better Axe Around"},{level:52,name:"Duty and the Beast"},
    {level:54,name:"The Bear Necessity"},{level:56,name:"Pirates of Shallow Water"},{level:56,name:"How to Train Your Warrior"},
    {level:58,name:"Slap an' Chop"},{level:60,name:"And My Axe"},{level:60,name:"Curious Gorge Meets His Match"},
    {level:63,name:"Field Training"},{level:65,name:"When Push Comes to Shove"},{level:68,name:"Going the Distance"},
    {level:70,name:"The Heart of the Problem"},{level:80,name:"Once, Twice, Three Times a Warrior"}
  ],
  "Dark Knight": [
    {level:30,name:"Ishgardian Justice"},{level:35,name:"The Voice in the Abyss"},{level:40,name:"Heroic Reprise"},
    {level:45,name:"Declaration of Blood"},{level:50,name:"Our Answer"},{level:50,name:"A Dark Spectacle"},
    {level:50,name:"Our End"},{level:50,name:"The Wages of Mercy"},{level:52,name:"The Knight and the Maiden Fair"},
    {level:54,name:"Kindred Spirits"},{level:56,name:"Original Sins"},{level:58,name:"The Flame in the Abyss"},
    {level:60,name:"Absolution"},{level:60,name:"In Memories We Walked"},{level:63,name:"The Widow and Her Love"},
    {level:65,name:"The Orphans and the Broken Blade"},{level:68,name:"We Can Never Go Home"},{level:70,name:"Our Compromise"},{level:80,name:"Our Closure"}
  ],
  Gunbreaker: [
    {level:60,name:"The Makings of a Gunbreaker"},{level:60,name:"Hired Gunblades"},{level:63,name:"For Better or Worse"},
    {level:65,name:"Confessions of a Flaming Mongrel"},{level:68,name:"Of Defectors and Defenders"},{level:70,name:"Steel against Steel"},{level:80,name:"Gunblades of the Patriots"}
  ],
  "White Mage": [
    {level:1,name:"Way of the Conjurer"},{level:1,name:"My First Cane"},{level:5,name:"Trial by Earth"},
    {level:10,name:"Trial by Wind"},{level:15,name:"Trial by Water"},{level:20,name:"Sylphie's Trials"},
    {level:25,name:"Like Mother, Like Daughter"},{level:30,name:"In Nature's Embrace"},
    {level:30,name:"Seer Folly"},{level:35,name:"Only You Can Prevent Forest Ire"},{level:40,name:"O Brother, Where Art Thou"},
    {level:45,name:"Following in His Footsteps"},{level:45,name:"Yearn for the Urn"},{level:50,name:"Heart of the Forest"},
    {level:50,name:"Taint Misbehaving"},{level:52,name:"A Journey of Purification"},{level:54,name:"The Girl with the Dragon Tissue"},
    {level:56,name:"The Dark Blight Writhes"},{level:58,name:"In the Wake of Death"},{level:58,name:"Trials of the Padjals"},
    {level:60,name:"Hands of Healing"},{level:60,name:"Unease in East End"},{level:63,name:"An Aura for Trouble"},
    {level:65,name:"A Beacon for Bad Things"},{level:68,name:"The Problem with Padjals"},{level:70,name:"What She Always Wanted"},{level:80,name:"Whence the Healing Springs"}
  ],
  Scholar: [
    {level:1,name:"Way of the Arcanist"},{level:1,name:"My First Grimoire"},{level:5,name:"What's in the Box"},
    {level:10,name:"Tactical Planning"},{level:15,name:"Topaz Teachings"},{level:15,name:"Over the Rails"},
    {level:20,name:"Pincer Maneuver"},{level:25,name:"Grimoire Fandango"},{level:30,name:"Sinking Doesmaga"},
    {level:30,name:"Forgotten but Not Gone"},{level:35,name:"The Last Remnants"},{level:40,name:"The Consequences of Anger"},
    {level:45,name:"In the Image of the Ancients"},{level:45,name:"For Your Fellow Man"},{level:50,name:"The Beast Within"},
    {level:50,name:"The Green Death"},{level:52,name:"Quarantine"},{level:54,name:"False Friends"},
    {level:56,name:"Ooh Rah"},{level:58,name:"Unseen"},{level:60,name:"Forward, Royal Marines"},
    {level:60,name:"The Vanishing Act"},{level:63,name:"A Safe Place to Hide"},{level:65,name:"In Loving Memory"},
    {level:68,name:"The Chase"},{level:70,name:"Our Unsung Heroes"},{level:80,name:"True Beauty"}
  ],
  Astrologian: [
    {level:30,name:"Fortune Favors the Bole"},{level:35,name:"Hanging in the Balance"},{level:40,name:"A Lesson in Patience"},
    {level:40,name:"Slings and Arrows"},{level:45,name:"Ewer Right"},{level:50,name:"Loved by the Sun"},
    {level:50,name:"Spearheading Initiatives"},{level:50,name:"Sharlayan Ascending"},{level:52,name:"Empty Nest"},
    {level:54,name:"Conviction"},{level:56,name:"Feather in the Cap"},{level:58,name:"Trumped"},
    {level:60,name:"The Hands of Fate"},{level:60,name:"East Meets West"},{level:63,name:"Ride Like the Wind"},
    {level:65,name:"Come Rain or Shrine"},{level:68,name:"Behind Door Number Two"},{level:70,name:"Foxfire"},{level:80,name:"Love, Astrologically"}
  ],
  Sage: [
    {level:70,name:"Sage's Path"},{level:70,name:"Sage's Focus"},{level:73,name:"Sands of Despair"},
    {level:75,name:"A Poisoned Gift"},{level:78,name:"Pledge of Hope"},{level:80,name:"Life Ephemeral, Path Eternal"}
  ],
  Monk: [
    {level:1,name:"Way of the Pugilist"},{level:1,name:"My First Hora"},{level:5,name:"Harder than Rock"},
    {level:10,name:"Burning Up the Quarter Malm"},{level:15,name:"The Spirit Is Willing"},{level:20,name:"Keeping the Spirit Alive"},
    {level:25,name:"Star-crossed Rivals"},{level:30,name:"Return of the Holyfist"},
    {level:30,name:"Brother from Another Mother"},{level:35,name:"Insulted Intelligence"},{level:40,name:"A Slave to the Aether"},
    {level:45,name:"The Pursuit of Power"},{level:45,name:"Good Vibrations"},{level:50,name:"Five Easy Pieces"},
    {level:50,name:"The Legend Continues"},{level:52,name:"Let's Talk about Sects"},{level:54,name:"Against the Shadow"},
    {level:56,name:"Fight the Battle to Win"},{level:58,name:"Stop the Senseless Killing"},{level:60,name:"Appetite for Destruction"},
    {level:60,name:"A Fistful of Resolve"},{level:63,name:"Return of the Monk"},{level:65,name:"Cross-fist Training"},
    {level:68,name:"Choices and Paths"},{level:70,name:"The Power to Protect"},{level:80,name:"A Monk's Legacy"}
  ],
  Dragoon: [
    {level:1,name:"Way of the Lancer"},{level:1,name:"My First Spear"},{level:5,name:"Spear of the Fearless"},
    {level:10,name:"Courage of Stone"},{level:15,name:"A Dangerous Proposition"},{level:20,name:"Lance of Destiny"},
    {level:25,name:"Questions and Lancers"},{level:30,name:"Proof of Might"},
    {level:30,name:"Eye of the Dragon"},{level:35,name:"Lance of Fury"},{level:40,name:"Unfading Skies"},
    {level:45,name:"Double Dragoon"},{level:45,name:"Fatal Seduction"},{level:50,name:"Into the Dragon's Maw"},
    {level:50,name:"Sky's the Limit"},{level:52,name:"Days of Azure"},{level:52,name:"Heart of Justice"},
    {level:54,name:"Sworn Upon a Lance"},{level:56,name:"Dragoon's Errand"},{level:58,name:"Sanguine Dragoon"},
    {level:60,name:"Dragoon's Fate"},{level:60,name:"Friends Through Eternity"},{level:63,name:"Drowsy Dragons"},
    {level:65,name:"Serpent and the Sea of Rubies"},{level:68,name:"Dark as the Night Sky"},{level:70,name:"Dragon Sound"},{level:80,name:"Gone but Not Forgiven"}
  ],
  Ninja: [
    {level:1,name:"My First Daggers"},{level:1,name:"Stabbers in Yer Fambles"},{level:5,name:"A Dainty Dilemma"},
    {level:10,name:"Stray into the Shadows"},{level:15,name:"Stifled Screams"},{level:15,name:"Slave to the Code"},
    {level:20,name:"Grinners in the Mist"},{level:25,name:"Sweet Sorrows"},{level:30,name:"Market for Death"},
    {level:30,name:"Cloying Victory"},
    {level:30,name:"Peasants by Day, Ninjas by Night"},{level:30,name:"My First Mudra"},{level:35,name:"Killer Combinations"},
    {level:35,name:"Once Upon a Time in Doma"},{level:40,name:"Pirates versus Ninjas"},{level:40,name:"Ninja Bathin'"},
    {level:45,name:"Tough Guys"},{level:45,name:"The Crow Knows"},{level:50,name:"Master and Student"},
    {level:50,name:"Strangers in a Strange Land"},{level:52,name:"The Impossible Girl"},{level:54,name:"Ninja Assassin"},
    {level:56,name:"Medieval Espionage"},{level:58,name:"Staying Alive"},{level:60,name:"In Her Defense"},
    {level:60,name:"Search for the Stolen Scroll"},{level:63,name:"Ninja Bathin' Redux"},{level:65,name:"A Game of Life and Death"},
    {level:68,name:"True Enlightenment"},{level:70,name:"When Clans Collide"},{level:80,name:"Oboro's Big Idea"}
  ],
  Samurai: [
    {level:50,name:"The Way of the Samurai"},{level:50,name:"Master Musosai"},{level:52,name:"The Sands of Debt"},
    {level:54,name:"Blood on the Deck"},{level:56,name:"A Fraudster in the Forest"},{level:58,name:"Tears in the Snow"},
    {level:60,name:"The Face of True Evil"},{level:60,name:"A Dignified Visitor"},{level:63,name:"Trials of the Sekiseigumi"},
    {level:65,name:"Matsuba Mayhem"},{level:68,name:"The Hunt for Ugetsu"},{level:70,name:"The Battle on Bekko"},{level:80,name:"The Legend of Musosai"}
  ],
  Reaper: [
    {level:70,name:"The Killer Instinct"},{level:70,name:"The Harvest Begins"},{level:73,name:"On the Hunt"},
    {level:75,name:"Dark Days"},{level:78,name:"Thicker than Blood"},{level:80,name:"The Killing Art"}
  ],
  Viper: [
    {level:80,name:"Enter the Viper"},{level:80,name:"Fangs of the Viper"},{level:83,name:"Viper in the Vidraal's Shadow"},
    {level:85,name:"Vipers on the Hunt"},{level:88,name:"Into the Viper Pit"},{level:90,name:"Vengeance of the Viper"}
  ],
  Bard: [
    {level:1,name:"Way of the Archer"},{level:1,name:"My First Bow"},{level:5,name:"A Matter of Perspective"},
    {level:10,name:"Training with Leih"},{level:15,name:"Violators Will Be Shot"},{level:20,name:"To Catch a Poacher"},
    {level:25,name:"Homecoming"},{level:30,name:"The One That Got Away"},
    {level:30,name:"A Song of Bards and Bowmen"},{level:35,name:"The Archer's Anthem"},{level:40,name:"Bard's-eye View"},
    {level:45,name:"Doing It the Bard Way"},{level:45,name:"Pieces of the Past"},{level:50,name:"Requiem for the Fallen"},
    {level:50,name:"On the Road Again"},{level:52,name:"The Stiff and the Spent"},{level:54,name:"Requiem on Ice"},
    {level:56,name:"When Gnaths Cry"},{level:58,name:"A Saint of Song"},{level:60,name:"The Ballad of Oblivion"},
    {level:60,name:"Three's a Company"},{level:63,name:"Masked Motives"},{level:65,name:"One Autumn's Secret"},
    {level:68,name:"Sleeping Truths Lie"},{level:70,name:"Sweet Dreams Are Made of Peace"},{level:80,name:"A Harmony from the Heavens"}
  ],
  Machinist: [
    {level:30,name:"Master of Marksmanship"},{level:35,name:"Always the Last Place You Look"},{level:40,name:"Rook Before You Reap"},
    {level:40,name:"Securing the Locks"},{level:45,name:"A Suppressive Strategy"},{level:45,name:"Blood on the Sands"},
    {level:50,name:"Rage against the Machinists"},{level:50,name:"The Power of a Tourney"},{level:50,name:"A Joye-less Celebration"},
    {level:52,name:"Pushing the Brume"},{level:54,name:"A Joye-ful Reunion"},{level:56,name:"Wheels of Justice"},
    {level:58,name:"Taking the Fall"},{level:58,name:"Rusted Steel"},{level:60,name:"Rise of the Machinists"},
    {level:60,name:"The Machinists' Choice"},{level:63,name:"The Hrunting Heist"},{level:65,name:"Release the Hounds"},
    {level:68,name:"Snouts Down, Tails Up"},{level:70,name:"The Mongrel and the Knight"},{level:80,name:"Machinists for the Morrow"}
  ],
  Dancer: [
    {level:60,name:"Shall We Dance"},{level:60,name:"Gamboling for Gil"},{level:63,name:"A Soirée in the Sultanate"},
    {level:65,name:"Dances with Duskwights"},{level:68,name:"High-steppin' in the Holy See"},{level:70,name:"Save the Last Dance for Me"},{level:80,name:"Rising to the Occasion"}
  ],
  "Black Mage": [
    {level:1,name:"Way of the Thaumaturge"},{level:1,name:"My First Scepter"},{level:5,name:"The Threat of Intimacy"},
    {level:10,name:"The Threat of Paucity"},{level:15,name:"The Threat of Superiority"},{level:20,name:"The Threat of Perplexity"},
    {level:25,name:"The Hidden Chapter"},{level:30,name:"Facing Your Demons"},
    {level:30,name:"Taking the Black"},{level:35,name:"You'll Never Go Back"},{level:40,name:"International Relations"},
    {level:45,name:"The Voidgate Breathes Gloomy"},{level:45,name:"The Blood Must Flow"},{level:50,name:"Always Bet on Black"},
    {level:50,name:"Black Books"},{level:52,name:"An Unexpected Journey"},{level:54,name:"A Cunning Plan"},
    {level:56,name:"Black Squawk Down"},{level:58,name:"Destruction in the Name of Justice"},{level:60,name:"The Defiant Ones"},
    {level:60,name:"Shades of Shatotto"},{level:63,name:"Golems Gone Wild"},{level:65,name:"When the Golems Get Tough"},
    {level:68,name:"Unnatural Selection"},{level:70,name:"One Golem to Rule Them All"},{level:80,name:"A Home for a Tome"}
  ],
  Summoner: [
    {level:1,name:"Way of the Arcanist"},{level:1,name:"My First Grimoire"},{level:5,name:"What's in the Box"},
    {level:10,name:"Tactical Planning"},{level:15,name:"Topaz Teachings"},{level:15,name:"Over the Rails"},
    {level:20,name:"Pincer Maneuver"},{level:25,name:"Grimoire Fandango"},{level:30,name:"Sinking Doesmaga"},
    {level:30,name:"Austerities of Flame"},{level:35,name:"Austerities of Earth"},{level:40,name:"Shadowing the Summoner"},
    {level:45,name:"Allagan Attire"},{level:45,name:"Austerities of Wind"},{level:50,name:"Primal Burdens"},
    {level:50,name:"A Fitting Tomestone"},{level:52,name:"A Matter of Fact"},{level:54,name:"A Miner Negotiation"},
    {level:56,name:"Mad, Bad, and Ebon-clad"},{level:58,name:"I Could Have Tranced All Night"},{level:60,name:"A Flare for the Dramatic"},
    {level:60,name:"A Book with Bite"},{level:63,name:"Performing for Prin"},{level:65,name:"An Egi-stential Crisis"},
    {level:68,name:"Off the Record"},{level:70,name:"An Art for the Living"},{level:80,name:"To Be Second Best"}
  ],
  "Red Mage": [
    {level:50,name:"Taking the Red"},{level:50,name:"The Crimson Duelist"},{level:52,name:"A Rewarding Struggle"},
    {level:54,name:"Tracking the Cabal"},{level:56,name:"A Vermilion Vendetta"},{level:58,name:"On Lambard's Trail"},
    {level:60,name:"Stained in Scarlet"},{level:60,name:"The Color of Her Hair"},{level:63,name:"Traced in Blood"},
    {level:65,name:"Nightkin"},{level:68,name:"Child of Lilith"},{level:70,name:"With Heart and Steel"},{level:80,name:"Succession of Steel"}
  ],
  Pictomancer: [
    {level:80,name:"The Joy of Pictomancy"},{level:80,name:"Mind over Manor"},{level:83,name:"Perspectives in Pursuit"},
    {level:85,name:"The Crate Beyond"},{level:88,name:"Beruru's Clues"},{level:90,name:"Somewhere Only She Knows"}
  ],
  "Blue Mage": [
    {level:1,name:"Blue Leading the Blue"},{level:10,name:"Blue Collar Work"},{level:20,name:"Why They Call It the Blues"},
    {level:30,name:"Scream Blue Murder"},{level:40,name:"Blue Gold"},{level:50,name:"Out of the Blue"},
    {level:50,name:"The Real Folk Blues"},{level:50,name:"Turning Over a Blue Leaf"},{level:50,name:"Into the Blue Again"},
    {level:53,name:"Something Borrowed, Something Blue"},{level:55,name:"Bolt from the Blue"},{level:58,name:"Blue in the Face"},
    {level:60,name:"Blue Scream of Death"},{level:60,name:"Blue Cheese"},{level:65,name:"Azuro and Goliath"},
    {level:68,name:"Where the Gold Goes"},{level:70,name:"Master of Mimicry"},{level:70,name:"A Future in Blue"},
    {level:80,name:"A New Gold Standard"},{level:80,name:"The Brave and the Blue"}
  ]
};
// Which shared role-quest chain each combat job draws on.
const JOB_ROLE = {
  Paladin:"tank", Warrior:"tank", "Dark Knight":"tank", Gunbreaker:"tank",
  "White Mage":"healer", Scholar:"healer", Astrologian:"healer", Sage:"healer",
  Monk:"melee", Dragoon:"melee", Ninja:"melee", Samurai:"melee", Reaper:"melee", Viper:"melee",
  Bard:"ranged", Machinist:"ranged", Dancer:"ranged",
  "Black Mage":"caster", Summoner:"caster", "Red Mage":"caster", Pictomancer:"caster"
  // Blue Mage has no role quests — it's excluded from the role quest system entirely.
};
// Viper and Pictomancer don't exist below level 80, so they never pass through the
// Shadowbringers bracket (71-80) as that job — skip straight to Endwalker/Dawntrail.
const JOB_ROLE_FLOOR = { Viper:80, Pictomancer:80 };
// Which pool of completion state a role's quests share, per bracket. Shadowbringers runs
// melee and physical ranged as ONE combined "Physical DPS" chain (same quests, same NPCs) —
// clearing it on any melee or ranged job clears it for all of them. Endwalker/Dawntrail split
// back into separate melee/ranged chains. Tank/caster/healer never combine with anything.
const ROLE_TRACK_KEY = {
  shb: { tank:"tank", melee:"physDPS", ranged:"physDPS", caster:"caster", healer:"healer" },
  ew:  { tank:"tank", melee:"melee",   ranged:"ranged",  caster:"caster", healer:"healer" },
  dt:  { tank:"tank", melee:"melee",   ranged:"ranged",  caster:"caster", healer:"healer" }
};
// Known gap: role quests actually gate on MSQ progress into that expansion, not just job
// level. A job hitting 70 while still finishing Stormblood's post-MSQ content (i.e. before
// setting foot in Shadowbringers) will show its bracket-70 role quest as "missed" a little
// early, since level is all this tracker has to go on. Not fixable without tracking exact
// MSQ position, which isn't data this app collects.

const ROLE_QUESTS = {
  shb: {
    tank:   [{level:70,name:"The Man with Too Many Scars"},{level:72,name:"Shaped by Tragedy"},{level:74,name:"Defined by Loss"},{level:76,name:"The Princess and Her Knight"},{level:78,name:"The Hardened Heart"},{level:80,name:"To Have Loved and Lost"}],
    melee:  [{level:70,name:"No Greater Sport"},{level:72,name:"Vengeance in Defeat"},{level:74,name:"Freedom from Privilege"},{level:76,name:"The Hunter's Legacy"},{level:78,name:"Fellowship Restored"},{level:80,name:"Courage Born of Fear"}],
    ranged: [{level:70,name:"No Greater Sport"},{level:72,name:"Vengeance in Defeat"},{level:74,name:"Freedom from Privilege"},{level:76,name:"The Hunter's Legacy"},{level:78,name:"Fellowship Restored"},{level:80,name:"Courage Born of Fear"}],
    caster: [{level:70,name:"Hollow Pursuits"},{level:72,name:"A Voice from the Void"},{level:74,name:"Echoes of the Past"},{level:76,name:"Nyelbert's Lament"},{level:78,name:"Taynor's Training Day"},{level:80,name:"A Tearful Reunion"}],
    healer: [{level:70,name:"Traditions and Travails"},{level:72,name:"Affronts and Allies"},{level:74,name:"The Scientific Method"},{level:76,name:"The Lost and the Found"},{level:78,name:"Never to Return"},{level:80,name:"The Soul of Temperance"}]
  },
  ew: {
    tank:   [{level:85,name:"Shrouded in Peril"},{level:86,name:"To Give Voice"},{level:87,name:"A Gift Undone"},{level:88,name:"A Pact Proven"},{level:89,name:"Hearts True"},{level:90,name:"A Path Unveiled"}],
    melee:  [{level:85,name:"Storm Clouds Brewing"},{level:86,name:"The Crushing Tide"},{level:87,name:"Old Heroes Never Die"},{level:88,name:"A Mother's Suffering"},{level:89,name:"Out of the Shadows"},{level:90,name:"To Calmer Seas"}],
    ranged: [{level:85,name:"Seeds of Disquiet"},{level:86,name:"When the Kami Answer"},{level:87,name:"Home No Longer"},{level:88,name:"The Devoted Daughter"},{level:89,name:"A Singular Gift"},{level:90,name:"Laid to Rest"}],
    caster: [{level:85,name:"Our Aching Souls"},{level:86,name:"No Forgiveness, No Deliverance"},{level:87,name:"Only Justice, Only Vengeance"},{level:88,name:"Wills Unending, Faith Unbending"},{level:89,name:"O Mighty Fury, Guide Us to Victory"},{level:90,name:"Ever March Heavensward"}],
    healer: [{level:85,name:"Far from Free"},{level:86,name:"The Butcher's Blade"},{level:87,name:"A New Battleground"},{level:88,name:"Laying the Past to Rest"},{level:89,name:"Trail of Skulls"},{level:90,name:"The Gift of Mercy"}]
  },
  dt: {
    tank:   [{level:90,name:"The Narwhal Beckons"},{level:92,name:"Sleepless in Ishgard"},{level:94,name:"Between Sleep and Death"},{level:96,name:"Beacon in the Darkness"},{level:98,name:"Awakened, Not Stirred"},{level:100,name:"Dreams of a New Day"}],
    melee:  [{level:90,name:"The Hunter and the Hunted"},{level:92,name:"A Sea of Blood"},{level:94,name:"Who's Who"},{level:96,name:"Cornered Prey"},{level:98,name:"Impostor Syndrome"},{level:100,name:"A Hunter True"}],
    ranged: [{level:90,name:"To Steal a Steelhog"},{level:92,name:"Bandits Abound"},{level:94,name:"Take Me to Your Leader"},{level:96,name:"The Milk of Mamool Ja Kindness"},{level:98,name:"Ally in the Alley"},{level:100,name:"The Mightiest Shield"}],
    caster: [{level:90,name:"Power Forgotten"},{level:92,name:"A Brand of Justice"},{level:94,name:"The Seeds of Popularity"},{level:96,name:"Floundering Fame"},{level:98,name:"Behind the Helm"},{level:100,name:"Heroes and Pretenders"}],
    healer: [{level:90,name:"In the Sting of Things"},{level:92,name:"Causing Problems on Purpose"},{level:94,name:"Living among the Deadly"},{level:96,name:"Taste of a Toxin Paradise"},{level:98,name:"Downed by the River"},{level:100,name:"An Antidote for Anarchy"}]
  }
};
// Every role-quest bracket that applies to a job, in level order, respecting JOB_ROLE_FLOOR.
// Each returned quest carries its own trackKey — melee/ranged quests in the Shadowbringers
// bracket both come back tagged "physDPS" so their completion state is shared; the same
// quests in Endwalker/Dawntrail come back tagged "melee"/"ranged" since those don't share.
function roleQuestsFor(job){
  const role = JOB_ROLE[job];
  if(!role) return [];
  const floor = JOB_ROLE_FLOOR[job] || 1;
  return ['shb','ew','dt'].flatMap(exp => {
    const list = ROLE_QUESTS[exp][role];
    // These chains are sequential — a job that doesn't exist yet when a bracket opens
    // (Viper/Pictomancer skip Shadowbringers entirely) never gets access to any of it,
    // not just the entries below its floor.
    if(list[0].level < floor) return [];
    return list.map(q => ({...q, trackKey: ROLE_TRACK_KEY[exp][role]}));
  });
}
function missedJobQuests(job, level, doneMap){
  const list = JOB_QUESTS[job] || [];
  const done = (doneMap && doneMap[job]) || {};
  const ownMissed = list.filter(q => q.level <= level && !done[q.name]);
  const roleList = roleQuestsFor(job);
  if(!roleList.length) return ownMissed;
  const roleMissed = roleList.filter(q => q.level <= level && !((doneMap && doneMap['role:'+q.trackKey]) || {})[q.name]);
  return ownMissed.concat(roleMissed);
}

// "Overall" is a roll-up: sub-categories should sum to it on both the done and total side.
// Totals are editable per-character (Edit totals button) since they grow with patches.
const QUEST_CATS = [
  ["overall","Overall",6472],
  ["msq","Main scenario",991],
  ["era","Chronicles of a New Era",192],
  ["side","Sidequests",1987],
  ["allied","Allied Society",716],
  ["class","Class & Job Quests",848],
  ["leve","Levequests",1738]
];
const SUB_CATS = QUEST_CATS.filter(([key])=>key!=='overall');

// Sourced from ffxiv.consolegameswiki.com's Main Scenario Quests overview table, grouped
// the way the QuestTracker plugin itself groups them (initial release + every "post-X"
// continuation through the next expansion's start — confirmed against a real screenshot
// showing Stormblood at 122/162, which is exactly 122 initial + 40 post-Stormblood).
// "A Realm Reborn" here is two wiki arcs combined — Seventh Umbral Era (160-161,
// starting-city/GC-dependent) + Seventh Astral Era (80, fixed) = 240 or 241. ARR's total
// is deliberately editable: summing all six with 240 gives exactly 991, with 241 giving
// exactly 992 — both independently confirmed against the plugin's real numbers, so this
// checks out rather than being assumed.
const MSQ_EXPANSIONS = [
  ["arr","A Realm Reborn",240],
  ["hw","Heavensward",138],
  ["stb","Stormblood",162],
  ["shb","Shadowbringers",157],
  ["ew","Endwalker",155],
  ["dt","Dawntrail",139]
];

// Every reset is a fixed instant in UTC (SE's own convention: GMT reference regardless of
// player DST). Edit/extend this list when 8.0 reworks resets (2027-01-19) — no other code
// changes needed, every routine just points at whichever schedule id you pick.
const RESET_SCHEDULES = [
  { id:'daily15',   kind:'daily',    hour:15,            label:'Daily · 15:00 UTC — roulettes, Allied Society' },
  { id:'daily20',   kind:'daily',    hour:20,            label:'Daily · 20:00 UTC — GC supply, Squadron' },
  { id:'daily09',   kind:'daily',    hour:9,             label:'Daily · 09:00 UTC — Cosmic Exploration' },
  { id:'every12h',  kind:'interval', hours:12,           label:'Every 12h · 00:00 / 12:00 UTC — leve allowances' },
  { id:'weeklyTue', kind:'weekly',   weekday:2, hour:8,  label:'Weekly · Tuesday 08:00 UTC — Challenge Log, raids' },
  { id:'weeklySat', kind:'weekly',   weekday:0, hour:2,  label:'Weekly · Sat→Sun 02:00 UTC — Jumbo Cactpot draw (NA time; EU/JP/OCE draw a few hours earlier)' },
  { id:'monthly1',  kind:'monthly',  day:1,     hour:8,  label:'Monthly · 1st 08:00 UTC' },
  { id:'cooldown18h', kind:'cooldown', hours:18, label:"18h from last click — matches your own last dispatch/click, not a shared clock" }
];
const DAY_MS = 86400000;
const ACCENTS = ['gold','teal','rose'];

// Sourced from ffxiv.consolegameswiki.com's Daily and Weekly Checklist page. Seeded onto
// every new character so the known list is there from the start — hide (not delete)
// whatever doesn't apply to you, same idea as Haven's "I'd never do Faux Hollows as Grey."
// No `requires` patch gates pre-filled — real per-item unlock patches weren't verified,
// so everything defaults to always-visible; add gating yourself if you want it.
// Schedule mapping is best-effort where the source didn't map cleanly to a fixed reset:
// Squadron Training and Retainer Ventures run on their own per-action timers, approximated
// to the closest fixed daily reset — adjust the dropdown per-item if the timing bugs you.
// Jumbo Cactpot was originally miscoded onto the standard Tuesday weekly reset — it's
// actually its own Saturday drawing (weeklySat), and the exact clock time is per-data-center,
// not global; weeklySat is calibrated to North America's draw time specifically.
// Treasure Hunt is a real 18h personal cooldown starting from whenever you last clicked
// it (cooldown18h), not tied to any fixed UTC reset at all.
// "Windurst: The Third Walk" (FFXI-crossover alliance raid) is included — real content,
// not a wiki error. "YoRHa Epilogue Quest Chain" is a one-time 6-week unlock rather than a
// recurring weekly, but it's included anyway so people know it exists at all — once
// finished, hide it the same way as anything else that's stopped being relevant.
// Third value is a stable key, separate from the editable label — the one-time backfill
// below matches on this, not on label text, so renaming "Duty Roulette" to something else
// doesn't make it look "missing" and spawn a duplicate on the next load.
const DEFAULT_ROUTINES = [
  ["Allied Society Quests","daily15","allied-society"],
  ["Duty Roulette","daily15","duty-roulette"],
  ["Morbid Motivation (Mysterious Maps - High Level Dungeons)","daily15","morbid-motivation"],
  ["Cut from a Different Cloth (Singing Clusters)","daily15","cut-different-cloth"],
  ["The Will to Resist (Resistance Weapon)","daily15","will-to-resist"],
  ["Aether, Aether, Everywhere (Phantom Weapon)","daily15","aether-everywhere"],
  ["Tank You (Tank Roulette — any tank job)","daily15","tank-you"],
  ["Mini Cactpot","daily15","mini-cactpot"],
  ["The Hunt (Daily Marks)","daily15","hunt-daily"],
  ["Grand Company Turn-in","daily20","gc-turnin"],
  ["Treasure Hunt (map every 18h)","cooldown18h","treasure-hunt"],
  ["Adventurer Squadron Training","daily20","squadron-training"],
  ["Cosmic Exploration Daily Successes","daily09","cosmic-exploration"],
  ["Retainer Ventures","cooldown18h","retainer-ventures"],
  ["Dancing Mad (Ultimate)","weeklyTue","dancing-mad"],
  ["AAC Heavyweight M4","weeklyTue","aac-m4"],
  ["Windurst: The Third Walk","weeklyTue","windurst"],
  ["YoRHa Epilogue Quest Chain (one-time unlock)","weeklyTue","yorha-epilogue"],
  ["Cap Allagan Tomestone of Mnemonics","weeklyTue","tomestone-cap"],
  ["AAC Heavyweight (Savage)","weeklyTue","aac-savage"],
  ["Challenge Log","weeklyTue","challenge-log"],
  ["Seeking Inspiration (Anima Weapon)","weeklyTue","seeking-inspiration"],
  ["Wondrous Tails","weeklyTue","wondrous-tails"],
  ["Jumbo Cactpot","weeklySat","jumbo-cactpot"],
  ["Hunt — B-Rank Elite Marks","weeklyTue","hunt-brank"],
  ["Masked Carnivale / Blue Mage Log","weeklyTue","masked-carnivale"],
  ["Fashion Report","weeklyTue","fashion-report"],
  ["Custom Deliveries","weeklyTue","custom-deliveries"],
  ["Doman Enclave Reconstruction","weeklyTue","doman-enclave"],
  ["Squadron Missions","weeklyTue","squadron-missions"],
  ["Faux Hollows","weeklyTue","faux-hollows"],
  ["Island Sanctuary Weekly","weeklyTue","island-sanctuary"],
  ["Bozjan Frontier (Delubrum Reginae)","weeklyTue","bozjan-frontier"]
];
function seedRoutines(){
  return DEFAULT_ROUTINES.map(([label,schedId,seedKey])=>(
    { id:newId(), label, schedId, lastDone:null, requires:'', hidden:false, seedKey }
  ));
}
// One-time backfill for characters that existed before this seed list did (or before an
// item was added to it) — adds only what's missing, matched by seedKey so a renamed label
// doesn't duplicate, and never re-adds something whose seedKey is already present even if
// the user deleted that routine on purpose. Runs once per character via routinesSeeded.
function backfillSeedRoutines(c){
  const have = new Set(c.routines.map(r=>r.seedKey).filter(Boolean));
  DEFAULT_ROUTINES.forEach(([label,schedId,seedKey])=>{
    if(!have.has(seedKey)){
      c.routines.push({ id:newId(), label, schedId, lastDone:null, requires:'', hidden:false, seedKey });
    }
  });
  c.routinesSeeded = true;
}
// One-time corrections to already-seeded routines whose original best-effort schedule
// turned out wrong after the fact (Jumbo Cactpot was on the standard Tuesday reset; it's
// really its own Saturday drawing. Treasure Hunt was approximated to a fixed daily reset;
// it's really an 18h cooldown from whenever you last clicked it). Each only applies if the
// routine is still sitting on the specific old (wrong) schedId — a deliberate manual change
// away from that couldn't have happened before the fix existed, so this can't clobber a real
// user choice. Add future corrections here rather than one-off functions.
const SEED_SCHEDULE_FIXES = [
  { seedKey:'jumbo-cactpot',      from:'weeklyTue', to:'weeklySat' },
  { seedKey:'treasure-hunt',      from:'daily15',   to:'cooldown18h' },
  { seedKey:'retainer-ventures',  from:'daily15',   to:'cooldown18h' }
];
function applySeedScheduleFixes(c){
  SEED_SCHEDULE_FIXES.forEach(({seedKey,from,to})=>{
    const r = c.routines.find(r=>r.seedKey===seedKey);
    if(r && r.schedId===from) r.schedId = to;
  });
  c.seedScheduleFixesApplied = true;
}
// Same one-time, only-if-still-default safety as SEED_SCHEDULE_FIXES, but for wording
// corrections instead of schedule corrections — a user's own rename is never touched.
const SEED_LABEL_FIXES = [
  { seedKey:'morbid-motivation', from:'Morbid Motivation (Mysterious Maps)', to:'Morbid Motivation (Mysterious Maps - High Level Dungeons)' },
  // "Tank You" is a per-job achievement family (Tank You, Warrior IV; Tank You, Paladin IV;
  // etc.) but the underlying activity — Tank Roulette — counts toward whichever tank job
  // you're queuing as, not one specific job. Clarified so it doesn't read as Warrior-only.
  { seedKey:'tank-you', from:'Tank You (Tank Roulette)', to:'Tank You (Tank Roulette — any tank job)' }
];
function applySeedLabelFixes(c){
  SEED_LABEL_FIXES.forEach(({seedKey,from,to})=>{
    const r = c.routines.find(r=>r.seedKey===seedKey);
    if(r && r.label===from) r.label = to;
  });
  c.seedLabelFixesApplied = true;
}

function schedById(id){ return RESET_SCHEDULES.find(s=>s.id===id) || RESET_SCHEDULES[0]; }

const ROUTINE_SECTIONS = ['Daily','Weekly','Monthly','Other'];
// No monthly-reset content has ever existed in FFXIV — Monthly stays folded into Other
// (so nothing a user adds goes missing) until patch 8.0 actually ships. Flip this to true
// once it does; the Monthly heading then appears on its own automatically.
const PATCH_8_0_RELEASED = false;
function routineSection(item){
  const kind = schedById(item.schedId).kind;
  if(kind === 'monthly') return PATCH_8_0_RELEASED ? 'Monthly' : 'Other';
  if(kind === 'weekly') return 'Weekly';
  if(kind === 'daily' || kind === 'interval') return 'Daily';
  return 'Other'; // cooldown (Treasure Hunt) and anything else that isn't clock-based
}

// Finer grouping within Daily specifically — Weekly/Monthly/Other don't need this level of
// detail yet. Keyed by seedKey (stable, unlike the editable label) rather than schedId
// (shared by unrelated items). Anything with no match — including every manually-added
// daily, which has no seedKey at all — falls into "Other".
// Morbid Motivation (Mysterious Maps) was tied to the Relic Weapon line once, but that
// association was phased out in patch 3.0 — it's a plain repeatable dungeon/map activity
// now, same category as Tank You or Mini Cactpot, no level check needed.
// Retainer Ventures isn't in this list at all — it's an 18h personal cooldown (same
// mechanism as Treasure Hunt), so it lives in the top-level Other section, not Daily.
const DAILY_SUBGROUPS = [
  ['Continuous', ['tank-you','hunt-daily','mini-cactpot','duty-roulette','morbid-motivation']],
  ['Relic Weapons', ['cut-different-cloth','will-to-resist','aether-everywhere']],
  ['Allied Societies', ['allied-society']],
  ['Grand Company', ['squadron-training','gc-turnin']]
];
function dailySubgroup(item){
  for(const [name, keys] of DAILY_SUBGROUPS){
    if(item.seedKey && keys.includes(item.seedKey)) return name;
  }
  return 'Other';
}
function dailySubgroupHTML(cid, items){
  const names = DAILY_SUBGROUPS.map(([name])=>name).concat(['Other']);
  return names.map(name=>{
    const groupItems = items.filter(item => dailySubgroup(item) === name);
    if(!groupItems.length) return '';
    return `<div class="routine-subgroup"><div class="routine-subhead">${esc(name)}</div>${groupItems.map(item=>routineHTML(cid,item)).join('')}</div>`;
  }).join('');
}

function lastResetInstant(sched, now){
  const t = now.getTime();
  const Y = now.getUTCFullYear(), M = now.getUTCMonth(), D = now.getUTCDate();
  if(sched.kind === 'daily'){
    let d = Date.UTC(Y, M, D, sched.hour, 0, 0);
    if(d > t) d -= DAY_MS;
    return d;
  }
  if(sched.kind === 'interval'){
    const dayStart = Date.UTC(Y, M, D, 0, 0, 0);
    const period = sched.hours * 3600000;
    return dayStart + Math.floor((t - dayStart) / period) * period;
  }
  if(sched.kind === 'weekly'){
    const d = new Date(Date.UTC(Y, M, D, sched.hour, 0, 0));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - sched.weekday + 7) % 7));
    if(d.getTime() > t) d.setUTCDate(d.getUTCDate() - 7);
    return d.getTime();
  }
  if(sched.kind === 'monthly'){
    const d = new Date(Date.UTC(Y, M, sched.day, sched.hour, 0, 0));
    if(d.getTime() > t) d.setUTCMonth(d.getUTCMonth() - 1);
    return d.getTime();
  }
  return 0;
}
// Cooldown schedules ignore the fixed-UTC-grid model entirely — "next available" is purely
// lastDone + duration, so this (and isRoutineDone below) need the routine's own lastDone,
// not just the schedule definition.
function nextResetInstant(sched, now, lastDone){
  if(sched.kind === 'cooldown'){
    if(!lastDone) return now.getTime();
    return lastDone + sched.hours * 3600000;
  }
  const last = lastResetInstant(sched, now);
  if(sched.kind === 'daily')    return last + DAY_MS;
  if(sched.kind === 'interval') return last + sched.hours * 3600000;
  if(sched.kind === 'weekly')   return last + 7 * DAY_MS;
  if(sched.kind === 'monthly'){ const d = new Date(last); d.setUTCMonth(d.getUTCMonth()+1); return d.getTime(); }
  return last;
}
function isRoutineDone(item, now){
  if(!item.lastDone) return false;
  const sched = schedById(item.schedId);
  if(sched.kind === 'cooldown') return (now.getTime() - item.lastDone) < sched.hours * 3600000;
  return item.lastDone >= lastResetInstant(sched, now);
}
function fmtDue(ms){
  if(ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  if(h >= 24) return Math.floor(h/24) + 'd ' + (h % 24) + 'h';
  if(h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

/* ---------- reset sound cues ---------- */
// Tiny WebAudio beeps — no audio files to host, matches the site's local-only footprint.
let audioCtx = null;
function beep(notes){
  if(!DATA.ui.soundEnabled) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    notes.forEach(({freq,start,dur})=>{
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0+start);
      gain.gain.exponentialRampToValueAtTime(0.16, t0+start+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0+start+dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0+start); osc.stop(t0+start+dur+0.02);
    });
  }catch(e){ /* autoplay-blocked or unsupported — silent no-op, never breaks the page */ }
}
const RESET_SOUND_PLAYERS = {
  bell:  () => beep([{freq:880,start:0,dur:0.22},{freq:660,start:0.16,dur:0.3}]),   // daily / interval
  gong:  () => beep([{freq:196,start:0,dur:0.7}]),                                  // weekly — lower, longer
  chirp: () => beep([{freq:520,start:0,dur:0.09},{freq:920,start:0.07,dur:0.12}])   // 18h cooldown
};
const RESET_SOUND_BY_KIND = { daily:'bell', interval:'bell', weekly:'gong', monthly:'gong', cooldown:'chirp' };
function playResetSound(kind){ (RESET_SOUND_PLAYERS[kind] || RESET_SOUND_PLAYERS.bell)(); }
// In-memory only, never persisted. Two different signals depending on kind, since a
// cooldown's expiry instant is fixed once lastDone is set (it doesn't advance on its own),
// while a clock-based schedule's "current period" boundary advances forward every day/week
// on its own regardless of any item. So: clock-based kinds watch lastResetInstant() advance
// to a new value (the period just rolled over — that IS the reset); cooldown kind watches
// a plain "now >= expiry" boolean flip false->true. Either way, keying by schedId (not by
// item) for clock-based, and by item.id for cooldown, means N items sharing one schedule
// (e.g. 13 dailies all on daily15) collapse into one Map entry — and the Set below collapses
// multiple *different* keys that map to the same sound into a single play per tick.
const seenResetState = new Map();
function checkResetSounds(){
  const now = Date.now();
  const nowDate = new Date(now);
  const firedSounds = new Set();
  DATA.chars.forEach(c=>{
    c.routines.forEach(item=>{
      const sched = schedById(item.schedId);
      if(sched.kind === 'cooldown'){
        if(!item.lastDone) return; // nothing to expire if never done
        const key = `item:${item.id}`;
        const isDue = now >= item.lastDone + sched.hours*3600000;
        const wasDue = seenResetState.get(key);
        if(wasDue === false && isDue) firedSounds.add('chirp');
        seenResetState.set(key, isDue);
        return;
      }
      const key = `sched:${item.schedId}`;
      const periodStart = lastResetInstant(sched, nowDate);
      const prevStart = seenResetState.get(key);
      if(prevStart !== undefined && periodStart > prevStart){
        firedSounds.add(RESET_SOUND_BY_KIND[sched.kind] || 'bell');
      }
      seenResetState.set(key, periodStart);
    });
  });
  firedSounds.forEach(playResetSound);
}
function toggleResetSound(){
  DATA.ui.soundEnabled = !DATA.ui.soundEnabled;
  updateSoundToggleUI();
  scheduleSave();
}
function updateSoundToggleUI(){
  const btn = document.getElementById('oc-mute-btn');
  if(!btn) return;
  btn.textContent = DATA.ui.soundEnabled ? '🔔' : '🔕';
  btn.classList.toggle('muted', !DATA.ui.soundEnabled);
  btn.title = DATA.ui.soundEnabled ? 'Reset sounds on — click to mute' : 'Reset sounds muted — click to unmute';
}

/* ---------- patch gating ---------- */
// FFXIV patch numbers compare correctly as plain decimals (x.0 ... x.5, x.55, x.56, x.58,
// then (x+1).0 — there is no x.6). Verified against all 137 real patches 2.0–8.0: zero
// out-of-order comparisons, including leading-zero cases (3.07 < 3.1) that break naive
// integer-minor comparison. Lettered hotfix patches (6.11a) parse to their base number and
// compare equal to it — deliberate, since letter suffixes never carry new content.
function patchValue(s){
  const n = parseFloat(String(s ?? '').trim());
  return isNaN(n) ? null : n;
}
function isGated(item, patchStr){
  const need = patchValue(item.requires);
  if(need === null) return false;
  const have = patchValue(patchStr);
  if(have === null) return false;
  return need > have;
}

/* ---------- job-level ranking ---------- */
// Which job to level next: lowest among those started (level>=1, so unstarted jobs at 0
// don't all tie for "lowest") and not yet capped.
function lowestStarted(entries){
  const eligible = entries.filter(e => e.level >= 1 && e.level < e.cap);
  if(eligible.length < 2) return new Set();
  const min = Math.min(...eligible.map(e=>e.level));
  return new Set(eligible.filter(e=>e.level===min).map(e=>e.name));
}
function markerHTML(lvl, cap, isLowest){
  if(lvl >= cap) return '<span class="at-cap">at cap</span>';
  return isLowest ? '<span class="next-up">lowest</span>' : '';
}
// Ranks the bottom N distinct levels (not just the single lowest) — for beast tribe
// crafting rotations that need to know their 2nd/3rd lowest, not just one job to level.
// Ties share a rank: two jobs tied for lowest both come back as rank 1.
function rankLowestTiers(entries, maxTiers){
  const eligible = entries.filter(e => e.level >= 1 && e.level < e.cap);
  if(eligible.length < 2) return new Map();
  const tierLevels = [...new Set(eligible.map(e=>e.level))].sort((a,b)=>a-b).slice(0, maxTiers);
  const rankOf = new Map();
  eligible.forEach(e=>{
    const tier = tierLevels.indexOf(e.level);
    if(tier !== -1) rankOf.set(e.name, tier+1);
  });
  return rankOf;
}
function rankMarkerHTML(lvl, cap, rank){
  if(lvl >= cap) return '<span class="at-cap">at cap</span>';
  if(!rank) return '';
  return `<span class="next-up">${rank===1 ? 'lowest' : '#'+rank}</span>`;
}

/* ---------- generic helpers ---------- */
function num(v){ const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n) ? 0 : n; }
function fmt(n){ return Math.round(n).toLocaleString(); }
function fmtLvl(n){
  const r = Math.round(n*10)/10;
  return Number.isInteger(r) ? r.toLocaleString() : r.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
}
function pct(a,b){ return b ? ((a/b)*100) : 0; }
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Safe for interpolating into a single-quoted JS string literal inside an inline
// onclick/onchange attribute (e.g. names like "Amalj'aa" would otherwise close the
// string early and silently break the handler).
function jsStr(s){
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
function newId(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- character data model ---------- */
function newCharacter(name){
  return {
    id: newId(),
    name: name || '',
    duty:0, comm:0, roleTank:false, roleHealer:false, roleDps:false,
    playtime:{days:0,hours:0}, patch:'', showGated:false, showHidden:false,
    noPlugin:false,
    quests: Object.fromEntries(QUEST_CATS.map(([k])=>[k,0])),
    questTotals: Object.fromEntries(QUEST_CATS.map(([k,l,t])=>[k,t])),
    msqBreakdown: Object.fromEntries(MSQ_EXPANSIONS.map(([k])=>[k,0])),
    msqBreakdownTotals: Object.fromEntries(MSQ_EXPANSIONS.map(([k,l,t])=>[k,t])),
    msqBreakdownOpen: false,
    combat: Object.fromEntries(COMBAT_JOBS.map(([n])=>[n,0])),
    craft: Object.fromEntries(CRAFT_JOBS.map(n=>[n,0])),
    gather: Object.fromEntries(GATHER_JOBS.map(n=>[n,0])),
    tradeCollected:0, tradeMade:0,
    custom: [], routines: seedRoutines(), routinesSeeded: true, notes: '',
    jobQuestsDone: {}, jobQuestsOpen: {},
    server: {pdc:'', ldc:'', world:''},
    societies: Object.fromEntries(ALLIED_SOCIETIES.map(([name,exp,startRank])=>[name,{rank:startRank,points:0}])),
    intersocietalDone: {},
    societiesSynced:false,
    tmSyncedAt: null, tmSyncedVersion: null, playtimeAsOf: null
  };
}

function normalizeCharacter(c){
  if(!c.id) c.id = newId();
  if(typeof c.name !== 'string') c.name = '';
  ['duty','comm','tradeCollected','tradeMade'].forEach(k=>{ if(typeof c[k] !== 'number') c[k] = 0; });
  ['roleTank','roleHealer','roleDps','showGated','showHidden','noPlugin','societiesSynced'].forEach(k=>{ c[k] = !!c[k]; });
  if(typeof c.patch !== 'string') c.patch = '';
  if(typeof c.notes !== 'string') c.notes = '';
  if(!c.quests) c.quests = {};
  if(!c.combat) c.combat = {};
  if(!c.craft) c.craft = {};
  if(!c.gather) c.gather = {};
  if(!c.questTotals) c.questTotals = {};
  QUEST_CATS.forEach(([key,label,total])=>{ if(c.questTotals[key] === undefined) c.questTotals[key] = total; });
  if(!c.msqBreakdown) c.msqBreakdown = {};
  if(!c.msqBreakdownTotals) c.msqBreakdownTotals = {};
  MSQ_EXPANSIONS.forEach(([key,label,total])=>{
    if(c.msqBreakdown[key] === undefined) c.msqBreakdown[key] = 0;
    if(c.msqBreakdownTotals[key] === undefined) c.msqBreakdownTotals[key] = total;
  });
  c.msqBreakdownOpen = !!c.msqBreakdownOpen;
  if(typeof c.playtime === 'string'){
    const d = c.playtime.match(/(\d+)\s*d/i), h = c.playtime.match(/(\d+)\s*h/i);
    c.playtime = { days: d?parseInt(d[1]):0, hours: h?parseInt(h[1]):0 };
  }
  if(!c.playtime) c.playtime = {days:0,hours:0};
  if(!c.jobQuestsDone || typeof c.jobQuestsDone !== 'object') c.jobQuestsDone = {};
  if(!c.jobQuestsOpen || typeof c.jobQuestsOpen !== 'object') c.jobQuestsOpen = {};
  if(!c.server || typeof c.server !== 'object') c.server = {pdc:'', ldc:'', world:''};
  if(typeof c.server.pdc !== 'string') c.server.pdc = '';
  if(typeof c.server.ldc !== 'string') c.server.ldc = '';
  if(typeof c.server.world !== 'string') c.server.world = '';
  // A saved LDC/world that no longer exists under its PDC (stale data, or hand-edited
  // import) must not leave a selection the UI can't actually represent.
  if(c.server.pdc && !SERVER_DATA[c.server.pdc]) c.server = {pdc:'', ldc:'', world:''};
  else if(c.server.ldc && !(SERVER_DATA[c.server.pdc]||{})[c.server.ldc]){ c.server.ldc=''; c.server.world=''; }
  else if(c.server.world && !((SERVER_DATA[c.server.pdc]||{})[c.server.ldc]||[]).includes(c.server.world)) c.server.world='';
  if(!Array.isArray(c.custom)) c.custom = [];
  if(!Array.isArray(c.routines)) c.routines = [];
  c.routines.forEach(r=>{
    if(!r.schedId || !RESET_SCHEDULES.some(s=>s.id===r.schedId)) r.schedId = 'daily15';
    r.lastDone = typeof r.lastDone === 'number' ? r.lastDone : null;
    if(typeof r.requires !== 'string') r.requires = '';
    r.hidden = !!r.hidden;
    if(typeof r.seedKey !== 'string') r.seedKey = null;
  });
  if(!c.routinesSeeded) backfillSeedRoutines(c);
  if(!c.seedScheduleFixesApplied) applySeedScheduleFixes(c);
  if(!c.seedLabelFixesApplied) applySeedLabelFixes(c);
  if(!c.societies || typeof c.societies !== 'object') c.societies = {};
  ALLIED_SOCIETIES.forEach(([name,exp,startRank])=>{
    const s = c.societies[name];
    if(!s || typeof s !== 'object') c.societies[name] = {rank:startRank, points:0};
    else{
      if(typeof s.rank !== 'number' || !validRanksFor(name).includes(s.rank)) s.rank = startRank;
      if(typeof s.points !== 'number' || s.points < 0) s.points = 0;
    }
  });
  if(!c.intersocietalDone || typeof c.intersocietalDone !== 'object') c.intersocietalDone = {};
  if(typeof c.tmSyncedAt !== 'string') c.tmSyncedAt = null;
  if(typeof c.tmSyncedVersion !== 'string') c.tmSyncedVersion = null;
  if(typeof c.playtimeAsOf !== 'string') c.playtimeAsOf = null;
  return c;
}

/* ---------- top-level data ---------- */
let DATA = null;

async function loadData(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem('ledger-data') || 'null'); }catch(e){ raw = null; }
  if(!raw || !Array.isArray(raw.chars) || raw.chars.length === 0){
    const first = newCharacter('');
    DATA = { chars:[first], activeId:first.id, ui:{collapsed:{}} };
  }else{
    DATA = raw;
  }
  normalizeData();
}
function normalizeData(){
  DATA.chars = DATA.chars.slice(0,3).map(normalizeCharacter);
  if(!DATA.chars.find(c=>c.id===DATA.activeId)) DATA.activeId = DATA.chars[0].id;
  if(!DATA.ui || typeof DATA.ui !== 'object') DATA.ui = {};
  if(!DATA.ui.collapsed || typeof DATA.ui.collapsed !== 'object') DATA.ui.collapsed = {};
  if(typeof DATA.ui.soundEnabled !== 'boolean') DATA.ui.soundEnabled = true;
  // Earlier builds named these after the plugin's own UIs before they were
  // given aesthetic names, so a stored value may still use the old spelling.
  if(DATA.ui.theme === 'ledger') DATA.ui.theme = 'poetic';
  if(DATA.ui.theme === 'classic') DATA.ui.theme = 'midnight';
  if(!THEMES.includes(DATA.ui.theme)) DATA.ui.theme = 'poetic';
}
function getChar(cid){ return DATA.chars.find(c=>c.id===cid); }

async function save(){
  collectAllInputs();
  try{
    localStorage.setItem('ledger-data', JSON.stringify(DATA));
    document.getElementById('save-status').textContent = 'Saved locally';
  }catch(e){
    document.getElementById('save-status').textContent = 'Save failed';
  }
}
let saveTimer = null;
function scheduleSave(){
  document.getElementById('save-status').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

/* Reads every input for every character currently in the DOM (all pages exist at once,
   only display:none toggles which is visible) back into DATA. Never skips a character
   just because its page isn't the active one. */
function collectAllInputs(){
  DATA.chars.forEach(c => collectCharInputs(c.id));
}
function collectCharInputs(cid){
  const c = getChar(cid); if(!c) return;
  const g = id => document.getElementById(id);
  if(g(`${cid}-name`)) c.name = g(`${cid}-name`).value;
  if(g(`${cid}-duty`)) c.duty = num(g(`${cid}-duty`).value);
  if(g(`${cid}-comm`)) c.comm = num(g(`${cid}-comm`).value);
  if(g(`${cid}-role-tank`)) c.roleTank = g(`${cid}-role-tank`).checked;
  if(g(`${cid}-role-healer`)) c.roleHealer = g(`${cid}-role-healer`).checked;
  if(g(`${cid}-role-dps`)) c.roleDps = g(`${cid}-role-dps`).checked;
  if(g(`${cid}-playtime-days`)) c.playtime.days = num(g(`${cid}-playtime-days`).value);
  if(g(`${cid}-playtime-hours`)) c.playtime.hours = num(g(`${cid}-playtime-hours`).value);
  if(g(`${cid}-trade-collected`)) c.tradeCollected = num(g(`${cid}-trade-collected`).value);
  if(g(`${cid}-trade-made`)) c.tradeMade = num(g(`${cid}-trade-made`).value);
  if(g(`${cid}-patch`)) c.patch = g(`${cid}-patch`).value.trim();
  if(g(`${cid}-notes`)) c.notes = g(`${cid}-notes`).value;
  if(g(`${cid}-server-pdc`)) c.server.pdc = g(`${cid}-server-pdc`).value;
  if(g(`${cid}-server-ldc`)) c.server.ldc = g(`${cid}-server-ldc`).value;
  if(g(`${cid}-server-world`)) c.server.world = g(`${cid}-server-world`).value;

  QUEST_CATS.forEach(([key])=>{
    if(g(`${cid}-quest-${key}`)) c.quests[key] = num(g(`${cid}-quest-${key}`).value);
    if(g(`${cid}-total-${key}`)) c.questTotals[key] = num(g(`${cid}-total-${key}`).value);
  });
  MSQ_EXPANSIONS.forEach(([key])=>{
    if(g(`${cid}-msqexp-${key}`)) c.msqBreakdown[key] = num(g(`${cid}-msqexp-${key}`).value);
    if(g(`${cid}-msqexptotal-${key}`)) c.msqBreakdownTotals[key] = num(g(`${cid}-msqexptotal-${key}`).value);
  });
  COMBAT_JOBS.forEach(([name])=>{
    const el = g(`${cid}-combat-${name.replace(/\s/g,'')}`);
    if(el) c.combat[name] = num(el.value);
  });
  CRAFT_JOBS.forEach(name=>{ if(g(`${cid}-craft-${name}`)) c.craft[name] = num(g(`${cid}-craft-${name}`).value); });
  GATHER_JOBS.forEach(name=>{ if(g(`${cid}-gather-${name}`)) c.gather[name] = num(g(`${cid}-gather-${name}`).value); });

  c.custom.forEach(item=>{
    if(g(`${cid}-custom-label-${item.id}`)) item.label = g(`${cid}-custom-label-${item.id}`).value;
    if(g(`${cid}-custom-cur-${item.id}`)) item.current = num(g(`${cid}-custom-cur-${item.id}`).value);
    if(g(`${cid}-custom-total-${item.id}`)) item.total = num(g(`${cid}-custom-total-${item.id}`).value);
  });
  c.routines.forEach(item=>{
    if(g(`${cid}-rt-label-${item.id}`)) item.label = g(`${cid}-rt-label-${item.id}`).value;
    if(g(`${cid}-rt-sched-${item.id}`)) item.schedId = g(`${cid}-rt-sched-${item.id}`).value;
    if(g(`${cid}-rt-req-${item.id}`)) item.requires = g(`${cid}-rt-req-${item.id}`).value.trim();
  });
  ALLIED_SOCIETIES.forEach(([name])=>{
    const id = socId(name);
    if(g(`${cid}-soc-rank-${id}`)) c.societies[name].rank = num(g(`${cid}-soc-rank-${id}`).value);
    if(g(`${cid}-soc-points-${id}`)) c.societies[name].points = num(g(`${cid}-soc-points-${id}`).value);
  });
}

/* ---------- switcher ---------- */
function renderSwitcher(){
  const box = document.getElementById('switcher');
  const capNote = document.getElementById('cap-note');
  box.innerHTML = DATA.chars.map((c,i)=>{
    const accent = ACCENTS[i % ACCENTS.length];
    const seal = (c.name||'?').trim().charAt(0).toUpperCase() || '?';
    const active = c.id === DATA.activeId ? ' active' : '';
    return `<button class="switch-btn${active}" style="--accent:var(--${accent})" onclick="setActiveChar('${c.id}')">
      <div class="seal">${esc(seal)}</div>
      <div class="switch-label">
        <span class="name">${esc(c.name || 'Unnamed')}</span>
        <span class="role">Character ${i+1}</span>
      </div>
    </button>`;
  }).join('');
  if(DATA.chars.length < 3){
    box.insertAdjacentHTML('beforeend', `<button class="add-char-btn" onclick="addCharacter()">+ Add character</button>`);
    capNote.style.display = 'none';
  }else{
    capNote.style.display = '';
  }
}
function setActiveChar(cid){
  collectAllInputs();
  DATA.activeId = cid;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id === 'page-'+cid));
  renderSwitcher();
  scheduleSave();
}
function addCharacter(){
  if(DATA.chars.length >= 3) return;
  collectAllInputs();
  const c = newCharacter('');
  DATA.chars.push(c);
  DATA.activeId = c.id;
  rebuildPages();
  renderSwitcher();
  const nameEl = document.getElementById(`${c.id}-name`);
  if(nameEl) nameEl.focus();
  scheduleSave();
}
function removeCharacter(cid){
  const c = getChar(cid);
  if(!c) return;
  const label = (c.name||'').trim() || 'this character';
  if(!confirm(`Remove ${label}? This deletes everything tracked for them and can't be undone.`)) return;
  collectAllInputs();
  DATA.chars = DATA.chars.filter(x=>x.id!==cid);
  if(DATA.chars.length === 0) DATA.chars.push(newCharacter(''));
  DATA.activeId = DATA.chars[0].id;
  rebuildPages();
  renderSwitcher();
  scheduleSave();
}

/* ---------- per-character page markup ---------- */
function characterPageHTML(cid){
  return `
  <div class="section">
    <div class="char-header">
      <div class="char-name-group">
        <input type="text" class="char-name-input" id="${cid}-name" placeholder="Character name" oninput="onNameInput('${cid}')">
        <span class="patch-box">MSQ progress <input type="text" id="${cid}-patch" class="patch-input" placeholder="4.0" oninput="onPatchInput('${cid}')"></span>
      </div>
      <button class="remove-char-btn" onclick="removeCharacter('${cid}')">Remove character</button>
    </div>
    <span class="cap" id="${cid}-tm-sync-note"></span>
    <div class="server-picker" id="${cid}-server-picker"></div>
    <div class="dash-grid" id="${cid}-dash"></div>
  </div>

  <div class="tabbar" data-cid="${cid}">
      <button class="tab-btn" data-tab="overview" onclick="switchTab('${cid}','overview')">Overview</button>
      <button class="tab-btn" data-tab="routines" onclick="switchTab('${cid}','routines')">Routines</button>
      <button class="tab-btn" data-tab="jobs" onclick="switchTab('${cid}','jobs')">Jobs</button>
      <button class="tab-btn" data-tab="societies" onclick="switchTab('${cid}','societies')">Societies</button>
      <button class="tab-btn" data-tab="mentor" onclick="switchTab('${cid}','mentor')">Mentor</button>
      <button class="tab-btn" data-tab="notes" onclick="switchTab('${cid}','notes')">Notes</button>
  </div>

  <div class="tab-panel" data-tab="overview">
  <div class="section">
    <h2>Quest categories <span class="hint-group"><span class="hint" id="${cid}-pluginhint">via Time Memoria</span><button class="link-btn" id="${cid}-pluginmode-btn" onclick="toggleNoPlugin('${cid}')">I don't use the plugin</button><button class="edit-btn" id="${cid}-totals-edit-btn" onclick="toggleEditTotals('${cid}')">Edit totals</button></span></h2>
    <div class="quest-grid" id="${cid}-quests"></div>
    <div class="check-note" id="${cid}-overall-check"></div>
  </div>
  <div class="section">
    <h2>Session</h2>
    <table>
      <tr><td style="width:160px;color:var(--text-faint)">Cumulative playtime</td><td>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="text" id="${cid}-playtime-days" class="playtime-input" oninput="onPlaytimeInput('${cid}')"><span class="cap">d</span>
          <input type="text" id="${cid}-playtime-hours" class="playtime-input" oninput="onPlaytimeInput('${cid}')"><span class="cap">h</span>
          <span class="cap" id="${cid}-playtime-total" style="margin-left:8px"></span>
          <span class="cap" id="${cid}-playtime-asof" style="margin-left:8px"></span>
        </div>
      </td></tr>
    </table>
  </div>
  </div>
  <div class="tab-panel" data-tab="routines">
  <div class="section">
    <h2>Routines <span class="hint-group"><span class="hint">clears itself on the game's reset</span><button class="edit-btn" onclick="resetRoutines('${cid}')">Reset to defaults</button></span></h2>
    <div class="routine-list" id="${cid}-routines"></div>
    <div class="gated-note" id="${cid}-gated"></div>
    <div class="hidden-note" id="${cid}-hiddennote"></div>
    <button class="add-btn" onclick="addRoutine('${cid}')">+ Add routine</button>
  </div>
  </div>
  <div class="tab-panel" data-tab="jobs">
  <div class="section">
    <h2>Job levels</h2>
    <div class="subhead">Combat &middot; cap 100 (Blue Mage 80, Beastmaster 50)</div>
    <div id="${cid}-combat" class="job-columns"></div>
    <div class="two-col">
      <div>
        <div class="subhead">Crafting &middot; cap 100</div>
        <table id="${cid}-craft"></table>
      </div>
      <div>
        <div class="subhead">Gathering &middot; cap 100</div>
        <table id="${cid}-gather"></table>
      </div>
    </div>
  </div>
  </div>
  <div class="tab-panel" data-tab="societies">
  <div class="section">
    <h2>Allied society relations <span class="hint-group"><span class="hint" id="${cid}-sochint">rank + points reset to 0 on every rank-up</span><button class="link-btn" id="${cid}-socmode-btn" onclick="toggleSocietiesManual('${cid}')">Edit manually</button></span></h2>
    <div id="${cid}-societies" class="society-columns"></div>
  </div>
  </div>
  <div class="tab-panel" data-tab="mentor">
  <div class="section">
    <h2>Battle Mentor requirements
      <span class="hint">1000 dungeons &middot; 1500 comms &middot; tank + healer + 1 dps role quest</span>
    </h2>
    <table style="margin-bottom:10px">
      <tr><td style="width:120px"><input type="text" id="${cid}-duty" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 1,000 duty completions</td></tr>
      <tr><td><input type="text" id="${cid}-comm" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 1,500 commendations</td></tr>
    </table>
    <div id="${cid}-roles"></div>
  </div>
  <div class="section">
    <h2>Trade mentor requirements <span class="hint">300 collectables &middot; 100 synthesized &middot; a craft + gather job at 100</span></h2>
    <table style="margin-bottom:10px">
      <tr><td style="width:140px"><input type="text" id="${cid}-trade-collected" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 300 collectables gathered or caught</td><td style="width:60px" id="${cid}-trade-collected-done"></td></tr>
      <tr><td><input type="text" id="${cid}-trade-made" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 100 collectables synthesized</td><td style="width:60px" id="${cid}-trade-made-done"></td></tr>
    </table>
    <div id="${cid}-trade-jobs"></div>
  </div>
  </div>
  <div class="tab-panel" data-tab="notes">
  <div class="section">
    <h2>Custom trackers <span class="hint">achievements, mounts, minions, logs &mdash; add your own</span></h2>
    <div class="custom-list" id="${cid}-custom"></div>
    <button class="add-btn" onclick="addCustomRow('${cid}')">+ Add tracker</button>
  </div>
  <div class="section">
    <h2>Notes</h2>
    <textarea class="note-area" id="${cid}-notes" placeholder="Anything worth remembering — GC, retainers, sync points, whatever." oninput="scheduleSave()"></textarea>
  </div>
  </div>`;
}

function rebuildPages(){
  const box = document.getElementById('pages');
  box.innerHTML = DATA.chars.map(c=>
    `<div class="page${c.id===DATA.activeId?' active':''}" id="page-${c.id}">${characterPageHTML(c.id)}</div>`
  ).join('');
  DATA.chars.forEach(c=>renderChar(c.id));
  initCollapsible();
  DATA.chars.forEach(c=>applyTab(c.id, activeTab(c.id)));
}

/* ---------- tabs ---------- */
/* Sections are grouped rather than stacked, so reaching routines is a click
   instead of a scroll past everything else. Each character remembers its own
   tab, since two characters are usually being tracked for different reasons. */
function activeTab(cid){
  const saved = (DATA.ui.tabs||{})[cid];
  const exists = saved && document.querySelector(`#page-${cid} .tab-panel[data-tab="${saved}"]`);
  return exists ? saved : 'overview';
}

function switchTab(cid, tab){
  DATA.ui.tabs = DATA.ui.tabs || {};
  DATA.ui.tabs[cid] = tab;
  applyTab(cid, tab);
  scheduleSave();
}

/* ---------- theme ---------- */
/* Every colour in the stylesheet resolves through a custom property, so a theme
   is a variable swap on the root element rather than a second set of rules.
   Poetic is the site's own look; Midnight and Daylight follow the plugin's
   Classic and Native windows. */
const THEMES = ['poetic','midnight','daylight'];
function setTheme(name){
  DATA.ui.theme = name;
  applyTheme();
  scheduleSave();
}
function applyTheme(){
  const theme = DATA.ui.theme || 'poetic';
  // The default palette lives in :root itself, so it is the absence of the
  // attribute rather than a value of its own.
  if(theme === 'poetic') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelectorAll('.theme-switch button').forEach(b=>{
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}

function applyTab(cid, tab){
  const page = document.getElementById('page-'+cid);
  if(!page) return;
  page.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.dataset.tab===tab));
  page.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
}

/* ---------- per-character render/update ---------- */
function renderCharDash(cid){
  const c = getChar(cid);
  const dutyPct = pct(c.duty,1000), commPct = pct(c.comm,1500);
  const rolesGot = [c.roleTank,c.roleHealer,c.roleDps].filter(Boolean).length;
  const overallPct = ((Math.min(c.duty,1000)/1000)+(Math.min(c.comm,1500)/1500)+(c.roleTank?1:0)+(c.roleHealer?1:0)+(c.roleDps?1:0))/5*100;
  const combatTotal = Object.values(c.combat).reduce((a,b)=>a+b,0);
  const craftTotal = Object.values(c.craft).reduce((a,b)=>a+b,0);
  const gatherTotal = Object.values(c.gather).reduce((a,b)=>a+b,0);
  const questPct = pct(c.quests.overall, c.questTotals.overall);
  document.getElementById(cid+'-dash').innerHTML = `
    <div class="metric ${c.duty>=1000?'done':''}"><div class="label">Duty completions</div><div class="value">${fmt(c.duty)}<small> / 1,000</small></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(dutyPct,100)}%"></div></div></div>
    <div class="metric ${c.comm>=1500?'done':''}"><div class="label">Commendations</div><div class="value">${fmt(c.comm)}<small> / 1,500</small></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(commPct,100)}%"></div></div></div>
    <div class="metric ${rolesGot>=3?'done':''}"><div class="label">Battle mentor role quests</div><div class="value">${rolesGot}<small> / 3 req'd</small></div><div class="bar-track"><div class="bar-fill" style="width:${rolesGot/3*100}%"></div></div></div>
    <div class="metric"><div class="label">Overall to Battle Mentor</div><div class="value">${overallPct.toFixed(1)}%</div><div class="bar-track"><div class="bar-fill" style="width:${overallPct}%"></div></div></div>
    <div class="metric"><div class="label">Quest completion</div><div class="value">${questPct.toFixed(2)}%</div><div class="bar-track"><div class="bar-fill" style="width:${questPct}%"></div></div></div>
    <div class="metric"><div class="label">Combat levels</div><div class="value">${fmtLvl(combatTotal)}<small> / 2,230</small></div><div class="bar-track"><div class="bar-fill" style="width:${pct(combatTotal,2230)}%"></div></div></div>
    <div class="metric"><div class="label">Crafting levels</div><div class="value">${fmtLvl(craftTotal)}<small> / 800</small></div><div class="bar-track"><div class="bar-fill" style="width:${pct(craftTotal,800)}%"></div></div></div>
    <div class="metric"><div class="label">Gathering levels</div><div class="value">${fmtLvl(gatherTotal)}<small> / 300</small></div><div class="bar-track"><div class="bar-fill" style="width:${pct(gatherTotal,300)}%"></div></div></div>
  `;
}

function renderRoles(cid){
  const c = getChar(cid);
  const tankReady = COMBAT_JOBS.filter(([n,r])=>r==="Tank").some(([n])=>c.combat[n]>=100);
  document.getElementById(cid+'-roles').innerHTML = `
    <div class="check-row"><label><input type="checkbox" id="${cid}-role-tank" ${c.roleTank?'checked':''} onchange="onMainInput('${cid}')"> Tank role quest &mdash; No Sleep Till Tuliyollal <span class="qname">${tankReady?'':'(needs a tank at 100)'}</span></label>${c.roleTank?'<span class="stamp">done</span>':'<span class="stamp pending">pending</span>'}</div>
    <div class="check-row"><label><input type="checkbox" id="${cid}-role-healer" ${c.roleHealer?'checked':''} onchange="onMainInput('${cid}')"> Healer role quest &mdash; An Antidote for Anarchy</label>${c.roleHealer?'<span class="stamp">done</span>':'<span class="stamp pending">pending</span>'}</div>
    <div class="check-row"><label><input type="checkbox" id="${cid}-role-dps" ${c.roleDps?'checked':''} onchange="onMainInput('${cid}')"> One DPS role quest (any of the three)</label>${c.roleDps?'<span class="stamp">done</span>':'<span class="stamp pending">pending</span>'}</div>
  `;
}

function updateTradeMentorChecks(cid){
  const c = getChar(cid);
  const craftJob = CRAFT_JOBS.find(name => (c.craft[name]||0) >= 100);
  const gatherJob = GATHER_JOBS.find(name => (c.gather[name]||0) >= 100);
  const row = (label, job) => `
    <div class="check-row">
      <span>${label}${job ? ` <span class="qname">(${job})</span>` : ''}</span>
      ${job ? '<span class="stamp">done</span>' : '<span class="stamp pending">pending</span>'}
    </div>`;
  document.getElementById(cid+'-trade-jobs').innerHTML =
    row('Crafting job at level 100', craftJob) + row('Gathering job at level 100', gatherJob);
  const collectedEl = document.getElementById(cid+'-trade-collected-done');
  const madeEl = document.getElementById(cid+'-trade-made-done');
  if(collectedEl) collectedEl.innerHTML = c.tradeCollected >= 300 ? '<span class="at-cap">done</span>' : '';
  if(madeEl) madeEl.innerHTML = c.tradeMade >= 100 ? '<span class="at-cap">done</span>' : '';
}

function updatePlaytimeTotal(cid){
  const c = getChar(cid);
  document.getElementById(cid+'-playtime-total').textContent = `= ${c.playtime.days*24 + c.playtime.hours}h total`;
  const asofEl = document.getElementById(cid+'-playtime-asof');
  if(asofEl) asofEl.textContent = c.playtimeAsOf ? `· as of ${fmtTmTimestamp(c.playtimeAsOf)}` : '';
}
// Playtime only advances when the player runs /playtime in-game, so its own freshness
// (playtimeAsOf) can lag behind the rest of a Time Memoria import — tracked separately
// from tmSyncedAt, which stamps the whole import.
function renderTmSyncNote(cid){
  const c = getChar(cid);
  const el = document.getElementById(cid+'-tm-sync-note');
  if(!el) return;
  el.textContent = c.tmSyncedAt ? `Synced from Time Memoria v${c.tmSyncedVersion||'?'} · ${fmtTmTimestamp(c.tmSyncedAt)}` : '';
}
function fmtTmTimestamp(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
}

function updateOverallCheck(cid){
  const el = document.getElementById(cid+'-overall-check');
  if(!el) return;
  const c = getChar(cid);
  let sumDone=0, sumTotal=0;
  SUB_CATS.forEach(([key])=>{ sumDone += c.quests[key]||0; sumTotal += c.questTotals[key]||0; });
  const doneOk = sumDone === (c.quests.overall||0), totalOk = sumTotal === (c.questTotals.overall||0);
  if(doneOk && totalOk){
    el.className = 'check-note ok';
    el.textContent = `✓ sub-categories sum to ${fmt(sumDone)} / ${fmt(sumTotal)} — matches Overall`;
  }else{
    const parts=[];
    if(!doneOk) parts.push(`done ${fmt(sumDone)} vs Overall ${fmt(c.quests.overall||0)}`);
    if(!totalOk) parts.push(`total ${fmt(sumTotal)} vs Overall ${fmt(c.questTotals.overall||0)}`);
    el.className = 'check-note warn';
    el.textContent = `⚠ sub-categories disagree with Overall — ${parts.join('; ')}`;
  }
}

let editingTotals = {};
function toggleEditTotals(cid){
  editingTotals[cid] = !editingTotals[cid];
  const btn = document.getElementById(cid+'-totals-edit-btn');
  btn.textContent = editingTotals[cid] ? 'Done editing' : 'Edit totals';
  btn.classList.toggle('active', editingTotals[cid]);
  renderQuestsTable(cid);
}
function onTotalInput(cid){
  collectAllInputs();
  updateQuestPercents(cid);
  updateOverallCheck(cid);
  updateMsqCheckNote(cid);
  renderCharDash(cid);
  scheduleSave();
}
function renderQuestsTable(cid){
  const c = getChar(cid);
  let rows = `<div class="h">Category</div><div class="h" style="text-align:right">Done</div><div class="h" style="text-align:right">Total</div><div class="h" style="text-align:right">%</div>`;
  QUEST_CATS.forEach(([key,label])=>{
    const v = c.quests[key]||0, total = c.questTotals[key];
    const totalCell = editingTotals[cid]
      ? `<input type="text" class="total-input" id="${cid}-total-${key}" value="${total}" oninput="onTotalInput('${cid}')">`
      : total.toLocaleString();
    // Main Scenario gets a per-expansion breakdown option — the no-plugin fallback. Same
    // number-entry pattern as every other category, not a quest-by-quest checklist; the
    // user types each expansion's own done/total (from the wiki or their own count),
    // and a mini consistency check confirms it against this row's own numbers, same
    // relationship as Overall vs. the seven categories.
    const labelCell = (key==='msq' && c.noPlugin)
      ? `${label} ${msqToggleHTML(cid)}`
      : label;
    rows += `
      <div>${labelCell}</div>
      <div><input type="text" id="${cid}-quest-${key}" value="${v}" style="text-align:right" oninput="onMainInput('${cid}')"></div>
      <div style="text-align:right" class="cap">${totalCell}</div>
      <div style="text-align:right;font-family:var(--font-mono);color:var(--text-dim)" id="${cid}-qpct-${key}">${pct(v,total).toFixed(1)}%</div>
    `;
    if(key==='msq' && c.noPlugin){
      rows += `<div id="${cid}-msqrow" style="grid-column:1/-1;${c.msqBreakdownOpen?'':'display:none'}"></div>`;
    }
  });
  document.getElementById(cid+'-quests').innerHTML = rows;
  const msqRow = document.getElementById(`${cid}-msqrow`);
  if(msqRow && c.noPlugin){
    msqRow.style.display = c.msqBreakdownOpen ? '' : 'none';
    if(c.msqBreakdownOpen) msqRow.innerHTML = msqBreakdownPanelHTML(cid);
  }
}
function renderPluginMode(cid){
  const c = getChar(cid);
  const hint = document.getElementById(`${cid}-pluginhint`);
  const btn = document.getElementById(`${cid}-pluginmode-btn`);
  if(hint) hint.textContent = c.noPlugin ? 'manual entry — no plugin' : 'via Time Memoria';
  if(btn) btn.textContent = c.noPlugin ? 'I use Time Memoria' : "I don't use the plugin";
}
function toggleNoPlugin(cid){
  collectAllInputs();
  const c = getChar(cid);
  c.noPlugin = !c.noPlugin;
  if(!c.noPlugin) c.msqBreakdownOpen = false;
  renderPluginMode(cid);
  renderQuestsTable(cid);
  scheduleSave();
}

/* ---------- MSQ per-expansion breakdown (no-plugin fallback) ---------- */
function msqToggleHTML(cid){
  const c = getChar(cid);
  return `<button class="jq-toggle neutral" id="${cid}-msqbtn" onclick="toggleMsqBreakdown('${cid}')">${c.msqBreakdownOpen?'hide':'by expansion'}</button>`;
}
function msqCheck(cid){
  const c = getChar(cid);
  let sumDone=0, sumTotal=0;
  MSQ_EXPANSIONS.forEach(([key])=>{ sumDone += c.msqBreakdown[key]||0; sumTotal += c.msqBreakdownTotals[key]||0; });
  const doneOk = sumDone === (c.quests.msq||0), totalOk = sumTotal === (c.questTotals.msq||0);
  if(doneOk && totalOk){
    return { cls:'ok', text:`✓ expansions sum to ${fmt(sumDone)} / ${fmt(sumTotal)} — matches Main scenario` };
  }
  const parts=[];
  if(!doneOk) parts.push(`done ${fmt(sumDone)} vs Main scenario ${fmt(c.quests.msq||0)}`);
  if(!totalOk) parts.push(`total ${fmt(sumTotal)} vs Main scenario ${fmt(c.questTotals.msq||0)}`);
  return { cls:'warn', text:`⚠ expansions disagree — ${parts.join('; ')}` };
}
function msqBreakdownPanelHTML(cid){
  const c = getChar(cid);
  const rows = MSQ_EXPANSIONS.map(([key,label])=>{
    const v = c.msqBreakdown[key]||0, t = c.msqBreakdownTotals[key];
    return `<div class="jq-item">
      <span class="jq-name" style="flex:1">${esc(label)}</span>
      <input type="text" id="${cid}-msqexp-${key}" value="${v}" style="width:56px;text-align:right" oninput="onMsqExpInput('${cid}')">
      <span class="jq-level" style="width:12px;text-align:center;flex:0 0 auto">/</span>
      <input type="text" id="${cid}-msqexptotal-${key}" value="${t}" style="width:56px;text-align:right" oninput="onMsqExpInput('${cid}')">
      <span class="jq-level" style="width:50px;text-align:right;font-family:var(--font-mono)" id="${cid}-msqexppct-${key}">${pct(v,t).toFixed(1)}%</span>
    </div>`;
  }).join('');
  const check = msqCheck(cid);
  return `<div class="jq-panel">${rows}<div class="check-note ${check.cls}" id="${cid}-msqcheck" style="margin-top:8px">${check.text}</div></div>`;
}
function toggleMsqBreakdown(cid){
  collectAllInputs();
  const c = getChar(cid);
  c.msqBreakdownOpen = !c.msqBreakdownOpen;
  const row = document.getElementById(`${cid}-msqrow`);
  const btn = document.getElementById(`${cid}-msqbtn`);
  if(row){
    row.style.display = c.msqBreakdownOpen ? '' : 'none';
    row.innerHTML = c.msqBreakdownOpen ? msqBreakdownPanelHTML(cid) : '';
  }
  if(btn) btn.textContent = c.msqBreakdownOpen ? 'hide' : 'by expansion';
  scheduleSave();
}
function onMsqExpInput(cid){
  collectAllInputs();
  const c = getChar(cid);
  MSQ_EXPANSIONS.forEach(([key])=>{
    const v = c.msqBreakdown[key]||0, t = c.msqBreakdownTotals[key];
    const el = document.getElementById(`${cid}-msqexppct-${key}`);
    if(el) el.textContent = pct(v,t).toFixed(1)+'%';
  });
  updateMsqCheckNote(cid);
  scheduleSave();
}
function updateMsqCheckNote(cid){
  const el = document.getElementById(`${cid}-msqcheck`);
  if(!el) return;
  const check = msqCheck(cid);
  el.className = 'check-note '+check.cls;
  el.textContent = check.text;
}
function updateQuestPercents(cid){
  const c = getChar(cid);
  QUEST_CATS.forEach(([key])=>{
    const v = c.quests[key]||0, total = c.questTotals[key];
    const el = document.getElementById(cid+'-qpct-'+key);
    if(el) el.textContent = pct(v,total).toFixed(1)+'%';
  });
}

function renderJobTables(cid){
  // Grouped by role rather than one flat list of twenty-three, which is how the
  // game's own job panel reads and how people think about it — "what are my
  // healers on", not "what is job fourteen". Limited jobs keep their own group
  // instead of sitting under Melee and Magical Ranged where the game files them:
  // they cap early and cannot be levelled by the same means, so grouping them
  // with jobs that can would invite the wrong comparison.
  const ROLE_ORDER = ['Tank','Healer','Melee','Phys R','Mag R','Limited'];
  const ROLE_LABEL = {
    'Tank':'Tank', 'Healer':'Healer', 'Melee':'Melee DPS',
    'Phys R':'Physical Ranged DPS', 'Mag R':'Magical Ranged DPS',
    'Limited':'Limited &middot; Blue Mage 80, Beastmaster 50'
  };

  document.getElementById(cid+'-combat').innerHTML = ROLE_ORDER.map(role=>{
    const rows = COMBAT_JOBS.filter(j=>j[1]===role)
      .map(([name,r,capOverride])=>combatRowHTML(cid,name,r,capOverride)).join('');
    if(!rows) return '';
    return `<div class="job-role"><div class="subhead">${ROLE_LABEL[role]}</div><table>${rows}</table></div>`;
  }).join('');
  document.getElementById(cid+'-craft').innerHTML = CRAFT_JOBS.map(name=>craftGatherRowHTML(cid,'craft',name)).join('');
  document.getElementById(cid+'-gather').innerHTML = GATHER_JOBS.map(name=>craftGatherRowHTML(cid,'gather',name)).join('');
  updateJobCaps(cid);
}

/* ---------- allied society reputation ---------- */
function societyRowHTML(cid, name){
  const c = getChar(cid);
  const s = c.societies[name];
  const [, exp] = ALLIED_SOCIETIES.find(a=>a[0]===name);
  const info = rankInfo(s.rank);
  const id = socId(name);
  const rankOpts = validRanksFor(name)
    .map(rank=>{ const r = rankInfo(rank); return `<option value="${r.rank}"${r.rank===s.rank?' selected':''}>${r.rank}. ${esc(r.name)}</option>`; }).join('');
  const capped = info.quota === 0;
  const cappedText = INTERSOCIETAL_QUESTS[exp]
    ? `capped &mdash; needs ${esc(INTERSOCIETAL_QUESTS[exp])}`
    : `capped &mdash; Bloodsworn is the max (no Intersocietal Quests exist for ${esc(exp)})`;
  // Read-only once Time Memoria has sent the real figures: the plugin reads them from the
  // game every time, so an editable control would only ever let someone make it wrong.
  // Everyone else keeps the dropdowns — most of the FC does not run the plugin, and this
  // page is for them too.
  const rankCell = c.societiesSynced
    ? `<span class="society-rank">${info.rank}. ${esc(info.name)}</span>`
    : `<select id="${cid}-soc-rank-${id}" onchange="onSocietyRankChange('${cid}','${jsStr(name)}')">${rankOpts}</select>`;

  const pointsCell = capped
    ? `<span class="society-capped">${cappedText}</span>`
    : c.societiesSynced
      ? `<span class="society-points">${s.points}</span><span class="society-quota">/ ${info.quota}</span>`
      : `<input type="text" id="${cid}-soc-points-${id}" value="${s.points}" style="text-align:right" oninput="onSocietyPointsInput('${cid}','${jsStr(name)}')">
         <span class="society-quota">/ ${info.quota}</span>`;

  return `
    <div class="society-item">
      <span class="society-name">${esc(name)}</span>
      ${rankCell}
      ${pointsCell}
    </div>`;
}
// True once every society in the group is sitting at rank 8 — the point-earning cap for all
// of them regardless of how far their individual ladder runs (Trusted for the four early-cap
// ARR societies, Sworn for everyone else). That's the real in-game gate on starting the
// Intersocietal Quests chain.
function intersocietalReady(c, exp){
  return ALLIED_SOCIETIES.filter(a=>a[1]===exp).every(([name])=>c.societies[name].rank>=8);
}
function intersocietalRowHTML(cid, exp){
  const c = getChar(cid);
  const done = !!c.intersocietalDone[exp];
  const id = 'inter-'+socId(exp);
  return `
    <div class="check-row">
      <label><input type="checkbox" id="${cid}-${id}" ${done?'checked':''} onchange="toggleIntersocietal('${cid}','${exp}')"> ${esc(INTERSOCIETAL_QUESTS[exp])}</label>
      ${done?'<span class="stamp">done</span>':'<span class="stamp pending">ready</span>'}
    </div>`;
}
// Full render, safe to call on any rank change (a discrete <select> change, not continuous
// typing) since it rebuilds every row — including toggling the points input vs. the capped
// note depending on the newly selected rank's quota, and whether the Intersocietal Quests
// prompt should appear below the group at all.
function renderSocieties(cid){
  const c = getChar(cid);
  const have = patchValue(c.patch);
  const groups = [...new Set(ALLIED_SOCIETIES.map(a=>a[1]))]
    .filter(exp => !(have !== null && SOCIETY_EXP_GATE[exp] > have));
  // Each expansion is one block rather than loose siblings, so the columns on a
  // wide screen can never split a heading from the societies under it.
  const html = groups.map(exp => `
    <div class="society-exp">
      <div class="subhead">${esc(exp)}</div>
      <div class="society-group">${ALLIED_SOCIETIES.filter(a=>a[1]===exp).map(a=>societyRowHTML(cid,a[0])).join('')}</div>
      ${INTERSOCIETAL_QUESTS[exp] && intersocietalReady(c,exp) ? intersocietalRowHTML(cid,exp) : ''}
    </div>
  `).join('');
  document.getElementById(cid+'-societies').innerHTML = html || '<div class="empty-hint">Set your MSQ progress above to see allied societies as you unlock them.</div>';
  updateSocietyModeUi(cid);
}
// Hands the section back to manual entry, or back to the plugin's figures. Not a
// destructive switch either way — the stored values are the same numbers; this only
// decides who is allowed to write them.
function toggleSocietiesManual(cid){
  const c = getChar(cid);
  if(!c) return;

  collectAllInputs();
  c.societiesSynced = !c.societiesSynced;
  renderSocieties(cid);
  scheduleSave();
}

// Reflects which mode the section is in, the same way the quest categories header does.
function updateSocietyModeUi(cid){
  const c = getChar(cid);
  if(!c) return;

  const hint = document.getElementById(`${cid}-sochint`);
  const btn = document.getElementById(`${cid}-socmode-btn`);

  if(hint) hint.textContent = c.societiesSynced
    ? 'via Time Memoria'
    : 'rank + points reset to 0 on every rank-up';

  if(btn){
    btn.textContent = c.societiesSynced ? 'Edit manually' : 'Use Time Memoria';
    // Nothing to go back to until an import has actually happened.
    btn.style.display = (c.societiesSynced || c.tmSyncedAt) ? '' : 'none';
  }
}

function toggleIntersocietal(cid, exp){
  const c = getChar(cid);
  const id = 'inter-'+socId(exp);
  const chk = document.getElementById(`${cid}-${id}`);
  if(!chk) return;
  c.intersocietalDone[exp] = chk.checked;
  const stamp = chk.closest('.check-row').querySelector('.stamp');
  stamp.textContent = chk.checked ? 'done' : 'ready';
  stamp.classList.toggle('pending', !chk.checked);
  scheduleSave();
}
function onSocietyRankChange(cid, name){
  collectAllInputs();
  renderSocieties(cid);
  scheduleSave();
}
// Points typed in never need anything else on screen to update (quota only depends on
// rank), so this deliberately never touches the DOM — never rebuild a text input the user
// is mid-keystroke in.
function onSocietyPointsInput(cid, name){
  collectAllInputs();
  scheduleSave();
}

/* ---------- job quest checklist (levels 1-70) ---------- */
// Job names never collide across combat/craft/gather, so one lookup covers all three.
function jobLevelOf(c, job){
  if(c.combat[job] !== undefined) return c.combat[job]||0;
  if(c.craft[job] !== undefined) return c.craft[job]||0;
  return c.gather[job]||0;
}
function jqToggleHTML(cid, job, lvl){
  const c = getChar(cid);
  // No sourced list yet (Viper, Pictomancer, Beastmaster) must read as "no data," never
  // as a false "caught up" — zero missed only means something when there's a real list.
  if(!JOB_QUESTS[job] || !JOB_QUESTS[job].length){
    return `<button class="jq-toggle neutral" id="${cid}-jqbtn-${job}" onclick="toggleJobQuests('${cid}','${job}')">&mdash;</button>`;
  }
  const missed = missedJobQuests(job, lvl, c.jobQuestsDone);
  const cls = lvl<=0 ? 'neutral' : (missed.length ? 'warn' : 'ok');
  const label = lvl<=0 ? 'quests' : (missed.length ? `⚠ ${missed.length}` : '✓');
  return `<button class="jq-toggle ${cls}" id="${cid}-jqbtn-${job}" onclick="toggleJobQuests('${cid}','${job}')">${label}</button>`;
}
// Own (per-job) quests and shared role quests, merged and level-sorted. Same deterministic
// order every call (stable sort, own always concatenated before role) so an index computed
// here still points at the same quest when toggleJobQuestDone looks it back up.
function mergedJobQuestList(job){
  const ownList = (JOB_QUESTS[job] || []).map(q => ({level:q.level, name:q.name, src:'own'}));
  const roleList = roleQuestsFor(job).map(q => ({level:q.level, name:q.name, src:'role', trackKey:q.trackKey}));
  return ownList.concat(roleList).sort((a,b)=>a.level-b.level);
}
function jqPanelHTML(cid, job){
  const c = getChar(cid);
  const lvl = jobLevelOf(c, job);
  const done = c.jobQuestsDone[job] || {};
  const list = mergedJobQuestList(job);
  const items = list.map((q,i)=>{
    const isDone = q.src==='own' ? !!done[q.name] : !!((c.jobQuestsDone['role:'+q.trackKey] || {})[q.name]);
    const isMissed = q.level <= lvl && !isDone;
    return `<div class="jq-item${isMissed?' missed':''}${q.level>lvl?' future':''}">
      <input type="checkbox" id="${cid}-jq-${job}-${i}" ${isDone?'checked':''} onchange="toggleJobQuestDone('${cid}','${job}',${i})">
      <span class="jq-level">Lv.${q.level}</span>
      <span class="jq-name">${esc(q.name)}${q.src==='role'?' <span class="jq-shared-tag">shared</span>':''}</span>
      ${isMissed?'<span class="jq-flag">not done</span>':''}
    </div>`;
  }).join('');
  return `<div class="jq-panel">${items || '<div class="empty-hint">No quest data loaded for this job yet.</div>'}</div>`;
}
function combatRowHTML(cid, name, role, capOverride){
  const c = getChar(cid);
  const cap = capOverride || 100, lvl = c.combat[name]||0, id = name.replace(/\s/g,'');
  const open = !!c.jobQuestsOpen[name];
  return `<tr>
      <td><div class="job-cell"><span class="role-tag">${role}</span><span class="job-name">${name}</span></div></td>
      <td style="width:104px"><input type="text" id="${cid}-combat-${id}" value="${lvl}" oninput="onMainInput('${cid}')"></td>
      <td style="width:60px" class="cap">/ ${cap}</td>
      <td style="width:60px" id="${cid}-ccap-${id}">${lvl>=cap?'<span class="at-cap">at cap</span>':''}</td>
      <td style="width:56px" id="${cid}-jqcell-${name}">${jqToggleHTML(cid,name,lvl)}</td>
    </tr>
    <tr class="jq-panel-row" id="${cid}-jqrow-${name}" style="${open?'':'display:none'}">
      <td colspan="5" id="${cid}-jqpanel-${name}">${open ? jqPanelHTML(cid,name) : ''}</td>
    </tr>`;
}
function craftGatherRowHTML(cid, kind, name){
  const c = getChar(cid);
  const lvl = (kind==='craft' ? c.craft[name] : c.gather[name]) || 0;
  const open = !!c.jobQuestsOpen[name];
  const inputId = `${cid}-${kind}-${name}`;
  const markId = `${cid}-${kind==='craft'?'craftmark':'gathermark'}-${name}`;
  return `<tr>
      <td>${name}</td>
      <td style="width:96px"><input type="text" id="${inputId}" value="${lvl}" oninput="onMainInput('${cid}')"></td>
      <td class="cap" style="width:52px">/ 100</td>
      <td style="width:66px" id="${markId}"></td>
      <td style="width:56px" id="${cid}-jqcell-${name}">${jqToggleHTML(cid,name,lvl)}</td>
    </tr>
    <tr class="jq-panel-row" id="${cid}-jqrow-${name}" style="${open?'':'display:none'}">
      <td colspan="5" id="${cid}-jqpanel-${name}">${open ? jqPanelHTML(cid,name) : ''}</td>
    </tr>`;
}
function toggleJobQuests(cid, job){
  collectAllInputs();
  const c = getChar(cid);
  c.jobQuestsOpen[job] = !c.jobQuestsOpen[job];
  const row = document.getElementById(`${cid}-jqrow-${job}`);
  const cell = document.getElementById(`${cid}-jqpanel-${job}`);
  if(c.jobQuestsOpen[job]){
    row.style.display = '';
    cell.innerHTML = jqPanelHTML(cid, job);
  }else{
    row.style.display = 'none';
    cell.innerHTML = '';
  }
  scheduleSave();
}
function toggleJobQuestDone(cid, job, index){
  const c = getChar(cid);
  const q = mergedJobQuestList(job)[index];
  if(!q) return;
  const chk = document.getElementById(`${cid}-jq-${job}-${index}`);
  if(q.src==='role'){
    const key = 'role:'+q.trackKey;
    if(!c.jobQuestsDone[key]) c.jobQuestsDone[key] = {};
    c.jobQuestsDone[key][q.name] = chk.checked;
  }else{
    if(!c.jobQuestsDone[job]) c.jobQuestsDone[job] = {};
    c.jobQuestsDone[job][q.name] = chk.checked;
  }
  const lvl = jobLevelOf(c, job);
  const item = chk.closest('.jq-item');
  const isMissed = q.level <= lvl && !chk.checked;
  item.classList.toggle('missed', isMissed);
  const flag = item.querySelector('.jq-flag');
  if(isMissed && !flag) item.insertAdjacentHTML('beforeend', '<span class="jq-flag">not done</span>');
  if(!isMissed && flag) flag.remove();
  const btnCell = document.getElementById(`${cid}-jqcell-${job}`);
  if(btnCell) btnCell.innerHTML = jqToggleHTML(cid, job, lvl);
  scheduleSave();
}
function updateJobCaps(cid){
  const c = getChar(cid);
  const combatEntries = COMBAT_JOBS.map(([name,role,capOverride])=>({ name, level: c.combat[name]||0, cap: capOverride||100 }));
  const combatLow = lowestStarted(combatEntries);
  combatEntries.forEach(e=>{
    const el = document.getElementById(cid+'-ccap-'+e.name.replace(/\s/g,''));
    if(el) el.innerHTML = markerHTML(e.level, e.cap, combatLow.has(e.name));
  });
  const craftEntries = CRAFT_JOBS.map(name=>({ name, level: c.craft[name]||0, cap:100 }));
  const craftRanks = rankLowestTiers(craftEntries, 3);
  craftEntries.forEach(e=>{
    const el = document.getElementById(cid+'-craftmark-'+e.name);
    if(el) el.innerHTML = rankMarkerHTML(e.level, e.cap, craftRanks.get(e.name));
  });
  const gatherEntries = GATHER_JOBS.map(name=>({ name, level: c.gather[name]||0, cap:100 }));
  const gatherLow = lowestStarted(gatherEntries);
  gatherEntries.forEach(e=>{
    const el = document.getElementById(cid+'-gathermark-'+e.name);
    if(el) el.innerHTML = markerHTML(e.level, e.cap, gatherLow.has(e.name));
  });

  // Job-quest badges and any open checklist panel need to reflect a level typed just now,
  // not only refresh on the next full page render.
  [...combatEntries, ...craftEntries, ...gatherEntries].forEach(e=>{
    const btnCell = document.getElementById(`${cid}-jqcell-${e.name}`);
    if(btnCell) btnCell.innerHTML = jqToggleHTML(cid, e.name, e.level);
    if(c.jobQuestsOpen[e.name]){
      const panel = document.getElementById(`${cid}-jqpanel-${e.name}`);
      if(panel) panel.innerHTML = jqPanelHTML(cid, e.name);
    }
  });
}

/* ---------- custom trackers (per character) ---------- */
function customRowHTML(cid, item){
  const p = pct(item.current, item.total);
  const call = `onCustomInput('${cid}','${item.id}')`;
  return `
    <div class="custom-item" id="${cid}-custom-item-${item.id}">
      <div class="custom-row">
        <input type="text" id="${cid}-custom-label-${item.id}" value="${esc(item.label)}" placeholder="Name (e.g. Mounts)" oninput="${call}">
        <input type="text" id="${cid}-custom-cur-${item.id}" value="${item.current}" style="text-align:right" oninput="${call}">
        <span class="slash">/</span>
        <input type="text" id="${cid}-custom-total-${item.id}" value="${item.total}" style="text-align:right" oninput="${call}">
        <span class="pct" id="${cid}-custom-pct-${item.id}">${p.toFixed(1)}%</span>
        <button class="remove-btn" title="Remove this tracker" onclick="removeCustomRow('${cid}','${item.id}')">&times;</button>
      </div>
      <div class="bar-track"><div class="bar-fill" id="${cid}-custom-bar-${item.id}" style="width:${Math.min(p,100)}%"></div></div>
    </div>`;
}
function renderCustom(cid){
  const box = document.getElementById(cid+'-custom');
  if(!box) return;
  const list = getChar(cid).custom;
  box.innerHTML = list.length
    ? list.map(item=>customRowHTML(cid,item)).join('')
    : '<div class="empty-hint">Nothing yet &mdash; add achievements, mounts, minions, hunting log, or anything else worth counting.</div>';
}
function addCustomRow(cid){
  collectAllInputs();
  const item = { id:newId(), label:'', current:0, total:100 };
  getChar(cid).custom.push(item);
  const box = document.getElementById(cid+'-custom');
  const hint = box.querySelector('.empty-hint');
  if(hint) hint.remove();
  box.insertAdjacentHTML('beforeend', customRowHTML(cid, item));
  const labelEl = document.getElementById(`${cid}-custom-label-${item.id}`);
  if(labelEl) labelEl.focus();
  scheduleSave();
}
function removeCustomRow(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.custom.find(i=>i.id===id);
  if(item && ((item.label||'').trim() || item.current)){
    const name = (item.label||'').trim() || 'this tracker';
    if(!confirm(`Remove "${name}"?`)) return;
  }
  c.custom = c.custom.filter(i=>i.id!==id);
  const node = document.getElementById(`${cid}-custom-item-${id}`);
  if(node) node.remove();
  if(c.custom.length===0) renderCustom(cid);
  scheduleSave();
}
function onCustomInput(cid, id){
  collectAllInputs();
  const item = getChar(cid).custom.find(i=>i.id===id);
  if(item){
    const p = pct(item.current, item.total);
    const pctEl = document.getElementById(`${cid}-custom-pct-${id}`);
    const barEl = document.getElementById(`${cid}-custom-bar-${id}`);
    if(pctEl) pctEl.textContent = p.toFixed(1)+'%';
    if(barEl) barEl.style.width = Math.min(p,100)+'%';
  }
  scheduleSave();
}

/* ---------- routines (per character) ---------- */
function routineHTML(cid, item){
  const now = new Date();
  const sched = schedById(item.schedId);
  const done = isRoutineDone(item, now);
  const gated = isGated(item, getChar(cid).patch);
  const dueMs = nextResetInstant(sched, now, item.lastDone) - now.getTime();
  const opts = RESET_SCHEDULES.map(s=>`<option value="${s.id}"${s.id===item.schedId?' selected':''}>${esc(s.label)}</option>`).join('');
  return `
    <div class="routine-item${done?' done':''}${gated?' gated':''}${item.hidden?' user-hidden':''}" id="${cid}-rt-item-${item.id}">
      <input type="checkbox" id="${cid}-rt-chk-${item.id}"${done?' checked':''}${gated?' disabled':''} onchange="toggleRoutine('${cid}','${item.id}')">
      <input type="text" class="routine-label" id="${cid}-rt-label-${item.id}" value="${esc(item.label)}" placeholder="e.g. Ixali dailies" oninput="onRoutineInput('${cid}','${item.id}')">
      <select id="${cid}-rt-sched-${item.id}" onchange="onRoutineSchedChange('${cid}','${item.id}')">${opts}</select>
      <input type="text" class="routine-req" id="${cid}-rt-req-${item.id}" value="${esc(item.requires||'')}" placeholder="any" title="Patch this unlocks in — blank means always available" oninput="onRoutineInput('${cid}','${item.id}')">
      <span class="routine-due" id="${cid}-rt-due-${item.id}">${gated?'locked':fmtDue(dueMs)}</span>
      <button class="hide-btn${item.hidden?' is-hidden':''}" id="${cid}-rt-hidebtn-${item.id}" title="${item.hidden?'Unhide this routine':"Hide — doesn't apply to this character"}" onclick="toggleRoutineHidden('${cid}','${item.id}')">${item.hidden?'◉':'○'}</button>
      <button class="remove-btn" title="Remove this routine" onclick="removeRoutine('${cid}','${item.id}')">&times;</button>
    </div>`;
}
function renderRoutines(cid){
  const box = document.getElementById(cid+'-routines');
  if(!box) return;
  const c = getChar(cid);
  const patchEl = document.getElementById(cid+'-patch');
  if(patchEl && patchEl.value !== (c.patch||'')) patchEl.value = c.patch || '';
  const all = c.routines;
  const visible = all.filter(r =>
    (c.showGated || !isGated(r, c.patch)) && (c.showHidden || !r.hidden)
  );
  if(!visible.length){
    box.innerHTML = `<div class="empty-hint">${all.length ? 'Everything here is hidden or needs a later patch.' : 'Nothing yet &mdash; add the things you repeat, like Ixali dailies or GC supply missions.'}</div>`;
  }else{
    box.innerHTML = ROUTINE_SECTIONS.map(sec=>{
      const items = visible.filter(r => routineSection(r) === sec);
      if(!items.length) return '';
      const body = sec === 'Daily' ? dailySubgroupHTML(cid, items) : items.map(item=>routineHTML(cid,item)).join('');
      return `<div class="routine-section"><div class="subhead">${esc(sec)}</div>${body}</div>`;
    }).join('');
  }
  renderGatedNote(cid);
  renderHiddenNote(cid);
}
function renderGatedNote(cid){
  const el = document.getElementById(cid+'-gated');
  if(!el) return;
  const c = getChar(cid);
  const hidden = c.routines.filter(r=>isGated(r, c.patch));
  if(!hidden.length && !c.showGated){ el.innerHTML=''; return; }
  const lowest = hidden.map(r=>patchValue(r.requires)).filter(v=>v!==null).sort((a,b)=>a-b)[0];
  const label = hidden.length
    ? `${hidden.length} hidden &mdash; ${hidden.length===1?'needs':'need'} a later patch${lowest!==undefined?` (next at ${lowest})`:''}`
    : 'showing patch-locked routines';
  el.innerHTML = `<span>${label}</span><button class="link-btn" onclick="toggleShowGated('${cid}')">${c.showGated?'hide them':'show them'}</button>`;
}
// Separate from the patch-gated note on purpose — "locked until a patch" and "hidden
// because you chose to" are different reasons a routine isn't showing, and conflating them
// would make it unclear which toggle would bring a given one back.
function renderHiddenNote(cid){
  const el = document.getElementById(cid+'-hiddennote');
  if(!el) return;
  const c = getChar(cid);
  const hidden = c.routines.filter(r=>r.hidden);
  if(!hidden.length && !c.showHidden){ el.innerHTML=''; return; }
  const label = hidden.length
    ? `${hidden.length} hidden by you &mdash; ${hidden.length===1?"doesn't":"don't"} apply to this character`
    : 'showing routines you hid';
  el.innerHTML = `<span>${label}</span><button class="link-btn" onclick="toggleShowHidden('${cid}')">${c.showHidden?'hide them':'show them'}</button>`;
}
function toggleShowGated(cid){
  collectAllInputs();
  const c = getChar(cid);
  c.showGated = !c.showGated;
  renderRoutines(cid);
  scheduleSave();
}
function toggleShowHidden(cid){
  collectAllInputs();
  const c = getChar(cid);
  c.showHidden = !c.showHidden;
  renderRoutines(cid);
  scheduleSave();
}
function toggleRoutineHidden(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.routines.find(r=>r.id===id);
  if(!item) return;
  item.hidden = !item.hidden;
  // Un-hiding while "show hidden" is off would leave it invisible right after the click
  // that was supposed to bring it back — a full re-render keeps the visible set honest.
  renderRoutines(cid);
  scheduleSave();
}
function onPatchInput(cid){
  const el = document.getElementById(cid+'-patch');
  const c = getChar(cid);
  if(el) c.patch = el.value.trim();
  renderRoutines(cid);
  renderSocieties(cid);
  scheduleSave();
}
// Scoped to routines only — everything else tracked for this character (name, job levels,
// quest categories, societies, notes, custom trackers) is untouched.
function resetRoutines(cid){
  const c = getChar(cid);
  const label = (c.name||'').trim() || 'this character';
  if(!confirm(`Reset all routines for ${label} back to the default list?\n\nThis removes anything you've added, renamed, hidden, rescheduled, or marked done in Routines. Nothing else you track for this character is affected, and the character itself is not removed.`)) return;
  c.routines = seedRoutines();
  renderRoutines(cid);
  scheduleSave();
}
function addRoutine(cid){
  collectAllInputs();
  const item = { id:newId(), label:'', schedId:'daily15', lastDone:null, requires:'' };
  getChar(cid).routines.push(item);
  // Full re-render (rather than appending in place) so the new item lands under its
  // correct Daily/Weekly/Monthly/Other section instead of always at the very bottom.
  renderRoutines(cid);
  const labelEl = document.getElementById(`${cid}-rt-label-${item.id}`);
  if(labelEl) labelEl.focus();
  scheduleSave();
}
function removeRoutine(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.routines.find(i=>i.id===id);
  if(item && (item.label||'').trim()){
    if(!confirm(`Remove "${item.label.trim()}"?`)) return;
  }
  c.routines = c.routines.filter(i=>i.id!==id);
  const node = document.getElementById(`${cid}-rt-item-${id}`);
  const subgroup = node ? node.closest('.routine-subgroup') : null;
  const section = node ? node.closest('.routine-section') : null;
  if(node) node.remove();
  // Removing the last item in a (sub)section should take its heading with it, not leave
  // an empty "Weekly" or "Relic Weapons" label sitting above nothing.
  if(subgroup && !subgroup.querySelector('.routine-item')) subgroup.remove();
  if(section && !section.querySelector('.routine-item')) section.remove();
  if(c.routines.length===0) renderRoutines(cid);
  scheduleSave();
}
function toggleRoutine(cid, id){
  const item = getChar(cid).routines.find(i=>i.id===id);
  const chk = document.getElementById(`${cid}-rt-chk-${id}`);
  if(!item || !chk) return;
  item.lastDone = chk.checked ? Date.now() : null;
  const wrap = document.getElementById(`${cid}-rt-item-${id}`);
  if(wrap) wrap.classList.toggle('done', chk.checked);
  // Recompute the due countdown immediately — otherwise it's stuck showing whatever it read
  // before the click (e.g. "now") until the next 30s periodic refresh or a page reload.
  refreshRoutines(cid);
  scheduleSave();
}
// A schedule change can move an item into a different Daily/Weekly/Monthly/Other section
// (unlike label/requires edits), so this needs a full re-render — same reasoning as
// onSocietyRankChange vs. onSocietyPointsInput.
function onRoutineSchedChange(cid, id){
  collectAllInputs();
  renderRoutines(cid);
  scheduleSave();
}
function onRoutineInput(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.routines.find(i=>i.id===id);
  if(item){
    const gated = isGated(item, c.patch);
    const wrap = document.getElementById(`${cid}-rt-item-${id}`);
    const chk  = document.getElementById(`${cid}-rt-chk-${id}`);
    const due  = document.getElementById(`${cid}-rt-due-${id}`);
    if(wrap) wrap.classList.toggle('gated', gated);
    if(chk) chk.disabled = gated;
    if(due && gated) due.textContent = 'locked';
  }
  refreshRoutines(cid);
  renderGatedNote(cid);
  scheduleSave();
}
function refreshRoutines(cid){
  const now = new Date();
  const c = getChar(cid);
  c.routines.forEach(item=>{
    const sched = schedById(item.schedId);
    const gated = isGated(item, c.patch);
    const done = !gated && isRoutineDone(item, now);
    const chk  = document.getElementById(`${cid}-rt-chk-${item.id}`);
    const wrap = document.getElementById(`${cid}-rt-item-${item.id}`);
    const due  = document.getElementById(`${cid}-rt-due-${item.id}`);
    if(chk){ chk.checked = done; chk.disabled = gated; }
    if(wrap){ wrap.classList.toggle('done', done); wrap.classList.toggle('gated', gated); }
    if(due){
      if(gated){ due.textContent='locked'; due.classList.remove('soon'); }
      else{
        const ms = nextResetInstant(sched, now, item.lastDone) - now.getTime();
        due.textContent = fmtDue(ms);
        due.classList.toggle('soon', ms < 3600000);
      }
    }
  });
}

/* ---------- server picker (PDC -> LDC -> World) ---------- */
// Selects rebuild in full on every change — unlike text inputs, a <select> has no
// mid-interaction typing state a rebuild could destroy, so this doesn't need the
// focus-safe split-render treatment the rest of the app uses.
function renderServerPicker(cid){
  const c = getChar(cid);
  const s = c.server;
  const pdcList = Object.keys(SERVER_DATA);
  const ldcList = s.pdc ? Object.keys(SERVER_DATA[s.pdc]||{}) : [];
  const worldList = (s.pdc && s.ldc) ? ((SERVER_DATA[s.pdc]||{})[s.ldc]||[]) : [];

  const options = (list, current, placeholder) =>
    `<option value="">${placeholder}</option>` +
    list.map(v=>`<option value="${esc(v)}"${v===current?' selected':''}>${esc(v)}</option>`).join('');

  document.getElementById(cid+'-server-picker').innerHTML = `
    <span class="sp-label">Server</span>
    <select id="${cid}-server-pdc" onchange="onServerChange('${cid}','pdc')">${options(pdcList, s.pdc, 'Region')}</select>
    <span class="sp-sep">/</span>
    <select id="${cid}-server-ldc" onchange="onServerChange('${cid}','ldc')" ${s.pdc?'':'disabled'}>${options(ldcList, s.ldc, 'Data Center')}</select>
    <span class="sp-sep">/</span>
    <select id="${cid}-server-world" onchange="onServerChange('${cid}','world')" ${s.ldc?'':'disabled'}>${options(worldList, s.world, 'World')}</select>
  `;
}
function onServerChange(cid, level){
  const c = getChar(cid);
  if(level==='pdc'){
    c.server.pdc = document.getElementById(`${cid}-server-pdc`).value;
    c.server.ldc = ''; c.server.world = '';
  }else if(level==='ldc'){
    c.server.ldc = document.getElementById(`${cid}-server-ldc`).value;
    c.server.world = '';
  }else{
    c.server.world = document.getElementById(`${cid}-server-world`).value;
  }
  renderServerPicker(cid);
  scheduleSave();
}

/* ---------- full render / input handlers (per character) ---------- */
function renderChar(cid){
  const c = getChar(cid);
  document.getElementById(cid+'-name').value = c.name;
  document.getElementById(cid+'-duty').value = c.duty;
  document.getElementById(cid+'-comm').value = c.comm;
  document.getElementById(cid+'-trade-collected').value = c.tradeCollected;
  document.getElementById(cid+'-trade-made').value = c.tradeMade;
  document.getElementById(cid+'-playtime-days').value = c.playtime.days;
  document.getElementById(cid+'-playtime-hours').value = c.playtime.hours;
  document.getElementById(cid+'-notes').value = c.notes;
  updatePlaytimeTotal(cid);
  renderServerPicker(cid);
  renderCharDash(cid);
  renderRoles(cid);
  updateTradeMentorChecks(cid);
  renderPluginMode(cid);
  renderQuestsTable(cid);
  updateOverallCheck(cid);
  renderJobTables(cid);
  renderSocieties(cid);
  renderRoutines(cid);
  renderCustom(cid);
  renderTmSyncNote(cid);
}
function onNameInput(cid){
  collectAllInputs();
  renderSwitcher();
  scheduleSave();
}
function onMainInput(cid){
  collectAllInputs();
  renderCharDash(cid);
  renderRoles(cid);
  updateTradeMentorChecks(cid);
  updateQuestPercents(cid);
  updateOverallCheck(cid);
  updateMsqCheckNote(cid);
  updateJobCaps(cid);
  scheduleSave();
}
function onPlaytimeInput(cid){
  collectAllInputs();
  updatePlaytimeTotal(cid);
  scheduleSave();
}

/* ---------- collapsible sections ---------- */
function sectionKey(sec){
  const page = sec.closest('.page');
  const h2 = sec.querySelector('h2');
  const slug = (h2 ? h2.textContent : '').trim().toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).slice(0,3).join('-');
  return (page ? page.id : 'page') + ':' + slug;
}
function initCollapsible(){
  document.querySelectorAll('.section').forEach(sec=>{
    const h2 = sec.querySelector('h2');
    if(!h2 || sec.dataset.collapsibleReady) return;
    sec.dataset.collapsibleReady = '1';
    const key = sectionKey(sec);
    sec.dataset.secKey = key;
    const body = document.createElement('div');
    body.className = 'sec-body';
    let node = h2.nextSibling;
    while(node){ const next = node.nextSibling; body.appendChild(node); node = next; }
    sec.appendChild(body);
    const btn = document.createElement('button');
    btn.className = 'sec-toggle'; btn.type = 'button'; btn.title = 'Collapse or expand';
    btn.onclick = ()=>toggleSection(key);
    h2.appendChild(btn);
    applyCollapsed(sec, !!DATA.ui.collapsed[key]);
  });
}
function applyCollapsed(sec, collapsed){
  sec.classList.toggle('collapsed', collapsed);
  const btn = sec.querySelector('.sec-toggle');
  if(btn) btn.textContent = collapsed ? '+' : '−';
}
function toggleSection(key){
  const sec = document.querySelector(`.section[data-sec-key="${key}"]`);
  if(!sec) return;
  const collapsed = !sec.classList.contains('collapsed');
  DATA.ui.collapsed[key] = collapsed;
  applyCollapsed(sec, collapsed);
  scheduleSave();
}

/* ---------- instructions ---------- */
function toggleInstructions(){
  const panel = document.getElementById('instructions-panel');
  const open = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  document.getElementById('instructions-toggle-btn').textContent = open ? 'Hide' : 'How this works';
}

/* ---------- backup ---------- */
function exportData(){
  collectAllInputs();
  const payload = { app:'adventurers-ledger-fc', version:1, exported:new Date().toISOString(), chars:DATA.chars, ui:DATA.ui };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const a = document.createElement('a');
  a.href = url; a.download = `pandora-lunar-ledger-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  document.getElementById('save-status').textContent = 'Backup downloaded';
}
function importData(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const parsed = JSON.parse(e.target.result);
      if(!parsed || typeof parsed!=='object' || !Array.isArray(parsed.chars)){
        throw new Error('No character data found in that file.');
      }
      const when = parsed.exported ? new Date(parsed.exported).toLocaleString() : 'unknown date';
      if(!confirm(`Replace ALL current tracker data with this backup?\n\nBackup taken: ${when}\n\nThis overwrites everything in this browser and cannot be undone.`)){
        input.value = ''; return;
      }
      DATA = { chars: parsed.chars, activeId: (parsed.chars[0]||{}).id, ui: parsed.ui || {} };
      normalizeData();
      document.querySelectorAll('.section[data-collapsible-ready]').forEach(s=>delete s.dataset.collapsibleReady);
      rebuildPages();
      renderSwitcher();
      updateSoundToggleUI();
      save();
      document.getElementById('save-status').textContent = 'Backup restored';
    }catch(err){
      alert('That file could not be read as a ledger backup.\n\n' + err.message);
    }
    input.value = '';
  };
  reader.onerror = function(){ alert('Could not read that file.'); input.value=''; };
  reader.readAsText(file);
}

/* ---------- Time Memoria import ---------- */
// One-way plugin -> ledger, clipboard only. Never auto-matched to a character (the plugin
// reports the in-game name, e.g. "Haurche Greystone", which won't generally match whatever
// the ledger has typed in, e.g. "Haurchefaunt Greystone") and never creates a new character —
// linking is always an explicit choice from the characters already in this browser. Every
// field is merge-only: only keys actually present in the payload are touched, everything
// else (routines, notes, ids, ...) is left alone.
let tmImportPayload = null;

function toggleTmImportPanel(){
  const panel = document.getElementById('tm-import-panel');
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? '' : 'none';
  if(!opening){
    tmImportPayload = null;
    document.getElementById('tm-import-text').value = '';
    document.getElementById('tm-import-error').textContent = '';
    document.getElementById('tm-import-summary').innerHTML = '';
  }
}
function tmPasteFromClipboard(){
  const errEl = document.getElementById('tm-import-error');
  if(!navigator.clipboard || !navigator.clipboard.readText){
    errEl.textContent = "Clipboard access isn't available here — paste manually into the box below (Ctrl+V).";
    return;
  }
  navigator.clipboard.readText().then(text=>{
    document.getElementById('tm-import-text').value = text;
    onTmPasteInput();
  }).catch(()=>{
    errEl.textContent = 'Clipboard permission denied — paste manually into the box below (Ctrl+V).';
  });
}
function onTmPasteInput(){
  const text = document.getElementById('tm-import-text').value.trim();
  const errEl = document.getElementById('tm-import-error');
  const summaryEl = document.getElementById('tm-import-summary');
  tmImportPayload = null;
  summaryEl.innerHTML = '';
  if(!text){ errEl.textContent = ''; return; }
  let obj;
  try{ obj = JSON.parse(text); }
  catch(e){ errEl.textContent = 'Not valid JSON.'; return; }
  if(!obj || typeof obj !== 'object' || obj.source !== 'time-memoria'){
    errEl.textContent = 'Doesn’t look like a Time Memoria export (missing or unexpected "source" field).';
    return;
  }
  if(typeof obj.name !== 'string' || !obj.name.trim()){
    errEl.textContent = 'Export is missing a character name.';
    return;
  }
  errEl.textContent = '';
  tmImportPayload = obj;
  renderTmImportSummary();
}
function renderTmImportSummary(){
  const summaryEl = document.getElementById('tm-import-summary');
  const p = tmImportPayload;
  if(!p){ summaryEl.innerHTML = ''; return; }
  const options = DATA.chars.map((c,i)=>
    `<option value="${c.id}">${esc(c.name || `Character ${i+1}`)}</option>`
  ).join('');
  summaryEl.innerHTML = `
    <div class="tm-import-meta">${esc(p.name)} &middot; ${esc((p.server&&p.server.world)||'?')} &mdash; Time Memoria v${esc(p.version||'?')}, exported ${fmtTmTimestamp(p.exported)}</div>
    <select class="tm-import-select" id="tm-import-target" onchange="onTmTargetChange()">
      <option value="">&mdash; Link to which tracked character? &mdash;</option>
      ${options}
    </select>
    <div id="tm-import-diff"></div>
    <button class="edit-btn tm-import-apply-btn" id="tm-import-apply-btn" onclick="applyTmImport()" disabled>Apply merge</button>
  `;
}
function onTmTargetChange(){
  const cid = document.getElementById('tm-import-target').value;
  const applyBtn = document.getElementById('tm-import-apply-btn');
  const diffEl = document.getElementById('tm-import-diff');
  if(!cid){ diffEl.innerHTML = ''; applyBtn.disabled = true; return; }
  diffEl.innerHTML = computeTmDiffHTML(tmImportPayload, getChar(cid));
  applyBtn.disabled = false;
}
// Values already arrive pre-combined as level + (exp/expToNext), same convention the ledger's
// own manual entry uses — this is purely a display formatter for the diff preview.
function fmtTmJobVal(v){
  if(v >= 100) return 'Lv 100 (max)';
  const lvl = Math.floor(v);
  const pct = Math.round((v - lvl) * 1000) / 10;
  return `Lv ${lvl} (${pct.toFixed(1)}%)`;
}
// Class & job quests. The plugin sends a flat array of completed quest titles and nothing
// else — it has no notion of which job this page files each one under, so the mapping is
// done here from the lists this page already holds. Role quests fall out of the same pass
// without being asked for: the game files them in the same category.
//
// Ticks only, never unticks. A title absent from the export means one of two things — not
// done, or worded differently in one of the two places — and this page cannot tell those
// apart. Ticking is right under either reading; unticking would silently erase hand-entered
// history the first time a title was revised. The boxes stay clickable for everyone either
// way, for the same reason the manual quest totals never went away.
let TM_QUEST_KEYS = null;
function tmQuestKeyIndex(){
  if(TM_QUEST_KEYS) return TM_QUEST_KEYS;
  const index = new Map();
  const add = (name, key)=>{
    const keys = index.get(name);
    if(keys){ if(!keys.includes(key)) keys.push(key); }
    else index.set(name, [key]);
  };
  // A title can land under more than one key — the Shadowbringers physical DPS chain is one
  // list shared by every melee and ranged job — so each match is applied, not just the first.
  Object.keys(JOB_QUESTS).forEach(job => JOB_QUESTS[job].forEach(q => add(q.name, job)));
  Object.keys(ROLE_QUESTS).forEach(exp =>
    Object.keys(ROLE_QUESTS[exp]).forEach(role =>
      ROLE_QUESTS[exp][role].forEach(q => add(q.name, 'role:' + ROLE_TRACK_KEY[exp][role]))));
  TM_QUEST_KEYS = index;
  return index;
}
// Every (storage key, title) pair this export would newly tick on that character. Shared by
// the preview and the merge so the two cannot disagree about what is about to happen.
function tmClassQuestTicks(p, c){
  const ticks = [];
  if(!Array.isArray(p.classQuests)) return ticks;
  const index = tmQuestKeyIndex();
  p.classQuests.forEach(name=>{
    const keys = index.get(name);
    if(!keys) return;
    keys.forEach(key=>{
      if(!((c.jobQuestsDone[key] || {})[name])) ticks.push([key, name]);
    });
  });
  return ticks;
}
function tmTickedCount(c){
  return Object.keys(c.jobQuestsDone || {})
    .reduce((sum,key)=>sum + Object.keys(c.jobQuestsDone[key]).filter(n=>c.jobQuestsDone[key][n]).length, 0);
}
function computeTmDiffHTML(p, c){
  const rows = [];
  if(typeof p.comm === 'number' && p.comm !== c.comm) rows.push(['Commendations', c.comm, p.comm]);
  if(p.playtime){
    const from = `${c.playtime.days}d ${c.playtime.hours}h`;
    const to = `${p.playtime.days}d ${p.playtime.hours}h`;
    if(from !== to) rows.push(['Playtime', from, to]);
  }
  if(p.server && (p.server.world||'') !== (c.server.world||'')){
    rows.push(['Server', c.server.world || '(none)', p.server.world || '(none)']);
  }
  if(p.msqPatch && typeof p.msqPatch.reached === 'string'){
    const imported = patchValue(p.msqPatch.reached);
    const stored = patchValue(c.patch);
    if(imported !== null && (stored === null || imported > stored)){
      rows.push(['MSQ progress', c.patch || '(none)', p.msqPatch.reached]);
    }
  }
  ['combat','craft','gather'].forEach(group=>{
    if(!p[group]) return;
    Object.keys(p[group]).forEach(job=>{
      const from = c[group][job] || 0, to = p[group][job];
      if(from !== to) rows.push([job, fmtTmJobVal(from), fmtTmJobVal(to)]);
    });
  });
  if(p.msqBreakdown){
    MSQ_EXPANSIONS.forEach(([key,label])=>{
      if(p.msqBreakdown[key] === undefined) return;
      const from = c.msqBreakdown[key] || 0, to = p.msqBreakdown[key];
      if(from !== to) rows.push([label, from, to]);
    });
  }
  if(p.quests && typeof p.quests === 'object'){
    // overall is always the sum of the 6 subcategories — never compared directly because
    // take-the-greater on individual subs means TM's pre-computed overall would diverge.
    const QUEST_SUBS = [['msq','Main scenario'],['era','Chronicles of a New Era'],['side','Sidequests'],['allied','Allied Society'],['class','Class & Job quests'],['leve','Levequests']];
    let anySubChanged = false;
    QUEST_SUBS.forEach(([key,label])=>{
      if(p.quests[key] === undefined) return;
      const from = c.quests[key]||0, to = p.quests[key];
      if(to > from){ rows.push([label, from, to]); anySubChanged = true; }
    });
    if(anySubChanged){
      const projOverall = QUEST_SUBS.reduce((sum,[key])=>sum+Math.max(c.quests[key]||0, p.quests[key]||0), 0);
      const storedOverall = c.quests.overall||0;
      if(projOverall !== storedOverall) rows.push(['Overall quests', storedOverall, projOverall]);
    }
  }
  const classTicks = tmClassQuestTicks(p, c);
  if(classTicks.length){
    const before = tmTickedCount(c);
    rows.push(['Job quest checklist', `${before} ticked`, `${before + classTicks.length} ticked`]);
  }
  if(!rows.length) return '<div class="tm-diff-row"><span class="tm-diff-label">No changes — this character already matches the export.</span></div>';
  return rows.map(([label,from,to])=>
    `<div class="tm-diff-row"><span class="tm-diff-label">${esc(label)}</span><span class="tm-diff-change">${esc(String(from))}<span class="tm-diff-arrow">→</span>${esc(String(to))}</span></div>`
  ).join('');
}
function applyTmImport(){
  const p = tmImportPayload;
  const cid = document.getElementById('tm-import-target').value;
  if(!p || !cid) return;
  const c = getChar(cid);
  if(!c) return;

  if(p.server && typeof p.server === 'object'){
    c.server = { pdc: p.server.pdc || '', ldc: p.server.ldc || '', world: p.server.world || '' };
  }
  if(typeof p.comm === 'number') c.comm = p.comm;
  // "reached" (not "cleared") — gating unlocks as soon as you're into that patch's content.
  // Take the GREATER of stored and imported — msqPatch.reached is always a floor, never an
  // overstatement (on patch day, before the plugin's bookends are updated, a finished player
  // still reports the previous patch). Blindly overwriting would silently downgrade anyone
  // whose stored value is already ahead of what the plugin can report.
  if(p.msqPatch && typeof p.msqPatch.reached === 'string'){
    const imported = patchValue(p.msqPatch.reached);
    const stored = patchValue(c.patch);
    if(imported !== null && (stored === null || imported > stored)) c.patch = p.msqPatch.reached;
  }
  if(p.playtime && typeof p.playtime === 'object'){
    if(typeof p.playtime.days === 'number') c.playtime.days = p.playtime.days;
    if(typeof p.playtime.hours === 'number') c.playtime.hours = p.playtime.hours;
    if(typeof p.playtime.asOf === 'string') c.playtimeAsOf = p.playtime.asOf;
  }
  ['combat','craft','gather'].forEach(group=>{
    if(p[group] && typeof p[group] === 'object'){
      Object.keys(p[group]).forEach(job=>{ c[group][job] = p[group][job]; });
    }
  });
  // msqBreakdown is the completed-count only; msqBreakdownTotals from the plugin is
  // deliberately ignored — the ledger's own totals stay authoritative for now.
  if(p.msqBreakdown && typeof p.msqBreakdown === 'object'){
    Object.keys(p.msqBreakdown).forEach(key=>{
      if(c.msqBreakdown[key] !== undefined) c.msqBreakdown[key] = p.msqBreakdown[key];
    });
  }
  // Quest counts only go up — take the greater on each subcategory, then recompute overall
  // from the sum so the "sub-cats sum to Overall" panel invariant is always preserved.
  // TM's own overall is ignored: it was computed before our take-the-greater merge and would
  // diverge if stored values were higher for any individual subcategory.
  if(p.quests && typeof p.quests === 'object'){
    const QUEST_SUBS = ['msq','era','side','allied','class','leve'];
    QUEST_SUBS.forEach(key=>{
      if(typeof p.quests[key] === 'number' && p.quests[key] > (c.quests[key]||0))
        c.quests[key] = p.quests[key];
    });
    c.quests.overall = QUEST_SUBS.reduce((sum,key)=>sum+(c.quests[key]||0), 0);
  }

  // Allied societies. Matched on the game's row id rather than the name, and only
  // applied when the payload actually carries the block — an older plugin build sends
  // nothing here, and absence must not be read as "everything is zero".
  //
  // Rank 0 means never started, which this page represents as the society's own opening
  // rank with no points, so that is what it becomes.
  if(Array.isArray(p.societies) && p.societies.length){
    p.societies.forEach(entry=>{
      const name = TM_SOCIETY_IDS[entry && entry.id];
      if(!name || !c.societies[name]) return;

      const meta = ALLIED_SOCIETIES.find(a=>a[0]===name);
      if(!meta) return;

      const startRank = meta[2];
      const rank = num(entry.rank);

      c.societies[name].rank = rank > 0 ? rank : startRank;
      c.societies[name].points = rank > 0 ? num(entry.points) : 0;
    });

    // Only set once a block has actually arrived, so a character synced by an older
    // build keeps its dropdowns rather than being locked to values nobody sent.
    c.societiesSynced = true;
  }

  // Class, job and role quests, ticked from the export's completed titles. Nothing is ever
  // unticked here — see tmClassQuestTicks for why.
  tmClassQuestTicks(p, c).forEach(([key,name])=>{
    if(!c.jobQuestsDone[key]) c.jobQuestsDone[key] = {};
    c.jobQuestsDone[key][name] = true;
  });

  c.tmSyncedAt = p.exported || new Date().toISOString();
  c.tmSyncedVersion = p.version || null;

  toggleTmImportPanel();
  DATA.activeId = cid;
  rebuildPages();
  renderSwitcher();
  scheduleSave();
  document.getElementById('save-status').textContent = 'Imported from Time Memoria';
}

/* ---------- init ---------- */
(async function init(){
  await loadData();
  applyTheme();
  rebuildPages();
  renderSwitcher();
  updateSoundToggleUI();
  setInterval(()=>{ DATA.chars.forEach(c=>refreshRoutines(c.id)); checkResetSounds(); }, 30000);
})();
