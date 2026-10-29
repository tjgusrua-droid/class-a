"""영업 중 영화관의 건축물대장을 조회해 '영화관 면적'을 뽑는다.

필요한 것
  1) 공공데이터포털 '국토교통부_건축HUB_건축물대장정보 서비스' 인증키(일반 인증키, Decoding)
       python3 fetch_building_register.py --key 인증키   (또는 환경변수 DATA_GO_KR_KEY)
  2) 법정동코드 파일: 행정표준코드관리시스템(code.go.kr) '법정동코드 전체자료' txt
       (탭 구분: 법정동코드 / 법정동명 / 폐지여부) → data/raw/building/법정동코드 전체자료.txt
  3) apis.data.go.kr 에 접속 가능한 네트워크

영화관 면적 산정(건물마다)
  ① 층별개요(getBrFlrOulnInfo): 주용도·기타용도에 '영화'가 들어간 층의 면적 합 — 일반건축물
  ② 전유공용면적(getBrExposPubuseAreaInfo): 용도에 '영화'가 들어간 전유부 면적 합(공용은 따로) — 집합건축물(쇼핑몰 등)
  ①이 있으면 ①을, 없으면 ②를 '영화관 면적'으로 쓴다. 둘 다 없으면 빈칸(대장에 영화관 용도가 따로 적혀 있지 않음).
  표제부(getBrTitleInfo)의 건물명·주용도·연면적·층수도 함께 남긴다.

출력
  data/verify/building_register_targets.csv   조회 대상(지번을 구·동·산·번·지로 나눔). 키 없이도 만든다(--targets-only)
  data/raw/building/register/<운영구간>.json   API 응답 보관(있으면 다시 부르지 않음)
  data/clean/building_register_cinema.csv     영화관별 면적 결과
"""
import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://apis.data.go.kr/1613000/BldRgstHubService"
RAW = ROOT / "data" / "raw" / "building"
CACHE = RAW / "register"
CODES = RAW / "법정동코드 전체자료.txt"
OPS = {"title": "getBrTitleInfo", "floor": "getBrFlrOulnInfo", "expos": "getBrExposPubuseAreaInfo"}


def parse_lot(addr):
    """'서울특별시 강남구 신사동 651-21 …' → (구, 동, 산여부 0/1, 번, 지). 실패하면 None."""
    t = str(addr).split()
    if len(t) < 4 or t[0] != "서울특별시":
        return None
    gu, dong, rest = t[1], t[2], t[3:]
    san = rest[0] == "산" or bool(re.match(r"산\d", rest[0]))
    lot = rest[1] if rest[0] == "산" and len(rest) > 1 else rest[0].lstrip("산")
    m = re.match(r"(\d+)(?:-(\d+))?", lot)
    return (gu, dong, int(san), m.group(1).zfill(4), (m.group(2) or "0").zfill(4)) if m else None


def targets():
    e = pd.read_csv(ROOT / "data" / "clean" / "venues_episodes.csv", dtype=str).fillna("")
    o = e[e.operation_status == "영업"].copy()
    parts = o.address_jibun.map(parse_lot)
    o[["gu_name", "dong_name", "plat_gb", "bun", "ji"]] = pd.DataFrame(parts.map(lambda p: p or ("", "", "", "", "")).tolist(), index=o.index)
    o["same_lot"] = o.groupby(["gu_name", "dong_name", "bun", "ji"]).standardized_name.transform(lambda s: " / ".join(s) if len(s) > 1 else "")
    return o[["operation_episode_id", "standardized_name", "analysis_type", "address_jibun", "address_road", "gu_name", "dong_name", "plat_gb", "bun", "ji", "same_lot"]]


def load_codes():
    """법정동명 → 10자리 코드(서울, 현존만)."""
    t = pd.read_csv(CODES, sep="\t", dtype=str, encoding="cp949") if CODES.exists() else None
    if t is None:
        raise SystemExit(f"법정동코드 파일이 없습니다: {CODES.relative_to(ROOT)}")
    t.columns = ["code", "name", "state"][: len(t.columns)]
    t = t[t.name.str.startswith("서울특별시") & (t.state == "존재")]
    return {tuple(n.split()[1:3]): c for n, c in zip(t.name, t.code) if len(n.split()) == 3}


def call(key, op, sig, bjd, plat, bun, ji):
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({"serviceKey": key, "sigunguCd": sig, "bjdongCd": bjd, "platGbCd": plat, "bun": bun, "ji": ji,
                                    "numOfRows": 100, "pageNo": page, "_type": "json"})
        with urllib.request.urlopen(f"{BASE}/{OPS[op]}?{q}", timeout=30) as r:
            body = json.loads(r.read().decode("utf-8"))["response"]["body"]
        got = (body.get("items") or {}).get("item") or []
        items += got if isinstance(got, list) else [got]
        if page * 100 >= int(body.get("totalCount", 0)):
            return items
        page += 1
        time.sleep(0.2)


def has_cinema(r):
    return "영화" in f"{r.get('mainPurpsCdNm', '')} {r.get('etcPurps', '')}"


def cinema_area(res):
    """API 응답 묶음 → 영화관 면적 요약."""
    num = lambda v: float(v or 0)
    fl = [r for r in res.get("floor", []) if has_cinema(r)]
    ex = [r for r in res.get("expos", []) if has_cinema(r)]
    ex_own, ex_pub = [r for r in ex if r.get("exposPubuseGbCdNm") == "전유"], [r for r in ex if r.get("exposPubuseGbCdNm") == "공용"]
    a_fl, a_own, a_pub = sum(num(r.get("area")) for r in fl), sum(num(r.get("area")) for r in ex_own), sum(num(r.get("area")) for r in ex_pub)
    title = res.get("title", [])
    return {
        "건물수(표제부)": len(title),
        "건물명": " / ".join(sorted({(r.get("bldNm") or "").strip() for r in title} - {""})),
        "건물 주용도": " / ".join(sorted({r.get("mainPurpsCdNm") or "" for r in title} - {""})),
        "건물 연면적(㎡)": round(sum(num(r.get("totArea")) for r in title), 2) or None,
        "지상층수": max([int(num(r.get("grndFlrCnt"))) for r in title] or [0]) or None,
        "지하층수": max([int(num(r.get("ugrndFlrCnt"))) for r in title] or [0]) or None,
        "영화관 면적_층별개요(㎡)": round(a_fl, 2) or None,
        "영화관 층": ", ".join(dict.fromkeys(r.get("flrNoNm", "") for r in fl)),
        "영화관 면적_전유(㎡)": round(a_own, 2) or None,
        "영화관 면적_공용(㎡)": round(a_pub, 2) or None,
        "영화관 면적(㎡)": round(a_fl or a_own, 2) or None,
        "면적 근거": "층별개요" if a_fl else "전유부" if a_own else "대장에 영화관 용도 없음",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("DATA_GO_KR_KEY", ""))
    ap.add_argument("--targets-only", action="store_true")
    a = ap.parse_args()
    t = targets()
    (ROOT / "data" / "verify").mkdir(exist_ok=True)
    t.to_csv(ROOT / "data" / "verify" / "building_register_targets.csv", index=False, encoding="utf-8-sig")
    print(f"조회 대상 {len(t)}곳(지번 해석 실패 {int((t.bun == '').sum())}) → data/verify/building_register_targets.csv")
    if a.targets_only:
        return
    if not a.key:
        raise SystemExit("인증키가 없습니다: --key 또는 환경변수 DATA_GO_KR_KEY")
    codes = load_codes()
    CACHE.mkdir(parents=True, exist_ok=True)
    rows = []
    for r in t.itertuples():
        code = codes.get((r.gu_name, r.dong_name))
        base = {"operation_episode_id": r.operation_episode_id, "영화관": r.standardized_name, "유형": r.analysis_type, "지번주소": r.address_jibun,
                "같은 지번의 다른 영화관": r.same_lot}
        if not code or not r.bun:
            rows.append({**base, "면적 근거": "법정동코드·지번 해석 실패"}); continue
        f = CACHE / f"{r.operation_episode_id}.json"
        if f.exists():
            res = json.loads(f.read_text(encoding="utf-8"))
        else:
            res = {op: call(a.key, op, code[:5], code[5:], r.plat_gb, r.bun, r.ji) for op in OPS}
            f.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
            time.sleep(0.3)
        rows.append({**base, "시군구코드": code[:5], "법정동코드": code[5:], **cinema_area(res)})
        print(r.standardized_name, rows[-1].get("영화관 면적(㎡)"), rows[-1]["면적 근거"])
    out = pd.DataFrame(rows)
    out["조회일"] = pd.Timestamp.today().date().isoformat()
    out.to_csv(ROOT / "data" / "clean" / "building_register_cinema.csv", index=False, encoding="utf-8-sig")
    print(f"→ data/clean/building_register_cinema.csv  면적 있음 {out['영화관 면적(㎡)'].notna().sum()}/{len(out)}")


if __name__ == "__main__":
    main()
