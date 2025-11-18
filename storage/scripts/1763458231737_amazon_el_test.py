"""
Python script to fetch HTML and output logs for each row.
Compatible with your worker:
    python3 script.py JSON_ROW --logFile=... --resultFile=...
"""

import sys
import json
import time
import requests

# ---------------------------
# Parse args
# ---------------------------
raw_row = sys.argv[1]

log_file = None
result_file = None

for arg in sys.argv:
    if arg.startswith("--logFile="):
        log_file = arg.split("=", 1)[1]
    if arg.startswith("--resultFile="):
        result_file = arg.split("=", 1)[1]


def log(msg):
    """Write to stdout + log file"""
    print(msg)
    if log_file:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(msg + "\n")


# Parse rowData
try:
    row = json.loads(raw_row)
except:
    log("❌ ERROR parsing row")
    sys.exit(1)

url = row.get("product_url") or row.get("Product URL") or row.get("Product_URL")

if not url:
    log("❌ No URL in row")
    sys.exit(1)

log(f"🔵 Processing URL: {url}")


# ---------------------------
# Fetch with retry
# ---------------------------
def fetch_html():
    attempts = 5

    while attempts > 0:
        attempts -= 1
        try:
            log(f"🌐 Fetching... attempts left: {attempts}")

            r = requests.get(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; elweb-python-scraper/1.0)"
            }, timeout=15)

            r.raise_for_status()
            return r.text
        except Exception as e:
            log(f"⚠️ Error: {str(e)}")
            time.sleep(2)

    log("❌ Failed to fetch after retries")
    return None


html = fetch_html()

# ---------------------------
# Output result JSON (worker captures)
# ---------------------------
if html:
    result = {
        "success": True,
        "url": url,
        "length": len(html),
        "message": "HTML fetched successfully",
        "htmlSnippet": html[:200]
    }
    print(json.dumps(result))
else:
    result = {
        "success": False,
        "url": url,
        "error": "Failed to fetch HTML"
    }
    print(json.dumps(result))