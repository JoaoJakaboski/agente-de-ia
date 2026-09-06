const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// maxRetriesPerRequest: null é exigido pelo BullMQ
const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

module.exports = { redis };
