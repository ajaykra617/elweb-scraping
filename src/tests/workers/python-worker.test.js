import fetch from "node-fetch";

test("Python stub job should be queued", async () => {
  const res = await fetch("http://api:8000/test/python");
  const json = await res.json();

  expect(json.status).toBe("queued");
  expect(json.lang).toBe("python");
});
