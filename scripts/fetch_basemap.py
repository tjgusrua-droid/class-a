"""서울 배경지도 원자료: Overture Maps(OpenStreetMap 등 기반, ODbL/CDLA) 2026-10-21.0 배포판에서 서울 범위만 읽는다.
공유 페이지는 바깥 지도 서버를 부를 수 없어서, 배경지도를 페이지 파일로 함께 올리기 위해 쓴다.
출력: data/raw/basemap/{roads,water,green}.parquet → build_basemap.py 가 웹용 GeoJSON으로 줄인다.
"""
import sys
from pathlib import Path

import pyarrow.dataset as ds
import pyarrow.fs as pfs
import pyarrow.parquet as pq

REL = "overturemaps-us-west-2/release/2026-10-21.0"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "basemap"
X0, Y0, X1, Y1 = 126.75, 37.40, 127.20, 37.72  # 서울 + 여유
fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
JOBS = {
    "roads": ("theme=transportation/type=segment", ["id", "geometry", "class", "subtype"], ds.field("subtype") == "road"),
    "water": ("theme=base/type=water", ["id", "geometry", "class", "subtype"], None),
    "green": ("theme=base/type=land_use", ["id", "geometry", "class", "subtype"], None),
    "land": ("theme=base/type=land", ["id", "geometry", "class", "subtype"], None),
}


def run(name):
    path, cols, extra = JOBS[name]
    d = ds.dataset(f"{REL}/{path}", filesystem=fs, format="parquet")
    f = (ds.field("bbox", "xmin") < X1) & (ds.field("bbox", "xmax") > X0) & (ds.field("bbox", "ymin") < Y1) & (ds.field("bbox", "ymax") > Y0)
    if extra is not None:
        f = f & extra
    t = d.to_table(columns=cols, filter=f)
    pq.write_table(t, OUT / f"{name}.parquet")
    print(name, t.num_rows)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for n in sys.argv[1:] or JOBS:
        run(n)
