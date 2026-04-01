/** @type {import('next').NextConfig} */
const nextConfig = {
  // API routes only — no static export needed
  output: undefined,

  // Trust all headers from upstream proxies (Vercel, Cloudflare, etc.)
  experimental: {
    serverComponentsExternalPackages: [
      '@langchain/core',
      '@langchain/langgraph',
      '@langchain/ollama',
      'drizzle-orm',
      'postgres',
    ],
  },

  // CORS and security headers for the API
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          {
            key: 'Access-Control-Allow-Origin',
            // TODO: restrict to known widget/admin origins in production
            value: process.env.ALLOWED_ORIGINS ?? '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,PUT,DELETE,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-Requested-With, Content-Type, Authorization, X-Api-Key',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
