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

export default connectRedis;

