import Redis from "ioredis";
let redis = null;
let connecting = null;

const getRedis = async () => {
  if (redis) return redis;
  if (connecting) return connecting;
  connecting = (async () => {
    const client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000
    });
    try {
      await client.connect();
      redis = client;
      return client;
    } catch {
      client.disconnect();
      return null;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
};

export const cacheGet = async key => {
  const client = await getRedis();
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key, value, seconds) => {
  const client = await getRedis();
  if (client) await client.set(key, JSON.stringify(value), "EX", seconds).catch(() => {});
};

export const cacheDelete = async pattern => {
  const client = await getRedis();
  if (!client) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length) await client.del(...keys);
  } catch {}
};
