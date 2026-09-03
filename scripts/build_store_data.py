"""Aggregate 1등 배출 판매점 data from smok95/lotto's winning-stores/ directory.

Produces data/lotto_stores.json:
    meta     - draw range covered, totals, online-purchase count
    regions  - 1등 배출 횟수 by 시·도
    stores   - stores with >= MIN_WINS 1등 배출, with coordinates

Usage:
    git clone --depth 1 https://github.com/smok95/lotto /tmp/smok95-lotto
    python3 scripts/build_store_data.py /tmp/smok95-lotto/winning-stores data/lotto_stores.json
"""
import collections
import glob
import json
import os
import sys

MIN_WINS = 3
ONLINE_ADDRESS = "동행복권(dhlottery.co.kr)"

# 주소 첫 토큰 -> 시·도 정식 표기. "전남광주"는 원본 데이터의 오타(좌표상 광주광역시).
REGION_BY_PREFIX = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
    "인천": "인천광역시", "광주": "광주광역시", "전남광주": "광주광역시",
    "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "경기": "경기도", "강원": "강원도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전라북도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}


def main(src_dir: str, dst_path: str) -> None:
    files = glob.glob(os.path.join(src_dir, "*.json"))
    if not files:
        raise SystemExit(f"no winning-store files under {src_dir}")

    wins = collections.Counter()          # (name, address) -> 1등 배출 횟수
    coords = {}                           # (name, address) -> (lat, lng)
    regions = collections.Counter()
    combos = collections.Counter()
    draws_with_data = []
    online = 0
    records = 0

    for path in files:
        draw_no = int(os.path.basename(path)[:-5])
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
        if not rows:
            continue
        draws_with_data.append(draw_no)
        for r in rows:
            records += 1
            name = (r.get("name") or "").strip()
            address = (r.get("address") or "").strip()
            combos[r.get("combination") or "미상"] += 1

            if address == ONLINE_ADDRESS:
                online += 1
                continue

            wins[(name, address)] += 1
            if r.get("lat") and r.get("lng"):
                coords[(name, address)] = (round(r["lat"], 5), round(r["lng"], 5))

            prefix = address.split()[0] if address else ""
            region = REGION_BY_PREFIX.get(prefix)
            if region:
                regions[region] += 1

    stores = []
    for (name, address), count in wins.most_common():
        if count < MIN_WINS or (name, address) not in coords:
            continue
        lat, lng = coords[(name, address)]
        prefix = address.split()[0] if address else ""
        stores.append({
            "n": name,
            "a": address,
            "r": REGION_BY_PREFIX.get(prefix, ""),
            "w": count,
            "lat": lat,
            "lng": lng,
        })

    out = {
        "meta": {
            "draw_from": min(draws_with_data),
            "draw_to": max(draws_with_data),
            "draws_with_data": len(draws_with_data),
            "records": records,
            "unique_stores": len(wins),
            "online_wins": online,
            "min_wins_listed": MIN_WINS,
            "combinations": dict(combos),
        },
        "regions": dict(regions.most_common()),
        "stores": stores,
    }

    with open(dst_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {len(stores)} stores / {len(regions)} regions to {dst_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "winning-stores",
         sys.argv[2] if len(sys.argv) > 2 else "data/lotto_stores.json")
