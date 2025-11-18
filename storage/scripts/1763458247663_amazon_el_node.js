/**
 * Node script to fetch HTML from a URL and output the result for each row.
 * Compatible with your worker:
 *   node script.js JSON_ROW --logFile=... --resultFile=...
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ---------------------------
// Parse arguments
// ---------------------------
const rawRow = process.argv[2];
const logArg = process.argv.find((a) => a.startsWith("--logFile="));
const resultArg = process.argv.find((a) => a.startsWith("--resultFile="));

const logFile = logArg ? logArg.split("=")[1] : null;
const resultFile = resultArg ? resultArg.split("=")[1] : null;

// Attach rowData
let rowData = {};
try {
  rowData = JSON.parse(rawRow);
} catch (e) {
  log("ERROR parsing row: " + e.message);
}

// Expecting CSV header column: "product_url"
const url = rowData["product_url"] || rowData["Product URL"] || rowData["Product_URL"];

if (!url) {
  log("❌ No URL found in row");
  process.exit(1);
}

// Write logs to file (optional; worker also logs)
function writeLog(txt) {
  if (!logFile) return;
  fs.appendFileSync(logFile, txt + "\n");
  log(txt);
}

writeLog(`🔵 Processing URL: ${url}`);

// ---------------------------
// FETCH WITH RETRIES
// ---------------------------
async function fetchHTML() {
  let attempts = 5;

  while (attempts-- > 0) {
    try {
      writeLog(`🌐 Fetching... attempts left: ${attempts}`);

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; elweb-scraper/1.0)"
        },
        timeout: 15000
      });

      if (!res.ok) throw new Error("HTTP " + res.status);

      return await res.text();
    } catch (err) {
      writeLog(`⚠️ Error: ${err.message}, retrying...`);
      await sleep(2000);
    }
  }

  writeLog("❌ Failed to fetch after retries");
  return null;
}

(async () => {
  const html = await fetchHTML();

  if (html) {
    // Worker will write final JSON, but we output for capture
    const result = {
      success: true,
      url,
      length: html.length,
      message: "HTML fetched successfully",
      htmlSnippet: html.slice(0, 200)
    };

    log(JSON.stringify(result));
  } else {
    const result = {
      success: false,
      url,
      error: "Failed to fetch HTML"
    };

    log(JSON.stringify(result));
  }
})();