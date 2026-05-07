using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FF14MarketDesktop;

internal sealed class MainForm : Form
{
    private const string WikiBaseUrl = "https://ff14.huijiwiki.com";
    private const string DefaultWikiPage = "https://ff14.huijiwiki.com/wiki/任务:晓月之终途";

    private readonly TabControl _tabs;
    private readonly SplitContainer _marketSplit;
    private readonly WebView2 _marketView;
    private readonly WebView2 _wikiPreviewView;
    private readonly WebView2 _wikiView;
    private readonly ToolStripStatusLabel _statusLabel;
    private readonly ToolStripTextBox _addressBox;
    private readonly ToolStripButton _goButton;
    private readonly ToolStripButton _wikiSearchButton;
    private readonly ToolStripLabel _previewTitleLabel;

    private LocalStaticServer? _server;

    public MainForm()
    {
        Text = "FF14 物价百科";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1280, 800);
        Width = 1600;
        Height = 980;

        var topBar = new ToolStrip
        {
            GripStyle = ToolStripGripStyle.Hidden,
            Padding = new Padding(8, 6, 8, 6),
            ImageScalingSize = new Size(20, 20),
        };

        var marketButton = new ToolStripButton("价格百科");
        var wikiButton = new ToolStripButton("国服 Wiki");
        _addressBox = new ToolStripTextBox
        {
            AutoSize = false,
            Width = 560,
        };
        _goButton = new ToolStripButton("打开");
        _wikiSearchButton = new ToolStripButton("Wiki 搜索");

        marketButton.Click += (_, _) => _tabs.SelectedIndex = 0;
        wikiButton.Click += (_, _) => _tabs.SelectedIndex = 1;
        _goButton.Click += (_, _) => NavigateFromAddressBox();
        _wikiSearchButton.Click += (_, _) => SearchInWiki(_addressBox.Text);
        _addressBox.KeyDown += AddressBoxOnKeyDown;

        topBar.Items.Add(marketButton);
        topBar.Items.Add(wikiButton);
        topBar.Items.Add(new ToolStripSeparator());
        topBar.Items.Add(_addressBox);
        topBar.Items.Add(_goButton);
        topBar.Items.Add(_wikiSearchButton);

        _tabs = new TabControl
        {
            Dock = DockStyle.Fill,
        };
        _tabs.SelectedIndexChanged += (_, _) => SyncToolbarForTab();

        var marketTab = new TabPage("价格百科");
        var wikiTab = new TabPage("国服 Wiki");

        _marketView = BuildWebView();
        _wikiPreviewView = BuildWebView();
        _wikiView = BuildWebView();

        _marketSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            SplitterDistance = 980,
            Panel2Collapsed = true,
        };

        var previewBar = new ToolStrip
        {
            GripStyle = ToolStripGripStyle.Hidden,
            Padding = new Padding(6, 4, 6, 4),
        };
        _previewTitleLabel = new ToolStripLabel("Wiki 预览");
        var openInWikiTabButton = new ToolStripButton("在 Wiki 标签打开");
        var closePreviewButton = new ToolStripButton("关闭预览");

        openInWikiTabButton.Click += (_, _) => OpenPreviewInWikiTab();
        closePreviewButton.Click += (_, _) => CollapseWikiPreview();

        previewBar.Items.Add(_previewTitleLabel);
        previewBar.Items.Add(new ToolStripSeparator());
        previewBar.Items.Add(openInWikiTabButton);
        previewBar.Items.Add(closePreviewButton);

        var previewContainer = new Panel { Dock = DockStyle.Fill };
        previewContainer.Controls.Add(_wikiPreviewView);
        previewContainer.Controls.Add(previewBar);
        previewBar.Dock = DockStyle.Top;
        _wikiPreviewView.Dock = DockStyle.Fill;

        _marketSplit.Panel1.Controls.Add(_marketView);
        _marketSplit.Panel2.Controls.Add(previewContainer);

        marketTab.Controls.Add(_marketSplit);
        wikiTab.Controls.Add(_wikiView);
        _tabs.TabPages.Add(marketTab);
        _tabs.TabPages.Add(wikiTab);

        var statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel("正在启动桌面软件…");
        statusStrip.Items.Add(_statusLabel);

        Controls.Add(_tabs);
        Controls.Add(topBar);
        Controls.Add(statusStrip);

        Load += HandleLoad;
        FormClosed += HandleClosed;
    }

    private WebView2 BuildWebView()
    {
        var runtimeFolder = GetBundledWebView2RuntimeFolder();

        return new WebView2
        {
            Dock = DockStyle.Fill,
            CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FF14MarketDesktop",
                    "WebView2"),
                BrowserExecutableFolder = runtimeFolder
            }
        };
    }

    private static string? GetBundledWebView2RuntimeFolder()
    {
        var runtimeFolder = Path.Combine(AppContext.BaseDirectory, "WebView2Runtime");
        return Directory.Exists(runtimeFolder) ? runtimeFolder : null;
    }

    private async void HandleLoad(object? sender, EventArgs e)
    {
        try
        {
            var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            _server = new LocalStaticServer(wwwroot);
            await _server.StartAsync();

            await _marketView.EnsureCoreWebView2Async();
            await _wikiPreviewView.EnsureCoreWebView2Async();
            await _wikiView.EnsureCoreWebView2Async();

            ConfigureWebView(_marketView, "价格百科");
            ConfigureWebView(_wikiPreviewView, "Wiki 预览");
            ConfigureWebView(_wikiView, "国服 Wiki");

            _marketView.CoreWebView2.WebMessageReceived += MarketViewOnWebMessageReceived;

            _marketView.Source = new Uri(_server.BaseUri, "index.html");
            _wikiView.Source = new Uri(DefaultWikiPage);

            _tabs.SelectedIndex = 0;
            SyncToolbarForTab();
            _statusLabel.Text = "桌面软件已启动";
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"桌面软件启动失败。\n\n{ex.Message}",
                "FF14 物价百科",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private void ConfigureWebView(WebView2 webView, string label)
    {
        var core = webView.CoreWebView2;
        if (core is null)
        {
            return;
        }

        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.AreDevToolsEnabled = true;
        core.NavigationStarting += (_, args) =>
        {
            _statusLabel.Text = $"{label} 正在打开：{args.Uri}";
        };
        core.NavigationCompleted += (_, args) =>
        {
            _statusLabel.Text = args.IsSuccess
                ? $"{label} 已加载"
                : $"{label} 加载失败：{args.WebErrorStatus}";
            SyncToolbarForTab();
        };
    }

    private void MarketViewOnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var payload = e.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(payload))
            {
                return;
            }

            if (payload.StartsWith("wiki-search:", StringComparison.OrdinalIgnoreCase))
            {
                var query = payload["wiki-search:".Length..].Trim();
                OpenWikiPreviewBySearch(query);
                return;
            }

            if (payload.StartsWith("wiki-page:", StringComparison.OrdinalIgnoreCase))
            {
                var path = payload["wiki-page:".Length..].Trim();
                if (!string.IsNullOrWhiteSpace(path))
                {
                    OpenWikiPreview(path.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                        ? new Uri(path)
                        : new Uri(new Uri(WikiBaseUrl), path), path);
                }
            }
        }
        catch
        {
            // Ignore malformed messages from the local page.
        }
    }

    private void OpenWikiPreviewBySearch(string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return;
        }

        var target = $"{WikiBaseUrl}/index.php?search={Uri.EscapeDataString(query)}";
        OpenWikiPreview(new Uri(target), query);
    }

    private void OpenWikiPreview(Uri uri, string title)
    {
        _tabs.SelectedIndex = 0;
        _marketSplit.Panel2Collapsed = false;
        _previewTitleLabel.Text = $"Wiki 预览：{title}";
        _wikiPreviewView.Source = uri;
    }

    private void OpenPreviewInWikiTab()
    {
        if (_wikiPreviewView.Source is null)
        {
            return;
        }

        _tabs.SelectedIndex = 1;
        _wikiView.Source = _wikiPreviewView.Source;
    }

    private void CollapseWikiPreview()
    {
        _marketSplit.Panel2Collapsed = true;
        _previewTitleLabel.Text = "Wiki 预览";
    }

    private void SyncToolbarForTab()
    {
        if (_tabs.SelectedIndex == 0)
        {
            _addressBox.Text = _marketSplit.Panel2Collapsed
                ? "价格百科模式"
                : (_wikiPreviewView.Source?.ToString() ?? "价格百科模式");
            _addressBox.Enabled = false;
            _goButton.Enabled = false;
            _wikiSearchButton.Enabled = false;
            return;
        }

        _addressBox.Enabled = true;
        _goButton.Enabled = true;
        _wikiSearchButton.Enabled = true;
        _addressBox.Text = _wikiView.Source?.ToString() ?? DefaultWikiPage;
    }

    private void AddressBoxOnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            e.SuppressKeyPress = true;
            NavigateFromAddressBox();
        }
    }

    private void NavigateFromAddressBox()
    {
        if (_tabs.SelectedIndex != 1)
        {
            return;
        }

        var text = _addressBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        if (Uri.TryCreate(text, UriKind.Absolute, out var absolute))
        {
            _wikiView.Source = absolute;
            return;
        }

        if (text.StartsWith("/wiki/", StringComparison.OrdinalIgnoreCase))
        {
            _wikiView.Source = new Uri(new Uri(WikiBaseUrl), text);
            return;
        }

        SearchInWiki(text);
    }

    private void SearchInWiki(string query)
    {
        if (_tabs.SelectedIndex != 1)
        {
            _tabs.SelectedIndex = 1;
        }

        var text = query.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            _wikiView.Source = new Uri(DefaultWikiPage);
            return;
        }

        var target = $"{WikiBaseUrl}/index.php?search={Uri.EscapeDataString(text)}";
        _wikiView.Source = new Uri(target);
    }

    private void HandleClosed(object? sender, FormClosedEventArgs e)
    {
        _server?.Dispose();
        _marketView.Dispose();
        _wikiPreviewView.Dispose();
        _wikiView.Dispose();
    }
}
