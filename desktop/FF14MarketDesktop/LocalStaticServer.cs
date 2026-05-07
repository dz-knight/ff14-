using System.Net;
using System.Text;

namespace FF14MarketDesktop;

internal sealed class LocalStaticServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly string _rootPath;
    private CancellationTokenSource? _cancellation;
    private Task? _loopTask;

    public LocalStaticServer(string rootPath)
    {
        _rootPath = rootPath;
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

        try
        {
            var absolutePath = context.Request.Url?.AbsolutePath ?? "/";
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
