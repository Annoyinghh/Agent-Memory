using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Media3D;

internal sealed class StarNode
{
    public string Id, Label, Source, Location, Content, Kind;
    public override string ToString() { return Label; }
}

internal sealed class Galaxy : Grid
{
    private const double InitialYaw = -0.68, InitialTilt = 0.63;
    private readonly PerspectiveCamera camera = new PerspectiveCamera
    {
        UpDirection = new Vector3D(0, 1, 0), NearPlaneDistance = 0.05, FarPlaneDistance = 12
    };
    private readonly Overlay overlay;
    private readonly Pen link = new Pen(Paint("#88AAC4"), 1.1);
    private readonly Pen ring = new Pen(Paint("#FEB976"), 1.4);
    private readonly Pen beacon = new Pen(Paint("#87BEDB"), 1);
    private readonly Pen guides = new Pen(Paint("#305D7C"), 0.65);
    private readonly Brush center = Paint("#FFD49C");
    private readonly Brush waypoint = Paint("#B7DEFF");
    private readonly Brush labelBackground = Paint("#141522");
    private Vector3D[] markers = new Vector3D[0];
    private StarNode[] nodes = new StarNode[0];
    private string[][] edges = new string[0][];
    private Dictionary<string, int> indices = new Dictionary<string, int>();
    private Point? pointer;
    private Point dragStart;
    private bool dragged;
    private double yaw = InitialYaw, tilt = InitialTilt, zoom = 1;
    private string selected;
    private int hovered = -1;
    public event Action<StarNode> NodeSelected;

    public Galaxy()
    {
        link.Freeze();
        ring.Freeze();
        beacon.Freeze();
        guides.Freeze();
        Background = Brushes.Transparent;
        ClipToBounds = true;
        Cursor = Cursors.SizeAll;
        var space = new Viewport3D { Camera = camera, IsHitTestVisible = false };
        space.Children.Add(new ModelVisual3D { Content = GalaxyVolume.Create() });
        Children.Add(space);
        overlay = new Overlay(this);
        Children.Add(overlay);
        SizeChanged += (sender, e) => PositionCamera();
        PositionCamera();
    }

    public void SetData(StarNode[] records, string[][] links)
    {
        nodes = records;
        edges = links;
        hovered = -1;
        Cursor = Cursors.SizeAll;
        markers = records.Select((node, i) => At(i % 4, 0.26 + 0.70 * i / Math.Max(1, records.Length), Math.Sin(i) * 0.16, 0.045)).ToArray();
        indices = records.Select((node, i) => new { node.Id, Index = i }).ToDictionary(node => node.Id, node => node.Index);
        overlay.InvalidateVisual();
    }

    public void Select(string id) { selected = id; overlay.InvalidateVisual(); }
    public void ScaleBy(double factor) { zoom = Math.Max(0.68, Math.Min(2.4, zoom * factor)); PositionCamera(); }
    public void Reset() { yaw = InitialYaw; tilt = InitialTilt; zoom = 1; PositionCamera(); }

    private void DrawNavigation(DrawingContext context)
    {
        if (ActualWidth <= 0 || ActualHeight <= 0) return;
        var frame = new Projection(camera, ActualWidth, ActualHeight);
        foreach (double radius in new[] { 0.54, 0.88, 1.13 })
        {
            var guide = new StreamGeometry();
            using (var curve = guide.Open())
            {
                curve.BeginFigure(frame.Project(new Vector3D(radius, 0.01, 0)), false, true);
                for (int i = 1; i < 72; i++)
                {
                    double angle = i * Math.PI / 36;
                    curve.LineTo(frame.Project(new Vector3D(Math.Cos(angle) * radius, 0.01, Math.Sin(angle) * radius)), true, false);
                }
            }
            context.DrawGeometry(null, guides, guide);
        }

        int lines = 0;
        foreach (var edge in edges)
        {
            if (edge[0] != selected && edge[1] != selected) continue;
            int from, to;
            if (!indices.TryGetValue(edge[0], out from) || !indices.TryGetValue(edge[1], out to)) continue;
            context.DrawLine(link, frame.Project(markers[from]), frame.Project(markers[to]));
            if (++lines == 32) break;
        }
        int selectedMarker = -1;
        for (int i = 0; i < markers.Length; i++)
        {
            if (nodes[i].Id == selected) { selectedMarker = i; continue; }
            var point = frame.Project(markers[i]);
            context.DrawEllipse(waypoint, null, point, 2.1, 2.1);
            if (markers.Length < 50) context.DrawEllipse(null, beacon, point, 6.5, 6.5);
        }
        if (selectedMarker >= 0) DrawBeacon(context, frame.Project(markers[selectedMarker]));
        if (hovered >= 0 && hovered != selectedMarker) DrawBeacon(context, frame.Project(markers[hovered]));
        int highlighted = hovered >= 0 ? hovered : selectedMarker;
        if (highlighted < 0) return;
        var target = frame.Project(markers[highlighted]);
        if (target.X < 0 || target.X > ActualWidth || target.Y < 0 || target.Y > ActualHeight) return;
        string title = nodes[highlighted].Label;
        if (title.Length > 34) title = title.Substring(0, 33) + "…";
        var text = new FormattedText(title, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface("Consolas"), 12, center, VisualTreeHelper.GetDpi(this).PixelsPerDip);
        double left = Math.Max(4, Math.Min(ActualWidth - text.Width - 16, target.X + 15));
        double top = Math.Max(4, Math.Min(ActualHeight - 24, target.Y - 12));
        context.DrawRoundedRectangle(labelBackground, null, new Rect(left, top, text.Width + 12, 22), 3, 3);
        context.DrawText(text, new Point(left + 6, top + 4));
    }

    private void DrawBeacon(DrawingContext context, Point point)
    {
        context.DrawEllipse(center, null, point, 3.6, 3.6);
        context.DrawEllipse(null, ring, point, 9, 9);
    }

    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        pointer = dragStart = e.GetPosition(this);
        dragged = false;
        CaptureMouse();
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        var next = e.GetPosition(this);
        if (!pointer.HasValue) { SetHover(HitTestNode(next)); return; }
        if (!dragged && (next - dragStart).Length < 4) return;
        dragged = true;
        SetHover(-1);
        yaw += (next.X - pointer.Value.X) / 165;
        tilt = Math.Max(0.20, Math.Min(1.46, tilt + (next.Y - pointer.Value.Y) / 220));
        pointer = next;
        PositionCamera();
    }
    protected override void OnMouseLeftButtonUp(MouseButtonEventArgs e)
    {
        if (!pointer.HasValue) return;
        pointer = null;
        ReleaseMouseCapture();
        if (dragged) return;
        int nearest = HitTestNode(e.GetPosition(this));
        if (nearest >= 0 && NodeSelected != null) NodeSelected(nodes[nearest]);
    }

    private int HitTestNode(Point point)
    {
        var frame = new Projection(camera, ActualWidth, ActualHeight);
        int nearest = -1;
        double distance = 13;
        for (int i = 0; i < markers.Length; i++)
        {
            double candidate = (point - frame.Project(markers[i])).Length;
            if (candidate < distance) { distance = candidate; nearest = i; }
        }
        return nearest;
    }

    private void SetHover(int index)
    {
        if (hovered == index) return;
        hovered = index;
        Cursor = hovered >= 0 ? Cursors.Hand : Cursors.SizeAll;
        overlay.InvalidateVisual();
    }
    protected override void OnLostMouseCapture(MouseEventArgs e) { pointer = null; }
    protected override void OnMouseLeave(MouseEventArgs e) { SetHover(-1); }
    protected override void OnMouseWheel(MouseWheelEventArgs e) { ScaleBy(e.Delta > 0 ? 1.12 : 0.89); e.Handled = true; }

    private void PositionCamera()
    {
        double distance = 3.4 / zoom;
        double horizontal = Math.Cos(tilt) * distance;
        var position = new Point3D(Math.Sin(yaw) * horizontal, Math.Sin(tilt) * distance, Math.Cos(yaw) * horizontal);
        camera.Position = position;
        camera.LookDirection = new Point3D() - position;
        double aspect = ActualWidth / Math.Max(1, ActualHeight);
        camera.FieldOfView = 2 * Math.Atan(Math.Tan(Math.PI / 9) * Math.Max(1, aspect / 1.90)) * 180 / Math.PI;
        overlay.InvalidateVisual();
    }
    private static Vector3D At(int arm, double distance, double spread, double height)
    {
        double angle = arm * Math.PI / 2 + distance * 4.2 + spread;
        return new Vector3D(Math.Cos(angle) * distance, height, Math.Sin(angle) * distance);
    }
    private static Brush Paint(string color)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
        brush.Freeze();
        return brush;
    }

    private sealed class Overlay : FrameworkElement
    {
        private readonly Galaxy galaxy;
        public Overlay(Galaxy galaxy) { this.galaxy = galaxy; IsHitTestVisible = false; }
        protected override void OnRender(DrawingContext context) { galaxy.DrawNavigation(context); }
    }

    private struct Projection
    {
        private readonly Vector3D origin, direction, right, up;
        private readonly double width, height, focal;

        public Projection(PerspectiveCamera camera, double width, double height)
        {
            this.width = width;
            this.height = height;
            focal = width / (2 * Math.Tan(camera.FieldOfView * Math.PI / 360));
            origin = (Vector3D)camera.Position;
            var forward = camera.LookDirection;
            forward.Normalize();
            direction = forward;
            var horizontal = Vector3D.CrossProduct(direction, camera.UpDirection);
            horizontal.Normalize();
            right = horizontal;
            up = Vector3D.CrossProduct(right, direction);
        }

        public Point Project(Vector3D point)
        {
            var delta = point - origin;
            double ratio = focal / Math.Max(0.05, Vector3D.DotProduct(delta, direction));
            return new Point(width * 0.5 + Vector3D.DotProduct(delta, right) * ratio,
                height * 0.5 - Vector3D.DotProduct(delta, up) * ratio);
        }
    }
}
