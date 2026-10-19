// Writes tm-export-tables.js: the lookups that turn a Time Memoria fmt 2
// export back into the fmt 1 shape (see tmNormalizeExport in app.js).
//
// Reads the local game install, English sheets. Run after a patch that adds
// class or job quests or a new job:
//   dotnet run -- "C:\FFXIV\game\sqpack" ..\..\tm-export-tables.js
using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using Lumina;
using Lumina.Excel.Sheets;

string sqpack = args.Length > 0 ? args[0] : @"C:\FFXIV\game\sqpack";
string output = args.Length > 1 ? args[1] : Path.Combine("..", "..", "tm-export-tables.js");

var data = new GameData(sqpack);

// Short quest id (RowId - 65536, what the plugin sends) -> title, for every
// quest the journal files under Class & Job Quests. Variants of one quest
// share a title, so several ids can map to the same title.
var quests = new SortedDictionary<uint, string>();
foreach (var quest in data.GetExcelSheet<Quest>()!)
{
  if (quest.Name.IsEmpty) continue;
  string section = quest.JournalGenre.ValueNullable?.JournalCategory.ValueNullable?.JournalSection.ValueNullable?.Name.ToString() ?? "";
  if (section == "Class & Job Quests") quests[quest.RowId & 0xFFFF] = quest.Name.ToString();
}

// Questline genres -> short quest ids, for the collections export's questsDone. Every
// questline the Ledger shows is one of the game's own journal genres, so the reader
// needs no hand-kept lists: side stories, Hildibrand, raid stories (Chronicles of a New
// Era), relic chains (Weapon Enhancement), Records of Unusual Endeavors, the crafter and
// gatherer hubs, and each seasonal event. Location sidequests are left out on purpose.
string[] questlineCategories =
[
  "Side Story Quests", "Hildibrand Sidequests", "Chronicles of Light", "Records of Unusual Endeavors",
  "Weapon Enhancement Sidequests", "Seasonal Events", "Special Quests",
  "Crystalline Mean Quests", "Studium Quests", "Wachumeqimeqi Quests", "YoRHa: Dark Apocalypse"
];
var genres = new SortedDictionary<string, (string Category, string Section, List<uint> Ids, uint Festival)>(StringComparer.Ordinal);
foreach (var quest in data.GetExcelSheet<Quest>()!)
{
  if (quest.Name.IsEmpty) continue;
  var genre = quest.JournalGenre.ValueNullable;
  var category = genre?.JournalCategory.ValueNullable;
  string section = category?.JournalSection.ValueNullable?.Name.ToString() ?? "";
  string categoryName = category?.Name.ToString() ?? "";
  bool wanted = questlineCategories.Contains(categoryName) || section == "Chronicles of a New Era";
  if (!wanted || genre is null) continue;

  string key = genre.Value.Name.ToString();
  if (!genres.TryGetValue(key, out var entry))
    genres[key] = entry = (categoryName, section, [], 0);
  entry.Ids.Add(quest.RowId & 0xFFFF);
}
var genreOut = genres.ToDictionary(g => g.Key, g => new { category = g.Value.Category, section = g.Value.Section, ids = g.Value.Ids.Order().ToArray() });

// Duties -> [name, content type, expansion (0 = ARR), level], keyed by InstanceContent id,
// which is what the collections export's dutiesDone sends.
var duties = new SortedDictionary<uint, object[]>();
foreach (var cfc in data.GetExcelSheet<ContentFinderCondition>()!)
{
  if (cfc.ContentLinkType != 1 || cfc.Content.RowId == 0 || cfc.Name.IsEmpty) continue;
  string name = cfc.Name.ToString();
  name = name.Length > 0 ? char.ToUpperInvariant(name[0]) + name[1..] : name;   // the sheet lowercases "the"
  duties.TryAdd(cfc.Content.RowId, [name, cfc.ContentType.ValueNullable?.Name.ToString() ?? "", cfc.RequiredExVersion.RowId, cfc.ClassJobLevelRequired]);
}

// World lists: totals the reader divides by, and the names of current zones.
var currentZones = data.GetExcelSheet<AetherCurrentCompFlgSet>()!
  .Where(r => r.RowId > 0 && r.Territory.RowId > 0)
  .ToDictionary(r => r.RowId.ToString(), r => r.Territory.ValueNullable?.PlaceName.ValueNullable?.Name.ToString() ?? "");
var porterIds = data.GetExcelSheet<ChocoboTaxiStand>()!
  .Where(r => r.RowId > 0 && !r.PlaceName.IsEmpty)
  .Select(r => (r.RowId, Name: r.PlaceName.ToString()))
  // Not stops: an unused row named "（空き）" and the two event-only Reginald Eventman stands.
  .Where(r => !r.Name.StartsWith("（") && !r.Name.StartsWith("Reginald Eventman"))
  .Select(r => r.RowId).ToArray();
var world = new
{
  sightseeing = data.GetExcelSheet<Adventure>()!.Count(r => !r.Name.IsEmpty),
  currents = data.GetExcelSheet<AetherCurrent>()!.Count(r => r.RowId > 0),
  zones = currentZones,
  aetherytes = data.GetExcelSheet<Aetheryte>()!.Count(r => r.RowId > 0 && r.IsAetheryte && !r.Invisible && r.PlaceName.RowId > 0),
  porters = porterIds
};

// Mount speed zones, keyed by the TerritoryType id the export's mountSpeed uses:
// [zone, region, top level, expansion, sort order, aetheryte ids]. The region and
// order follow the game's Mount Speed window. Instanced copies share a MountSpeed
// row, and a few extra rows reuse another zone's riding map (Zirgorteh reuses
// Urqopacha's), so a row whose level-I riding map an earlier row already uses is
// left out. Aetherytes use the export's own filter, so the reader can tell a zone
// not reached yet from a zone at speed 0.
var aetherytesByZone = data.GetExcelSheet<Aetheryte>()!
  .Where(r => r.RowId > 0 && r.IsAetheryte && !r.Invisible && r.PlaceName.RowId > 0)
  .GroupBy(r => r.Territory.RowId)
  .ToDictionary(g => g.Key, g => g.Select(r => r.RowId).Order().ToArray());
var seenLinks = new HashSet<uint>();
var speedZones = new SortedDictionary<uint, object[]>();
foreach (var zone in data.GetExcelSheet<TerritoryType>()!
           .Where(t => t.Mount && t.MountSpeed.RowId != 0 && t.PlaceName.RowId != 0)
           .GroupBy(t => t.MountSpeed.RowId)
           .Select(g => g.OrderBy(t => t.RowId).First())
           .OrderBy(t => t.MountSpeed.RowId))
{
  var row = zone.MountSpeed.Value;
  uint first = row.Quest.RowId;
  if (first is > 0 and < 65536 && !seenLinks.Add(first)) continue;
  int top = (first != 0 ? 1 : 0) + (row.Unknown0 != 0 ? 1 : 0);
  speedZones[zone.RowId] = [zone.PlaceName.Value.Name.ToString(), zone.PlaceNameRegion.ValueNullable?.Name.ToString() ?? "",
    top, zone.ExVersion.RowId, row.Unknown1, aetherytesByZone.GetValueOrDefault(zone.RowId, [])];
}

// Abbreviation -> the name the plugin used as a key in fmt 1 ("White Mage").
var jobs = new SortedDictionary<string, string>(StringComparer.Ordinal);
foreach (var job in data.GetExcelSheet<ClassJob>()!)
{
  string abbreviation = job.Abbreviation.ToString();
  if (job.RowId == 0 || abbreviation.Length == 0) continue;
  jobs[abbreviation] = CultureInfo.InvariantCulture.TextInfo.ToTitleCase(job.Name.ToString());
}

var options = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

using var writer = new StreamWriter(output);
writer.WriteLine("// Generated by tools/tm-export-tables from the game's English sheets. Do not edit.");
writer.WriteLine("// Short quest id -> title, Class & Job Quests only.");
writer.WriteLine($"const TM_QUEST_TITLES = {JsonSerializer.Serialize(quests, options)};");
writer.WriteLine("// Job abbreviation -> job name as fmt 1 exports keyed it.");
writer.WriteLine($"const TM_JOB_NAMES = {JsonSerializer.Serialize(jobs, options)};");
writer.WriteLine("// Questline genre -> {category, section, ids}: short quest ids, for the collections export's questsDone.");
writer.WriteLine($"const TM_QUEST_GENRES = {JsonSerializer.Serialize(genreOut, options)};");
writer.WriteLine("// InstanceContent id -> [name, content type, expansion (0 = ARR), level], for dutiesDone.");
writer.WriteLine($"const TM_DUTIES = {JsonSerializer.Serialize(duties, options)};");
writer.WriteLine("// TerritoryType id -> [zone, region, top speed level, expansion, window order, aetheryte ids], for mountSpeed.");
writer.WriteLine($"const TM_MOUNT_SPEED = {JsonSerializer.Serialize(speedZones.ToDictionary(k => k.Key.ToString(), k => k.Value), options)};");
writer.WriteLine("// World list totals, current zone names, and the real porter stops (unused and event rows left out).");
writer.WriteLine($"const TM_WORLD = {JsonSerializer.Serialize(world, options)};");

Console.WriteLine($"{quests.Count} quests, {jobs.Count} jobs, {genreOut.Count} questline genres, {duties.Count} duties, {porterIds.Length} porter stops -> {Path.GetFullPath(output)}");
