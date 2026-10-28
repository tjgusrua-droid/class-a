"""데이터 스토리텔링 사이트(story/)용 공간자료를 만든다. 결과: story/public/data/

입력
  data/clean/seoul_theater_year.csv, seoul_events.csv   영진위 정리본(build_seoul_theaters.py)
  data/raw/seoul_cinema_licenses.csv                    행안부 인허가(좌표 EPSG:5174)
  경계자료 디렉터리(인자)                                 아래 공개 GeoJSON을 내려받아 둔 곳
    HangJeongDong_ver20230701.geojson  vuski/admdongkor (통계청 행정동 2023.7)
    ne_10m_rivers_lake_centerlines.geojson, ne_10m_roads.geojson  Natural Earth 1:10m

사용: python3 scripts/build_story_data.py <경계자료 디렉터리>
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

from build_seoul_theaters import key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "story" / "public" / "data"
TO_WGS84 = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)


def write(name, features):
    (OUT / name).write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                       ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def rounded(geom, nd=5):
    g = mapping(geom)
    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], float) else [r(x) for x in c]
    g["coordinates"] = r(g["coordinates"])
    return g


def boundaries(src):
    dongs = json.load(open(src / "HangJeongDong_ver20230701.geojson", encoding="utf-8"))["features"]
    dongs = [f for f in dongs if f["properties"]["sidonm"] == "서울특별시"]
    gus = {}
    for f in dongs:
        gus.setdefault(f["properties"]["sggnm"], []).append(shape(f["geometry"]).buffer(0))
    gu_feats, gu_shapes = [], []
    for name, parts in sorted(gus.items()):
        g = unary_union(parts).simplify(0.0002)
        gu_shapes.append(g)
        c = g.representative_point()
        gu_feats.append({"type": "Feature", "properties": {"name": name, "label_lon": round(c.x, 5), "label_lat": round(c.y, 5)},
                         "geometry": rounded(g)})
    seoul = unary_union(gu_shapes).buffer(0.0003).buffer(-0.0003)
    write("seoul_gu.geojson", gu_feats)
    write("seoul_boundary.geojson", [{"type": "Feature", "properties": {"name": "서울특별시"}, "geometry": rounded(seoul)}])

    clip = box(*seoul.buffer(0.05).bounds)
    def clipped(fname, keep):
        out = []
        for f in json.load(open(src / fname, encoding="utf-8"))["features"]:
            if not f["geometry"] or not keep(f["properties"]):
                continue
            g = shape(f["geometry"]).intersection(clip)
            if not g.is_empty:
                out.append({"type": "Feature", "properties": {k: f["properties"].get(k) for k in ("name", "type", "scalerank")},
                            "geometry": rounded(g)})
        return out
    write("han_river.geojson", clipped("ne_10m_rivers_lake_centerlines.geojson", lambda p: p.get("name") == "Han"))
    write("roads.geojson", clipped("ne_10m_roads.geojson", lambda p: p.get("type") in ("Major Highway", "Road")))
    return len(gu_feats)


def addr_keys(s):
    """도로명(○○로/길 N)·지번(○○동/가 N-M) 비교 키."""
    s = re.sub(r"(로|동)\s+(\d+가)", r"\1\2", str(s))
    road = re.finditer(r"(?:^|[\s(,])([가-힣0-9]+(?:로|길)(?:\s*\d+[가-힣]?길)?)\s*(\d+(?:-\d+)?)(?![\d가-힣])", s)
    jibun = re.finditer(r"(?:^|[\s(,])([가-힣]+\d*(?:동|가)|[가-힣]+\d+가)\s*(\d+(?:-\d+)?)(?![\d])", s)
    keys = {re.sub(r"\s", "", m.group(1)) + m.group(2) for m in road}
    keys |= {re.sub(r"\d+동$", "동", m.group(1)) + m.group(2) for m in jibun}
    return keys


def norm_biz(s):
    """상호 비교용: 공백·(주)·법인명·관 번호 제거."""
    s = re.sub(r"\(.*?\)|\s|주식회사|메가박스중앙|지점", "", str(s))
    return re.sub(r"제?\d+관.*$|[A-Z ]*관$", "", s.upper())


def classify(rows):
    """연구 정의가 들어오기 전의 임시 유형 분류(영진위 필드 기준). 근거도 함께 돌려준다."""
    ops = set(rows.operator.astype(str).str.strip())
    if ops & {"직영", "위탁"}:
        return "멀티플렉스", "영진위 '대기업 운영 여부' 직영·위탁"
    art = pd.to_numeric(rows.art_screens, errors="coerce").fillna(0)
    if (art > 0).any():
        return "독립극장", "영진위 독립예술영화 전용관 수 > 0 (2019년~ 필드)"
    if rows.year.max() < 2019:
        return "기타", "2019년 이전 목록만 있어 독립예술 전용관 여부 필드 없음 — 검토 필요"
    return "기타", "대기업 운영 아님 · 독립예술 전용관 아님"


def theaters():
    t = pd.read_csv(ROOT / "data" / "clean" / "seoul_theater_year.csv")
    ev = pd.read_csv(ROOT / "data" / "clean" / "seoul_events.csv")
    lic = pd.read_csv(ROOT / "data" / "raw" / "seoul_cinema_licenses.csv", dtype=str)
    lic = lic[(lic["지번주소"].fillna("") + lic["도로명주소"].fillna("")).str.contains("서울특별시")]
    lic = lic.dropna(subset=["좌표정보(X)"])
    lic["keys"] = (lic["지번주소"].fillna("") + " " + lic["도로명주소"].fillna("")).map(addr_keys)
    lic["gu"] = lic["지번주소"].fillna(lic["도로명주소"]).str.extract(r"서울특별시\s+(\S+구)")[0]
    override = pd.read_csv(ROOT / "data" / "manual" / "theater_type.csv", dtype=str).fillna("") \
        if (ROOT / "data" / "manual" / "theater_type.csv").exists() else pd.DataFrame(columns=["name", "type", "basis"])
    override = {key(r["name"]): r for _, r in override.iterrows()}

    incoming = ev.event.str.startswith("전환") & ev.note.astype(str).str.startswith("(구)")
    out_ev = ev[(ev.event.str.startswith("폐관") | ev.event.str.startswith("전환")) & ~incoming]

    feats, unmatched = [], []
    for k, rows in t.groupby("key"):
        rows = rows.sort_values("year")
        last = rows.iloc[-1]
        keys = set().union(*rows.address.map(addr_keys))
        cand = lic[(lic.gu == last.gu) & lic["keys"].map(lambda s: bool(s & keys))]
        geom, note, note_prefix = None, "", "주소 일치"
        if not len(cand):  # 주소가 안 맞으면 같은 구에서 상호로 찾는다
            nk = norm_biz(last["name"])
            cand = lic[(lic.gu == last.gu) & lic["사업장명"].map(lambda b: len(nk) >= 4 and nk in norm_biz(b))]
            if len(cand):
                note_prefix = "상호 일치"
        if len(cand):
            x = pd.to_numeric(cand["좌표정보(X)"]).median()
            y = pd.to_numeric(cand["좌표정보(Y)"]).median()
            lon, lat = TO_WGS84.transform(x, y)
            geom = {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}
            note = f"행안부 인허가 {len(cand)}건과 {note_prefix}"
        typ, basis = classify(rows)
        if k in override and override[k]["type"]:
            typ, basis = override[k]["type"], override[k]["basis"] or "data/manual/theater_type.csv"
        o = out_ev[out_ev.key == k].sort_values("year").tail(1)
        end_kind = o.event.iloc[0].split("(")[0] if len(o) else ""
        end_date = str(o.date.iloc[0]) if len(o) and pd.notna(o.date.iloc[0]) else ""
        status = last.status if last.year == 2025 else ("전환" if end_kind == "전환" else "폐관")
        opened = rows.opened.dropna().astype(str)
        opened = opened[opened.str.match(r"^\d{4}")]
        came_by_rename = bool(((ev.key == k) & incoming).any())
        feats.append({"type": "Feature", "geometry": geom, "properties": {
            "id": k, "name": last["name"], "gu": last.gu, "address": last.address, "type": typ, "type_basis": basis,
            "operator": str(last.operator), "status": status,
            "open_date": opened.iloc[0][:10] if len(opened) else "",
            "renamed_from": came_by_rename,
            "close_kind": end_kind if status in ("폐관", "전환") else "", "close_date": end_date if status in ("폐관", "전환") else "",
            "close_year": int(o.year.iloc[0]) if len(o) and status in ("폐관", "전환") else None,
            "first_year": int(rows.year.min()), "last_year": int(last.year),
            "years": [int(y) for y in rows.year], "hyu_years": [int(y) for y in rows[rows.status == "휴관"].year],
            "screens": None if pd.isna(last.screens) else int(last.screens),
            "seats": None if pd.isna(last.seats) else int(last.seats),
            "coord_note": note, "license_name": cand["사업장명"].iloc[0].strip() if len(cand) else "", "_keys": keys,
        }})
    for f in feats:  # 같은 주소의 다른 운영 이력(이름 변경 전후)이 있으면 그 좌표를 쓴다
        p = f["properties"]
        if not f["geometry"]:
            same = [g for g in feats if g["geometry"] and g["properties"]["gu"] == p["gu"] and p["_keys"] & g["properties"]["_keys"]]
            if same:
                f["geometry"], p["coord_note"] = same[0]["geometry"], f"같은 주소의 '{same[0]['properties']['name']}' 좌표 사용"
            else:
                unmatched.append((p["name"], p["gu"], p["address"]))
    for f in feats:
        f["properties"].pop("_keys")
    write("theaters.geojson", feats)
    return feats, unmatched


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    n_gu = boundaries(Path(sys.argv[1]))
    feats, unmatched = theaters()
    located = sum(f["geometry"] is not None for f in feats)
    print(f"자치구 {n_gu}개, 영화관 {len(feats)}곳 중 좌표 {located}곳")
    for u in unmatched:
        print("  좌표 없음:", *u)


if __name__ == "__main__":
    main()
