"""Build a compact SVG-ready Korea province map from southkorea/southkorea-maps.

Projects lat/lng with a simple equirectangular projection (scaled by cos(lat0)),
simplifies rings with Douglas-Peucker, drops negligible islands, and writes
data/korea_provinces.json:

    view       - {w, h} SVG viewBox size
    projection - {lat0, lng0, scale, x0, y0} so the page can project store
                 coordinates into the same space
    provinces  - [{name, code, d}] with `d` an SVG path string

Usage:
    git clone --depth 1 --filter=blob:none --sparse \
        https://github.com/southkorea/southkorea-maps /tmp/sk-maps
    git -C /tmp/sk-maps sparse-checkout set kostat/2018/json
    python3 scripts/build_korea_map.py \
        /tmp/sk-maps/kostat/2018/json/skorea-provinces-2018-geo.json \
        data/korea_provinces.json
"""
import json
import math
import sys

VIEW_W = 460.0          # target viewBox width in SVG units
PADDING = 6.0
EPSILON = 0.55          # Douglas-Peucker tolerance, in SVG units
MIN_RING_AREA = 1.2     # drop islands smaller than this, in SVG units^2
LAT0 = 36.5

# 본토 + 제주가 화면을 채우도록 표시 범위를 고정한다. 이 범위 밖의 외딴 섬
# (백령도·울릉도·독도 등)은 지도에서 제외한다 - 1등 배출 판매점도 없다.
BOUNDS = {"lng_min": 125.6, "lng_max": 129.8, "lat_min": 33.0, "lat_max": 38.7}


def project(lng, lat, scale, lng0, lat_max, x0, y0):
    x = (lng - lng0) * math.cos(math.radians(LAT0)) * scale + x0
    y = (lat_max - lat) * scale + y0
    return x, y


def dp_simplify(points, eps):
    """Douglas-Peucker on a list of (x, y)."""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy

    max_dist, idx = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if seg_len2 == 0:
            dist = math.hypot(px - ax, py - ay)
        else:
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
            dist = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if dist > max_dist:
            max_dist, idx = dist, i

    if max_dist <= eps:
        return [points[0], points[-1]]
    left = dp_simplify(points[:idx + 1], eps)
    right = dp_simplify(points[idx:], eps)
    return left[:-1] + right


def ring_area(points):
    area = 0.0
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def rings_of(geometry):
    """Yield the outer ring of every polygon (holes are ignored - none matter here)."""
    if geometry["type"] == "Polygon":
        yield geometry["coordinates"][0]
    else:
        for poly in geometry["coordinates"]:
            yield poly[0]


def main(src_path: str, dst_path: str) -> None:
    with open(src_path, encoding="utf-8") as f:
        geo = json.load(f)

    lng0, lng1 = BOUNDS["lng_min"], BOUNDS["lng_max"]
    lat0, lat1 = BOUNDS["lat_min"], BOUNDS["lat_max"]
    span_x = (lng1 - lng0) * math.cos(math.radians(LAT0))
    scale = (VIEW_W - 2 * PADDING) / span_x
    view_h = (lat1 - lat0) * scale + 2 * PADDING

    provinces = []
    for feat in geo["features"]:
        props = feat["properties"]
        parts = []
        projected_rings = []
        for ring in rings_of(feat["geometry"]):
            inside = any(lng0 <= lng <= lng1 and lat0 <= lat <= lat1 for lng, lat in ring)
            if not inside:
                continue
            pts = [project(lng, lat, scale, lng0, lat1, PADDING, PADDING)
                   for lng, lat in ring]
            projected_rings.append(pts)
        if not projected_rings:
            continue

        biggest = max(ring_area(r) for r in projected_rings)
        for pts in projected_rings:
            area = ring_area(pts)
            if area < MIN_RING_AREA and area < biggest:
                continue
            simple = dp_simplify(pts, EPSILON)
            if len(simple) < 4:
                continue
            coords = " ".join(f"{x:.1f},{y:.1f}" for x, y in simple)
            parts.append("M" + coords.replace(" ", "L", 1).replace(" ", "L") + "Z")

        provinces.append({
            "name": props["name"],
            "code": props["code"],
            "d": "".join(parts),
        })

    out = {
        "view": {"w": round(VIEW_W, 1), "h": round(view_h, 1)},
        "projection": {
            "lat0": LAT0, "lng0": lng0, "latMax": lat1,
            "scale": round(scale, 4), "x0": PADDING, "y0": PADDING,
        },
        "provinces": provinces,
    }
    with open(dst_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size = sum(len(p["d"]) for p in provinces)
    print(f"wrote {len(provinces)} provinces, {size/1024:.1f}KB of path data, "
          f"viewBox {VIEW_W:.0f}x{view_h:.0f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "data/korea_provinces.json")
