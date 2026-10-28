"""서울시 5개 생활권(권역) 경계: 자치구 경계(seoul_gu.geojson)를 생활권별로 합친다.
권역 구분은 서울도시기본계획의 5개 생활권(도심·동북·서북·서남·동남).
출력: story/public/data/seoul_regions.geojson  (name, label=[lon, lat])
"""
import json
from pathlib import Path

import shapely
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union

OUT = Path(__file__).resolve().parent.parent / "story" / "public" / "data"
REGION = {"도심권": "종로구 중구 용산구", "동북권": "성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구", "서북권": "은평구 서대문구 마포구",
          "서남권": "양천구 강서구 구로구 금천구 영등포구 동작구 관악구", "동남권": "서초구 강남구 송파구 강동구"}
gu = {f["properties"]["name"]: shape(f["geometry"]) for f in json.loads((OUT / "seoul_gu.geojson").read_text(encoding="utf-8"))["features"]}
# 이름표 위치: 중심지 이름과 겹치지 않는 곳(폴리곤 안이 아니면 대표점)
LABEL = {"도심권": (127.004, 37.552), "동북권": (127.082, 37.582), "서북권": (126.927, 37.598), "서남권": (126.862, 37.508), "동남권": (127.078, 37.488)}
# 서울 경계 밖 태그 위치(지시선으로 권역 안 위치와 잇는다)
TAG = {"도심권": (126.93, 37.705), "동북권": (127.155, 37.665), "서북권": (126.80, 37.655), "서남권": (126.785, 37.445), "동남권": (127.165, 37.445)}
seoul = unary_union(list(gu.values()))
feats = []
for name, gus in REGION.items():
    g = unary_union([gu[x].buffer(0.00005) for x in gus.split()]).buffer(-0.00005).simplify(0.0003)
    p = Point(LABEL[name]) if g.contains(Point(LABEL[name])) else g.representative_point()
    print(name, "지정 위치" if g.contains(Point(LABEL[name])) else "대표점")
    out = not seoul.contains(Point(TAG[name]))
    print(name, "태그 서울 밖" if out else "태그가 서울 안 — 위치 조정 필요")
    feats.append({"type": "Feature", "geometry": mapping(shapely.set_precision(g, 1e-5)),
                  "properties": {"name": name, "anchor": [round(p.x, 5), round(p.y, 5)], "label": list(TAG[name])}})
(OUT / "seoul_regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
print("생활권", len(feats), sum(len(v.split()) for v in REGION.values()), "개 구")
