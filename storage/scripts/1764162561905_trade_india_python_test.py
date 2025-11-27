import requests
import json
import argparse
import csv
import os
import time


# -------------------------------
# PROXY FETCHER
# -------------------------------
def get_proxy():
    try:
        r = requests.get("http://20.64.237.238:3100/v1/proxies/random", timeout=10)
        r.raise_for_status()
        proxy_raw = r.json().get("proxy")
        return {"http": proxy_raw, "https": proxy_raw}
    except:
        return None


# -------------------------------
# TRADEINDIA API WITH RETRIES
# -------------------------------
def call_tradeindia(payload, headers):
    url = "https://apis.tradeindia.com/restapi/micro_categories_produts/"

    for attempt in range(1, 4):
        try:
            proxy = get_proxy()
            print(f"[Attempt {attempt}/3] Using proxy → {proxy}")

            res = requests.post(
                url,
                json=payload,
                headers=headers,
                proxies=proxy,
                timeout=20
            )

            if res.status_code == 200:
                return res.json()

            print("Non-200:", res.status_code)

        except Exception as e:
            print("Error:", e)

        time.sleep(1)

    return None


# -------------------------------
# MAIN WORKER
# -------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("row_json", help="Row JSON")
    parser.add_argument("--resultFile")
    parser.add_argument("--logFile")
    args = parser.parse_args()

    row = json.loads(args.row_json)

    log_file = args.logFile
    result_file = args.resultFile

    log = open(log_file, "a")

    # extract microcategory
    micro_id = (
        row.get("microcategory_id")
        or row.get("m_cat_id")
        or row.get("_4")
    )

    if not micro_id:
        log.write("❌ No microcategory id found\n")
        open(result_file, "w").write(json.dumps({"code": 1}))
        return

    # -------------------------
    # API PAYLOAD
    # -------------------------
    payload = {
        "m_cat_id": int(micro_id),
        "page": 1,
        "offset": 0,
        "filter": 0,
        "trust_stamp": 0,
        "city_id": "",
        "nat_of_business": []
    }

    headers = {
        "accept": "application/json, text/plain, */*",
        "client_remote_address": "undefined",
        "content-type": "application/json",
        "host": "apis.tradeindia.com",
        "accept-encoding": "gzip",
        "cookie": "NEW_TI_SESSION_COOKIE=7ccdada31e5bb2f574c314c028cc5537; TRADE_INDIA_SESSION_COOKIE=A8bad4945b9D026D8Ffd3ce4bad696ED",
        "user-agent": "okhttp/4.11.0"
    }

    # -------------------------
    # API REQUEST
    # -------------------------
    log.write("➡️ Calling TradeIndia...\n")
    data = call_tradeindia(payload, headers)

    if not data:
        log.write("❌ All attempts failed\n")
        open(result_file, "w").write(json.dumps({"code": 1}))
        return

    # -------------------------
    # EXTRACT SELLERS (your API structure)
    # -------------------------
    sellers = []

    # Known arrays
    for key in [
        "super_premium_seller_data",
        "super_seller_data",
        "PRODUCTS",
        "featured_products"
    ]:
        if isinstance(data.get("data", {}).get(key), list):
            sellers.extend(data["data"][key])

    # Any dynamic arrays
    for key, val in data.get("data", {}).items():
        if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
            if val not in sellers:
                sellers.extend(val)

    log.write(f"Found sellers: {len(sellers)}\n")

    # -------------------------
    # WRITE sellers CSV for this row
    # -------------------------
    csv_out = result_file.replace(".json", "_sellers.csv")

    headers_out = [
        "Company Name","City","State","Address","GSTN","Product_URL","source",
        "member_since_year","prod_desc","ifpaid","category_id","Category Name",
        "has_trust_stamp","year_of_estab","super_seller","super_seller_package",
        "default_email","mobile","premium_seller","catalog_desktop_url/Website",
        "long_tail_prod_name","number_mask"
    ]

    with open(csv_out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers_out)

        for s in sellers:
            w.writerow([
                s.get("co_name"),
                s.get("es_city"),
                s.get("state"),
                s.get("address"),
                s.get("custom_field_dict", {}).get("gstin", {}).get("value") if s.get("custom_field_dict") else "",
                "https://www.tradeindia.com" + s.get("prod_url", ""),
                "tradeindia",
                s.get("member_since_year"),
                s.get("prod_desc") or s.get("prod_desc_schema"),
                s.get("ifpaid"),
                row.get("category_id"),
                row.get("category_name"),
                s.get("has_trust_stamp"),
                s.get("year_of_estab"),
                s.get("super_seller"),
                s.get("super_seller_package"),
                s.get("default_email"),
                s.get("default_mobile"),
                s.get("premium_seller"),
                s.get("catalog_desktop_url"),
                s.get("long_tail_prod_name"),
                s.get("number_mask")
            ])

    # -------------------------
    # SAVE RESULT JSON
    # -------------------------
    result_obj = {
        "code": 0,
        "out": f"Saved {len(sellers)} sellers",
        "err": "",
        "csv_file": csv_out,
        "rowData": row,
        "finishedAt": time.time()
    }

    open(result_file, "w").write(json.dumps(result_obj))
    log.write("✅ Completed!\n")


if __name__ == "__main__":
    main()