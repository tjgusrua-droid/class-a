"""정리된 서울 극장 데이터를 엑셀 파일 하나(data/seoul_cinema_master.xlsx)로 묶는다.

먼저 build_seoul_theaters.py 를 실행해 data/clean/*.csv 를 만든 뒤 실행한다.
"""
from pathlib import Path

import pandas as pd

from build_seoul_theaters import key
from verify_kofic_seoul import col, find_sheet, workbook

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
OUT = ROOT / "data" / "seoul_cinema_master.xlsx"

GUIDE = [
    ("파일", "서울 극장 마스터 데이터 (2010~2025)"),
    ("출처", "영화진흥위원회 연도별 전국 극장 현황(2010~2025), 행정안전부 영화상영관 인허가 CSV, 사용자 확인"),
    ("집계 기준", "그해 말 기준 영업 + 휴관 극장. 폐관과 브랜드 전환 전 옛 이름은 제외한다."),
    ("휴관", "영진위 본 목록에는 없고 휴폐관 목록에만 있는 극장. 기록 없이 이어지는 휴관은 2년까지만 인정하고(영진위 기준), 사용자가 확인한 경우는 그 사실을 따른다."),
    ("중복 처리", "같은 해 본 목록과 휴폐관 목록에 함께 나오면(부분 폐관) 하나로 센다. 이름만 바뀐 극장은 '전환'으로 이어 붙인다."),
    ("보정", "확인된 사실은 data/manual/corrections.csv 에 기록하고 '보정내역' 시트에 그대로 싣는다."),
    ("시트: 연도별집계", "연도별 극장 수(영업/휴관), 스크린·좌석 합계, 멀티플렉스 수, 특별관 스크린 수(2019~)"),
    ("시트: 극장연도", "연도 × 극장 한 행. 상태, 주소, 스크린·좌석, 특별관, 3D/4D/IMAX(2010~2018), 독립예술 전용관, 작은영화관"),
    ("시트: 극장목록", "극장(key)마다 한 행. 처음·마지막 등장 연도, 최근 상태, 마지막 이벤트"),
    ("시트: 이벤트", "개관·폐관·휴관·전환·부분폐관. '(목록비교)'는 시트 기록 없이 전년 목록과 비교해 추정한 것"),
    ("시트: 계보", "전환 이벤트만 모은 것(옛 이름 → 새 이름)"),
    ("시트: 휴관진행", "휴관 기간별 한 행(연속 휴관 연도, 결말)"),
    ("시트: 스크린상세", "2019~2025 상영관 단위 좌석수·3D·특별관·독립예술 전용관 (영진위 스크린별 상세 리스트, 서울)"),
    ("시트: 보정내역 / 미해결", "수동 보정 목록과 아직 확인이 필요한 항목"),
    ("key", "영화관명을 정규화한 식별자(공백·괄호 제거, 표기 변형 통일). 같은 key = 같은 극장"),
    ("operator", "직영/위탁 = 대기업 멀티플렉스, ~ = 비해당"),
    ("~", "영진위 원자료의 '해당 없음' 표기"),
]


def screens_detail():
    frames = []
    for y in range(2019, 2026):
        xl = pd.ExcelFile(workbook(y))
        d = xl.parse(find_sheet(xl, "스크린별"), header=0)
        d = d[d[col(d, "광역단체")].astype(str).str.startswith("서울")]
        frames.append(pd.DataFrame({
            "year": y,
            "key": d[col(d, "영화관명")].map(key),
            "name": d[col(d, "영화관명")].astype(str).str.strip(),
            "gu": d[col(d, "기초단체")],
            "screen": d[col(d, "스크린명")],
            "seats": pd.to_numeric(d[col(d, "좌석수")], errors="coerce"),
            "is_3d": d[col(d, "3D")],
            "is_special": d[next(c for c in d.columns if "여부" in str(c) and ("특수" in str(c) or "특별" in str(c)))],
            "special_name": d[next(c for c in d.columns if "관명" in str(c) and ("특수" in str(c) or "특별" in str(c)))],
            "is_art": d[next(c for c in d.columns if "독립" in str(c) and "여부" in str(c))],
            "art_name": d[col(d, "독립예술영화전용관명")],
            "note": d[col(d, "비고")],
        }))
    return pd.concat(frames, ignore_index=True)


def main():
    tbl = pd.read_csv(CLEAN / "seoul_theater_year.csv")
    ev = pd.read_csv(CLEAN / "seoul_events.csv")
    hyu = pd.read_csv(CLEAN / "seoul_closure_timeline.csv")
    corr = pd.read_csv(ROOT / "data" / "manual" / "corrections.csv", dtype=str)
    errors_md = (ROOT / "data" / "verify" / "file_errors.md").read_text(encoding="utf-8")
    unresolved = errors_md.split("## 오류·확인 필요 (미해결)")[1].split("## 수동 보정")[0]
    unresolved = pd.DataFrame({"항목": [l[2:] for l in unresolved.splitlines() if l.startswith("- ")]})
    scr = screens_detail()

    for c in ("screens", "seats"):
        tbl[c] = pd.to_numeric(tbl[c], errors="coerce")
    tbl["is_multiplex"] = tbl.operator.astype(str).str.strip().isin(["직영", "위탁"])

    summary = tbl.groupby("year").agg(
        극장수=("key", "size"),
        영업=("status", lambda s: (s == "영업").sum()),
        휴관=("status", lambda s: (s == "휴관").sum()),
        스크린=("screens", "sum"),
        좌석=("seats", "sum"),
        멀티플렉스=("is_multiplex", "sum"),
    ).reset_index()
    sp = scr[scr.is_special.astype(str).str.upper() == "Y"].groupby("year").size().rename("특별관스크린")
    art = scr[scr.is_art.astype(str).str.upper() == "Y"].groupby("year").size().rename("독립예술전용관")
    summary = summary.merge(sp, on="year", how="left").merge(art, on="year", how="left")
    summary[["스크린", "좌석"]] = summary[["스크린", "좌석"]].astype(int)

    last = tbl.sort_values("year").groupby("key").tail(1).set_index("key")
    first = tbl.groupby("key").year.min()
    last_ev = ev[ev.event.str.match(r"^(폐관|전환)")].sort_values("year").groupby("key").tail(1).set_index("key")
    master = pd.DataFrame({
        "name": last.name, "gu": last.gu, "address": last.address,
        "first_year": first, "last_year": last.year,
        "status_2025": ["영업" if (y == 2025 and s == "영업") else "휴관" if y == 2025 else "폐관/전환"
                        for y, s in zip(last.year, last.status)],
        "operator": last.operator, "screens": last.screens, "seats": last.seats,
        "special_desc": last.special_desc,
        "end_event": last_ev.event.reindex(last.index), "end_year": last_ev.year.reindex(last.index),
        "end_date": last_ev.date.reindex(last.index), "end_note": last_ev.note.reindex(last.index),
    }).reset_index().sort_values(["status_2025", "gu", "name"])

    lineage = ev[ev.event.str.startswith("전환")].sort_values(["year", "name"])

    with pd.ExcelWriter(OUT, engine="openpyxl") as w:
        pd.DataFrame(GUIDE, columns=["항목", "설명"]).to_excel(w, sheet_name="안내", index=False)
        summary.to_excel(w, sheet_name="연도별집계", index=False)
        tbl.drop(columns="is_multiplex").to_excel(w, sheet_name="극장연도", index=False)
        master.to_excel(w, sheet_name="극장목록", index=False)
        ev.to_excel(w, sheet_name="이벤트", index=False)
        lineage.to_excel(w, sheet_name="계보", index=False)
        hyu.to_excel(w, sheet_name="휴관진행", index=False)
        scr.to_excel(w, sheet_name="스크린상세", index=False)
        corr.to_excel(w, sheet_name="보정내역", index=False)
        unresolved.to_excel(w, sheet_name="미해결", index=False)
        for ws in w.book.worksheets:
            ws.freeze_panes = "A2"
            for column in ws.columns:
                width = max(len(str(c.value or "")) for c in list(column)[:200])
                ws.column_dimensions[column[0].column_letter].width = min(max(8, width * 1.2), 60)
    print(summary.to_string(index=False))
    print(f"\n→ {OUT.relative_to(ROOT)}  (극장 {len(master)}곳, 극장연도 {len(tbl)}행, 스크린상세 {len(scr)}행)")


if __name__ == "__main__":
    main()
