import fetch from "node-fetch";

test("API health route should respond", async () => {
  const res = await fetch("http://api:8000/");
  const text = await res.text();

  expect(text.includes("API")).toBe(true);
});
