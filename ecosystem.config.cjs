module.exports = {
  apps: [
    {
      name: "openvlt",
      script: "node_modules/.bin/next",
      args: "start -p " + (process.env.OPENVLT_PORT || 3456),
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: process.env.OPENVLT_PORT || 3456,
        HOSTNAME: "0.0.0.0",
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      watch: false,
      max_memory_restart: "512M",
      error_file: "~/.openvlt/logs/error.log",
      out_file: "~/.openvlt/logs/out.log",
      merge_logs: true,
      time: true,
    },
  ],
}
