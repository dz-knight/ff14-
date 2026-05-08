using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace FF14MarketDesktop;

internal sealed class LocalStaticServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly string _rootPath;
    private readonly Func<string, Task<string>>? _itemResolver;
    private CancellationTokenSource? _cancellation;
    private Task? _loopTask;

    public LocalStaticServer(string rootPath, Func<string, Task<string>>? itemResolver = null)
    {
        _rootPath = rootPath;
        _itemResolver = itemResolver;
    }

    public int Port { get; private set; }

    public Uri BaseUri => new($"http://127.0.0.1:{Port}/");

    public Task StartAsync()
    {
        if (_cancellation is not null)
        {
            return Task.CompletedTask;
        }

        Port = FindAvailablePort();
        _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
        _listener.Start();

        _cancellation = new CancellationTokenSource();
        _loopTask = Task.Run(() => RunAsync(_cancellation.Token));
        return Task.CompletedTask;
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            HttpListenerContext? context = null;
            try
            {
                context = await _listener.GetContextAsync();
            }
            catch (HttpListenerException)
            {
                return;
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            if (context is null)
            {
                continue;
            }

            _ = Task.Run(() => HandleAsync(context), cancellationToken);
        }
    }

    private async Task HandleAsync(HttpListenerContext context)
    {
        var response = context.Response;
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        response.Headers["Pragma"] = "no-cache";
        response.Headers["Expires"] = "0";

        try
        {
            var absolutePath = context.Request.Url?.AbsolutePath ?? "/";
            if (absolutePath.Equals("/__resolve_item", StringComparison.OrdinalIgnoreCase))
            {
                LogToFile($"[server] hit __resolve_item method={context.Request.HttpMethod}");
                await HandleResolveItemAsync(context);
                return;
            }
            if (absolutePath.Equals("/__debug_log", StringComparison.OrdinalIgnoreCase))
            {
                LogToFile($"[server] hit __debug_log method={context.Request.HttpMethod}");
                await HandleDebugLogAsync(context);
                return;
            }

            if (absolutePath == "/")
            {
                absolutePath = "/index.html";
            }

            var relativePath = Uri.UnescapeDataString(absolutePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            var fullPath = Path.GetFullPath(Path.Combine(_rootPath, relativePath));

            if (!fullPath.StartsWith(_rootPath, StringComparison.OrdinalIgnoreCase))
            {
                response.StatusCode = (int)HttpStatusCode.Forbidden;
                response.Close();
                return;
            }

            if (!File.Exists(fullPath))
            {
                fullPath = Path.Combine(_rootPath, "index.html");
            }

            if (!File.Exists(fullPath))
            {
                response.StatusCode = (int)HttpStatusCode.NotFound;
                await WriteTextAsync(response, "Not Found");
                response.Close();
                return;
            }

            var bytes = await File.ReadAllBytesAsync(fullPath);
            if (Path.GetFileName(fullPath).Equals("app.js", StringComparison.OrdinalIgnoreCase))
            {
                var content = Encoding.UTF8.GetString(bytes);
                if (!content.Contains("window.__HOST_BRIDGE__")) 
                {
                    content = "window.__HOST_BRIDGE__ = true;\n" + content;
                    bytes = Encoding.UTF8.GetBytes(content);
                }
            }
            response.ContentType = GetContentType(Path.GetExtension(fullPath));
            response.ContentLength64 = bytes.LongLength;
            await response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
            response.Close();
        }
        catch
        {
            if (response.OutputStream.CanWrite)
            {
                response.StatusCode = (int)HttpStatusCode.InternalServerError;
                await WriteTextAsync(response, "Internal Server Error");
                response.Close();
            }
        }
    }

    private async Task HandleResolveItemAsync(HttpListenerContext context)
    {
        var response = context.Response;
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.ContentType = "application/json; charset=utf-8";
        response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";

        try
        {
            using var reader = new StreamReader(context.Request.InputStream, Encoding.UTF8);
            var body = await reader.ReadToEndAsync();
            LogToFile($"[server] __resolve_item body={body}");
            var payload = JsonSerializer.Deserialize<ResolveRequest>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            var query = payload?.Query ?? string.Empty;
            if (_itemResolver is null || string.IsNullOrWhiteSpace(query))
            {
                response.StatusCode = (int)HttpStatusCode.BadRequest;
                await WriteTextAsync(response, "{\"success\":false}");
                response.Close();
                return;
            }

            var resultJson = await _itemResolver(query);
            var bytes = Encoding.UTF8.GetBytes(resultJson);
            response.ContentLength64 = bytes.LongLength;
            await response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
            response.Close();
        }
        catch (Exception ex)
        {
            response.StatusCode = (int)HttpStatusCode.InternalServerError;
            await WriteTextAsync(response, "{\"success\":false,\"error\":\"" + EscapeJson(ex.Message) + "\"}");
            response.Close();
        }
    }

    private async Task HandleDebugLogAsync(HttpListenerContext context)
    {
        var response = context.Response;
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.ContentType = "application/json; charset=utf-8";

        try
        {
            using var reader = new StreamReader(context.Request.InputStream, Encoding.UTF8);
            var body = await reader.ReadToEndAsync();
            var message = body;
            if (!string.IsNullOrWhiteSpace(body) && body.TrimStart().StartsWith("{"))
            {
                var payload = JsonSerializer.Deserialize<DebugRequest>(body, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                if (!string.IsNullOrWhiteSpace(payload?.Message))
                {
                    message = payload.Message;
                }
            }
            LogToFile($"[front] {message}");

            await WriteTextAsync(response, "{\"success\":true}");
            response.Close();
        }
        catch
        {
            response.StatusCode = (int)HttpStatusCode.InternalServerError;
            await WriteTextAsync(response, "{\"success\":false}");
            response.Close();
        }
    }

    private static string EscapeJson(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private sealed record ResolveRequest(string? Query);
    private sealed record DebugRequest(string? Message);

    private static void LogToFile(string message)
    {
        try
        {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FF14MarketDesktop", "resolver.log");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch
        {
            // ignore server log failures
        }
    }

    private static string GetQueryParameter(string queryString, string key)
    {
        if (string.IsNullOrWhiteSpace(queryString))
        {
            return string.Empty;
        }

        var trimmed = queryString.TrimStart('?');
        foreach (var part in trimmed.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = part.Split('=', 2);
            if (pair.Length == 2 && pair[0].Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                return WebUtility.UrlDecode(pair[1]);
            }
        }

        return string.Empty;
    }

    private static async Task WriteTextAsync(HttpListenerResponse response, string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        response.ContentType = "text/plain; charset=utf-8";
        response.ContentLength64 = bytes.LongLength;
        await response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
    }

    private static string GetContentType(string extension) => extension.ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "application/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" => "application/json; charset=utf-8",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };

    private static int FindAvailablePort()
    {
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    public void Dispose()
    {
        _cancellation?.Cancel();
        _cancellation?.Dispose();
        _cancellation = null;

        if (_listener.IsListening)
        {
            _listener.Stop();
        }

        _listener.Close();
    }
}
