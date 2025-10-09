// const Redis =require("ioredis")

// const redis = new Redis({
//   host: process.env.REDIS_HOST || "redis", // ต้องเป็นชื่อ service ใน docker-compose
//   port: process.env.REDIS_PORT || 6379,
// });

// redis.on("connect", () => console.log("Redis connected"));
// redis.on("error", (err) => console.error("Redis error:", err));

// redisClient.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ทดสอบ connection (optional)
redis.set("foo", "bar").then(() => console.log("Set success"));
redis.get("foo").then((val) => console.log("Value:", val));

module.exports = redis;
