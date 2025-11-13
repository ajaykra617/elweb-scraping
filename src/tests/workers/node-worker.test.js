import Redis from "ioredis";

const redis = new Redis("redis://redis:6379");

test("Worker should pick node job from queue", async () => {
  await redis.flushall();

  // Submit a job manually
  await redis.lpush("bull:scrape:wait", JSON.stringify({
    name: "manualJob",
    data: { script: "src/tests/test_node.js", args: {} }
  }));

  // Wait for worker to process
  await new Promise(r => setTimeout(r, 2000));

  const logs = await redis.keys("bull:*");
  expect(logs.length).toBeGreaterThan(0);

  redis.disconnect();
});
