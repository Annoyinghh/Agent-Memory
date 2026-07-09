/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a minimal self-contained server.js under .next/standalone for Docker.
  output: 'standalone',
  allowedDevOrigins: ['127.0.0.1', 'localhost', '198.18.0.1'],
  // Reverse proxy: every /api/* the browser issues is forwarded server-side to the
  // backend over the compose internal network (service name `backend`). This keeps a
  // single browser-facing port (3000) and needs no baked-in API URL, so the LAN IP
  // can change without rebuilding the frontend. beforeFiles guarantees the proxy wins
  // over any filesystem/dynamic route lookup.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:8900/api/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
