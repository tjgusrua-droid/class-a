"""공식 지하철역 좌표가 들어오면 역·역세권 버퍼를 만든다. (현재 저장소에는 역 자료가 없다)

입력: data/raw/subway/stations.csv  — 열: name(역명), line(노선명), lon, lat (EPSG:4326)  ※ 행 = 역×노선
      data/raw/subway/lines.geojson  — (선택) 공식 노선 형상. 없으면 노선은 표시하지 않는다(역 순서 직선 연결 금지).
출력: story/public/data/subway_stations.geojson  역 1곳 = 1점, lines(노선 목록), n_lines, transfer(2개 노선 이상)
      story/public/data/subway_buffers.geojson   반경 300/500/800/1000m × 일반역/환승역, 같은 조건 원은 합집합
      story/public/data/subway_lines.geojson      (lines.geojson 이 있을 때만 복사)
거리·버퍼는 EPSG:5186(중부원점, m)에서 계산한 뒤 EPSG:4326 으로 되돌린다.
같은 역명이 300m 안에 여러 노선으로 있으면 한 역으로 합친다.
"""
import json
import shutil
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely.geometry import Point, mapping
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "subway"
OUT = ROOT / "story" / "public" / "data"
RADII = [300, 500, 800, 1000]
to_m = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True).transform
to_deg = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True).transform


def main():
    s = pd.read_csv(SRC / "stations.csv")
    s["name"] = s["name"].str.replace(r"역$", "", regex=True).str.strip()
    s["pt"] = [transform(to_m, Point(x, y)) for x, y in zip(s.lon, s.lat)]
    stations = []
    for name, g in s.groupby("name"):
        used = set()
        for i, r in g.iterrows():
            if i in used:
                continue
            grp = [j for j, q in g.iterrows() if q.pt.distance(r.pt) <= 300]
            used |= set(grp)
            gg = g.loc[grp]
            c = unary_union(list(gg.pt)).centroid
            lines = sorted(set(gg.line))
            stations.append(dict(name=name, lines=lines, n_lines=len(lines), transfer=len(lines) >= 2, pt=c))
    feats = [{"type": "Feature", "geometry": mapping(transform(to_deg, st["pt"])),
              "properties": {k: st[k] for k in ("name", "lines", "n_lines", "transfer")}} for st in stations]
    (OUT / "subway_stations.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    buf = []
    for r in RADII:
        for kind, flag in (("환승역", True), ("일반역", False)):
            u = unary_union([st["pt"].buffer(r, 32) for st in stations if st["transfer"] == flag])
            if not u.is_empty:
                buf.append({"type": "Feature", "geometry": mapping(transform(to_deg, u)), "properties": {"radius": r, "kind": kind}})
    (OUT / "subway_buffers.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": buf}), encoding="utf-8")
    if (SRC / "lines.geojson").exists():
        shutil.copy(SRC / "lines.geojson", OUT / "subway_lines.geojson")
    print(f"역 {len(stations)}곳(환승 {sum(s['transfer'] for s in stations)}), 버퍼 {len(buf)}개")


if __name__ == "__main__":
    main()
