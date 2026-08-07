import { createClient } from 'redis';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

let redisClient = null;
let connectionAttempted = false;
let connectionErrorLogged = false;

export const connectRedis = async () => {
  // Only attempt connection if Redis is explicitly enabled
  if (process.env.REDIS_ENABLED !== 'true' && process.env.REDIS_ENABLED !== '1') {
    if (!connectionAttempted) {
      logger.info('Redis is disabled. Set REDIS_ENABLED=true in .env to enable.');
      connectionAttempted = true;
    }
    return null;
  }

  // Prevent multiple connection attempts
  if (connectionAttempted) {
    return redisClient;
  }

  connectionAttempted = true;

  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        reconnectStrategy: false, // Disable automatic reconnection to prevent error spam
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    // Only log errors once to prevent spam
    redisClient.on('error', (err) => {
      if (!connectionErrorLogged) {
        logger.warn(`Redis connection failed: ${err.message}. The app will continue without Redis.`);
        connectionErrorLogged = true;
      }
    });

    redisClient.on('connect', () => {
      logger.info('Redis Client Connected');
      connectionErrorLogged = false; // Reset on successful connection
    });

    // Set a connection timeout
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    return redisClient;
  } catch (error) {
    if (!connectionErrorLogged) {
      logger.warn(`Redis connection failed: ${error.message}. The app will continue without Redis.`);
      connectionErrorLogged = true;
    }
    redisClient = null;
    // Don't exit process, app can work without Redis
    return null;
  }
};

export const getRedisClient = () => {
  return redisClient;
};

/**
 * Create the pub/sub client pair for the Socket.IO Redis adapter.
 *
 * Deliberately not the shared client above: the adapter puts its subscriber into subscribe
 * mode, where redis refuses ordinary commands, so sharing it would break every other Redis
 * user in the process. These two also reconnect, unlike the shared client - a Redis blip
 * that permanently severed the adapter would silently stop cross-worker order events while
 * the app looked healthy.
 *
 * Returns null when Redis is disabled or unreachable. The caller must then stay on a single
 * process: without this adapter, a socket connected to one worker never sees events emitted
 * from another.
 */
export const createSocketAdapterClients = async () => {
  if (process.env.REDIS_ENABLED !== 'true' && process.env.REDIS_ENABLED !== '1') {
    return null;
  }

  const build = () =>
    createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        reconnectStrategy: (retries) => Math.min(1000 * 2 ** retries, 30000),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

  const pubClient = build();
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => logger.warn(`Socket.IO Redis pub error: ${err.message}`));
  subClient.on('error', (err) => logger.warn(`Socket.IO Redis sub error: ${err.message}`));

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    return { pubClient, subClient };
  } catch (error) {
    logger.warn(`Socket.IO Redis adapter unavailable: ${error.message}`);
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    return null;
  }
};

export default connectRedis;

