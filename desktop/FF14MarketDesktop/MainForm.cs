using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;

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
    private readonly WebView2 _wikiResolverView;
    private readonly ToolStripStatusLabel _statusLabel;
    private readonly ToolStripTextBox _addressBox;
    private readonly ToolStripButton _goButton;
    private readonly ToolStripButton _wikiSearchButton;
    private readonly ToolStripLabel _previewTitleLabel;
    private readonly SemaphoreSlim _resolverGate = new(1, 1);
    private readonly TaskCompletionSource<bool> _resolverReady = new(TaskCreationOptions.RunContinuationsAsynchronously);

    private LocalStaticServer? _server;
    private readonly string _resolverLogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FF14MarketDesktop",
        "resolver.log");
    private static readonly HttpClient ResolverHttp = new();

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
        marketButton.Click += (_, _) => _tabs.SelectedIndex = 0;
        wikiButton.Click += (_, _) => _tabs.SelectedIndex = 1;
        _goButton.Click += (_, _) => NavigateFromAddressBox();
        _wikiSearchButton.Click += (_, _) => SearchInWiki(_addressBox.Text);
        _addressBox.KeyDown += AddressBoxOnKeyDown;

        var marketTab = new TabPage("价格百科");
        var wikiTab = new TabPage("国服 Wiki");

        _marketView = BuildWebView();
        _wikiPreviewView = BuildWebView();
        _wikiView = BuildWebView();
        _wikiResolverView = BuildWebView();
        _wikiResolverView.Visible = true;
        _wikiResolverView.Left = 0;
        _wikiResolverView.Top = 0;
        _wikiResolverView.Width = 1600;
        _wikiResolverView.Height = 2400;

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
        Controls.Add(_wikiResolverView);
        _wikiResolverView.SendToBack();

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
                    "WebView2_20260508_fix3"),
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
            LogResolver("[startup] app start");
            var wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            _server = new LocalStaticServer(wwwroot, ResolveItemRequestJsonAsync);
            await _server.StartAsync();

            await _marketView.EnsureCoreWebView2Async();
            await _wikiPreviewView.EnsureCoreWebView2Async();
            await _wikiView.EnsureCoreWebView2Async();
            await _wikiResolverView.EnsureCoreWebView2Async();

            ConfigureWebView(_marketView, "价格百科");
            ConfigureWebView(_wikiPreviewView, "Wiki 预览");
            ConfigureWebView(_wikiView, "国服 Wiki");
            ConfigureWebView(_wikiResolverView, "Wiki 解析器");

            await _marketView.CoreWebView2.Profile.ClearBrowsingDataAsync();
            _marketView.Source = new Uri(_server.BaseUri, "index.html");
            _wikiView.Source = new Uri(DefaultWikiPage);

            _tabs.SelectedIndex = 0;
            SyncToolbarForTab();
            _resolverReady.TrySetResult(true);
            _statusLabel.Text = "桌面软件已启动";
        }
        catch (Exception ex)
        {
            _resolverReady.TrySetException(ex);
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

    private async Task<string> ResolveItemRequestJsonAsync(string query)
    {
        try
        {
            await _resolverGate.WaitAsync();
            LogResolver($"[request] query={query}");
            var result = await ResolveItemViaWikiOnUiThreadAsync(query);
            LogResolver($"[result] query={query} itemId={result.ItemId} title={result.Title} english={result.EnglishName} url={result.Url}");
            return JsonSerializer.Serialize(new
            {
                success = result.ItemId.HasValue || !string.IsNullOrWhiteSpace(result.EnglishName),
                itemId = result.ItemId,
                title = result.Title,
                englishName = result.EnglishName,
                url = result.Url
            });
        }
        catch (Exception ex)
        {
            LogResolver($"[error] query={query} error={ex}");
            return JsonSerializer.Serialize(new
            {
                success = false,
                error = ex.Message
            });
        }
        finally
        {
            _resolverGate.Release();
        }
    }

    private Task<WikiResolveResult> ResolveItemViaWikiOnUiThreadAsync(string query)
    {
        if (!InvokeRequired)
        {
            return ResolveItemViaWikiAsync(query);
        }

        var tcs = new TaskCompletionSource<WikiResolveResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        BeginInvoke(new Action(async () =>
        {
            try
            {
                var result = await ResolveItemViaWikiAsync(query);
                tcs.TrySetResult(result);
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        }));
        return tcs.Task;
    }

    private async Task<WikiResolveResult> ResolveItemViaWikiAsync(string query)
    {
        await _resolverReady.Task;
        var resolverWikiView = _wikiView;

        if (string.IsNullOrWhiteSpace(query))
        {
            return new WikiResolveResult(null, null, null, null);
        }

        var searchUrl = $"{WikiBaseUrl}/index.php?search={Uri.EscapeDataString(query)}";
        await NavigateAndWaitAsync(resolverWikiView, new Uri(searchUrl));

        var firstLinkScript = """
(() => {
  const searchLink = document.querySelector('.mw-search-result-heading a');
  if (searchLink && searchLink.href) {
    return searchLink.href;
  }
  if (location.pathname.startsWith('/wiki/')) {
    return location.href;
  }
  return '';
})();
""";

        var linkResult = await resolverWikiView.CoreWebView2.ExecuteScriptAsync(firstLinkScript);
        var pageUrl = JsonSerializer.Deserialize<string>(linkResult) ?? string.Empty;
        LogResolver($"[wiki-search] query={query} pageUrl={pageUrl}");
        if (string.IsNullOrWhiteSpace(pageUrl))
        {
          return new WikiResolveResult(null, null, null, null);
        }

        var parsed = await LoadAndExtractWikiPayloadAsync(resolverWikiView, pageUrl);
        var effectiveUrl = parsed?.Url ?? pageUrl;
        var title = CleanWikiTitle(parsed?.Title);
        if (string.IsNullOrWhiteSpace(title))
        {
            title = ExtractTitleFromWikiUrl(effectiveUrl);
        }

        var rootPageUrl = ExtractRootWikiPageUrl(effectiveUrl);
        var shouldRetryOnRootPage =
            !string.IsNullOrWhiteSpace(rootPageUrl) &&
            !string.Equals(rootPageUrl, effectiveUrl, StringComparison.OrdinalIgnoreCase) &&
            string.IsNullOrWhiteSpace(parsed?.EnglishName) &&
            string.IsNullOrWhiteSpace(parsed?.UniversalisUrl) &&
            string.IsNullOrWhiteSpace(parsed?.DirectItemId);

        if (shouldRetryOnRootPage)
        {
            LogResolver($"[wiki-page-retry-root] from={effectiveUrl} root={rootPageUrl}");
            var rootParsed = await LoadAndExtractWikiPayloadAsync(resolverWikiView, rootPageUrl!);
            parsed = MergeWikiPayload(parsed, rootParsed);
            effectiveUrl = parsed?.Url ?? rootPageUrl!;
            title ??= ExtractTitleFromWikiUrl(rootPageUrl);
        }

        var englishName = CleanEnglishName(parsed?.EnglishName);
        var directUniversalis = ParseUniversalisMarketId(parsed?.UniversalisUrl);
        var directItemId = ParseDirectItemId(parsed?.DirectItemId);
        LogResolver($"[wiki-page] title={title} english={englishName} universalisUrl={parsed?.UniversalisUrl} directMarketId={directUniversalis.ItemId} directItemId={directItemId}");

        if (directItemId.HasValue)
        {
            return new WikiResolveResult(
                directItemId,
                title,
                englishName,
                effectiveUrl);
        }

        if (directUniversalis.ItemId.HasValue)
        {
            return new WikiResolveResult(
                directUniversalis.ItemId,
                title,
                englishName,
                directUniversalis.Url ?? effectiveUrl);
        }

        if (string.IsNullOrWhiteSpace(englishName))
        {
            return new WikiResolveResult(null, title, null, effectiveUrl);
        }

        var englishResolvedItemId = await ResolveItemIdByEnglishNameAsync(englishName);
        LogResolver($"[xivapi-english-search] english={englishName} itemId={englishResolvedItemId}");
        if (englishResolvedItemId.HasValue)
        {
            return new WikiResolveResult(
                englishResolvedItemId,
                title,
                englishName,
                effectiveUrl);
        }

        var universalis = await ResolveUniversalisItemByEnglishNameAsync(englishName);
        return new WikiResolveResult(
            universalis.ItemId,
            title,
            englishName,
            universalis.Url ?? effectiveUrl);
    }

    private async Task<WikiResolvePayload?> LoadAndExtractWikiPayloadAsync(WebView2 view, string pageUrl)
    {
        await NavigateAndWaitAsync(view, new Uri(pageUrl));

        var extractScript = """
(() => {
  const title = (document.querySelector('#firstHeading')?.textContent || document.title || '').trim();
  const walkNodes = (root) => {
    const results = [];
    const visit = (node) => {
      if (!node || !(node instanceof Element)) return;
      results.push(node);
      if (node.shadowRoot) {
        for (const child of Array.from(node.shadowRoot.children)) {
          visit(child);
        }
      }
      for (const child of Array.from(node.children)) {
        visit(child);
      }
    };
    visit(root.documentElement || root);
    return results;
  };
  const allNodes = walkNodes(document);
  const anchors = allNodes.filter(node => node.matches?.('a[href]'));
  const universalisUrl = anchors.map(a => a.href || '').find(h => /universalis\.app\/market\/\d+/i.test(h)) || '';
  const hrefs = anchors.map(a => a.href || '');
  const html = document.documentElement.outerHTML || '';
  const sources = [html, ...hrefs];
  const getEnglishCandidates = () => {
    const candidates = [];
    const englishLinks = allNodes.filter(node => node.matches?.('#p-lang a, .interlanguage-link-target, a[hreflang="en"]'));
    for (const link of englishLinks) {
      const href = link.getAttribute('href') || '';
      const text = (link.textContent || '').trim();
      const titleText = (link.getAttribute('title') || '').trim();
      const sourceText = [text, titleText].find(v => /[A-Za-z]{3,}/.test(v));
      if (sourceText) {
        candidates.push(sourceText);
      }
      const hrefMatch = href.match(/\/wiki\/([A-Z][A-Za-z0-9_()%'\-]+(?:_[A-Z0-9][A-Za-z0-9_()%'\-]+){0,5})/);
      if (hrefMatch) {
        candidates.push(hrefMatch[1].replace(/_/g, ' '));
      }
    }
    const quickPanels = allNodes.filter(node => {
      const text = (node.textContent || '').trim();
      return /各语言名称|物品速查信息/.test(text);
    });
    for (const panel of quickPanels) {
      const lines = (panel.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (/[A-Za-z]{3,}/.test(line)) {
          candidates.push(line);
        }
      }
      const panelAnchors = walkNodes(panel).filter(node => node.matches?.('a[href]'));
      for (const link of panelAnchors) {
        const text = (link.textContent || '').trim();
        if (/[A-Za-z]{3,}/.test(text)) {
          candidates.push(text);
        }
      }
    }
    const explicitLanguagePanels = allNodes.filter(node => {
      const text = (node.textContent || '').trim();
      return /各语言名称|各語言名稱|物品速查信息/.test(text);
    });
    for (const panel of explicitLanguagePanels) {
      const lines = (panel.textContent || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (/[A-Za-z]{3,}/.test(line)) {
          candidates.push(line);
        }
      }
      const panelAnchors = walkNodes(panel).filter(node => node.matches?.('a[href]'));
      for (const link of panelAnchors) {
        const text = (link.textContent || '').trim();
        if (/[A-Za-z]{3,}/.test(text)) {
          candidates.push(text);
        }
      }
    }
    const rows = allNodes.filter(node => node.matches?.('tr'));
    for (const row of rows) {
      const cells = Array.from(row.children);
      if (cells.length < 2) continue;
      const key = (cells[0].innerText || '').trim();
      const value = (cells[cells.length - 1].innerText || '').trim();
      if (/(english|英文|英語|name_en|en)/i.test(key) && /[A-Za-z]/.test(value)) {
        candidates.push(value);
      }
    }
    const lines = (document.body.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      if (/(english|英文|英語)/i.test(lines[i]) && /[A-Za-z]/.test(lines[i + 1])) {
        candidates.push(lines[i + 1]);
      }
    }
    if (/[A-Za-z]/.test(title)) {
      candidates.push(title);
    }
    const htmlPatterns = [
      /Name_en[\"':=\s>]+([^\"'<>\\n\\r]{3,200})/ig,
      /[\"']Name_en[\"']\s*:\s*[\"']([^\"']{3,200})[\"']/ig,
      /[\"']Name_en[\"']\s*:\s*[\"']([^\"']{3,200})[\"']/ig,
      /[\"']Name_en[\"']\s*:\s*null/ig,
      /English Name[<:\s\\/]*([^<\\n\\r]{3,200})/ig,
      /\"en\"\s*:\s*\"([^\"]{3,200})\"/ig,
      /https?:\/\/[^"'\\s>]*\/wiki\/([A-Z][A-Za-z0-9_()%'\-]+(?:_[A-Z0-9][A-Za-z0-9_()%'\-]+){0,5})/ig
    ];
    for (const pattern of htmlPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const value = String(match[1] || '').replace(/_/g, ' ');
        if (/[A-Za-z]/.test(value)) {
          candidates.push(value);
        }
      }
    }
    return candidates;
  };
  const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const english = getEnglishCandidates().map(clean).find(v => /[A-Za-z]{3,}/.test(v)) || '';
  const itemPatterns = [
    /cafemaker\.wakingsands\.com\/item\/(\d+)/i,
    /xivapi\.com\/Item\/(\d+)/i,
    /garlandtools\.org\/db\/#item\/(\d+)/i,
    /[\"']Url[\"']\s*:\s*[\"'](?:\\\/|\/)Item(?:\\\/|\/)(\d+)[\"']/i,
    /[\"']url[\"']\s*:\s*[\"'](?:\\\/|\/)Item(?:\\\/|\/)(\d+)[\"']/i,
    /[\"']Url[\"']\s*:\s*[\"']\/Item\/(\d+)[\"']/i,
    /[\"']Url[\"']\s*:\s*[\"'](?:\\\/|\/)Item(?:\\\/|\/)(\d+)[\"']/i,
    /(?:\\\/|\/)Item(?:\\\/|\/)(\d+)/i,
    /[?&]itemId=(\d+)/i,
    /lodestone\/playguide\/db\/item\/([a-z0-9]+)/i,
    /data-item-id=[\"']?(\d+)[\"']?/i,
    /ItemTargetID[\"':= ]+(\d{3,6})/i
  ];
  let directItemId = '';
  for (const source of sources) {
    for (const pattern of itemPatterns) {
      const match = String(source).match(pattern);
      if (match) {
        directItemId = match[1];
        break;
      }
    }
    if (directItemId) break;
  }
  const bodyText = (document.body?.innerText || '').trim();
  const languagePanel = allNodes
    .find(node => /各语言名称|各語言名稱|Languages?/i.test(node.textContent || ''));
  const languagePanelTextLength = (languagePanel?.textContent || '').trim().length;
  return JSON.stringify({ title, englishName: english, universalisUrl, directItemId, url: location.href, bodyTextLength: bodyText.length, languagePanelTextLength });
})();
""";

        WikiResolvePayload? parsed = null;
        for (var attempt = 0; attempt < 30; attempt++)
        {
            var extractResult = await view.CoreWebView2.ExecuteScriptAsync(extractScript);
            var payload = NormalizeScriptJson(extractResult);
            parsed = JsonSerializer.Deserialize<WikiResolvePayload>(payload);
            if (!string.IsNullOrWhiteSpace(parsed?.Title) ||
                !string.IsNullOrWhiteSpace(parsed?.EnglishName) ||
                !string.IsNullOrWhiteSpace(parsed?.UniversalisUrl) ||
                !string.IsNullOrWhiteSpace(parsed?.DirectItemId) ||
                (parsed?.LanguagePanelTextLength ?? 0) > 20)
            {
                break;
            }

            await Task.Delay(300);
        }

        var needsApiFallback =
            parsed is null ||
            (string.IsNullOrWhiteSpace(parsed.EnglishName) &&
             string.IsNullOrWhiteSpace(parsed.UniversalisUrl) &&
             string.IsNullOrWhiteSpace(parsed.DirectItemId));

        if (needsApiFallback)
        {
            var apiParsed = await ExtractWikiApiPayloadAsync(view);
            parsed = MergeWikiPayload(parsed, apiParsed);
        }

        return parsed;
    }

    private async Task<WikiResolvePayload?> ExtractWikiApiPayloadAsync(WebView2 view)
    {
        var apiScript = """
(() => new Promise(async (resolve) => {
  try {
    const pageName = decodeURIComponent(location.pathname.replace(/^\/wiki\//i, '')).split('/')[0] || '';
    if (!pageName) {
      resolve(JSON.stringify({}));
      return;
    }

    const parseUrl = `/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext|text&format=json&origin=*`;
    const parseResponse = await fetch(parseUrl, { credentials: 'include' });
    const text = await parseResponse.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      resolve(JSON.stringify({ rawLength: text.length || 0 }));
      return;
    }

    const wikitext = data?.parse?.wikitext?.['*'] || data?.parse?.wikitext || '';
    const html = data?.parse?.text?.['*'] || '';
    const combined = `${wikitext}\n${html}`;
    const clean = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const englishPatterns = [
      /\|\s*Name_en\s*=\s*([^\n|]+)/ig,
      /\|\s*name_en\s*=\s*([^\n|]+)/ig,
      /\|\s*英文名\s*=\s*([^\n|]+)/ig,
      /\|\s*EnglishName\s*=\s*([^\n|]+)/ig,
      /\|\s*english\s*=\s*([^\n|]+)/ig,
      /[\"']Name_en[\"']\s*:\s*[\"']([^\"']{3,200})[\"']/ig
    ];

    const englishCandidates = [];
    for (const pattern of englishPatterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        const value = clean(match[1]);
        if (/[A-Za-z]{3,}/.test(value)) {
          englishCandidates.push(value);
        }
      }
    }

    try {
      const queryUrl = `/api.php?action=query&titles=${encodeURIComponent(pageName)}&prop=langlinks&lllimit=20&format=json&origin=*`;
      const queryResponse = await fetch(queryUrl, { credentials: 'include' });
      const queryText = await queryResponse.text();
      const queryData = JSON.parse(queryText);
      const pages = queryData?.query?.pages || {};
      for (const page of Object.values(pages)) {
        const langlinks = page?.langlinks || [];
        for (const link of langlinks) {
          const lang = String(link?.lang || '').toLowerCase();
          const value = clean(link?.['*'] || link?.title || '');
          if (lang === 'en' && /[A-Za-z]{3,}/.test(value)) {
            englishCandidates.push(value);
          }
        }
      }
    } catch {
      // ignore langlink fetch failures
    }

    let cargoDebug = '';
    try {
      const cargoTables = ['Item', 'Items'];
      for (const table of cargoTables) {
        const cargoUrl = `/api.php?action=cargoquery&tables=${encodeURIComponent(table)}&fields=${encodeURIComponent('Name_en,ID,_pageName')}&where=${encodeURIComponent(`_pageName="${pageName}"`)}&limit=1&format=json`;
        const cargoResponse = await fetch(cargoUrl, { credentials: 'include' });
        const cargoText = await cargoResponse.text();
        cargoDebug += `${table}:${cargoResponse.status}:${cargoText.slice(0, 120)}||`;
        let cargoData = null;
        try {
          cargoData = JSON.parse(cargoText);
        } catch {
          continue;
        }
        const first = Array.isArray(cargoData?.cargoquery) ? cargoData.cargoquery[0]?.title : null;
        const cargoEnglish = clean(first?.Name_en || first?.name_en || '');
        const cargoId = clean(first?.ID || first?.id || '');
        if (/[A-Za-z]{3,}/.test(cargoEnglish)) {
          englishCandidates.push(cargoEnglish);
        }
        if (/^\d{3,6}$/.test(cargoId)) {
          resolve(JSON.stringify({
            title: pageName,
            englishName: cargoEnglish,
            englishCandidates: Array.from(new Set([...englishCandidates, cargoEnglish].filter(Boolean))),
            universalisUrl: '',
            directItemId: cargoId,
            url: location.href,
            bodyTextLength: combined.length
          }));
          return;
        }
      }
    } catch (error) {
      cargoDebug += `error:${String(error || '')}`;
    }

    const englishWikiLinkPattern = /https?:\/\/[^"'\\s>]*\/wiki\/([A-Z][A-Za-z0-9_()%'\-]+(?:_[A-Z0-9][A-Za-z0-9_()%'\-]+){0,5})/ig;
    let englishWikiLinkMatch;
    while ((englishWikiLinkMatch = englishWikiLinkPattern.exec(combined)) !== null) {
      const value = clean(String(englishWikiLinkMatch[1] || '').replace(/_/g, ' '));
      if (/[A-Za-z]{3,}/.test(value)) {
        englishCandidates.push(value);
      }
    }

    const phrasePattern = /\b([A-Z][A-Za-z'/-]{1,}(?: [A-Z0-9][A-Za-z0-9'/-]{1,}){0,5})\b/g;
    let phraseMatch;
    while ((phraseMatch = phrasePattern.exec(combined)) !== null) {
      const value = clean(phraseMatch[1]);
      if (!/[A-Za-z]{3,}/.test(value)) {
        continue;
      }
      if (/^(Patch|Other|Materials?|Recipe|Quest|Item|Tradeable|Movement|Source|Tooltip|Journal)$/i.test(value)) {
        continue;
      }
      englishCandidates.push(value);
    }

    const pickBestEnglish = () => {
      const deduped = Array.from(new Set(englishCandidates.map(clean).filter(v => /[A-Za-z]{3,}/.test(v))));
      const titleText = `${pageName} ${title}`.trim();
      const prefer = (predicate) => deduped.find(predicate) || '';

      if (/角笛/.test(titleText)) {
        return prefer(v => /\bHorn$/i.test(v)) || prefer(v => /\bWhistle$/i.test(v));
      }
      if (/启动钥匙/.test(titleText)) {
        return prefer(v => /\bIdentification Key$/i.test(v)) || prefer(v => /\bKey$/i.test(v));
      }
      if (/礼仪/.test(titleText)) {
        return prefer(v => /\bEtiquette\b/i.test(v));
      }
      if (/坐骑|飞行|行走|慢走/.test(titleText)) {
        return prefer(v => /\b[A-Z][A-Za-z'/-]+(?: [A-Z0-9][A-Za-z0-9'/-]+){0,4}\b/.test(v));
      }
      return deduped.find(Boolean) || '';
    };

    const englishName = pickBestEnglish();
    const universalisUrl = combined.match(/https?:\/\/universalis\.app\/market\/\d+/i)?.[0] || '';
    const directItemId =
      combined.match(/cafemaker\.wakingsands\.com\/item\/(\d+)/i)?.[1] ||
      combined.match(/xivapi\.com\/Item\/(\d+)/i)?.[1] ||
      combined.match(/[\"']Url[\"']\s*:\s*[\"'](?:\\\/|\/)Item(?:\\\/|\/)(\d+)[\"']/i)?.[1] ||
      combined.match(/(?:\\\/|\/)Item(?:\\\/|\/)(\d+)/i)?.[1] ||
      combined.match(/[?&]itemId=(\d+)/i)?.[1] ||
      combined.match(/ItemTargetID[\"':= ]+(\d{3,6})/i)?.[1] ||
      '';

    resolve(JSON.stringify({
      title: pageName,
      englishName,
      englishCandidates: deduped.slice(0, 12),
      cargoDebug,
      universalisUrl,
      directItemId,
      url: location.href,
      bodyTextLength: combined.length
    }));
  } catch (error) {
    resolve(JSON.stringify({ error: String(error || '') }));
  }
}))();
""";

        var apiResult = await view.CoreWebView2.ExecuteScriptAsync(apiScript);
        var payload = NormalizeScriptJson(apiResult);
        var parsed = JsonSerializer.Deserialize<WikiResolvePayload>(payload);
        LogResolver($"[wiki-page-api] title={parsed?.Title} english={parsed?.EnglishName} candidates={string.Join(" | ", parsed?.EnglishCandidates ?? Array.Empty<string>())} cargo={parsed?.CargoDebug} universalisUrl={parsed?.UniversalisUrl} directItemId={parsed?.DirectItemId} languagePanelTextLength={parsed?.LanguagePanelTextLength}");
        return parsed;
    }

    private static string NormalizeScriptJson(string rawResult)
    {
        if (string.IsNullOrWhiteSpace(rawResult))
        {
            return "{}";
        }

        try
        {
            using var doc = JsonDocument.Parse(rawResult);
            return doc.RootElement.ValueKind == JsonValueKind.String
                ? doc.RootElement.GetString() ?? "{}"
                : doc.RootElement.GetRawText();
        }
        catch
        {
            return rawResult;
        }
    }

    private static WikiResolvePayload? MergeWikiPayload(WikiResolvePayload? original, WikiResolvePayload? preferred)
    {
        if (original is null)
        {
            return preferred;
        }

        if (preferred is null)
        {
            return original;
        }

        return new WikiResolvePayload(
            PreferNonEmpty(preferred.Title, original.Title),
            PreferNonEmpty(preferred.EnglishName, original.EnglishName),
            (preferred.EnglishCandidates?.Length ?? 0) > 0 ? preferred.EnglishCandidates : original.EnglishCandidates,
            PreferNonEmpty(preferred.CargoDebug, original.CargoDebug),
            PreferNonEmpty(preferred.UniversalisUrl, original.UniversalisUrl),
            PreferNonEmpty(preferred.DirectItemId, original.DirectItemId),
            PreferNonEmpty(preferred.Url, original.Url),
            Math.Max(preferred.BodyTextLength ?? 0, original.BodyTextLength ?? 0),
            Math.Max(preferred.LanguagePanelTextLength ?? 0, original.LanguagePanelTextLength ?? 0));
    }

    private static string? PreferNonEmpty(string? first, string? second) =>
        !string.IsNullOrWhiteSpace(first) ? first : second;

    private static string? CleanWikiTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return title;
        }

        return title
            .Replace("物品:", string.Empty)
            .Replace("Item:", string.Empty)
            .Trim();
    }

    private static string? ExtractTitleFromWikiUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        try
        {
            var uri = new Uri(url);
            var absolute = Uri.UnescapeDataString(uri.AbsolutePath);
            var marker = "/wiki/";
            var index = absolute.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (index < 0)
            {
                return null;
            }

            var path = absolute[(index + marker.Length)..];
            var firstSegment = path.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (string.IsNullOrWhiteSpace(firstSegment))
            {
                return null;
            }

            return firstSegment.Replace("物品:", string.Empty).Trim();
        }
        catch
        {
            return null;
        }
    }

    private static string? ExtractRootWikiPageUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        try
        {
            var uri = new Uri(url);
            var absolute = Uri.UnescapeDataString(uri.AbsolutePath);
            var marker = "/wiki/";
            var index = absolute.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (index < 0)
            {
                return null;
            }

            var path = absolute[(index + marker.Length)..];
            var firstSegment = path.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (string.IsNullOrWhiteSpace(firstSegment))
            {
                return null;
            }

            return $"{uri.Scheme}://{uri.Host}{marker}{Uri.EscapeDataString(firstSegment)}";
        }
        catch
        {
            return null;
        }
    }

    private static string? CleanEnglishName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        return name
            .Replace("英文名", string.Empty)
            .Replace("English", string.Empty)
            .Replace("：", " ")
            .Replace(":", " ")
            .Trim();
    }

    private async Task<UniversalisResolveResult> ResolveUniversalisItemByEnglishNameAsync(string englishName)
    {
        LogResolver($"[universalis-search-start] english={englishName}");
        await NavigateAndWaitAsync(_wikiResolverView, new Uri("https://universalis.app/items"));
        var escaped = JsonSerializer.Serialize(englishName);
        var script =
            "(() => new Promise(async (resolve) => {" +
            $"const target = ({escaped} || '').trim().toLowerCase();" +
            "const wait = (ms) => new Promise(r => setTimeout(r, ms));" +
            "const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim().toLowerCase();" +
            "const findInput = () => {" +
            "  const inputs = Array.from(document.querySelectorAll('input'));" +
            "  return inputs.find(i => /search/i.test(i.placeholder || '')) || inputs.find(i => i.type === 'search') || inputs.find(i => i.type === 'text');" +
            "};" +
            "const input = findInput();" +
            "if (input) {" +
            "  input.focus();" +
            $"  input.value = {escaped};" +
            "  input.dispatchEvent(new Event('input', { bubbles: true }));" +
            "  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));" +
            "  input.dispatchEvent(new Event('change', { bubbles: true }));" +
            "}" +
            "for (let attempt = 0; attempt < 10; attempt++) {" +
            "  await wait(500);" +
            "  const anchors = Array.from(document.querySelectorAll('a[href*=\"/market/\"]'))" +
            "    .map(a => ({ text: normalize(a.textContent), href: a.href }))" +
            "    .filter(a => /\\/market\\/\\d+/.test(a.href));" +
            "  const exact = anchors.find(a => a.text === target);" +
            "  if (exact) { resolve(JSON.stringify(exact)); return; }" +
            "  const contains = anchors.find(a => a.text.includes(target) || target.includes(a.text));" +
            "  if (contains) { resolve(JSON.stringify(contains)); return; }" +
            "}" +
            "resolve(JSON.stringify({ text: '', href: '' }));" +
            "}))();";

        var result = await _wikiResolverView.CoreWebView2.ExecuteScriptAsync(script);
        var payload = JsonSerializer.Deserialize<string>(result) ?? "{}";
        var parsed = JsonSerializer.Deserialize<UniversalisResolvePayload>(payload);
        LogResolver($"[universalis-search-result] english={englishName} href={parsed?.Href} text={parsed?.Text}");
        if (parsed?.Href is null)
        {
            return new UniversalisResolveResult(null, null);
        }

        var match = Regex.Match(parsed.Href, @"/market/(\d+)");
        return match.Success
            ? new UniversalisResolveResult(int.Parse(match.Groups[1].Value), parsed.Href)
            : new UniversalisResolveResult(null, parsed.Href);
    }

    private static UniversalisResolveResult ParseUniversalisMarketId(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return new UniversalisResolveResult(null, null);
        }

        var match = Regex.Match(url, @"/market/(\d+)");
        return match.Success
            ? new UniversalisResolveResult(int.Parse(match.Groups[1].Value), url)
            : new UniversalisResolveResult(null, url);
    }

    private static int? ParseDirectItemId(string? value)
    {
        if (int.TryParse(value, out var id))
        {
            return id;
        }

        return null;
    }

    private async Task<int?> ResolveItemIdByEnglishNameAsync(string englishName)
    {
        try
        {
            var query = Uri.EscapeDataString($"Name~\"{englishName}\"");
            var url = $"https://v2.xivapi.com/api/search?sheets=Item&fields=Name&query={query}&limit=1";
            var json = await ResolverHttp.GetStringAsync(url);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("results", out var results) &&
                results.ValueKind == JsonValueKind.Array &&
                results.GetArrayLength() > 0)
            {
                var first = results[0];
                if (first.TryGetProperty("row_id", out var rowId) && rowId.TryGetInt32(out var id))
                {
                    return id;
                }
            }
        }
        catch (Exception ex)
        {
            LogResolver($"[xivapi-english-search-error] english={englishName} error={ex.Message}");
        }

        return null;
    }

    private Task NavigateAndWaitAsync(WebView2 view, Uri uri)
    {
        var core = view.CoreWebView2 ?? throw new InvalidOperationException("WebView2 is not ready.");
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        void Handler(object? sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            core.NavigationCompleted -= Handler;
            tcs.TrySetResult(args.IsSuccess);
        }

        core.NavigationCompleted += Handler;
        view.Source = uri;
        return tcs.Task;
    }

    private void LogResolver(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_resolverLogPath)!);
            File.AppendAllText(_resolverLogPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch
        {
            // Ignore logging failures.
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
        _wikiResolverView.Dispose();
    }

    private sealed record WikiResolvePayload(string? Title, string? EnglishName, string[]? EnglishCandidates, string? CargoDebug, string? UniversalisUrl, string? DirectItemId, string? Url, int? BodyTextLength, int? LanguagePanelTextLength);
    private sealed record WikiResolveResult(int? ItemId, string? Title, string? EnglishName, string? Url);
    private sealed record UniversalisResolvePayload(string? Text, string? Href);
    private sealed record UniversalisResolveResult(int? ItemId, string? Url);
}
