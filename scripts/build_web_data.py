"""웹(story/public/data/)용 파일: venues.geojson(LOCALDATA 운영구간), yearly.json(2000~ 시계열).

먼저 build_venues.py, audit_venues.py 를 실행한다.
"""
import json
import math
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
OUT = ROOT / "story" / "public" / "data"


def cinema_floor(*addrs):
    """주소에 적힌 영화관 층(지하 = 음수). 여러 층이면 가장 낮은 층. 없으면 None."""
    a = " ".join(str(x) for x in addrs)
    m = re.search(r"(지하|B)\s*(\d+)\s*층", a)
    if m:
        return -int(m.group(2))
    m = re.search(r"(\d+)\s*(?:[~,·]\s*\d+)?\s*층", a)
    return int(m.group(1)) if m else None


# 실제 개관 연도: LOCALDATA 인허가일은 2000년대 초 재등록 날짜인 경우가 많다(단성사 1907 → 2005 등).
# 참고 홈페이지 '극장 이야기'(data/raw/reference/ref_homepage_archive.json)의 개관 연도가 더 이르면 그 값을 쓴다.
# 연결: 이름 핵심어가 같고(괄호·'극장'·'시네마' 등 제외) 200m 안이거나 좌표가 없으면 이름만으로.
ARCHIVE_SKIP = {"신영극장 → 아트레온": "아트레온", "서울극장": "서울아트시네마"}  # 같은 자리 다른 영화관에는 붙이지 않음
ARCHIVE_NO = {"메가박스 동대문", "서울아트시네마"}  # 브랜드가 다른 이웃 영화관에 붙거나(동대문), 2022년 지금 자리로 옮겨 온 곳(서울아트시네마)


def founded_years(e):
    a = json.loads((ROOT / "data" / "raw" / "reference" / "ref_homepage_archive.json").read_text(encoding="utf-8"))
    core = lambda x: re.sub(r"\(.*?\)|[\s·\-]|→.*|극장|시네마|영화관|아트홀|아트시네마|CGV|아산M", "", str(x))
    out = {}
    for x in a:
        if not isinstance(x.get("o"), int) or x["n"] in ARCHIVE_NO:
            continue
        nm = core(x["n"])
        for r in e.itertuples():
            name = core(r.standardized_name)
            if not nm or not name or not (nm in name or name in nm) or ARCHIVE_SKIP.get(x["n"]) == r.standardized_name:
                continue
            if r.lon != "" and math.hypot((float(r.lon) - x["lon"]) * 88000, (float(r.lat) - x["lat"]) * 111000) > 200:
                continue
            ld = int(str(r.open_date)[:4]) if str(r.open_date)[:4].isdigit() else 9999
            if x["o"] < ld:
                out[r.operation_episode_id] = (x["o"], x["n"])
    return out


def main():
    e = pd.read_csv(CLEAN / "venues_episodes.csv").fillna("")
    det = pd.read_csv(CLEAN / "_screen_detail.csv")
    links = pd.read_csv(CLEAN / "kofic_episode_links.csv")
    # 2025년 특별관 스크린 수(KOFIC 스크린별 상세) → 운영구간
    sp = det[(det.year == 2025) & (det.is_special.astype(str).str.upper() == "Y")].groupby("key").size()
    l25 = links[links.year == 2025].dropna()
    sp_ep = l25.assign(n=l25.kofic_key.map(sp).fillna(0)).groupby("operation_episode_id").n.sum()
    t25 = pd.read_csv(CLEAN / "seoul_theater_year.csv").query("year == 2025").set_index("key")
    art_ep = l25.assign(n=l25.kofic_key.map(pd.to_numeric(t25.art_screens, errors="coerce")).fillna(0)).groupby("operation_episode_id").n.sum()
    op_ep = l25.assign(o=l25.kofic_key.map(t25.operator.astype(str).str.strip())).groupby("operation_episode_id").o.first()
    founded = founded_years(e)
    print("실제 개관 연도 보정", len(founded), "곳:", ", ".join(f"{v[1]} {v[0]}" for v in founded.values()))
    feats = []
    for _, r in e.iterrows():
        num = lambda v: None if v == "" else int(float(v))
        feats.append({"type": "Feature",
                      "geometry": {"type": "Point", "coordinates": [float(r.lon), float(r.lat)]} if r.lon != "" else None,
                      "properties": {
                          "id": r.operation_episode_id, "venue": r.venue_id, "name": r.standardized_name,
                          "ld_names": r.source_name_localdata, "kofic_names": r.source_name_kofic,
                          "type": r.analysis_type, "type_basis": r.type_basis, "type_note": r.type_note, "subtype": r.facility_subtype,
                          "status": r.operation_status, "open": r.open_date, "close": r.close_date,
                          "bulk_open": "일괄 등록일" in r.source_conflict,
                          "gu": r.gu, "dong": r.dong, "address": r.address_road or r.address_jibun,
                          "screens": num(r.screens_kofic_latest), "seats": num(r.seats_kofic_latest),
                          "screens25": num(r.screens_kofic_2025), "seats25": num(r.seats_kofic_2025),
                          "special25": int(sp_ep.get(r.operation_episode_id, 0)) if r.screens_kofic_2025 != "" else None,
                          "art25": int(art_ep.get(r.operation_episode_id, 0)) if r.screens_kofic_2025 != "" else None,
                          "operator25": op_ep.get(r.operation_episode_id, ""),
                          "kofic_years": r.kofic_years, "licenses": int(r.license_count), "licenses_active": int(r.license_active),
                          "occupancy": r.building_occupancy_type, "occ_building": r.building_name, "occ_conf": r.occupancy_confidence, "floor": cinema_floor(r.address_road, r.address_jibun), "founded": founded.get(r.operation_episode_id, (None,))[0],
                          "conflict": r.source_conflict, "source": r.data_source_status,
                      }})
    (OUT / "venues.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    y = pd.read_csv(CLEAN / "yearly_series.csv")
    y = y.astype(object).where(y.notna(), None)
    (OUT / "yearly.json").write_text(json.dumps(y.to_dict("records"), ensure_ascii=False), encoding="utf-8")
    print(len(feats), "운영구간,", sum(f["geometry"] is not None for f in feats), "좌표")


if __name__ == "__main__":
    main()
