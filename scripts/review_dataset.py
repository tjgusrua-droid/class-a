"""데이터셋 전체 검수: 운영구간 표를 규칙별로 다시 살펴 틀렸을 수 있는 곳을 목록으로 남긴다.

산출: data/verify/dataset_review.csv (검수 항목 · 심각도 · 영화관 · 내용 · 조치)
심각도: 오류(고쳐야 함) / 확인 필요(자료끼리 다름) / 참고(한계)
"""
import json
import math
import re
from pathlib import Path

import pandas as pd
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
DATA_DATE = pd.Timestamp("2026-09-04")
BRAND = r"CGV|롯데시네마|메가박스|씨너스|프리머스|씨네Q|CINE ?Q"


def main():
    e = pd.read_csv(CLEAN / "venues_episodes.csv", dtype=str).fillna("")
    t = pd.read_csv(CLEAN / "seoul_theater_year.csv")
    links = pd.read_csv(CLEAN / "kofic_episode_links.csv")
    ty = pd.read_csv(CLEAN / "episode_type_year.csv")
    gus = {f["properties"]["name"]: shape(f["geometry"]) for f in json.loads((ROOT / "story" / "public" / "data" / "seoul_gu.geojson").read_text(encoding="utf-8"))["features"]}
    seoul = json.loads((ROOT / "story" / "public" / "data" / "seoul_boundary.geojson").read_text(encoding="utf-8"))
    seoul = shape(seoul["features"][0]["geometry"] if "features" in seoul else seoul["geometry"])
    o, c = pd.to_datetime(e.open_date, errors="coerce"), pd.to_datetime(e.close_date, errors="coerce")
    l25 = links[links.year == 2025].dropna()
    t25 = t[t.year == 2025].set_index("key")
    name25 = l25.assign(n=l25.kofic_key.map(t25.name)).groupby("operation_episode_id").n.agg(lambda s: " / ".join(dict.fromkeys(s.dropna())))
    out = []
    add = lambda r, item, sev, msg, act="": out.append(dict(검수항목=item, 심각도=sev, operation_episode_id=r.operation_episode_id, 영화관=r.standardized_name,
                                                          유형=r.analysis_type, 상태=r.operation_status, 내용=msg, 조치=act))
    for i, r in e.iterrows():
        # 1 날짜
        if pd.notna(o[i]) and pd.notna(c[i]) and c[i] < o[i]:
            add(r, "날짜", "오류", f"폐업일({r.close_date})이 개업일({r.open_date})보다 이름")
        if r.operation_status == "영업" and r.close_date:
            add(r, "날짜", "오류", f"영업 중인데 폐업일 {r.close_date}")
        if r.operation_status != "영업" and pd.isna(c[i]):
            add(r, "날짜", "확인 필요", "폐업·말소인데 폐업일 없음 — 운영 수 계산에서 빠짐")
        if pd.notna(o[i]) and o[i] > DATA_DATE:
            add(r, "날짜", "오류", f"개업일이 기준일 뒤({r.open_date})")
        if "일괄 등록일" in r.source_conflict:
            add(r, "날짜", "참고", f"개업일 {r.open_date}는 일괄 등록일로 의심 — 실제 개관은 더 이름" + (f"(확인된 개관 연도 있음)" if r.operation_episode_id in founded else ""))
        # 2 위치
        if not r.lon:
            add(r, "위치", "확인 필요", "좌표 없음 — 지도·입지 분석에서 빠짐", "주소로 좌표 보완 필요")
        else:
            p = Point(float(r.lon), float(r.lat))
            if not seoul.buffer(0.002).contains(p):
                add(r, "위치", "오류", "좌표가 서울 밖")
            hit = next((g for g, s in gus.items() if s.contains(p)), "")
            if r.gu and hit and hit != r.gu:
                add(r, "위치", "확인 필요", f"주소의 구({r.gu})와 좌표의 구({hit})가 다름")
        # 3 KOFIC와의 대조(영업 중)
        if r.operation_status == "영업":
            if r.screens_kofic_2025 == "":
                add(r, "KOFIC 대조", "확인 필요", f"LOCALDATA 영업 중인데 KOFIC 2025 목록에 없음(마지막 수록 {r.kofic_years or '없음'}) — 실제로는 문을 닫았을 수 있음")
            n25 = name25.get(r.operation_episode_id, "")
            core = lambda s: re.sub(r"\s|\(.*?\)|CINEMA|시네마|극장|관", "", str(s)).upper()
            if n25 and core(r.standardized_name) not in core(n25) and core(n25) not in core(r.standardized_name):
                add(r, "상호", "확인 필요", f"표준 상호 ‘{r.standardized_name}’ ↔ KOFIC 2025 상호 ‘{n25}’", "지금 상호로 고쳐 표시")
        # 4 유형 일관성
        has_brand = re.search(BRAND, r.standardized_name.upper()) is not None
        if has_brand and r.analysis_type != "멀티플렉스" and not r.facility_subtype:
            add(r, "유형", "확인 필요", f"상호에 체인 브랜드가 있는데 마지막 유형은 {r.analysis_type} ({r.type_history})")
        if r.analysis_type == "멀티플렉스" and not has_brand:
            add(r, "유형", "확인 필요", f"멀티플렉스인데 상호에 4대 체인 브랜드 없음 — 근거: {r.type_basis}")
        if r.type_changed == "True":
            add(r, "유형", "참고", f"운영 중 유형이 바뀜: {r.type_history}")
        if "근거 재확인" in r.type_basis:
            add(r, "유형", "확인 필요", f"참고 홈페이지 분류에만 근거: {r.type_basis}")
        # 5 규모
        sc, lc = pd.to_numeric(r.screens_kofic_latest, errors="coerce"), int(r.license_count or 0)
        if sc == sc and sc and lc and abs(sc - lc) >= 4:
            add(r, "규모", "참고", f"KOFIC 스크린 {int(sc)}개 ↔ LOCALDATA 인허가 {lc}건(인허가 단위가 상영관과 다를 수 있음)")
        if r.analysis_type == "독립·예술영화전용관" and sc == sc and sc >= 5:
            add(r, "규모", "확인 필요", f"독립·예술영화전용관인데 스크린 {int(sc)}개")
        # 6 입점 형태
        if r.operation_status == "영업" and r.building_occupancy_type == "확인 불가":
            add(r, "입점 형태", "참고", "입점 형태 확인 불가", "data/manual/occupancy_review.xlsx 에서 채움")
    # 7 같은 이름이 겹치는 기간에 두 번
    for n, g in e.groupby("standardized_name"):
        if len(g) > 1:
            gg = g.assign(o=pd.to_datetime(g.open_date, errors="coerce"), c=pd.to_datetime(g.close_date, errors="coerce").fillna(DATA_DATE)).sort_values("o")
            for a, b in zip(gg.itertuples(), gg.iloc[1:].itertuples()):
                if b.o < a.c and a.venue_id != b.venue_id:
                    out.append(dict(검수항목="중복", 심각도="확인 필요", operation_episode_id=f"{a.operation_episode_id}/{b.operation_episode_id}", 영화관=n,
                                    유형=a.analysis_type, 상태="", 내용="같은 상호가 다른 장소에서 기간이 겹침"))
    d = pd.DataFrame(out)
    order = {"오류": 0, "확인 필요": 1, "참고": 2}
    d = d.sort_values(["심각도", "검수항목"], key=lambda s: s.map(order) if s.name == "심각도" else s).reset_index(drop=True)
    d.to_csv(ROOT / "data" / "verify" / "dataset_review.csv", index=False, encoding="utf-8-sig")
    print(d.groupby(["심각도", "검수항목"]).size().to_string())
    return d


founded = set()
if __name__ == "__main__":
    main()
