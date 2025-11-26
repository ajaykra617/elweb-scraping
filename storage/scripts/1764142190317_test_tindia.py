import requests
import json

# 1. Fetch a proxy from your proxy API
def get_proxy():
    try:
        r = requests.get("http://20.64.237.238:3100/v1/proxies/random", timeout=10)
        r.raise_for_status()
        data = r.json()
        proxy_raw = data.get("proxy")
        print("Using proxy:", proxy_raw)

        # Convert "http://user:pass@ip:port" to requests format
        return {
            "http": proxy_raw,
            "https": proxy_raw
        }
    except Exception as e:
        print("Failed to fetch proxy:", e)
        return None


def test_tradeindia():
    url = "https://apis.tradeindia.com/restapi/micro_categories_produts/"

    payload = {
        "m_cat_id": 101984,
        "page": 1,
        "offset": 0,
        "filter": 0,
        "trust_stamp": 0,
        "city_id": "",
        "nat_of_business": []
    }

    headers = {
        "accept": "application/json, text/plain, */*",
        # "x-authorization": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxMzE4Mjg0MiwidGltZV9zdGFtcCI6IjIwMjUtMTEtMjQgMTk6MjE6MDQuMDk0Nzc0In0.9KxQk5wRkYcSf75MpppOfPJGi7QwTezozTdTqN96mOY",
        "client_remote_address": "undefined",
        "content-type": "application/json",
        "host": "apis.tradeindia.com",
        "connection": "Keep-Alive",
        "accept-encoding": "gzip",
        "cookie": "NEW_TI_SESSION_COOKIE=7ccdada31e5bb2f574c314c028cc5537; TRADE_INDIA_SESSION_COOKIE=A8bad4945b9D026D8Ffd3ce4bad696ED",
        "user-agent": "okhttp/4.11.0"
    }

    # 2. Get proxy
    proxy = get_proxy()

    try:
        # 3. Make TradeIndia request through proxy
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            proxies=proxy,
            timeout=20
        )

        print("Status:", response.status_code)
        print("Response:")
        print(response.text)

    except Exception as e:
        print("Request failed:", e)


if __name__ == "__main__":
    test_tradeindia()