using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace FF14MarketDesktop;

internal sealed class LocalStaticServer : IDisposable
{
    private const int MaxResolveBodyBytes = 8 * 1024;
    private const int MaxDebugBodyBytes = 16 * 1024;
    private const int MaxResolveQueryLength = 256;
    private const int MaxIconBytes = 5 * 1024 * 1024;
    private const long MaxLogBytes = 2 * 1024 * 1024;
    private static readonly TimeSpan DefaultResolverTimeout = TimeSpan.FromSeconds(45);
    private static readonly object LogLock = new();
    private static readonly HttpClient IconHttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(10),
    };
    private static readonly Regex IconPathRegex = new(@"^\d{6}/\d{6}\.png$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly HashSet<string> PublicFiles = new(StringComparer.OrdinalIgnoreCase)
    {
        "index.html",
        "app.js",
        "market-calculations.js",
        "search-ranking.js",
        "styles.css",
        "party-finder.js",
        "party-finder.css",
        "data/item_mapping.min.json",
    };
    private static readonly string[] IconSources =
    [
        "https://cafemaker.wakingsands.com/i/",
        "https://xivapi.com/i/"
    ];

    private readonly HttpListener _listener = new();
    private readonly SemaphoreSlim _requestGate = new(16, 16);
    private readonly string _rootPath;
    private readonly string _rootPrefix;
    private readonly Func<string, CancellationToken, Task<string>>? _itemResolver;
    private readonly TimeSpan _resolverTimeout;
    private CancellationTokenSource? _cancellation;
    private Task? _loopTask;

    public LocalStaticServer(
        string rootPath,
        Func<string, CancellationToken, Task<string>>? itemResolver = null,
        TimeSpan? resolverTimeout = null)
    {
        _rootPath = Path.TrimEndingDirectorySeparator(Path.GetFullPath(rootPath));
        _rootPrefix = _rootPath + Path.DirectorySeparatorChar;
        _itemResolver = itemResolver;
        _resolverTimeout = resolverTimeout ?? DefaultResolverTimeout;
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

            try
            {
                await _requestGate.WaitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                TryCloseResponse(context.Response, HttpStatusCode.ServiceUnavailable);
                return;
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    await HandleAsync(context, cancellationToken);
                }
                finally
                {
                    _requestGate.Release();
                }
            }, CancellationToken.None);
        }
    }

    private async Task HandleAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var response = context.Response;
        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        response.Headers["Pragma"] = "no-cache";
        response.Headers["Expires"] = "0";

        try
        {
            var absolutePath = context.Request.Url?.AbsolutePath ?? "/";
            if (absolutePath.Equals("/__resolve_item", StringComparison.OrdinalIgnoreCase))
            {
                LogToFile($"[server] hit __resolve_item method={context.Request.HttpMethod}");
                if (!EnsureMethod(context, "POST")) return;
                await HandleResolveItemAsync(context, cancellationToken);
                return;
            }
            if (absolutePath.Equals("/__icon", StringComparison.OrdinalIgnoreCase))
            {
                if (!EnsureMethod(context, "GET", "HEAD")) return;
                await HandleIconAsync(context, cancellationToken);
                return;
            }
            if (absolutePath.Equals("/__debug_log", StringComparison.OrdinalIgnoreCase))
            {
                LogToFile($"[server] hit __debug_log method={context.Request.HttpMethod}");
                if (!EnsureMethod(context, "POST")) return;
                await HandleDebugLogAsync(context, cancellationToken);
                return;
            }

            if (!EnsureMethod(context, "GET", "HEAD")) return;

            if (absolutePath == "/")
            {
                absolutePath = "/index.html";
            }

            var fullPath = ResolveStaticPath(absolutePath);
            if (fullPath is null || !IsPublicStaticFile(fullPath))
            {
                response.StatusCode = (int)HttpStatusCode.Forbidden;
                response.Close();
                return;
            }

            if (!File.Exists(fullPath))
            {
                response.StatusCode = (int)HttpStatusCode.NotFound;
                await WriteTextAsync(response, "Not Found", cancellationToken);
                response.Close();
                return;
            }

            var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
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
            if (!context.Request.HttpMethod.Equals("HEAD", StringComparison.OrdinalIgnoreCase))
            {
                await response.OutputStream.WriteAsync(bytes, cancellationToken);
            }
            response.Close();
        }
        catch (OperationCanceledException)
        {
            TryCloseResponse(response, HttpStatusCode.ServiceUnavailable);
        }
        catch
        {
            if (response.OutputStream.CanWrite)
            {
                response.StatusCode = (int)HttpStatusCode.InternalServerError;
                await WriteTextAsync(response, "Internal Server Error", CancellationToken.None);
                TryCloseResponse(response);
            }
        }
    }

    private bool IsPublicStaticFile(string fullPath)
    {
        var relative = Path.GetRelativePath(_rootPath, fullPath)
            .Replace(Path.DirectorySeparatorChar, '/');
        return PublicFiles.Contains(relative);
    }

    internal static bool IsPathWithinRoot(string rootPath, string candidatePath)
    {
        var normalizedRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(rootPath));
        var normalizedCandidate = Path.GetFullPath(candidatePath);
        if (normalizedCandidate.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var rootPrefix = normalizedRoot + Path.DirectorySeparatorChar;
        return normalizedCandidate.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase);
    }

    internal static string? ResolveStaticPath(string rootPath, string absolutePath)
    {
        try
        {
            var normalizedRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(rootPath));
            var decoded = Uri.UnescapeDataString(absolutePath ?? string.Empty)
                .TrimStart('/', '\\')
                .Replace('/', Path.DirectorySeparatorChar)
                .Replace('\\', Path.DirectorySeparatorChar);
            var candidate = Path.GetFullPath(Path.Combine(normalizedRoot, decoded));
            return IsPathWithinRoot(normalizedRoot, candidate) ? candidate : null;
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch (UriFormatException)
        {
            return null;
        }
        catch (NotSupportedException)
        {
            return null;
        }
    }

    private string? ResolveStaticPath(string absolutePath)
    {
        var candidate = ResolveStaticPath(_rootPath, absolutePath);
        if (candidate is null || !candidate.StartsWith(_rootPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return candidate is not null && candidate.Equals(_rootPath, StringComparison.OrdinalIgnoreCase)
                ? candidate
                : null;
        }

        return ContainsReparsePoint(_rootPath, candidate) ? null : candidate;
    }

    private static bool ContainsReparsePoint(string rootPath, string candidatePath)
    {
        var relative = Path.GetRelativePath(rootPath, candidatePath);
        var current = rootPath;
        foreach (var segment in relative.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            current = Path.Combine(current, segment);
            if (!File.Exists(current) && !Directory.Exists(current))
            {
                continue;
            }
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
            {
                return true;
            }
        }
        return false;
    }

    private static bool EnsureMethod(HttpListenerContext context, params string[] allowedMethods)
    {
        if (allowedMethods.Any(method => context.Request.HttpMethod.Equals(method, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        context.Response.StatusCode = (int)HttpStatusCode.MethodNotAllowed;
        context.Response.Headers["Allow"] = string.Join(", ", allowedMethods);
        context.Response.Close();
        return false;
    }

    private async Task HandleIconAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var response = context.Response;
        response.ContentType = "image/png";
        response.Headers["Cache-Control"] = "public, max-age=604800";

        var iconPath = NormalizeIconPath(GetQueryParameter(context.Request.Url?.Query ?? string.Empty, "path"));
        if (string.IsNullOrWhiteSpace(iconPath))
        {
            response.StatusCode = (int)HttpStatusCode.BadRequest;
            await WriteTextAsync(response, "Invalid icon path", cancellationToken);
            response.Close();
            return;
        }

        var bytes = await ReadCachedIconAsync(iconPath, cancellationToken)
            ?? await FetchAndCacheIconAsync(iconPath, cancellationToken);
        if (bytes is null || bytes.Length == 0)
        {
            response.StatusCode = (int)HttpStatusCode.NotFound;
            response.Headers["Cache-Control"] = "no-store";
            await WriteTextAsync(response, "Icon not found", cancellationToken);
            response.Close();
            return;
        }

        response.ContentLength64 = bytes.LongLength;
        if (!context.Request.HttpMethod.Equals("HEAD", StringComparison.OrdinalIgnoreCase))
        {
            await response.OutputStream.WriteAsync(bytes, cancellationToken);
        }
        response.Close();
    }

    private static async Task<byte[]?> ReadCachedIconAsync(string iconPath, CancellationToken cancellationToken)
    {
        try
        {
            var cachePath = GetIconCachePath(iconPath);
            var info = new FileInfo(cachePath);
            if (!info.Exists || info.Length <= 0 || info.Length > MaxIconBytes)
            {
                return null;
            }
            return await File.ReadAllBytesAsync(cachePath, cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    private static async Task<byte[]?> FetchAndCacheIconAsync(string iconPath, CancellationToken cancellationToken)
    {
        foreach (var source in IconSources)
        {
            try
            {
                using var response = await IconHttpClient.GetAsync(source + iconPath, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                var mediaType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
                if (!response.IsSuccessStatusCode
                    || !mediaType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                    || response.Content.Headers.ContentLength > MaxIconBytes)
                {
                    continue;
                }

                var bytes = await ReadLimitedBytesAsync(response.Content, MaxIconBytes, cancellationToken);
                if (bytes is null)
                {
                    continue;
                }

                var cachePath = GetIconCachePath(iconPath);
                Directory.CreateDirectory(Path.GetDirectoryName(cachePath)!);
                await File.WriteAllBytesAsync(cachePath, bytes, cancellationToken);
                return bytes;
            }
            catch
            {
                // Try the next icon source.
            }
        }

        try
        {
            var assetPath = $"ui/icon/{Path.ChangeExtension(iconPath.Replace('\\', '/'), ".tex")}";
            var assetUrl = $"https://v2.xivapi.com/api/asset?path={Uri.EscapeDataString(assetPath)}&format=png";
            using var response = await IconHttpClient.GetAsync(assetUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var mediaType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
            if (response.IsSuccessStatusCode
                && mediaType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                && (response.Content.Headers.ContentLength is null
                    || response.Content.Headers.ContentLength <= MaxIconBytes))
            {
                var bytes = await ReadLimitedBytesAsync(response.Content, MaxIconBytes, cancellationToken);
                if (bytes is not null)
                {
                    var cachePath = GetIconCachePath(iconPath);
                    Directory.CreateDirectory(Path.GetDirectoryName(cachePath)!);
                    await File.WriteAllBytesAsync(cachePath, bytes, cancellationToken);
                    return bytes;
                }
            }
        }
        catch
        {
            // Keep the existing not-found behavior if every source fails.
        }

        return null;
    }

    private static async Task<byte[]?> ReadLimitedBytesAsync(
        HttpContent content,
        int maxBytes,
        CancellationToken cancellationToken)
    {
        await using var source = await content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream(Math.Min(maxBytes, 64 * 1024));
        var chunk = new byte[64 * 1024];
        while (true)
        {
            var read = await source.ReadAsync(chunk.AsMemory(0, chunk.Length), cancellationToken);
            if (read == 0)
            {
                break;
            }
            if (buffer.Length + read > maxBytes)
            {
                return null;
            }
            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }
        return buffer.Length > 0 ? buffer.ToArray() : null;
    }

    private static string GetIconCachePath(string iconPath)
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FF14MarketDesktop", "icon-cache");
        var fullPath = Path.GetFullPath(Path.Combine(root, iconPath.Replace('/', Path.DirectorySeparatorChar)));
        if (!IsPathWithinRoot(root, fullPath))
        {
            throw new InvalidOperationException("Invalid icon cache path.");
        }

        return fullPath;
    }

    private async Task HandleResolveItemAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var response = context.Response;
        response.ContentType = "application/json; charset=utf-8";
        response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";

        try
        {
            if (!IsJsonRequest(context.Request))
            {
                response.StatusCode = (int)HttpStatusCode.UnsupportedMediaType;
                await WriteJsonAsync(response, new { success = false, error = "Content-Type must be application/json." }, cancellationToken);
                response.Close();
                return;
            }

            var body = await ReadRequestBodyAsync(context.Request, MaxResolveBodyBytes, cancellationToken);
            var payload = JsonSerializer.Deserialize<ResolveRequest>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            var query = (payload?.Query ?? string.Empty).Trim();
            if (_itemResolver is null || string.IsNullOrWhiteSpace(query) || query.Length > MaxResolveQueryLength)
            {
                response.StatusCode = (int)HttpStatusCode.BadRequest;
                await WriteJsonAsync(response, new { success = false, error = "Invalid query." }, cancellationToken);
                response.Close();
                return;
            }

            LogToFile($"[server] __resolve_item query={query}");
            using var resolverCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            resolverCancellation.CancelAfter(_resolverTimeout);
            var resultJson = await _itemResolver(query, resolverCancellation.Token);
            var bytes = Encoding.UTF8.GetBytes(resultJson);
            response.ContentLength64 = bytes.LongLength;
            await response.OutputStream.WriteAsync(bytes, cancellationToken);
            response.Close();
        }
        catch (RequestBodyTooLargeException)
        {
            response.StatusCode = (int)HttpStatusCode.RequestEntityTooLarge;
            await WriteJsonAsync(response, new { success = false, error = "Request body is too large." }, CancellationToken.None);
            TryCloseResponse(response);
        }
        catch (JsonException)
        {
            response.StatusCode = (int)HttpStatusCode.BadRequest;
            await WriteJsonAsync(response, new { success = false, error = "Invalid JSON." }, CancellationToken.None);
            TryCloseResponse(response);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            response.StatusCode = (int)HttpStatusCode.GatewayTimeout;
            await WriteJsonAsync(response, new { success = false, error = "Resolver timed out." }, CancellationToken.None);
            TryCloseResponse(response);
        }
        catch (OperationCanceledException)
        {
            TryCloseResponse(response, HttpStatusCode.ServiceUnavailable);
        }
        catch (Exception ex)
        {
            response.StatusCode = (int)HttpStatusCode.InternalServerError;
            await WriteJsonAsync(response, new { success = false, error = ex.Message }, CancellationToken.None);
            TryCloseResponse(response);
        }
    }

    private async Task HandleDebugLogAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var response = context.Response;
        response.ContentType = "application/json; charset=utf-8";

        try
        {
            if (!IsJsonRequest(context.Request))
            {
                response.StatusCode = (int)HttpStatusCode.UnsupportedMediaType;
                await WriteJsonAsync(response, new { success = false, error = "Content-Type must be application/json." }, cancellationToken);
                response.Close();
                return;
            }

            var body = await ReadRequestBodyAsync(context.Request, MaxDebugBodyBytes, cancellationToken);
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

            await WriteJsonAsync(response, new { success = true }, cancellationToken);
            response.Close();
        }
        catch (RequestBodyTooLargeException)
        {
            response.StatusCode = (int)HttpStatusCode.RequestEntityTooLarge;
            await WriteJsonAsync(response, new { success = false, error = "Request body is too large." }, CancellationToken.None);
            TryCloseResponse(response);
        }
        catch (JsonException)
        {
            response.StatusCode = (int)HttpStatusCode.BadRequest;
            await WriteJsonAsync(response, new { success = false, error = "Invalid JSON." }, CancellationToken.None);
            TryCloseResponse(response);
        }
        catch (OperationCanceledException)
        {
            TryCloseResponse(response, HttpStatusCode.ServiceUnavailable);
        }
        catch (Exception)
        {
            response.StatusCode = (int)HttpStatusCode.InternalServerError;
            await WriteJsonAsync(response, new { success = false }, CancellationToken.None);
            TryCloseResponse(response);
        }
    }

    private static string NormalizeIconPath(string value)
    {
        var normalized = (value ?? string.Empty)
            .Trim()
            .Replace('\\', '/')
            .TrimStart('/');

        if (normalized.StartsWith("i/", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[2..];
        }
        if (normalized.StartsWith("ui/icon/", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[8..];
        }
        if (normalized.EndsWith(".tex", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[..^4] + ".png";
        }

        return IconPathRegex.IsMatch(normalized) ? normalized : string.Empty;
    }

    private sealed record ResolveRequest(string? Query);
    private sealed record DebugRequest(string? Message);

    internal static void LogToFile(string message)
    {
        try
        {
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FF14MarketDesktop",
                "resolver.log");
            var safeMessage = Regex.Replace(message ?? string.Empty, @"[\r\n\u0000-\u001F]+", " ").Trim();
            if (safeMessage.Length > 4096)
            {
                safeMessage = safeMessage[..4096];
            }

            lock (LogLock)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                if (File.Exists(path) && new FileInfo(path).Length >= MaxLogBytes)
                {
                    var backupPath = Path.Combine(Path.GetDirectoryName(path)!, "resolver.1.log");
                    File.Move(path, backupPath, true);
                }
                File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {safeMessage}{Environment.NewLine}");
            }
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

    private static bool IsJsonRequest(HttpListenerRequest request) =>
        request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true;

    private static async Task<string> ReadRequestBodyAsync(
        HttpListenerRequest request,
        int maxBytes,
        CancellationToken cancellationToken)
    {
        if (request.ContentLength64 > maxBytes)
        {
            throw new RequestBodyTooLargeException();
        }

        await using var buffer = new MemoryStream(Math.Min(maxBytes, 4096));
        var chunk = new byte[4096];
        while (true)
        {
            var read = await request.InputStream.ReadAsync(chunk, cancellationToken);
            if (read == 0) break;
            if (buffer.Length + read > maxBytes)
            {
                throw new RequestBodyTooLargeException();
            }
            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }
        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, checked((int)buffer.Length));
    }

    private static async Task WriteJsonAsync(
        HttpListenerResponse response,
        object payload,
        CancellationToken cancellationToken)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(payload);
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = bytes.LongLength;
        await response.OutputStream.WriteAsync(bytes, cancellationToken);
    }

    private static async Task WriteTextAsync(
        HttpListenerResponse response,
        string text,
        CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        response.ContentType = "text/plain; charset=utf-8";
        response.ContentLength64 = bytes.LongLength;
        await response.OutputStream.WriteAsync(bytes, cancellationToken);
    }

    private static void TryCloseResponse(HttpListenerResponse response, HttpStatusCode? statusCode = null)
    {
        try
        {
            if (statusCode.HasValue)
            {
                response.StatusCode = (int)statusCode.Value;
            }
            response.Close();
        }
        catch
        {
            // The client or listener may already have closed the stream.
        }
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

    private sealed class RequestBodyTooLargeException : Exception
    {
    }
}
