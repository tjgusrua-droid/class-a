"""웹(story/public/data/)용 파일: venues.geojson(LOCALDATA 운영구간), yearly.json(2000~ 시계열).

먼저 build_venues.py, audit_venues.py 를 실행한다.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
OUT = ROOT / "story" / "public" / "data"


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
                          "occupancy": r.building_occupancy_type, "occ_building": r.building_name, "occ_conf": r.occupancy_confidence,
                          "conflict": r.source_conflict, "source": r.data_source_status,
                      }})
    (OUT / "venues.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    y = pd.read_csv(CLEAN / "yearly_series.csv")
    y = y.astype(object).where(y.notna(), None)
    (OUT / "yearly.json").write_text(json.dumps(y.to_dict("records"), ensure_ascii=False), encoding="utf-8")
    print(len(feats), "운영구간,", sum(f["geometry"] is not None for f in feats), "좌표")


if __name__ == "__main__":
    main()
