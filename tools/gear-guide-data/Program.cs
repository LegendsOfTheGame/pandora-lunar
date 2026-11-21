// Writes gear-guide.js: the data for the gear guide page. For each piece of gear:
// the slot, the equip level, the item level and the jobs that can wear it. Then the
// ways to get it: the crafting job, the NPC gil vendors with price, and the trades
// (SpecialShop), each with the NPC's zone and map coordinates.
//
// Reads the local game install, English sheets. Run after each patch:
//   dotnet run -- "C:\FFXIV\game\sqpack" ..\..\gear-guide.js
using System.Text.Encodings.Web;
using System.Text.Json;
using Lumina;
using Lumina.Excel.Sheets;

string sqpack = args.Length > 0 ? args[0] : @"C:\FFXIV\game\sqpack";
string output = args.Length > 1 ? args[1] : Path.Combine("..", "..", "gear-guide.js");

var data = new GameData(sqpack);
var itemSheet = data.GetExcelSheet<Item>()!;

// --- Jobs per ClassJobCategory --------------------------------------------------
// ClassJobCategory has one bool column per class or job, named by its abbreviation.
var jobAbbrs = data.GetExcelSheet<ClassJob>()!
  .Select(j => j.Abbreviation.ToString()).Where(a => a.Length > 0).Distinct().ToList();
var categoryProps = typeof(ClassJobCategory).GetProperties()
  .Where(p => p.PropertyType == typeof(bool) && jobAbbrs.Contains(p.Name)).ToList();
var categories = new SortedDictionary<uint, string>();

// --- Gear ---------------------------------------------------------------------------
// The slot is the first slot the item takes (value 1). A two-handed weapon also
// blocks the off hand (value -1); that is not a second slot.
string? SlotOf(EquipSlotCategory s) =>
  s.MainHand == 1 ? "MainHand" : s.OffHand == 1 ? "OffHand" : s.Head == 1 ? "Head" :
  s.Body == 1 ? "Body" : s.Gloves == 1 ? "Hands" : s.Legs == 1 ? "Legs" : s.Feet == 1 ? "Feet" :
  s.Ears == 1 ? "Ears" : s.Neck == 1 ? "Neck" : s.Wrists == 1 ? "Wrists" :
  s.FingerL == 1 || s.FingerR == 1 ? "Ring" : null; // soul crystals and waist are left out

var gear = new SortedDictionary<uint, object[]>();
foreach (var item in itemSheet)
{
  if (item.Name.IsEmpty || item.LevelEquip < 1 || item.EquipSlotCategory.RowId == 0) continue;
  if (item.EquipSlotCategory.ValueNullable is not { } slotRow || SlotOf(slotRow) is not { } slot) continue;
  uint cat = item.ClassJobCategory.RowId;
  if (cat == 0 || item.ClassJobCategory.ValueNullable is not { } catRow) continue;

  if (!categories.ContainsKey(cat))
    categories[cat] = string.Join(' ', categoryProps.Where(p => (bool)p.GetValue(catRow)!).Select(p => p.Name));

  // [name, slot, equip level, item level, job category, can be HQ, is PvP, is unique, is untradable]
  gear[item.RowId] = [item.Name.ToString(), slot, item.LevelEquip, item.LevelItem.RowId, cat, item.CanBeHq ? 1 : 0,
    item.IsPvP ? 1 : 0, item.IsUnique ? 1 : 0, item.IsUntradable ? 1 : 0];
}

// Classes and jobs in the game's own menu order: [abbreviation, name, Ledger name].
// Names are title-cased to match the Ledger's job names ("Dark Knight"). A base
// class shares its level with its job, and the Ledger keeps only the job, so a
// class's Ledger name is its job's (Gladiator -> Paladin). Adventurer is left out.
string Title(ClassJob j) => System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(j.Name.ToString());
var classJobs = data.GetExcelSheet<ClassJob>()!
  .Where(j => j.RowId > 0 && j.Abbreviation.ToString().Length > 0 && categoryProps.Any(p => p.Name == j.Abbreviation.ToString()))
  .OrderBy(j => j.UIPriority).ToList();
var jobsOut = classJobs.Select(j =>
{
  var job = classJobs.FirstOrDefault(o => o.RowId != j.RowId && o.ClassJobParent.RowId == j.RowId);
  return new[] { j.Abbreviation.ToString(), Title(j), Title(job.RowId != 0 ? job : j) };
}).ToArray();

// --- Crafting -----------------------------------------------------------------------
// CraftType rows 0-7 are CRP BSM ARM GSM LTW WVR ALC CUL, in that order.
string[] crafters = ["CRP", "BSM", "ARM", "GSM", "LTW", "WVR", "ALC", "CUL"];
var crafts = new SortedDictionary<uint, object[]>();
foreach (var recipe in data.GetExcelSheet<Recipe>()!)
{
  uint id = recipe.ItemResult.RowId;
  if (!gear.ContainsKey(id) || recipe.CraftType.RowId >= crafters.Length) continue;
  int level = recipe.RecipeLevelTable.ValueNullable?.ClassJobLevel ?? 0;
  // [crafting job, recipe level]. The lowest recipe level wins when two jobs can make it.
  if (!crafts.TryGetValue(id, out var have) || level < (int)have[1])
    crafts[id] = [crafters[recipe.CraftType.RowId], level];
}

// --- Shops to NPCs ----------------------------------------------------------------
// ENpcBase.ENpcData holds event ids. The high bits name the handler type:
// 0x0004 GilShop, 0x001B SpecialShop, 0x000B CustomTalk, 0x0032 TopicSelect,
// 0x0036 PreHandler, 0x003D InclusionShop. Menus and pre-handlers lead to shops.
const uint GilShopType = 0x0004, SpecialShopType = 0x001B, CustomTalkType = 0x000B,
  TopicSelectType = 0x0032, PreHandlerType = 0x0036, InclusionShopType = 0x003D;

var topicSelect = data.GetExcelSheet<TopicSelect>()!;
var preHandler = data.GetExcelSheet<PreHandler>()!;
var customTalk = data.GetExcelSheet<CustomTalk>()!;
var inclusionShop = data.GetExcelSheet<InclusionShop>()!;

IEnumerable<uint> ShopsOf(uint eventId, int depth = 0)
{
  if (eventId == 0 || depth > 4) yield break;
  uint type = eventId >> 16;
  if (type == GilShopType || type == SpecialShopType) { yield return eventId; yield break; }

  IEnumerable<uint> next = [];
  if (type == TopicSelectType && topicSelect.TryGetRow(eventId, out var ts))
    next = ts.Shop.Select(s => s.RowId);
  else if (type == PreHandlerType && preHandler.TryGetRow(eventId, out var ph))
    next = [ph.Target.RowId];
  else if (type == CustomTalkType && customTalk.TryGetRow(eventId, out var ct))
    next = ct.Script.Select(s => s.ScriptArg).Where(a => (a >> 16) is GilShopType or SpecialShopType or TopicSelectType or PreHandlerType or InclusionShopType);
  else if (type == InclusionShopType && inclusionShop.TryGetRow(eventId, out var inc))
  {
    var series = data.GetSubrowExcelSheet<InclusionShopSeries>()!;
    next = inc.Category.Where(c => c.RowId != 0)
      .Select(c => data.GetExcelSheet<InclusionShopCategory>()!.GetRowOrDefault(c.RowId))
      .Where(c => c is not null)
      .SelectMany(c => series.TryGetRow(c!.Value.InclusionShopSeries.RowId, out var rows) ? rows.Select(r => r.SpecialShop.RowId) : []);
  }

  foreach (uint n in next)
    foreach (uint shop in ShopsOf(n, depth + 1))
      yield return shop;
}

var shopNpcs = new Dictionary<uint, SortedSet<uint>>();
foreach (var npc in data.GetExcelSheet<ENpcBase>()!)
  foreach (var ev in npc.ENpcData)
    foreach (uint shop in ShopsOf(ev.RowId))
    {
      if (!shopNpcs.TryGetValue(shop, out var set)) shopNpcs[shop] = set = [];
      set.Add(npc.RowId);
    }

// --- NPC positions ------------------------------------------------------------------
// A Level row of type 8 places an ENpc on a map. NPCs placed only by the zone's
// layout files have no Level row, so they get a name and no position.
var levels = new Dictionary<uint, Level>();
foreach (var level in data.GetExcelSheet<Level>()!)
  if (level.Type == 8 && level.Map.RowId != 0 && !levels.ContainsKey(level.Object.RowId))
    levels[level.Object.RowId] = level;

// Most NPCs have no Level row. Their place is in the zone's layout file
// (bg/<zone>/level/planevent.lgb), as an ENPC instance whose BaseId is the
// ENpcBase id. The first place found wins; the zone's own map gives the scale.
var layoutPlaces = new Dictionary<uint, (Map Map, float X, float Z)>();
foreach (var zone in data.GetExcelSheet<TerritoryType>()!)
{
  string bg = zone.Bg.ToString();
  int cut = bg.IndexOf("/level/", StringComparison.Ordinal);
  if (cut < 0 || zone.Map.ValueNullable is not { } zoneMap) continue;
  foreach (string file in new[] { "planevent", "bg" })
  {
    var lgb = data.GetFile<Lumina.Data.Files.LgbFile>("bg/" + bg[..cut] + "/level/" + file + ".lgb");
    if (lgb is null) continue;
    foreach (var layer in lgb.Layers)
      foreach (var instance in layer.InstanceObjects)
        if (instance.Object is Lumina.Data.Parsing.Layer.LayerCommon.ENPCInstanceObject npc)
        {
          uint baseId = npc.ParentData.ParentData.BaseId;
          if (!layoutPlaces.ContainsKey(baseId))
            layoutPlaces[baseId] = (zoneMap, instance.Transform.Translation.X, instance.Transform.Translation.Z);
        }
  }
}

static double MapCoord(float pos, short offset, ushort sizeFactor)
{
  double c = sizeFactor / 100.0;
  return Math.Round(41.0 / c * (((pos + offset) * c + 1024.0) / 2048.0) + 1.0, 1);
}

var residents = data.GetExcelSheet<ENpcResident>()!;
var npcsOut = new SortedDictionary<uint, object[]>();
void AddNpc(uint id)
{
  if (npcsOut.ContainsKey(id)) return;
  string name = residents.GetRowOrDefault(id)?.Singular.ToString() ?? "";
  if (levels.TryGetValue(id, out var lv) && lv.Map.ValueNullable is { } map)
  {
    string zone = map.PlaceName.ValueNullable?.Name.ToString() ?? "";
    // [name, zone, x, y]
    npcsOut[id] = [name, zone, MapCoord(lv.X, map.OffsetX, map.SizeFactor), MapCoord(lv.Z, map.OffsetY, map.SizeFactor)];
  }
  else if (layoutPlaces.TryGetValue(id, out var place))
    npcsOut[id] = [name, place.Map.PlaceName.ValueNullable?.Name.ToString() ?? "",
      MapCoord(place.X, place.Map.OffsetX, place.Map.SizeFactor), MapCoord(place.Z, place.Map.OffsetY, place.Map.SizeFactor)];
  else npcsOut[id] = [name, "", 0, 0];
}

// Salvagers sell back gear the player has owned before (repurchase), not new
// stock, so they are not a way to get an item.
bool IsSalvager(uint npcId) =>
  residents.GetRowOrDefault(npcId)?.Singular.ToString().Contains("salvager", StringComparison.OrdinalIgnoreCase) ?? false;
foreach (var set in shopNpcs.Values) set.RemoveWhere(IsSalvager);
foreach (uint shop in shopNpcs.Where(s => s.Value.Count == 0).Select(s => s.Key).ToList()) shopNpcs.Remove(shop);

// --- Gil vendors ----------------------------------------------------------------------
// GilShopItem has no price column; a gil shop sells at the item's PriceMid.
var gil = new SortedDictionary<uint, object[]>();
var gilNpcs = new Dictionary<uint, SortedSet<uint>>();
foreach (var row in data.GetSubrowExcelSheet<GilShopItem>()!.SelectMany(s => s))
{
  uint id = row.Item.RowId;
  if (!gear.ContainsKey(id) || !shopNpcs.TryGetValue(row.RowId, out var npcs)) continue;
  if (!gilNpcs.TryGetValue(id, out var set)) gilNpcs[id] = set = [];
  set.UnionWith(npcs);
}
foreach (var (id, npcs) in gilNpcs)
{
  foreach (uint n in npcs) AddNpc(n);
  // [price, [npc ids]]
  gil[id] = [itemSheet.GetRow(id).PriceMid, npcs.ToArray()];
}

// --- Trades ----------------------------------------------------------------------------
// SpecialShop: hand in items (or currency items such as tomestones), get gear.
var trades = new SortedDictionary<uint, List<object[]>>();
var costNames = new SortedDictionary<uint, string>();
var seenTrade = new HashSet<string>();
foreach (var shop in data.GetExcelSheet<SpecialShop>()!)
{
  if (!shopNpcs.TryGetValue(shop.RowId, out var npcs)) continue;
  foreach (var entry in shop.Item)
  {
    var costs = entry.ItemCosts.Where(c => c.ItemCost.RowId != 0 && c.CurrencyCost > 0)
      .Select(c => new object[] { c.ItemCost.RowId, c.CurrencyCost, c.CostType == 1 || c.CollectabilityCost > 0 ? 1 : 0 }).ToArray();
    if (costs.Length == 0) continue;

    foreach (var receive in entry.ReceiveItems)
    {
      uint id = receive.Item.RowId;
      if (id == 0 || !gear.ContainsKey(id)) continue;

      string key = $"{id}|{string.Join(',', costs.Select(c => $"{c[0]}x{c[1]}"))}";
      foreach (var c in costs)
      {
        uint costId = (uint)c[0];
        if (!costNames.ContainsKey(costId) && itemSheet.GetRowOrDefault(costId) is { } ci) costNames[costId] = ci.Name.ToString();
      }
      foreach (uint n in npcs) AddNpc(n);

      if (!trades.TryGetValue(id, out var list)) trades[id] = list = [];
      if (seenTrade.Add(key))
        // [[cost item id, count, hq or collectable], ...], receive count, [npc ids]
        list.Add([costs, receive.ReceiveCount, npcs.ToArray()]);
      else
      {
        // The same trade at another NPC: add the NPCs to the existing entry.
        var existing = list.First(t => $"{id}|{string.Join(',', ((object[][])t[0]).Select(c => $"{c[0]}x{c[1]}"))}" == key);
        existing[2] = ((uint[])existing[2]).Union(npcs).Order().ToArray();
      }
    }
  }
}

// --- Wiki fallback ----------------------------------------------------------------------
// The local wiki dump (E:\wiki\ffxiv_wiki.db) fills what the sheets do not give:
//   1. NPC positions: the NPC infobox has location and coordinates. Only for proper
//      names; a generic name ("merchant & mender") matches many NPCs.
//   2. Gear with no craft, gil or trade source: the page's ==Acquisition== section,
//      as quest titles and a short note (cosmic tool upgrades, for example).
// The sheets always win; the wiki only fills gaps.
string wikiPath = args.Length > 2 ? args[2] : @"E:\wiki\ffxiv_wiki.db";
var wiki = new SortedDictionary<uint, object[]>();
int wikiNpcs = 0;
if (File.Exists(wikiPath))
{
  using var db = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={wikiPath};Mode=ReadOnly");
  db.Open();

  (string? Template, string? Infobox, string? Raw) Page(string title)
  {
    using var cmd = db.CreateCommand();
    cmd.CommandText = "select template_name, infobox_json, raw_text from pages where title = $t";
    cmd.Parameters.AddWithValue("$t", title);
    using var r = cmd.ExecuteReader();
    return r.Read() ? (r.IsDBNull(0) ? null : r.GetString(0), r.IsDBNull(1) ? null : r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2)) : (null, null, null);
  }

  foreach (var (id, npc) in npcsOut)
  {
    string name = (string)npc[0];
    if ((string)npc[1] != "" || name.Length == 0 || !char.IsUpper(name[0])) continue;
    var page = Page(name);
    if (page.Template != "NPC infobox" || page.Infobox is null) continue;
    using var json = JsonDocument.Parse(page.Infobox);
    if (!json.RootElement.TryGetProperty("location", out var loc) || !json.RootElement.TryGetProperty("coordinates", out var co)) continue;
    string[] xy = (co.GetString() ?? "").Split(',', StringSplitOptions.TrimEntries);
    if (xy.Length != 2 || !double.TryParse(xy[0], System.Globalization.CultureInfo.InvariantCulture, out double x)
        || !double.TryParse(xy[1], System.Globalization.CultureInfo.InvariantCulture, out double y)) continue;
    npc[1] = System.Text.RegularExpressions.Regex.Replace(loc.GetString() ?? "", @"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", "$1");
    npc[2] = x;
    npc[3] = y;
    wikiNpcs++;
  }

  var questRow = new System.Text.RegularExpressions.Regex(@"\{\{quest list row\|([^}|]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  foreach (var (id, item) in gear)
  {
    if (crafts.ContainsKey(id) || gil.ContainsKey(id) || trades.ContainsKey(id)) continue;
    var page = Page((string)item[0]);
    if (page.Raw is null) continue;
    int start = page.Raw.IndexOf("==Acquisition==", StringComparison.Ordinal);
    if (start < 0) continue;
    int end = System.Text.RegularExpressions.Regex.Match(page.Raw[(start + 15)..], @"\n==[^=]").Index;
    string section = end > 0 ? page.Raw.Substring(start + 15, end) : page.Raw[(start + 15)..];

    string[] quests = questRow.Matches(section).Select(m => m.Groups[1].Value.Trim()).Distinct().ToArray();
    string note = string.Join(" ", section.Split('\n').Where(l => l.StartsWith('*')).Select(CleanWikiLine)).Trim();
    if (note.Length > 240) note = note[..240].TrimEnd() + "…";
    if (quests.Length == 0 && note.Length == 0) continue;
    // [[quest titles], note]
    wiki[id] = [quests, note];
  }
}
else Console.WriteLine($"No wiki dump at {wikiPath}; the wiki fallback is skipped.");

static string CleanWikiLine(string line)
{
  string s = line.TrimStart('*', ' ');
  s = System.Text.RegularExpressions.Regex.Replace(s, @"\{\{(?:item icon|i|item)\|([^}|]+)[^}]*\}\}", "$1", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  s = System.Text.RegularExpressions.Regex.Replace(s, @"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", "$1");
  s = System.Text.RegularExpressions.Regex.Replace(s, @"\{\{[^}]*\}\}", "");
  s = System.Text.RegularExpressions.Regex.Replace(s, @"<[^>]+>|'{2,}", "");
  return System.Text.RegularExpressions.Regex.Replace(s, @"\s+", " ").Trim();
}

// --- Write ------------------------------------------------------------------------------
var options = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
string S<T>(T v) => JsonSerializer.Serialize(v, options);
string D<T>(SortedDictionary<uint, T> d) => S(d.ToDictionary(k => k.Key.ToString(), k => k.Value));

using (var writer = new StreamWriter(output))
{
  writer.WriteLine("// Generated by tools/gear-guide-data from the game's English sheets. Do not edit.");
  writer.WriteLine("// jobList: [abbreviation, name, Ledger name] in the game's menu order (a class uses its job's Ledger name)");
  writer.WriteLine("// items: id -> [name, slot, equip level, item level, job category, can be HQ, is PvP, is unique, is untradable]");
  writer.WriteLine("// jobs: job category -> space-separated class and job abbreviations");
  writer.WriteLine("// crafts: id -> [crafting job, recipe level]");
  writer.WriteLine("// gil: id -> [price, [npc ids]]");
  writer.WriteLine("// trades: id -> [[[cost item id, count, hq or collectable], ...], receive count, [npc ids]], ...]");
  writer.WriteLine("// wiki: id -> [[quest titles], note], from the wiki dump, only for gear with no craft, gil or trade source");
  writer.WriteLine("// costs: cost item id -> name. npcs: npc id -> [name, zone, x, y] (zone empty when the sheets give no position)");
  writer.WriteLine("const GEAR_GUIDE = {");
  writer.WriteLine($"\"built\":{S(DateTime.UtcNow.ToString("yyyy-MM-dd"))},");
  writer.WriteLine($"\"jobList\":{S(jobsOut)},");
  writer.WriteLine($"\"items\":{D(gear)},");
  writer.WriteLine($"\"jobs\":{D(categories)},");
  writer.WriteLine($"\"crafts\":{D(crafts)},");
  writer.WriteLine($"\"gil\":{D(gil)},");
  writer.WriteLine($"\"trades\":{D(trades)},");
  writer.WriteLine($"\"wiki\":{D(wiki)},");
  writer.WriteLine($"\"costs\":{D(costNames)},");
  writer.WriteLine($"\"npcs\":{D(npcsOut)}");
  writer.WriteLine("};");
}

int placed = npcsOut.Values.Count(n => (string)n[1] != "");
Console.WriteLine($"items {gear.Count}, crafted {crafts.Count}, gil {gil.Count}, traded {trades.Count}, " +
  $"npcs {npcsOut.Count} ({placed} with a position, {wikiNpcs} from the wiki), wiki sources {wiki.Count}, file {new FileInfo(output).Length / 1024} KB");
