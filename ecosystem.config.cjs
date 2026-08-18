// pm2 process definition for the API.
//
// Cluster mode runs one worker per CPU core with pm2 balancing connections across them, so
// a slow request no longer blocks every other customer on the single thread the app used to
// have. Two workers, because the box has two cores - more would just contend.
//
// This is only safe because Socket.IO is backed by the Redis adapter (REDIS_ENABLED=true,
// redis on 127.0.0.1). Without it a customer connected to worker 1 would never receive
// events emitted by worker 2, silently breaking live tracking and restaurant order alerts.
// server.js refuses to run clustered without the adapter and says so loudly.
module.exports = {
  apps: [
    {
      name: "backend",
      script: "server.js",
      cwd: "/var/www/Quick-spicy/backend",
      exec_mode: "cluster",
      instances: 2,
      // A worker that dies is replaced, but a crash loop backs off instead of thrashing.
      autorestart: true,
      exp_backoff_restart_delay: 200,
      max_restarts: 20,
      // Node's default heap on a 8GB box is conservative; this keeps a worker from being
      // OOM-killed mid-request while still leaving plenty for the OS and redis.
      max_memory_restart: "1G",
      kill_timeout: 8000,
      listen_timeout: 10000,
      merge_logs: true,
      time: true,
    },
  ],
};
