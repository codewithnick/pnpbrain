module.exports = {
  apps: [
    {
      name: 'crawl-worker',
      cwd: __dirname,
      script: 'pnpm',
      args: '--filter crawl-worker start',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      restart_delay: 5000,
      kill_timeout: 15000,
      max_restarts: 20,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
