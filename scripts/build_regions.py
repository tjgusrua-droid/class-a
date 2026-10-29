"""서울시 5개 생활권(권역) 경계: 자치구 경계(seoul_gu.geojson)를 생활권별로 합친다.
권역 구분은 서울도시기본계획의 5개 생활권(도심·동북·서북·서남·동남).
출력: story/public/data/seoul_regions.geojson  (name, anchor=외곽선 위 지시선 시작점, label=태그 위치, tagAnchor)
"""
import json
from pathlib import Path

import shapely
from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import unary_union

OUT = Path(__file__).resolve().parent.parent / "story" / "public" / "data"
REGION = {"도심권": "종로구 중구 용산구", "동북권": "성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구", "서북권": "은평구 서대문구 마포구",
          "서남권": "양천구 강서구 구로구 금천구 영등포구 동작구 관악구", "동남권": "서초구 강남구 송파구 강동구"}
gu = {f["properties"]["name"]: shape(f["geometry"]) for f in json.loads((OUT / "seoul_gu.geojson").read_text(encoding="utf-8"))["features"]}
# 태그: 권역이 서울 외곽선과 맞닿은 지점에서 같은 길이의 수평 지시선(도심권은 북쪽으로 수직)을 내고, 그 끝에 이름 태그
# (방향, 지시선을 낼 위도 또는 경도). 지시선 끝이 지도 범위 안에 들도록 서울 외곽에서 약 2km만 뺀다
LEADER = {"서북권": ("west", 37.615), "서남권": ("west", 37.485), "동북권": ("east", 37.655), "동남권": ("east", 37.470), "도심권": ("north", 126.975)}
STEP = 0.024  # 지시선 길이(도) ≈ 경도 2.1km / 위도 2.7km
seoul = unary_union(list(gu.values()))
x0, y0, x1, y1 = seoul.bounds


def edge(g, side, v):
    """권역 g를 지나는 수평(또는 수직)선이 권역 바깥쪽 끝에서 만나는 점 = 서울 외곽선 위의 점."""
    ray = LineString([(x0 - 1, v), (x1 + 1, v)]) if side in ("west", "east") else LineString([(v, y0 - 1), (v, y1 + 1)])
    pts = [c for part in getattr(g.boundary.intersection(ray), "geoms", [g.boundary.intersection(ray)]) for c in part.coords]
    return (min if side == "west" else max)(pts, key=lambda c: c[0] if side in ("west", "east") else c[1])


feats = []
for name, gus in REGION.items():
    g = unary_union([gu[x].buffer(0.00005) for x in gus.split()]).buffer(-0.00005).simplify(0.0003)
    side, v = LEADER[name]
    ax, ay = edge(g, side, v)
    tag = (ax - STEP, ay) if side == "west" else (ax + STEP, ay) if side == "east" else (ax, ay + STEP * 0.8)
    on_edge = seoul.boundary.distance(Point(ax, ay)) < 0.002
    print(name, side, "외곽선 위" if on_edge else "외곽선 아님 — 확인", "태그 범위 안" if x0 - 0.01 <= tag[0] <= x1 + 0.01 and tag[1] <= y1 + 0.03 else "범위 밖")
    feats.append({"type": "Feature", "geometry": mapping(shapely.set_precision(g, 1e-5)),
                  "properties": {"name": name, "anchor": [round(ax, 5), round(ay, 5)], "label": [round(tag[0], 5), round(tag[1], 5)],
                                 "tagAnchor": {"west": "right", "east": "left", "north": "bottom"}[side]}})
(OUT / "seoul_regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
print("생활권", len(feats), sum(len(v.split()) for v in REGION.values()), "개 구")
