#!/usr/bin/env python3
import sys
import json

try:
    raw = sys.argv[1]
    row = json.loads(raw)
except Exception as e:
    print("Error parsing row JSON:", e)
    sys.exit(1)

print("ROW:", json.dumps(row, ensure_ascii=False))
sys.exit(0)
