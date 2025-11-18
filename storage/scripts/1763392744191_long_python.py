"""
long_test.py
Receives row data from your worker (JSON argument).
"""

import json
import sys
import time

def main():
    if len(sys.argv) < 2:
        print("ERROR: Missing row input")
        sys.exit(1)

    # row from CSV
    row = json.loads(sys.argv[1])

    print("PROCESSING ROW:", json.dumps(row))

    url = row.get("product_url") or row.get("product url") or None
    if url:
        print("Target URL:", url)

    elapsed = 0
    total = 240  # 4 minutes

    while elapsed < total:
        print(f"Row still working ({elapsed}s)... URL={url}", flush=True)
        time.sleep(2)
        elapsed += 2

    print("DONE processing row:", url, flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", str(e), flush=True)
        sys.exit(1)