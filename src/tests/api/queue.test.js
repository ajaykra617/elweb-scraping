import fetch from "node-fetch";

test("Queue: node job should be queued successfully", async () => {
  const res = await fetch("http://api:8000/test/node");
  const json = await res.json();

  expect(json.status).toBe("queued");
  expect(json.jobId).toBeDefined();
});
