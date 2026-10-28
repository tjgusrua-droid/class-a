"""3-6 밀도 지도용 격자: 서울 경계 안 250m×250m 격자의 중심점(EPSG:5186에서 만든 뒤 EPSG:4326으로).
출력: story/public/data/seoul_grid_250.json  {"size": 250, "centers": [[lon, lat], ...]}
값(반경 1km 안 영화관 수)은 화면에서 유형별로 계산한다.
"""
import json
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import contains_xy
from shapely.geometry import shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "story" / "public" / "data"
SIZE = 250
to_m = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)
to_deg = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)

seoul = transform(to_m.transform, unary_union([shape(f["geometry"]) for f in json.loads((OUT / "seoul_boundary.geojson").read_text())["features"]]))
x0, y0, x1, y1 = seoul.bounds
xs, ys = np.meshgrid(np.arange(x0 + SIZE / 2, x1, SIZE), np.arange(y0 + SIZE / 2, y1, SIZE))
xs, ys = xs.ravel(), ys.ravel()
keep = contains_xy(seoul, xs, ys)
lon, lat = to_deg.transform(xs[keep], ys[keep])
(OUT / "seoul_grid_250.json").write_text(json.dumps({"size": SIZE, "centers": [[round(a, 5), round(b, 5)] for a, b in zip(lon, lat)]}), encoding="utf-8")
print(f"격자 {keep.sum()}칸")
