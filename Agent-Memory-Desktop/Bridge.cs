using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Interop;
using Json = System.Collections.Generic.Dictionary<string, object>;

internal static class BridgeJson
{
    public static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    public static Json Map(object value) { return value as Json ?? new Json(); }
    public static object Get(Json value, string key) { object found; return value.TryGetValue(key, out found) ? found : null; }
    public static object[] Items(Json value, string key) { return Get(value, key) as object[] ?? new object[0]; }
    public static string Text(Json value, string key) { return Convert.ToString(Get(value, key), CultureInfo.InvariantCulture); }
}

internal sealed class Bridge
{
    private const string Sample = "样例回放";
    private const int Budget = 900;
    private readonly Window window;
    private readonly HttpClient api;
    private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
    private readonly Galaxy galaxy = new Galaxy();
    private readonly ComboBox projects, nodes;
    private readonly TextBox query, sourceText, agentText;
    private readonly TextBlock engineState, detailTitle, detailLocation, agentTitle, meaningText, status;
    private readonly Button run, reload, index;
    private readonly FrameworkElement details, queryRow;
    private readonly TabControl detailTabs;
    private readonly Json replay;
    private bool updating, online, loadingSource, searching, indexing, closed;
    private int graphVersion, sourceVersion;
    private string[][] edges = new string[0][];
    private Dictionary<string, StarNode> recordsById = new Dictionary<string, StarNode>();
    private string active = Sample;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);

    [STAThread]
    public static void Main(string[] args)
    {
        if (args.Length != 2) return;
        try
        {
            var application = new Application();
            var bridge = new Bridge(args[0], new Uri(args[1]));
            application.Run(bridge.window);
        }
        catch (Exception error)
        {
            MessageBox.Show(error.GetBaseException().Message, "源码星系无法启动", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private Bridge(string root, Uri origin)
    {
        api = new HttpClient(new HttpClientHandler { UseProxy = false }) { BaseAddress = origin, Timeout = TimeSpan.FromSeconds(30) };
        using (var file = File.OpenRead(Path.Combine(root, "Agent-Memory-Desktop", "Bridge.xaml")))
            window = (Window)XamlReader.Load(file);
        window.SourceInitialized += (s, e) =>
        {
            const int useImmersiveDarkMode = 20;
            int enabled = 1;
            DwmSetWindowAttribute(new WindowInteropHelper(window).Handle, useImmersiveDarkMode, ref enabled, sizeof(int));
        };
        replay = BridgeJson.Map(BridgeJson.Serializer.DeserializeObject(File.ReadAllText(
            Path.Combine(root, "Agent-memory-ui", "src", "components", "demo-replay.json"), Encoding.UTF8)));
        projects = Find<ComboBox>("Projects");
        nodes = Find<ComboBox>("Nodes");
        query = Find<TextBox>("Query");
        sourceText = Find<TextBox>("SourceText");
        agentText = Find<TextBox>("AgentText");
        engineState = Find<TextBlock>("EngineState");
        detailTitle = Find<TextBlock>("DetailTitle");
        detailLocation = Find<TextBlock>("DetailLocation");
        agentTitle = Find<TextBlock>("AgentTitle");
        meaningText = Find<TextBlock>("MeaningText");
        status = Find<TextBlock>("Status");
        details = Find<Border>("Details");
        detailTabs = Find<TabControl>("DetailTabs");
        queryRow = Find<DockPanel>("QueryRow");
        run = Find<Button>("RunQuery");
        reload = Find<Button>("Reload");
        index = Find<Button>("OpenIndex");
        Find<Grid>("GalaxyStage").Children.Add(galaxy);
        Find<Button>("ZoomIn").Click += (s, e) => galaxy.ScaleBy(1.25);
        Find<Button>("ZoomOut").Click += (s, e) => galaxy.ScaleBy(0.8);
        Find<Button>("ResetCamera").Click += (s, e) => galaxy.Reset();
        projects.SelectionChanged += async (s, e) => { if (!updating) await LoadProject(); };
        nodes.SelectionChanged += async (s, e) => { if (nodes.SelectedItem != null) await LoadSource(); };
        galaxy.NodeSelected += node => nodes.SelectedItem = node;
        reload.Click += async (s, e) => await Refresh();
        run.Click += async (s, e) => await Search();
        index.Click += async (s, e) => await Index();
        Find<Button>("CloseDetails").Click += (s, e) => ClearSelection(true);
        window.PreviewKeyDown += (s, e) =>
        {
            if (e.Key != Key.Escape || details.Visibility != Visibility.Visible || nodes.IsDropDownOpen || projects.IsDropDownOpen) return;
            ClearSelection(true);
            e.Handled = true;
        };
        query.KeyDown += async (s, e) => { if (e.Key == Key.Enter) { e.Handled = true; await Search(); } };
        window.Loaded += async (s, e) => await Refresh();
        window.Closed += (s, e) =>
        {
            closed = true;
            lifetime.Cancel();
            api.Dispose();
        };
    }

    private T Find<T>(string name) where T : class { return (T)window.FindName(name); }

    private async Task<Json> Request(string path, Json body = null)
    {
        using (var message = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, path))
        {
            if (body != null) message.Content = new StringContent(BridgeJson.Serializer.Serialize(body), Encoding.UTF8, "application/json");
            using (var response = await api.SendAsync(message, lifetime.Token))
            {
                var text = await response.Content.ReadAsStringAsync();
                var value = BridgeJson.Map(BridgeJson.Serializer.DeserializeObject(text));
                if (!response.IsSuccessStatusCode)
                {
                    var detail = BridgeJson.Text(value, "detail");
                    throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail) ? response.ReasonPhrase : detail);
                }
                return value;
            }
        }
    }

    private async Task Refresh(string select = null)
    {
        reload.IsEnabled = false;
        try
        {
            var stats = await Request("/api/stats");
            var spaces = BridgeJson.Map(BridgeJson.Get(stats, "namespaces"));
            online = true;
            engineState.Text = "● 引擎在线";
            var names = new[] { Sample }.Concat(spaces.Keys.Where(name => name != Sample).OrderBy(name => name)).ToArray();
            updating = true;
            projects.ItemsSource = names;
            projects.SelectedItem = names.Contains(select ?? active) ? (select ?? active) : Sample;
            updating = false;
        }
        catch (Exception error)
        {
            if (closed) return;
            online = false;
            engineState.Text = "○ 引擎离线";
            updating = true;
            projects.ItemsSource = new[] { Sample };
            projects.SelectedItem = Sample;
            updating = false;
            status.Text = "引擎连接失败 · " + error.Message;
        }
        finally { if (!closed) reload.IsEnabled = true; }
        if (!closed) await LoadProject();
    }

    private async Task LoadProject()
    {
        active = projects.SelectedItem as string ?? Sample;
        int version = ++graphVersion;
        ClearSelection();
        nodes.ItemsSource = null;
        edges = new string[0][];
        recordsById.Clear();
        galaxy.SetData(new StarNode[0], new string[0][]);
        if (online) status.Text = "正在读取星标…";
        UpdateControls();
        try
        {
            StarNode[] records;
            if (active == Sample)
            {
                records = BridgeJson.Items(replay, "hits").Select(BridgeJson.Map).Select(hit =>
                {
                    string content = BridgeJson.Text(hit, "content");
                    var label = Regex.Match(content, @"^def (\w+)");
                    return new StarNode { Id = BridgeJson.Text(hit, "id"), Label = label.Success ? label.Groups[1].Value : BridgeJson.Text(hit, "source"),
                        Source = BridgeJson.Text(hit, "source"), Content = content, Kind = "function" };
                }).ToArray();
                var file = new StarNode { Id = "source_files.py", Label = "source_files.py", Source = "source_files.py", Kind = "file",
                    Content = string.Join("\n\n", records.Select(node => node.Source + "\n" + node.Content)) };
                edges = records.Select(node => new[] { file.Id, node.Id, "contains" }).ToArray();
                records = records.Concat(new[] { file }).ToArray();
            }
            else
            {
                var graph = await Request("/api/graph/data?limit=200&namespace=" + Uri.EscapeDataString(active));
                if (closed || version != graphVersion) return;
                records = BridgeJson.Items(graph, "nodes").Select(BridgeJson.Map).Select(node =>
                {
                    string content = BridgeJson.Text(node, "content");
                    string label = content.Split('\n')[0];
                    if (label.StartsWith("label: ")) label = label.Substring(7);
                    if (label.Length > 95) label = label.Substring(0, 95) + "…";
                    return new StarNode { Id = BridgeJson.Text(node, "id"), Label = label.Length == 0 ? BridgeJson.Text(node, "id") : label, Content = content,
                        Source = BridgeJson.Text(node, "source_file"), Location = BridgeJson.Text(node, "source_location"),
                        Kind = BridgeJson.Text(node, "node_type") };
                }).ToArray();
                edges = BridgeJson.Items(graph, "edges").Select(BridgeJson.Map)
                    .Select(edge => new[] { BridgeJson.Text(edge, "source"), BridgeJson.Text(edge, "target"), BridgeJson.Text(edge, "relation") }).ToArray();
            }
            recordsById = records.ToDictionary(node => node.Id);
            galaxy.SetData(records, edges);
            nodes.ItemsSource = records;
            if (online) status.Text = active + "  /  " + records.Length + " 个代码星标"
                + (active == Sample ? "  /  本项目源码回放" : records.Length == 0 ? "  /  先增量索引代码" : "");
        }
        catch (Exception error)
        {
            if (closed || version != graphVersion) return;
            status.Text = "无法读取项目星系 · " + error.Message;
        }
        finally { if (!closed && version == graphVersion) UpdateControls(); }
    }

    private async Task LoadSource()
    {
        var node = nodes.SelectedItem as StarNode;
        if (node == null) return;
        int version = ++sourceVersion;
        bool sample = active == Sample;
        galaxy.Select(node.Id);
        details.Visibility = Visibility.Visible;
        detailTabs.SelectedIndex = 0;
        detailTitle.Text = node.Label;
        detailLocation.Text = Location(node);
        detailLocation.ToolTip = detailLocation.Text;
        meaningText.Text = Describe(node, sample);
        queryRow.Visibility = sample ? Visibility.Collapsed : Visibility.Visible;
        query.Text = node.Label;
        loadingSource = !sample && !string.IsNullOrEmpty(node.Kind);
        UpdateControls();
        if (sample)
        {
            sourceText.Text = node.Content;
            agentTitle.Text = "样例 XML · " + BridgeJson.Text(replay, "query");
            agentText.Text = BridgeJson.Text(replay, "context");
            return;
        }
        if (!loadingSource)
        {
            sourceText.Text = node.Content;
            agentTitle.Text = "记忆记录 · 可检索并打包";
            agentText.Text = "";
            return;
        }
        agentTitle.Text = "节点工具响应 · JSON";
        agentText.Text = "";
        sourceText.Text = "正在读取源码…";
        try
        {
            var result = await Request("/api/graph/snippet", new Json { { "namespace", active }, { "node_id", node.Id }, { "context_lines", 6 } });
            if (closed || version != sourceVersion) return;
            agentText.Text = "{\n" + string.Join(",\n", result.Select(entry => "  " +
                BridgeJson.Serializer.Serialize(entry.Key) + ": " + BridgeJson.Serializer.Serialize(entry.Value))) + "\n}";
            string snippet = BridgeJson.Text(result, "snippet");
            string marker = "\nsnippet:\n";
            int at = node.Content.IndexOf(marker, StringComparison.Ordinal);
            if (snippet.Length == 0 && result.ContainsKey("snippet") && at >= 0)
            {
                detailLocation.Text += "  /  索引时的源码快照";
                snippet = node.Content.Substring(at + marker.Length);
            }
            sourceText.Text = snippet.Length == 0 ? "当前没有可读源码。 " + BridgeJson.Text(result, "error") : snippet;
        }
        catch (Exception error)
        {
            if (closed || version != sourceVersion) return;
            sourceText.Text = error.Message;
            agentTitle.Text = "未取得节点工具响应";
        }
        finally
        {
            if (!closed && version == sourceVersion) { loadingSource = false; UpdateControls(); }
        }
    }

    private static string Location(StarNode node)
    {
        if (string.IsNullOrEmpty(node.Source)) return "索引没有记录文件位置";
        return node.Source + (string.IsNullOrEmpty(node.Location) ? "" : ":" + node.Location);
    }

    private string Describe(StarNode node, bool sample)
    {
        if (sample)
        {
            switch (node.Label)
            {
                case "allowed_source_roots":
                    return "决定引擎允许从哪些目录读取源码。它先拆开环境变量 CODEBASE_SOURCE_ROOTS 中以逗号分隔的目录，再加入默认工作区和仓库目录，最后把路径规范化并去重。";
                case "is_within_roots":
                    return "判断某个文件是否在允许的目录里。它比较规范化路径的共同父目录；在 Windows 上，遇到不同盘符会跳过那一条并继续检查。";
                default:
                    return "这是处理源码读取范围的文件。它负责列出允许的目录，以及判断一个路径是否落在这些目录里。这里展示的是本次样例检索命中的两个函数片段。";
            }
        }
        var kind = node.Kind == "function" ? "函数" : node.Kind == "class" ? "类" : node.Kind == "file" ? "文件"
            : string.IsNullOrEmpty(node.Kind) ? "记忆记录" : "代码节点（" + node.Kind + "）";
        var summary = Regex.Match(node.Content, @"(?m)^summary: ([^\r\n]+)");
        var notes = new List<string> { node.Label + " 是索引中的" + kind + "。"
            + (string.IsNullOrEmpty(node.Source) ? "" : "位置：" + Location(node)) };
        if (summary.Success) notes.Add("索引说明：" + summary.Groups[1].Value);
        var neighbors = new List<string>();
        foreach (var edge in edges)
        {
            bool outgoing = edge[0] == node.Id;
            if (!outgoing && edge[1] != node.Id) continue;
            StarNode neighbor;
            if (!recordsById.TryGetValue(edge[outgoing ? 1 : 0], out neighbor)) continue;
            string relation;
            switch (edge[2])
            {
                case "calls": relation = outgoing ? "调用 " : "被调用："; break;
                case "contains": relation = outgoing ? "包含 " : "位于 "; break;
                case "imports": relation = outgoing ? "导入 " : "被导入："; break;
                default: relation = "关联（" + edge[2] + "）："; break;
            }
            neighbors.Add("• " + relation + neighbor.Label);
            if (neighbors.Count == 5) break;
        }
        notes.Add(neighbors.Count == 0 ? "当前星图未显示它的直接关系。" : "与它直接相连的代码：\n" + string.Join("\n", neighbors));
        return string.Join("\n\n", notes);
    }

    private async Task Search()
    {
        string space = active, question = query.Text.Trim();
        int version = sourceVersion;
        if (!run.IsEnabled || question.Length == 0) return;
        searching = true;
        UpdateControls();
        try
        {
            var packed = await Request("/api/memory/pack", new Json { { "namespace", space }, { "query", question }, { "max_tokens", Budget } });
            if (closed || version != sourceVersion) return;
            agentText.Text = BridgeJson.Text(packed, "packed_context");
            agentTitle.Text = "Agent 原始上下文 · XML · " + question;
            status.Text = "<memory> 是证据条目，source 是出处，relevance 是相关度，age 是记录时间距今的长度。";
        }
        catch (Exception error) { if (!closed && version == sourceVersion) status.Text = "检索失败 · " + error.Message; }
        finally { searching = false; if (!closed) UpdateControls(); }
    }

    private async Task Index()
    {
        if (!online || indexing) return;
        string directory;
        using (var picker = new System.Windows.Forms.FolderBrowserDialog { Description = "选择需要增量索引的代码目录", ShowNewFolderButton = false })
        {
            if (picker.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
            directory = picker.SelectedPath;
        }
        string space = AskNamespace(Path.GetFileName(directory.TrimEnd(Path.DirectorySeparatorChar)));
        if (string.IsNullOrWhiteSpace(space)) return;
        if (space == Sample || space == "all") { status.Text = "请为索引指定一个独立的项目空间名。"; return; }
        indexing = true;
        UpdateControls();
        try
        {
            var task = await Request("/api/graph/extract", new Json { { "target_dir", directory }, { "namespace", space }, { "incremental", true } });
            string taskId = BridgeJson.Text(task, "task_id");
            if (taskId.Length == 0) throw new InvalidOperationException("服务没有返回任务 ID。");
            var deadline = DateTime.UtcNow.AddMinutes(20);
            while (DateTime.UtcNow < deadline)
            {
                await Task.Delay(1000, lifetime.Token);
                var progress = await Request("/api/tasks/" + Uri.EscapeDataString(taskId));
                string state = BridgeJson.Text(progress, "status");
                status.Text = "索引 " + space + " · " + BridgeJson.Text(progress, "percent") + "% · " + BridgeJson.Text(progress, "message");
                if (state == "completed") { await Refresh(space); return; }
                if (state == "failed") throw new InvalidOperationException(BridgeJson.Text(progress, "error"));
            }
            status.Text = "索引仍在后台执行 · 任务 " + taskId;
        }
        catch (Exception error) { if (!closed) status.Text = "索引失败 · " + error.Message; }
        finally { indexing = false; if (!closed) UpdateControls(); }
    }

    private string AskNamespace(string suggested)
    {
        var dialog = new Window { Owner = window, Title = "增量索引", SizeToContent = SizeToContent.WidthAndHeight,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, ResizeMode = ResizeMode.NoResize, ShowInTaskbar = false };
        var panel = new StackPanel { Margin = new Thickness(20), MinWidth = 300 };
        var input = new TextBox { Text = suggested, Margin = new Thickness(0, 8, 0, 12), MinHeight = 30 };
        var ok = new Button { Content = "开始增量索引", IsDefault = true, Padding = new Thickness(12, 5, 12, 5) };
        ok.Click += (s, e) => dialog.DialogResult = true;
        panel.Children.Add(new TextBlock { Text = "项目空间名" });
        panel.Children.Add(input);
        panel.Children.Add(ok);
        dialog.Content = panel;
        dialog.Loaded += (s, e) => { input.Focus(); input.SelectAll(); };
        return dialog.ShowDialog() == true ? input.Text.Trim() : null;
    }

    private void ClearSelection(bool focusDirectory = false)
    {
        ++sourceVersion;
        loadingSource = false;
        if (nodes.SelectedIndex >= 0) nodes.SelectedIndex = -1;
        galaxy.Select(null);
        details.Visibility = Visibility.Collapsed;
        UpdateControls();
        if (focusDirectory) nodes.Focus();
    }

    private void UpdateControls()
    {
        run.IsEnabled = online && active != Sample && nodes.SelectedItem != null && !loadingSource && !searching;
        index.IsEnabled = online && !indexing;
    }
}
