"""문화시설 공간자료(story/public/data/cultural_facilities.geojson)를 만든다.

입력
  data/raw/culture/seoul_culture_spaces.csv     서울시 문화공간 정보(주제분류, 위경도)
  data/raw/culture/seoul_performance_halls.csv  행안부 공연장 인허가(EPSG:5174, 영업상태·날짜)

분류: 「문화예술진흥법」 시행령 별표 1 대분류 + 문학관·창작공간. 판단 근거를 basis 필드에 남기고
data/clean/culture_facilities_review.csv 로 검토표를 함께 낸다. 영화관은 제외한다.
"""
import json
import re
from pathlib import Path

import pandas as pd
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "culture"
SNAPSHOT_END = "2025-12-31"  # 사이트 기준 연도(2025년 말)와 맞춘다
CINEMA = re.compile(r"영화관|시네마|CGV|메가박스|롯데시네마|씨네|극장\s*\d+관|아트하우스\s*모모|영화센터")
GU = "종로|중|용산|성동|광진|동대문|중랑|성북|강북|도봉|노원|은평|서대문|마포|양천|강서|구로|금천|영등포|동작|관악|서초|강남|송파|강동"

# 주제분류 → 대분류
THEME = {
    "미술관/갤러리": "전시시설", "박물관/기념관": "전시시설", "도서관": "도서시설",
    "문화예술회관": "종합시설", "문화원": "문화 보급·전수시설",
}
# 이름 키워드 → 대분류 (위에서부터 먼저 맞는 규칙)
KEYWORDS = [
    (r"문학관", "문학관·창작공간"),
    (r"창작|예술공장|레지던시|예술가의\s*집|작업실|창작촌", "문학관·창작공간"),
    (r"전수|국악원|전통문화", "문화 보급·전수시설"),
    (r"문화체육센터|문화체육관|구민회관|문화의\s*집|청소년|복지관|생활문화|문화센터|주민", "지역문화활동시설"),
    (r"전시장|전시관|갤러리|박물관|미술관", "전시시설"),
    (r"책보고|도서관|라이브러리", "도서시설"),
]


def classify(name, theme):
    for pat, cat in KEYWORDS:
        if re.search(pat, name):
            return cat, f"이름 키워드 '{pat}'"
    if theme == "문화원" and not re.match(rf"({GU})(구)?\s*문화원", name):
        return "", "지방문화원이 아닌 문화원(외국 문화원 등) — 분류 검토"
    if theme in THEME:
        return THEME[theme], f"주제분류 '{theme}'"
    return "", f"주제분류 '{theme}' — 분류 검토"


def num(s):
    m = re.match(r"\s*(\d+\.\d+)", s)
    return float(m.group(1)) if m else None


def main():
    rows, bad = [], []
    a = pd.read_csv(RAW / "seoul_culture_spaces.csv", dtype=str).fillna("")
    for _, r in a.iterrows():
        if r["주제분류"] == "공연장" or CINEMA.search(r["문화시설명"]):
            continue  # 공연시설은 인허가 자료로 센다, 영화관은 제외
        lat, lon = num(r["위도"]), num(r["경도"])
        if lat and lon and lat > 100:  # 위경도가 뒤바뀐 행
            lat, lon = lon, lat
        if not (lat and lon and 37.4 < lat < 37.72 and 126.75 < lon < 127.2):
            bad.append(r["문화시설명"])
            continue
        cat, basis = classify(r["문화시설명"], r["주제분류"])
        rows.append(dict(name=r["문화시설명"], category=cat, theme=r["주제분류"], basis=basis, gu=r["자치구"],
                         lon=lon, lat=lat, source="서울시 문화공간 정보"))

    b = pd.read_csv(RAW / "seoul_performance_halls.csv", dtype=str).fillna("")
    b = b.apply(lambda c: c.str.strip())
    end = b[["폐업일자", "인허가취소일자"]].replace("", "9999").min(axis=1)
    alive = b[(b["인허가일자"] <= SNAPSHOT_END) & (end > SNAPSHOT_END) & (b["좌표정보(X)"] != "")]
    alive = alive[~alive["사업장명"].str.contains(CINEMA)]
    tr = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)
    n_hall_records = len(alive)
    # 같은 좌표(같은 건물)의 여러 홀은 시설 하나로
    alive = alive.assign(xy=alive["좌표정보(X)"].astype(float).round(0).astype(str) + "," + alive["좌표정보(Y)"].astype(float).round(0).astype(str))
    for xy, g in alive.groupby("xy"):
        x, y = map(float, xy.split(","))
        lon, lat = tr.transform(x, y)
        gu = re.search(r"서울특별시\s+(\S+구)", g["지번주소"].iloc[0] or g["도로명주소"].iloc[0])
        rows.append(dict(name=" / ".join(sorted(set(g["사업장명"])))[:80], category="공연시설", theme="공연장 인허가",
                         basis=f"공연장 인허가 {len(g)}건(같은 건물 묶음)", gu=gu.group(1) if gu else "",
                         lon=round(lon, 6), lat=round(lat, 6), source="행안부 공연장 인허가"))

    df = pd.DataFrame(rows)
    df.to_csv(ROOT / "data" / "clean" / "culture_facilities_review.csv", index=False, encoding="utf-8-sig")
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [r.lon, r.lat]},
              "properties": {k: r[k] for k in ("name", "category", "theme", "basis", "gu", "source")}}
             for _, r in df[df.category != ""].iterrows()]
    out = ROOT / "story" / "public" / "data" / "cultural_facilities.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"공연장 인허가: 2025년 말 영업·좌표 있음 {n_hall_records}건 → 건물 {alive.xy.nunique()}곳 (좌표 없음 {(b['좌표정보(X)'] == '').sum()}건 제외)")
    print(f"문화공간 좌표 오류로 제외 {len(bad)}건: {bad}")
    print(df.category.replace("", "(분류 검토)").value_counts().to_string())


if __name__ == "__main__":
    main()
