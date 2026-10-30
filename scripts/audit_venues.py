"""2026년 운영 영화관 재검증 감사표: data/verify/data_audit_2026.md + story/public/data/audit.json

build_venues.py 결과(LOCALDATA 1차 기준)를 KOFIC, 기존 홈페이지(KOFIC 2025 기준), 참고 홈페이지와 비교한다.
"""
import json
from pathlib import Path

import pandas as pd

from build_venues import DATA_DATE, VERIFIED

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
TYPES = ["멀티플렉스", "독립·예술영화전용관", "일반영화관"]


def main():
    e = pd.read_csv(CLEAN / "venues_episodes.csv").fillna("")
    links = pd.read_csv(CLEAN / "kofic_episode_links.csv")
    ko = pd.read_csv(CLEAN / "kofic_only.csv")
    t = pd.read_csv(CLEAN / "seoul_theater_year.csv")
    act = e[e.operation_status == "영업"]
    k25 = links[links.year == 2025]
    act_in25 = act.operation_episode_id.isin(k25.operation_episode_id)
    k25_to_active = k25.operation_episode_id.isin(act.operation_episode_id)
    # 같은 장소에 동시에 영업 중인 구간이 둘 이상 / 이름이 같은 영업 구간이 둘 이상
    dup_place = act.groupby("venue_id").size()
    dup_name = act.groupby("standardized_name").size()
    closed = e[e.operation_status != "영업"]
    eps_2000s = e[(pd.to_datetime(e.open_date, errors="coerce") <= "2009-12-31") &
                  ((e.operation_status == "영업") | (pd.to_datetime(e.close_date, errors="coerce") >= "2000-01-01"))]

    ref = [x for x in json.load(open(ROOT / "data" / "raw" / "reference" / "ref_homepage_venues.json", encoding="utf-8")) if x["r"] == "S"]
    ref_open = [x for x in ref if x["c"] is None]
    rb = lambda xs, b: sum(1 for x in xs if x["b"] in b)
    multi = ("cgv", "lotte", "megabox")
    ref_closed = [x for x in ref if x["c"] is not None]
    ref_2000s = [x for x in ref if x["o"] <= 2009 and (x["c"] is None or x["c"] >= 2000)]
    prev = dict(total=88, multi=70, indie=15, other=3, closed=28, indie_closed=0, noxy=4, s2000="없음(2010~2025만)")

    cnt = lambda df, ty: int((df.analysis_type == ty).sum())
    rows = [
        ("전체 운영 영화관", prev["total"], len(ref_open), len(act),
         "기존: KOFIC 2025년 말 목록(휴관 포함). 참고: 폐업연도 없는 기록. 현재: LOCALDATA 영업/정상 운영구간. LOCALDATA에만 남은 오래된 영업 기록·이동상영관이 포함되고, 2026년 폐업분은 빠짐"),
        ("멀티플렉스", prev["multi"], rb(ref_open, multi), cnt(act, "멀티플렉스"), "분류 근거: KOFIC 대기업 운영 여부 → 상호 브랜드"),
        ("독립·예술영화전용관", prev["indie"], rb(ref_open, ("indie",)), cnt(act, "독립·예술영화전용관"), "KOFIC 독립예술 전용관 + 상호 명칭 + 참고 홈페이지 분류(근거 표시)"),
        ("일반영화관", prev["other"], rb(ref_open, ("other",)), cnt(act, "일반영화관"), "LOCALDATA에만 있는 소극장·이동상영관·자동차극장 등이 일반영화관으로 들어옴"),
        ("폐업 영화관(전 기간)", prev["closed"], len(ref_closed), len(closed), "기존은 2010~2025 KOFIC 폐관만. 현재는 LOCALDATA 전 기간 폐업·취소 운영구간"),
        ("독립·예술영화관 폐업", prev["indie_closed"], rb(ref_closed, ("indie",)), cnt(closed, "독립·예술영화전용관"),
         "기존 0건 원인: 2019년 이전 KOFIC에 독립예술 필드가 없어 일반영화관으로 분류 + 2010년 이전 폐업 미포함"),
        ("좌표 누락", prev["noxy"], 0, int((e.lon == "").sum()), "현재: 운영구간 기준(LOCALDATA 좌표 없음)"),
        ("2000년대 운영 기록", prev["s2000"], len(ref_2000s), len(eps_2000s), "2000~2009년에 한 번이라도 운영한 기록 수"),
    ]
    audit = {
        "data_date": DATA_DATE, "verified": VERIFIED,
        "localdata_records": int(pd.read_csv(CLEAN / "license_records.csv").shape[0]),
        "venues": int(e.venue_id.nunique()), "episodes": len(e),
        "active": len(act), "active_by_type": {ty: cnt(act, ty) for ty in TYPES},
        "status": e.operation_status.value_counts().to_dict(),
        "closed_by_type": {ty: cnt(closed, ty) for ty in TYPES},
        "active_matched_kofic2025": int(act_in25.sum()),
        "active_localdata_only": int((~act_in25).sum()),
        "kofic2025_total": int((t.year == 2025).sum()),
        "kofic2025_not_active_in_localdata": int((~k25_to_active).sum()),
        "kofic_only": int(len(ko)),
        "dup_place": int((dup_place > 1).sum()), "dup_name": int((dup_name > 1).sum()),
        "no_coords": int((e.lon == "").sum()), "no_coords_active": int((act.lon == "").sum()),
        "type_no_evidence": int((e.type_basis == "대기업 운영·독립예술 근거 없음").sum()),
        "type_reference_only": int(e.type_basis.str.startswith("참고 홈페이지").sum()),
        "conflicts_active": int((act.source_conflict != "").sum()),
        "subtype_active": act.facility_subtype[act.facility_subtype != ""].value_counts().to_dict(),
        "compare": [dict(item=a, previous=b, reference=c, current=d, reason=r) for a, b, c, d, r in rows],
    }
    (ROOT / "story" / "public" / "data" / "audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=1), encoding="utf-8")

    md = [f"# 서울 영화관 데이터 감사 — LOCALDATA {DATA_DATE} 갱신본 기준 (확인일 {VERIFIED})", "",
          "## 2026년 운영 영화관 재검증", "",
          f"- LOCALDATA 인허가 기록 {audit['localdata_records']}건 → 장소 {audit['venues']}곳 · 운영구간 {audit['episodes']}개",
          f"- **영업 중 운영구간 {audit['active']}개** (멀티플렉스 {audit['active_by_type']['멀티플렉스']} · 독립·예술 {audit['active_by_type']['독립·예술영화전용관']} · 일반 {audit['active_by_type']['일반영화관']})",
          f"- 상태별 운영구간: {audit['status']}",
          f"- 폐업·취소 운영구간 유형별: {audit['closed_by_type']}",
          f"- KOFIC 2025 목록과 연결되는 영업 구간 {audit['active_matched_kofic2025']} · LOCALDATA에만 있는 영업 구간 {audit['active_localdata_only']}",
          f"- KOFIC 2025 극장 {audit['kofic2025_total']}곳 중 LOCALDATA에서 영업 구간이 아닌 곳 {audit['kofic2025_not_active_in_localdata']} (2026년 폐업 또는 자료 충돌)",
          f"- KOFIC에만 있고 별도 LOCALDATA 기록이 없는 극장 {audit['kofic_only']} (`data/clean/kofic_only.csv`)",
          f"- 같은 장소에 동시 영업 구간이 둘 이상인 장소 {audit['dup_place']} · 같은 이름의 영업 구간 {audit['dup_name']}",
          f"- 좌표 누락 운영구간 {audit['no_coords']} (영업 중 {audit['no_coords_active']})",
          f"- 유형 근거 없음(일반영화관으로 둠) {audit['type_no_evidence']} · 참고 홈페이지 분류에만 근거 {audit['type_reference_only']}",
          f"- 영업 중이지만 다른 자료와 충돌하는 구간 {audit['conflicts_active']} — 규칙상 영업으로 집계하고 `source_conflict`에 기록",
          f"- 영업 구간 세부유형: {audit['subtype_active']}", "",
          "## 기존·참고 홈페이지와 비교", "",
          "| 항목 | 기존 홈페이지 | 참고 홈페이지 | 현재 재계산 | 차이의 원인 |", "|---|---:|---:|---:|---|"]
    md += [f"| {a} | {b} | {c} | {d} | {r} |" for a, b, c, d, r in rows]
    md += ["", "최종 적용값 = 현재 재계산(LOCALDATA 1차 기준). 참고 홈페이지 수치에 맞추지 않았다.", "",
           "## 영업 중이지만 자료 충돌이 있는 구간", ""]
    for _, r in act[act.source_conflict != ""].iterrows():
        md.append(f"- {r.standardized_name} ({r.gu}, 개업 {r.open_date}): {r.source_conflict}")
    (ROOT / "data" / "verify" / "data_audit_2026.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:20]))
    print("\n".join(md[20:32]))


if __name__ == "__main__":
    main()
