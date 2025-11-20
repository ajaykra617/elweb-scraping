import fetch from "node-fetch";
import fs from "fs";

(async () => {
  const raw = process.argv[2];
  const row = JSON.parse(raw || "{}");

  // Extract URL from different CSV formats
  const url =
    row.product_url ||
    row.url ||
    row.link ||
    row._0 ||
    null;

  if (!url || !url.startsWith("http")) {
    console.log("❌ No URL found in row");
    process.exit(1);
  }

  console.log("➡️ Fetching:", url);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.3",
    },
  });

  const html = await res.text();

  // Save HTML output
  const outputFile = process.argv
    .find(a => a.startsWith("--resultFile="))
    ?.split("=")[1];

  if (outputFile) {
    fs.writeFileSync(outputFile + ".html", html);
  }

  console.log("✅ Saved HTML");
})();