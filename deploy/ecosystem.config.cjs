// PM2 Production Configuration for چی‌کجا (ChikojA) on Ubuntu 24.04 LTS
// Note: SQLite uses single-writer WAL mode, so keep instances: 1 (fork mode).
module.exports = {
  apps: [
    {
      name: 'chikoja-web',
      script: './server/dist/index.js',
      cwd: '/opt/chikoja',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      env_file: '/opt/chikoja/.env',
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
      },
      out_file: '/var/log/chikoja/out.log',
      error_file: '/var/log/chikoja/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
