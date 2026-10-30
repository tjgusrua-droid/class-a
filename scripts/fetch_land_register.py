"""영화관이 있는 땅(필지)의 토지대장 면적을 브이월드 오픈API로 조회한다.

주의: 토지대장 면적 = 땅 전체 면적(예: 쇼핑몰 부지 전체)이지 영화관이 쓰는 바닥 면적이 아니다.
영화관 자체 면적은 건축물대장(fetch_building_register.py)에서 뽑는다.

필요한 것: 브이월드 인증키(환경변수 VWORLD_KEY 또는 --key), 키에 등록한 서비스 주소(--domain), api.vworld.kr 접속
순서: 지번주소 → 주소 검색 API(필지)로 PNU(필지고유번호) → 토지임야정보 API(ladfrlList)로 면적·지목
출력: data/clean/land_register_cinema.csv (영업 중 영화관마다 PNU·지목·토지 면적㎡), 응답은 data/raw/land/<운영구간>.json 에 보관
"""
import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "land"


def get(url, params):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def pnu_of(key, domain, addr):
    j = get("https://api.vworld.kr/req/search", {"service": "search", "request": "search", "version": "2.0", "type": "address", "category": "parcel",
                                                 "query": addr, "format": "json", "size": 1, "key": key, "domain": domain})
    items = (j.get("response", {}).get("result") or {}).get("items") or []
    return items[0]["id"] if items else None


def land_of(key, domain, pnu):
    j = get("https://api.vworld.kr/ned/data/ladfrlList", {"pnu": pnu, "format": "json", "numOfRows": 10, "pageNo": 1, "key": key, "domain": domain})
    rows = ((j.get("ladfrlVOList") or {}).get("ladfrlVOList")) or []
    return rows[0] if rows else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("VWORLD_KEY", ""))
    ap.add_argument("--domain", default="localhost")
    a = ap.parse_args()
    if not a.key:
        raise SystemExit("브이월드 인증키가 없습니다: --key 또는 환경변수 VWORLD_KEY")
    e = pd.read_csv(ROOT / "data" / "clean" / "venues_episodes.csv", dtype=str).fillna("")
    o = e[e.operation_status == "영업"]
    CACHE.mkdir(parents=True, exist_ok=True)
    rows = []
    for r in o.itertuples():
        addr = " ".join(r.address_jibun.split()[:4])  # '서울특별시 구 동 번지'까지
        f = CACHE / f"{r.operation_episode_id}.json"
        if f.exists():
            res = json.loads(f.read_text(encoding="utf-8"))
        else:
            pnu = pnu_of(a.key, a.domain, addr)
            res = {"addr": addr, "pnu": pnu, "land": land_of(a.key, a.domain, pnu) if pnu else {}}
            f.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
            time.sleep(0.2)
        L = res["land"]
        rows.append({"operation_episode_id": r.operation_episode_id, "영화관": r.standardized_name, "유형": r.analysis_type, "지번주소": addr,
                     "PNU": res["pnu"], "지목": L.get("lndcgrCodeNm", ""), "토지 면적(㎡)": pd.to_numeric(L.get("lndpclAr"), errors="coerce"),
                     "조회일": pd.Timestamp.today().date().isoformat(), "비고": "" if L else "PNU 또는 토지 정보 없음"})
        print(r.standardized_name, res["pnu"], L.get("lndpclAr"))
    out = pd.DataFrame(rows)
    out.to_csv(ROOT / "data" / "clean" / "land_register_cinema.csv", index=False, encoding="utf-8-sig")
    print(f"→ data/clean/land_register_cinema.csv  면적 있음 {out['토지 면적(㎡)'].notna().sum()}/{len(out)}")


if __name__ == "__main__":
    main()
