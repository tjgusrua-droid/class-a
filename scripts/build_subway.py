"""지하철역·역세권 버퍼·2040 중심지(개략 영역)를 만든다.

입력: data/raw/subway/seoul_subway_stations_src.csv
        서울열린데이터광장 역 정보(공공누리 제1유형)를 kyckang/SeoulTransitMap_data 가 매일 재배포한 파일(v1, 2026-10-28 생성).
        열: line, name_ko, lat, lng (EPSG:4326)  ※ 행 = 역×노선
      data/manual/seoul_2040_centers.csv  — 중심지 명칭·위계·대표 역(anchor_stations, ';' 구분)
출력: story/public/data/subway_stations.geojson  역 1곳 = 1점, lines(노선 목록), n_lines, transfer(2개 노선 이상)
      story/public/data/subway_buffers.geojson   반경 300/500/800/1000m × 일반역/환승역, 같은 조건 원은 합집합
      story/public/data/seoul_centers.geojson    중심지 개략 영역 = 대표 역 중심 원의 합집합(반경은 위계별 표현값, 공식 범위 아님)
      data/raw/subway/osm_lines_network.json — 노선 선형(OpenStreetMap 선로 way 기반, © OpenStreetMap contributors, ODbL).
        kimmdr2/metroscope(MIT)가 Overpass API로 뽑아 단순화한 data/network.json(2026-10-12 생성)을 그대로 보관.
      → story/public/data/subway_lines.geojson  노선별 선형(name, color), 서울 경계 + 2km 안으로 자름
거리·버퍼는 EPSG:5186(중부원점, m)에서 계산한 뒤 EPSG:4326 으로 되돌린다.
같은 역명은 300m 안, 다른 역명은 150m 안(총신대입구·이수)이면 한 역으로 합친다.
"""
import json
import warnings
from pathlib import Path

import pandas as pd
from pyproj import Transformer
import shapely
from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "subway" / "seoul_subway_stations_src.csv"
OUT = ROOT / "story" / "public" / "data"
RADII = [300, 500, 800, 1000]
CENTER_R = {"3도심": 1200, "7광역중심": 900, "12지역중심": 600}  # 개략 영역 표현 반경(m)
LINE_KO = {f"L{i}": f"{i}호선" for i in range(1, 10)} | {
    "AREX": "공항철도", "GYEONGUI": "경의중앙선", "SUINBUNDANG": "수인분당선", "SINBUNDANG": "신분당선", "GYEONGCHUN": "경춘선",
    "UISINSEOL": "우이신설선", "SILLIM": "신림선", "SEOHAE": "서해선", "GTXA": "GTX-A", "GIMPO": "김포골드라인", "EVERLINE": "에버라인",
    "UIJEONGBU": "의정부경전철", "GYEONGGANG": "경강선", "INCHEON1": "인천1호선", "INCHEON2": "인천2호선"}
warnings.filterwarnings("ignore", category=DeprecationWarning)
to_m = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True).transform
to_deg = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True).transform


def stations():
    s = pd.read_csv(SRC)
    s["name"] = s.name_ko.str.replace(r"역$", "", regex=True).str.strip()
    s["pt"] = [transform(to_m, Point(x, y)) for x, y in zip(s.lng, s.lat)]
    seoul = transform(to_m, unary_union([shape(f["geometry"]) for f in json.loads((OUT / "seoul_boundary.geojson").read_text())["features"]]))
    s = s[[seoul.distance(p) <= 1000 for p in s.pt]].reset_index(drop=True)  # 서울 + 경계 밖 1km(버퍼가 경계를 넘는 역)
    parent = list(range(len(s)))
    find = lambda i: i if parent[i] == i else find(parent[i])
    for i in range(len(s)):
        for j in range(i + 1, len(s)):
            d = s.pt[i].distance(s.pt[j])
            if (s.name[i] == s.name[j] and d <= 300) or d <= 150:
                parent[find(i)] = find(j)
    out = []
    for _, g in s.groupby([find(i) for i in range(len(s))]):
        lines = sorted({LINE_KO.get(x, x) for x in g.line})
        out.append(dict(name="·".join(dict.fromkeys(g.name)), lines=lines, n_lines=len(lines), transfer=len(lines) >= 2,
                        inside=seoul.contains(g.pt.iloc[0]), pt=unary_union(list(g.pt)).centroid))
    return out, seoul


def lines(seoul):
    net = json.loads((ROOT / "data" / "raw" / "subway" / "osm_lines_network.json").read_text(encoding="utf-8"))
    area = seoul.buffer(2000)
    feats = []
    for ln in net["lines"]:
        for ch in ln["chains"]:
            g = transform(to_m, LineString(ch["path"])).intersection(area)
            if not g.is_empty:
                feats.append({"type": "Feature", "geometry": mapping(shapely.set_precision(transform(to_deg, g.simplify(8)), 1e-5)),
                              "properties": {"name": ln["name"], "color": ln["color"]}})
    return feats


def fc(feats):
    return json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False)


def main():
    st, seoul = stations()
    (OUT / "subway_lines.geojson").write_text(fc(lines(seoul)), encoding="utf-8")
    (OUT / "subway_stations.geojson").write_text(fc([{"type": "Feature", "geometry": mapping(transform(to_deg, x["pt"])),
        "properties": {k: x[k] for k in ("name", "lines", "n_lines", "transfer", "inside")}} for x in st]), encoding="utf-8")
    buf = []
    for r in RADII:
        for kind, flag in (("환승역", True), ("일반역", False)):
            u = unary_union([x["pt"].buffer(r, 32) for x in st if x["transfer"] == flag])
            buf.append({"type": "Feature", "geometry": mapping(shapely.set_precision(transform(to_deg, u.simplify(5)), 1e-5)), "properties": {"radius": r, "kind": kind}})
    (OUT / "subway_buffers.geojson").write_text(fc(buf), encoding="utf-8")

    by_name = {}
    for x in st:
        for n in x["name"].split("·") + [x["name"]]:
            by_name.setdefault(n, x)
    cs = pd.read_csv(ROOT / "data" / "manual" / "seoul_2040_centers.csv")
    feats = []
    for _, c in cs.iterrows():
        anchors = [by_name[a] for a in c.anchor_stations.split(";")]
        r = CENTER_R[c.level]
        u = unary_union([a["pt"].buffer(r, 48) for a in anchors]).simplify(10)
        feats.append({"type": "Feature", "geometry": mapping(shapely.set_precision(transform(to_deg, u), 1e-5)), "properties": {
            "name": c["name"], "level": c.level, "radius": r, "anchors": [list(transform(to_deg, a["pt"]).coords[0]) for a in anchors],
            "anchor_names": [a["name"] for a in anchors], "label": list(transform(to_deg, u.centroid).coords[0])}})
    (OUT / "seoul_centers.geojson").write_text(fc(feats), encoding="utf-8")
    print(f"역 {len(st)}곳(서울 안 {sum(x['inside'] for x in st)}, 환승 {sum(x['transfer'] for x in st)}), 버퍼 {len(buf)}개, 중심지 {len(feats)}곳")


if __name__ == "__main__":
    main()
