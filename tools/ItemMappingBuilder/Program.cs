using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lumina;
using Lumina.Data;
using Lumina.Excel;

const int BatchSize = 100;

var sqpackPath = args.Length > 0 ? args[0] : @"E:\ff14\最终幻想XIV\game\sqpack";
var outputPath = args.Length > 1 ? args[1] : @"E:\study\ff14\data\item_mapping.min.json";

using var gameData = new GameData(sqpackPath);
var zhSheet = gameData.Excel.GetSheet<RawRow>(Language.ChineseSimplified, "Item");
if (zhSheet is null)
{
    Console.Error.WriteLine("Unable to load ChineseSimplified Item sheet.");
    return 1;
}

Console.WriteLine($"Loaded Chinese Item sheet from: {sqpackPath}");
Console.WriteLine($"Rows: {zhSheet.Count}");

if (args.Length > 2 && uint.TryParse(args[2], out var inspectId))
{
    Console.WriteLine($"Inspect row: {inspectId}");
    Console.WriteLine($"Has row: {zhSheet.HasRow(inspectId)}");
    var inspectRow = zhSheet.GetRow(inspectId);
    for (var i = 0; i < 16; i++)
    {
        var value = inspectRow.ReadColumn(i);
        Console.WriteLine($"{i}: {value} ({value?.GetType().FullName ?? "null"})");
    }

    using var inspectHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    var inspectUrl = $"https://v2.xivapi.com/api/sheet/Item?rows={inspectId}&fields=Name,IsUntradable,Icon";
    var inspectPayload = await inspectHttp.GetFromJsonAsync<XivApiBatchResponse>(inspectUrl);
    var inspectEnglish = inspectPayload?.Rows?.FirstOrDefault();
    Console.WriteLine("XIVAPI:");
    Console.WriteLine(JsonSerializer.Serialize(inspectEnglish, new JsonSerializerOptions { WriteIndented = true }));
    return 0;
}

var localRows = new List<LocalItem>(zhSheet.Count);
for (var index = 0; index < zhSheet.Count; index++)
{
    var row = zhSheet.GetRowAt(index);
    var zhName = row.ReadStringColumn(0).ToString().Trim();
    if (string.IsNullOrWhiteSpace(zhName))
    {
        continue;
    }

    var zhDescription = row.ReadStringColumn(8).ToString().Trim();

    var iconId = Convert.ToUInt16(row.ReadColumn(10));
    var iconGroup = iconId / 1000;
    var iconPath = $"{iconGroup:000000}/{iconId:000000}.png";
    localRows.Add(new LocalItem(row.RowId, zhName, zhDescription, iconPath));
}

Console.WriteLine($"Named Chinese items: {localRows.Count}");

using var http = new HttpClient
{
    Timeout = TimeSpan.FromSeconds(60),
};

var merged = new List<MappingEntry>(localRows.Count);
for (var i = 0; i < localRows.Count; i += BatchSize)
{
    var batch = localRows.Skip(i).Take(BatchSize).ToArray();
    var rowsParam = string.Join(",", batch.Select(item => item.ItemId));
    var url = $"https://v2.xivapi.com/api/sheet/Item?rows={rowsParam}&fields=Name,IsUntradable,Icon";
    var payload = await http.GetFromJsonAsync<XivApiBatchResponse>(url);
    var englishById = payload?.Rows?
        .Where(row => row.Fields is not null)
        .ToDictionary(row => row.RowId, row => row.Fields!) ?? new Dictionary<uint, XivApiFields>();

    var missingIds = batch
        .Select(item => item.ItemId)
        .Where(id => !englishById.ContainsKey(id))
        .ToArray();

    foreach (var missingId in missingIds)
    {
        var singleUrl = $"https://v2.xivapi.com/api/sheet/Item?rows={missingId}&fields=Name,IsUntradable,Icon";
        var singlePayload = await http.GetFromJsonAsync<XivApiBatchResponse>(singleUrl);
        var singleRow = singlePayload?.Rows?.FirstOrDefault();
        if (singleRow?.Fields is not null)
        {
            englishById[missingId] = singleRow.Fields;
        }
    }

    foreach (var local in batch)
    {
        if (!englishById.TryGetValue(local.ItemId, out var fields))
        {
            continue;
        }

        if (fields.IsUntradable)
        {
            continue;
        }

        var enName = fields.Name?.Trim();
        if (string.IsNullOrWhiteSpace(enName))
        {
            continue;
        }

        var iconPath = fields.Icon?.Path is { Length: > 0 }
            ? NormalizeIconPath(fields.Icon.Path)
            : local.IconPath;

        merged.Add(new MappingEntry(local.ItemId, local.ZhName, enName, local.ZhDescription, iconPath));
    }

    Console.WriteLine($"Processed {Math.Min(i + BatchSize, localRows.Count)}/{localRows.Count}");
}

Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
await using var stream = File.Create(outputPath);
await JsonSerializer.SerializeAsync(stream, new MappingFile(
    1,
    DateTimeOffset.Now,
    "ff14-cn-client + xivapi-en",
    merged.OrderBy(entry => entry.ItemId).ToArray()
), new JsonSerializerOptions
{
    WriteIndented = false
});

Console.WriteLine($"Wrote {merged.Count} tradable entries to {outputPath}");
return 0;

static string NormalizeIconPath(string path)
{
    var normalized = path.Replace("ui/icon/", "", StringComparison.OrdinalIgnoreCase)
        .Replace(".tex", ".png", StringComparison.OrdinalIgnoreCase);
    return normalized;
}

internal sealed record LocalItem(uint ItemId, string ZhName, string ZhDescription, string IconPath);
internal sealed record MappingEntry(uint ItemId, string ZhName, string EnName, string ZhDescription, string IconPath);
internal sealed record MappingFile(int Version, DateTimeOffset GeneratedAt, string Source, MappingEntry[] Entries);

internal sealed record XivApiBatchResponse(XivApiRow[]? Rows);
internal sealed record XivApiRow(
    [property: JsonPropertyName("row_id")] uint RowId,
    [property: JsonPropertyName("fields")] XivApiFields? Fields
);

internal sealed record XivApiFields(
    [property: JsonPropertyName("Name")] string? Name,
    [property: JsonPropertyName("IsUntradable")] bool IsUntradable,
    [property: JsonPropertyName("Icon")] XivApiIcon? Icon
);

internal sealed record XivApiIcon(
    [property: JsonPropertyName("path")] string? Path
);
