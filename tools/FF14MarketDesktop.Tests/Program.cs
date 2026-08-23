using System.Net;
using System.Text;
using System.Text.Json;
using FF14MarketDesktop;

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var sandbox = Path.Combine(Path.GetTempPath(), $"ff14-static-server-tests-{Guid.NewGuid():N}");
var root = Path.Combine(sandbox, "wwwroot");
Directory.CreateDirectory(root);
await File.WriteAllTextAsync(Path.Combine(root, "index.html"), "<!doctype html><title>test</title>");
await File.WriteAllTextAsync(Path.Combine(root, "app.js"), "console.log('test');");
var siblingSecret = Path.Combine(sandbox, "wwwroot-secret.txt");
await File.WriteAllTextAsync(siblingSecret, "must not be served");

try
{
    Assert(LocalStaticServer.IsPathWithinRoot(root, Path.Combine(root, "app.js")), "root child should be accepted");
    Assert(!LocalStaticServer.IsPathWithinRoot(root, siblingSecret), "same-prefix sibling should be rejected");
    Assert(
        LocalStaticServer.ResolveStaticPath(root, "/..%2Fwwwroot-secret.txt") is null,
        "encoded slash traversal should be rejected");
    Assert(
        LocalStaticServer.ResolveStaticPath(root, "/%5C..%5Cwwwroot-secret.txt") is null,
        "encoded backslash traversal should be rejected");
    Assert(
        MainForm.TryCreateTrustedHttpsUri("https://ff14.huijiwiki.com/wiki/test", "ff14.huijiwiki.com", out _),
        "trusted Wiki HTTPS URLs should be accepted");
    Assert(
        !MainForm.TryCreateTrustedHttpsUri("https://ff14.huijiwiki.com.evil.invalid/wiki/test", "ff14.huijiwiki.com", out _),
        "lookalike Wiki hosts should be rejected");
    Assert(
        !MainForm.TryCreateTrustedHttpsUri("http://ff14.huijiwiki.com/wiki/test", "ff14.huijiwiki.com", out _),
        "non-HTTPS resolver URLs should be rejected");
    Assert(
        MainForm.FormatWikiSearchQuery("第四期重建用的特供硅砂（检）") == "第四期重建用的特供硅砂 （检）",
        "Wiki search should add the required space before the parenthesis");
    Assert(
        MainForm.FormatWikiSearchQuery("  第四期重建用的特供硅砂  ( 检 ) ") == "第四期重建用的特供硅砂 (检)",
        "Wiki search should normalize redundant whitespace and ASCII parentheses");
    Assert(
        MainForm.FormatWikiSearchQuery("\u200B第四期重建用的特供硅砂\u3000（ 检 ）\uFEFF") == "第四期重建用的特供硅砂 （检）",
        "Wiki search should remove zero-width and full-width whitespace");
    Assert(
        MainForm.FormatWikiSearchQuery("特供硅砂（检）名称") == "特供硅砂 （检） 名称",
        "Wiki search should preserve searchable words around punctuation");
    Assert(MainForm.ParseDirectItemId("123") == 123, "positive item IDs should be accepted");
    Assert(MainForm.ParseDirectItemId("0") is null, "non-positive item IDs should be rejected");
    Assert(
        MainForm.ParseUniversalisMarketId("https://universalis.app/market/123").ItemId == 123,
        "trusted Universalis market URLs should resolve item IDs");
    Assert(
        MainForm.ParseUniversalisMarketId("https://universalis.app.evil.invalid/market/123").ItemId is null,
        "lookalike Universalis hosts should be rejected");

    using var server = new LocalStaticServer(
        root,
        async (query, cancellationToken) =>
        {
            if (query == "slow")
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            }
            return JsonSerializer.Serialize(new { success = true, title = query });
        },
        TimeSpan.FromMilliseconds(150));
    await server.StartAsync();

    using var client = new HttpClient
    {
        BaseAddress = server.BaseUri,
        Timeout = TimeSpan.FromSeconds(5),
    };

    using (var staticResponse = await client.GetAsync("app.js"))
    {
        Assert(staticResponse.StatusCode == HttpStatusCode.OK, "public static file should be served");
        Assert(!staticResponse.Headers.Contains("Access-Control-Allow-Origin"), "wildcard CORS should not be present");
    }

    using (var missingAsset = await client.GetAsync("missing.js"))
    {
        Assert(
            missingAsset.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden,
            "missing assets should not return index.html");
    }

    using (var privateAsset = await client.GetAsync(".git/config"))
    {
        Assert(privateAsset.StatusCode == HttpStatusCode.Forbidden, "repository metadata should never be served");
    }

    using (var headRequest = new HttpRequestMessage(HttpMethod.Head, "app.js"))
    using (var headResponse = await client.SendAsync(headRequest))
    {
        Assert(headResponse.StatusCode == HttpStatusCode.OK, "HEAD should be supported for public files");
        Assert(headResponse.Content.Headers.ContentLength > 0, "HEAD should include the public file length");
    }

    using (var wrongMethod = await client.GetAsync("__resolve_item"))
    {
        Assert(wrongMethod.StatusCode == HttpStatusCode.MethodNotAllowed, "resolver should accept POST only");
    }

    using (var wrongContentType = await client.PostAsync("__resolve_item", new StringContent("{}", Encoding.UTF8, "text/plain")))
    {
        Assert(wrongContentType.StatusCode == HttpStatusCode.UnsupportedMediaType, "resolver should require JSON");
    }

    var oversizedJson = JsonSerializer.Serialize(new { Query = new string('x', 9000) });
    using (var oversized = await client.PostAsync(
        "__resolve_item",
        new StringContent(oversizedJson, Encoding.UTF8, "application/json")))
    {
        Assert(oversized.StatusCode == HttpStatusCode.RequestEntityTooLarge, "oversized resolver body should be rejected");
    }

    using (var valid = await client.PostAsync(
        "__resolve_item",
        new StringContent("{\"Query\":\"秘银矿\"}", Encoding.UTF8, "application/json")))
    {
        Assert(valid.StatusCode == HttpStatusCode.OK, "valid resolver request should succeed");
        var payload = await valid.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(payload);
        Assert(
            document.RootElement.GetProperty("title").GetString() == "秘银矿",
            "resolver response should be returned");
    }

    using (var slow = await client.PostAsync(
        "__resolve_item",
        new StringContent("{\"Query\":\"slow\"}", Encoding.UTF8, "application/json")))
    {
        Assert(slow.StatusCode == HttpStatusCode.GatewayTimeout, "slow resolver should time out");
    }

    using (var recovered = await client.PostAsync(
        "__resolve_item",
        new StringContent("{\"Query\":\"recovered\"}", Encoding.UTF8, "application/json")))
    {
        Assert(recovered.StatusCode == HttpStatusCode.OK, "resolver should recover after a timeout");
    }

    Console.WriteLine("FF14MarketDesktop.Tests: all assertions passed");
}
finally
{
    Directory.Delete(sandbox, recursive: true);
}
