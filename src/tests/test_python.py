import requests, json, sys, time
print("🌐 Python test started...")
try:
    r = requests.get("https://httpbin.org/ip", timeout=10)
    r.raise_for_status()
    print("✅ Status:", r.status_code)
    print("🧠 Response JSON:", json.dumps(r.json(), indent=2))
except Exception as e:
    print("❌ Error:", str(e))
    sys.exit(1)
