"""웹용 서울 배경지도(공유 페이지에 함께 올리는 파일): fetch_basemap.py 가 받은 Overture 원자료를 줄인다.
출력(story/public/data/basemap_*.geojson, EPSG:4326, 좌표 소수 5자리):
  basemap_green.geojson   공원·묘지·운동장·숲·풀밭(합쳐서 단순화)
  basemap_water.geojson   강·호수 면(kind=area)과 하천 선(kind=line)
  basemap_roads.geojson   도로 선(rank 1 큰길 = 고속·간선, 2 = 보조간선·집산, 3 = 동네길). 인도·계단·자전거길 제외
  basemap_dong.geojson    행정동 이름 위치(확대 시 표시)
서울 경계 + 1.5km 안으로 자른다. 출처: Overture Maps Foundation 2026-10-21.0(OpenStreetMap contributors 등)
"""
import json
import warnings
from pathlib import Path

import pyarrow.parquet as pq
import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "basemap"
OUT = ROOT / "story" / "public" / "data"
to_m = Transformer.from_crs(4326, 5186, always_xy=True).transform
to_deg = Transformer.from_crs(5186, 4326, always_xy=True).transform
seoul = unary_union([shape(f["geometry"]) for f in json.loads((OUT / "seoul_boundary.geojson").read_text())["features"]])
area = transform(to_deg, transform(to_m, seoul).buffer(1500))
ROAD_RANK = {"motorway": 1, "trunk": 1, "primary": 1, "secondary": 2, "tertiary": 2, "residential": 3, "unclassified": 3, "living_street": 3}
GREEN_USE = {"park", "cemetery", "golf_course", "garden", "grass", "meadow", "recreation_ground", "village_green", "nature_reserve", "forest", "fairway", "pitch", "playground"}
GREEN_LAND = {"wood", "forest", "grassland", "scrub", "heath", "grass", "wetland"}
WATER_AREA = {"water", "river", "lake", "reservoir", "pond", "basin", "canal", "bay"}
WATER_LINE = {"stream", "river", "canal", "drain", "ditch"}


def read(name):
    t = pq.read_table(RAW / f"{name}.parquet", columns=["geometry", "class"]).to_pandas()
    t["geom"] = shapely.from_wkb(t.geometry.values)
    return t


def simplify(g, tol_m):
    return transform(to_deg, transform(to_m, g).simplify(tol_m))


def write(name, feats):
    fc = {"type": "FeatureCollection", "features": feats}
    p = OUT / f"basemap_{name}.geojson"
    p.write_text(json.dumps(fc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{p.name}: {len(feats)} 개체, {p.stat().st_size / 1e6:.1f} MB")


def polys(gs, tol):
    u = simplify(unary_union([g for g in gs if g.geom_type in ("Polygon", "MultiPolygon")]).intersection(area), tol)
    parts = getattr(u, "geoms", [u])
    return [{"type": "Feature", "properties": {}, "geometry": mapping(shapely.set_precision(p, 1e-5))} for p in parts if not p.is_empty and p.area > 1e-8]


def main():
    lu, ld = read("green"), read("land")
    write("green", polys(list(lu[lu["class"].isin(GREEN_USE)].geom) + list(ld[ld["class"].isin(GREEN_LAND)].geom), 6))
    w = read("water")
    lines = unary_union([g for g, c in zip(w.geom, w["class"]) if c in WATER_LINE and "Line" in g.geom_type]).intersection(area)
    write("water", [dict(f, properties={"kind": "area"}) for f in polys([g for g, c in zip(w.geom, w["class"]) if c in WATER_AREA], 5)]
          + [{"type": "Feature", "properties": {"kind": "line"}, "geometry": mapping(shapely.set_precision(simplify(shapely.line_merge(lines), 5), 1e-5))}])
    r = read("roads")
    feats = []
    for rank in (1, 2, 3):
        gs = [g for g, c in zip(r.geom, r["class"]) if ROAD_RANK.get(c) == rank]
        merged = shapely.line_merge(unary_union(gs).intersection(area))
        feats.append({"type": "Feature", "properties": {"rank": rank}, "geometry": mapping(shapely.set_precision(simplify(merged, 3 if rank < 3 else 4), 1e-5))})
    write("roads", feats)
    dong = json.loads((ROOT / "data" / "raw" / "boundaries" / "seoul_admdong_2023.geojson").read_text(encoding="utf-8"))["features"]
    write("dong", [{"type": "Feature", "properties": {"name": f["properties"]["adm_nm"].split()[-1]},
                    "geometry": mapping(shapely.set_precision(shape(f["geometry"]).representative_point(), 1e-5))} for f in dong])


if __name__ == "__main__":
    main()
