"""건축적 입점 형태 확인 시트(data/manual/occupancy_review.xlsx)를 만든다.

- ✍ 열만 사람이 채운다. 다시 실행해도 ✍ 열의 입력값은 operation_episode_id 기준으로 보존된다.
- 'Claude 제안'은 주소에 적힌 건물명과 일반적으로 알려진 정보에 근거한 후보일 뿐이며, ✍ 확정 입점 형태에 적기 전에는 분석에 쓰지 않는다.
- 채운 뒤 build_venues.py → build_web_data.py → export_master.py 순서로 다시 실행하면 반영된다.
"""
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "manual" / "occupancy_review.xlsx"
CHOICES = ["백화점 내 입점", "쇼핑몰·아울렛 내 입점", "복합상업시설 내 입점(대형마트)", "복합상업시설 내 입점(역사)", "주상복합건물 내 입점",
           "공공·문화시설 내 입점", "대학 또는 교육시설 내 입점", "기타(호텔 내 입점)", "업무·근린상업 건물 내 입점", "단독 건물(영화관 전용·중심)", "확인 불가"]
INPUT = ["✍ 확정 입점 형태", "✍ 건물명", "✍ 근거 출처(URL·현장)", "✍ 확인일", "✍ 메모"]
# 후보: (제안, 근거) — 모두 확인 필요
SUGGEST = {
    "E0011": ("단독 건물(영화관 전용·중심)", "건물 이름이 '씨네시티'인 영화관 중심 건물로 알려져 있음"),
    "E0075-K3.1": ("단독 건물(영화관 전용·중심)", "주소의 건물명 '골든시네마타워'(영화관 이름을 딴 건물)"),
    "E0075-K4.1": ("단독 건물(영화관 전용·중심)", "주소의 건물명 '골든시네마타워' — 메가박스 이수와 같은 건물"),
    "E0198": ("단독 건물(영화관 전용·중심)", "주소의 건물명 '상봉뉴월드시네마'"),
    "E0183": ("단독 건물(영화관 전용·중심)", "주소의 건물명 '서울영화센터'(영화 전용 공공시설). 공공·문화시설로 볼 수도 있음"),
    "E0165": ("단독 건물(영화관 전용·중심)", "옛 피카디리극장 자리의 건물로 알려져 있음 — 상가 비중 확인 필요"),
    "E0171": ("단독 건물(영화관 전용·중심)", "단관 극장 건물로 알려져 있음 — 현재 운영 여부도 확인 필요"),
    "E0173": ("", "스카라극장 건물은 철거된 것으로 알려져 있음 — LOCALDATA '영업' 상태 자체를 확인 필요"),
    "E0159-K7.1": ("주상복합건물 내 입점", "낙원상가(상가+아파트) 4층"),
    "E0159-K8.1": ("주상복합건물 내 입점", "낙원상가(상가+아파트) — 낭만극장과 같은 건물"),
    "E0155": ("공공·문화시설 내 입점", "주소의 건물명 '복합문화공간 에무'"),
    "E0085": ("공공·문화시설 내 입점", "주소의 건물명 '상상마당빌딩'(복합문화공간)"),
    "E0153": ("업무·근린상업 건물 내 입점", "주소의 건물명 '흥국생명빌딩'(업무용 건물)"),
    "E0108": ("업무·근린상업 건물 내 입점", "주소의 건물명 '아라타워'"),
    "E0089": ("업무·근린상업 건물 내 입점", "주소의 건물명 '하늬솔빌딩'"),
    "E0061": ("업무·근린상업 건물 내 입점", "주소의 건물명 '조광빌딩' 지하 2층"),
    "E0078": ("업무·근린상업 건물 내 입점", "주소의 건물명 'LC TOWER' 7~10층"),
    "E0016": ("업무·근린상업 건물 내 입점", "주소의 건물명 '스타플렉스' 10층"),
    "E0117": ("업무·근린상업 건물 내 입점", "주소의 건물명 '유타' 10층"),
    "E0044": ("업무·근린상업 건물 내 입점", "주소의 건물명 '에그엘로우' 12층"),
    "E0100": ("업무·근린상업 건물 내 입점", "주소의 건물명 '아트레온' 11층 — 영화관 중심 건물일 수도 있음"),
}


def main():
    e = pd.read_csv(ROOT / "data" / "clean" / "venues_episodes.csv", dtype=str).fillna("")
    lic = pd.read_csv(ROOT / "data" / "clean" / "license_records.csv", dtype=str, low_memory=False).fillna("")
    hint = lic.groupby("operation_episode_id").apply(lambda g: " / ".join(sorted({f"{r.건물용도명 or '-'} 지상{r.지상층수 or '?'}·지하{r.지하층수 or '?'}" for r in g.itertuples()}))[:120])
    old = pd.read_excel(OUT, sheet_name="확인시트", dtype=str).fillna("").set_index("operation_episode_id") if OUT.exists() else None
    e["_o"] = (e.operation_status != "영업").astype(int) * 2 + (e.building_occupancy_type != "확인 불가").astype(int)
    e = e.sort_values(["_o", "gu", "standardized_name"])
    head = ["operation_episode_id", "영화관", "유형", "상태", "자치구", "도로명주소", "지번주소", "LOCALDATA 건물용도·층수(참고)",
            "현재 분류(자동)", "자동 근거(건물명)", "Claude 제안(확인 필요)", "제안 근거"] + INPUT
    wb = Workbook()
    ws = wb.active
    ws.title = "확인시트"
    ws.append(head)
    for r in e.itertuples():
        s = SUGGEST.get(r.operation_episode_id, ("", ""))
        keep = [old.loc[r.operation_episode_id, c] if old is not None and r.operation_episode_id in old.index and c in old.columns else "" for c in INPUT]
        ws.append([r.operation_episode_id, r.standardized_name, r.analysis_type, r.operation_status, r.gu, r.address_road, r.address_jibun,
                   hint.get(r.operation_episode_id, ""), r.building_occupancy_type, r.building_name, s[0], s[1]] + keep)
    dv = DataValidation(type="list", formula1="=목록!$A$1:$A$%d" % len(CHOICES), allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"M2:M{ws.max_row}")
    fill = PatternFill("solid", fgColor="FFF4C2")
    for c in ws[1]:
        c.font = Font(bold=True)
        c.alignment = Alignment(wrap_text=True, vertical="top")
    for row in ws.iter_rows(min_row=2, min_col=13, max_col=17):
        for c in row:
            c.fill = fill
    for col, w in zip("ABCDEFGHIJKLMNOPQ", [12, 22, 13, 7, 9, 36, 30, 26, 22, 14, 24, 40, 26, 18, 30, 11, 24]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions
    lst = wb.create_sheet("목록")
    for c in CHOICES:
        lst.append([c])
    info = wb.create_sheet("안내")
    for line in ["노란 칸(✍)만 채워 주세요. ✍ 확정 입점 형태는 목록에서 고릅니다.",
                 "정렬: 영업 중 + 확인 불가 → 영업 중 + 자동 분류됨 → 폐업. 자동 분류도 틀렸으면 ✍ 칸에 고쳐 적습니다.",
                 "'Claude 제안'은 주소의 건물명과 일반적으로 알려진 정보에 근거한 후보이며 웹 출처로 확인하지 않았습니다. 확정 칸에 옮겨 적은 것만 분석에 쓰입니다.",
                 "단독 건물(영화관 전용·중심) = 건물의 주된 용도가 영화관인 경우(단관 극장, 영화관 이름의 건물 등).",
                 "업무·근린상업 건물 내 입점 = 백화점·쇼핑몰이 아닌 일반 오피스·상가 건물의 일부 층.",
                 "반영: python3 scripts/build_venues.py && python3 scripts/build_web_data.py && python3 scripts/export_master.py (scripts 폴더에서 실행)"]:
        info.append([line])
    info.column_dimensions["A"].width = 120
    wb.save(OUT)
    print(f"{OUT.relative_to(ROOT)}: {ws.max_row - 1}행(영업 확인 불가 {((e.operation_status == '영업') & (e.building_occupancy_type == '확인 불가')).sum()}), 제안 {len(SUGGEST)}")


if __name__ == "__main__":
    main()
