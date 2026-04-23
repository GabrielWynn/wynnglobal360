/** @type {import('next').NextConfig} */
const nextConfig = {
  // Migrated commission code uses `any` types from the original project.
  // Lint cleanup is tracked separately; build must not fail on pre-existing issues.
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "wynnglobal360.com" }],
        destination: "https://www.wynnglobal360.com/",
        permanent: true,
      },
      {
        source: "/ifa",
        destination: "/commission/ifa",
        permanent: true,
      },
      {
        source: "/admin/upload",
        destination: "/commission/admin/upload",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
