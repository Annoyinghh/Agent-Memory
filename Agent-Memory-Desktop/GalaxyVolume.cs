using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media.Media3D;

internal static class GalaxyVolume
{
    public static Model3DGroup Create()
    {
        var volume = new Model3DGroup();
        volume.Children.Add(new AmbientLight(Colors.White));
        var cloud = new MeshGeometry3D();
        Quad(cloud, new Point3D(0, -0.035, 0), 1.16);
        volume.Children.Add(Surface(cloud, new ImageBrush(Nebula())));

        var random = new Random(421);
        var dust = new[] { new MeshGeometry3D(), new MeshGeometry3D(), new MeshGeometry3D() };
        for (int i = 0; i < 3400; i++)
        {
            double radius = Math.Pow(random.NextDouble(), 1.28) * 1.04;
            double angle = i % 4 * Math.PI / 2 + radius * 4.2 + (random.NextDouble() - random.NextDouble()) * 0.54;
            double elevation = (random.NextDouble() - random.NextDouble()) * (0.06 + (1 - radius) * 0.20);
            var point = new Point3D(Math.Cos(angle) * radius, elevation, Math.Sin(angle) * radius);
            int color = radius < 0.21 ? 2 : i % 2;
            Quad(dust[color], point, 0.0014 + Math.Pow(random.NextDouble(), 3) * 0.009);
        }
        volume.Children.Add(Surface(dust[0], Glow("#C1EBFF", "#609FFF")));
        volume.Children.Add(Surface(dust[1], Glow("#D4F5FF", "#79C4FA")));
        volume.Children.Add(Surface(dust[2], Glow("#FFF0C9", "#FF9D4E")));
        volume.Freeze();
        return volume;
    }

    private static GeometryModel3D Surface(MeshGeometry3D mesh, Brush brush)
    {
        mesh.Freeze();
        brush.Freeze();
        var material = new DiffuseMaterial(brush);
        material.Freeze();
        return new GeometryModel3D(mesh, material) { BackMaterial = material };
    }

    private static Brush Glow(string inner, string outer)
    {
        var tint = (Color)ColorConverter.ConvertFromString(outer);
        return new RadialGradientBrush(new GradientStopCollection
        {
            new GradientStop((Color)ColorConverter.ConvertFromString(inner), 0),
            new GradientStop(Color.FromArgb(155, tint.R, tint.G, tint.B), 0.23),
            new GradientStop(Color.FromArgb(0, tint.R, tint.G, tint.B), 1)
        });
    }

    private static void Quad(MeshGeometry3D mesh, Point3D point, double radius)
    {
        int first = mesh.Positions.Count;
        mesh.Positions.Add(new Point3D(point.X - radius, point.Y, point.Z - radius));
        mesh.Positions.Add(new Point3D(point.X - radius, point.Y, point.Z + radius));
        mesh.Positions.Add(new Point3D(point.X + radius, point.Y, point.Z + radius));
        mesh.Positions.Add(new Point3D(point.X + radius, point.Y, point.Z - radius));
        mesh.TextureCoordinates.Add(new Point(0, 0));
        mesh.TextureCoordinates.Add(new Point(0, 1));
        mesh.TextureCoordinates.Add(new Point(1, 1));
        mesh.TextureCoordinates.Add(new Point(1, 0));
        foreach (int index in new[] { 0, 1, 2, 0, 2, 3 }) mesh.TriangleIndices.Add(first + index);
    }

    private static BitmapSource Nebula()
    {
        const int size = 384;
        var pixels = new byte[size * size * 4];
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            double u = (x / (double)(size - 1) - 0.5) * 2.32;
            double v = (y / (double)(size - 1) - 0.5) * 2.32;
            double radius = Math.Sqrt(u * u + v * v);
            if (radius >= 1.1) continue;
            double texture = 0.55 * Noise(u * 12, v * 12) + 0.30 * Noise(u * 34, v * 34) + 0.15 * Noise(u * 88, v * 88);
            double angle = Math.Atan2(v, u) - radius * 4.2;
            double arms = Math.Pow(0.5 + 0.5 * Math.Cos(angle * 4 + (texture - 0.5) * 3.0), 4.5);
            double fade = Math.Min(1, (1.1 - radius) * 3.1);
            double center = Math.Exp(-radius * radius * 70);
            double cloud = arms * Math.Exp(-radius * 1.5) * (0.23 + texture * 1.9);
            double darkLane = 0.42 + 0.58 * Noise(u * 20 + 2, v * 20 - 3);
            double alpha = Math.Min(1, fade * (center * 1.08 + cloud * darkLane * 1.02 + Math.Exp(-radius * 4.0) * 0.11));
            double warm = Math.Exp(-radius * 4.8);
            int i = (y * size + x) * 4;
            pixels[i] = (byte)((232 + 18 * warm) * alpha);
            pixels[i + 1] = (byte)((136 + 99 * warm) * alpha);
            pixels[i + 2] = (byte)((57 + 198 * warm) * alpha);
            pixels[i + 3] = (byte)(255 * alpha);
        }
        var image = BitmapSource.Create(size, size, 96, 96, PixelFormats.Pbgra32, null, pixels, size * 4);
        image.Freeze();
        return image;
    }

    private static double Noise(double x, double y)
    {
        int i = (int)Math.Floor(x), j = (int)Math.Floor(y);
        double u = x - i, v = y - j;
        u = u * u * (3 - 2 * u);
        v = v * v * (3 - 2 * v);
        double top = Hash(i, j) * (1 - u) + Hash(i + 1, j) * u;
        double bottom = Hash(i, j + 1) * (1 - u) + Hash(i + 1, j + 1) * u;
        return top * (1 - v) + bottom * v;
    }

    private static double Hash(int x, int y)
    {
        uint hash = unchecked((uint)(x * 374761393 + y * 668265263));
        hash = unchecked((hash ^ (hash >> 13)) * 1274126177u);
        return (hash ^ (hash >> 16)) / (double)uint.MaxValue;
    }
}
