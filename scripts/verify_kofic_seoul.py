"""영진위 연도별 극장 현황 파일(2010~2025) 서울 극장 목록 중복·정합성 검증.

검증 항목
  1. 본 목록 내부 중복 (정규화한 영화관명 / 소재지)
  2. 본 목록 극장·스크린 수 vs 총계(전국극장현황) 시트의 서울 수치
  3. 본 목록과 같은 해 휴폐관 목록에 동시에 등장하는 극장
  4. 2014·2018: '서울' 시트 vs '전국' 시트의 서울 행
  5. 멀티플렉스(대기업 직영/위탁) 수 vs 멀티플렉스 현황 시트의 서울 수치

결과는 data/verify/kofic_seoul_report.md 로 저장한다.
"""
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "kofic"
OUT = ROOT / "data" / "verify"


def norm_name(s):
    s = str(s).upper()
    s = re.sub(r"\(.*?\)|\s|·|-", "", s)
    return s.replace("시네마", "CINEMA")


def norm_addr(s):
    s = str(s)
    s = re.sub(r"^(서울특별시|서울시|서울)\s*", "", s)
    m = re.match(r"(\S+구)\s+(\S+?[동가로길])\s*([\d-]+)", s)
    return " ".join(m.groups()) if m else re.sub(r"\s", "", s)


def col(df, key):
    key = key.replace(" ", "")
    for c in df.columns:
        if key in str(c).replace(" ", "").replace("\n", ""):
            return c
    raise KeyError(key)


def workbook(year):
    return next(RAW.glob(f"kofic_theaters_{year}.xls*"))


def split_sections(df):
    """지역 시트(2010~2018)를 본 목록과 부록(개관/폐관/휴관) 구역으로 나눈다."""
    sections, cur, rows = {}, "main", []
    num = df.columns[0]
    for _, r in df.iterrows():
        v = r[num]
        if isinstance(v, str) and not v.strip().isdigit() and re.search("개관|폐관|휴관|휴폐관", v):
            sections[cur] = pd.DataFrame(rows)
            cur, rows = v.strip(), []
            continue
        name = r[col(df, "영화관명")]
        if pd.isna(name) or str(name).strip() in ("합계", "계", "소계"):
            continue
        rows.append(r)
    sections[cur] = pd.DataFrame(rows)
    return sections


def load_old(year, sheet="서울"):
    df = pd.read_excel(workbook(year), sheet_name=sheet, header=0)
    if sheet == "전국":
        df = df[df[col(df, "광역단체")].astype(str).str.startswith("서울")]
    return split_sections(df)


def find_sheet(xl, *keys):
    for s in xl.sheet_names:
        if all(k in s.replace(" ", "") for k in keys):
            return s
    return None


def load_new(year):
    xl = pd.ExcelFile(workbook(year))
    df = xl.parse(find_sheet(xl, "극장리스트"), header=0)
    df = df[df[col(df, "광역단체")].astype(str).str.startswith("서울")]
    df = df[df[col(df, "영화관명")].notna()]
    out = {"main": df}
    s = find_sheet(xl, "휴폐관")
    if s:
        c = xl.parse(s, header=None)
        hdr = next(i for i in range(10) if c.iloc[i].astype(str).str.contains("영화관명").any())
        c = xl.parse(s, header=hdr)
        c = c[c[col(c, "광역단체")].astype(str).str.startswith("서울")]
        out["휴폐관"] = c
    return out


def summary_seoul(year):
    """총계 시트의 서울 행: (극장 수, 스크린 수)."""
    xl = pd.ExcelFile(workbook(year))
    s = "총계" if "총계" in xl.sheet_names else find_sheet(xl, "전국극장현황")
    d = xl.parse(s, header=None)
    hdr = next(i for i in range(10) if d.iloc[i].astype(str).str.contains("지역").any())
    d = xl.parse(s, header=hdr)
    row = d[d.iloc[:, 0].astype(str).str.strip() == "서울"].iloc[0]
    th = next(c for c in d.columns if str(year) in str(c) and "극장" in str(c))
    sc = next(c for c in d.columns if str(year) in str(c) and "스크린" in str(c))
    return int(row[th]), int(row[sc])


def multiplex_seoul(year):
    xl = pd.ExcelFile(workbook(year))
    s = find_sheet(xl, "전국멀티플렉스")
    if not s:
        return None
    d = xl.parse(s, header=1)
    row = d[d.iloc[:, 0].astype(str).str.strip() == "서울"].iloc[0]
    cur = next(c for c in d.columns if str(year) in str(c) and "극장" in str(c))
    prev = next(c for c in d.columns if str(year - 1) in str(c) and "극장" in str(c))
    return int(row[cur]), int(row[prev])


def is_multiplex(v):
    return str(v).strip() in ("직영", "위탁")


def main():
    years = range(2010, 2026)
    lines = ["# 영진위 서울 극장 목록 중복·정합성 검증", ""]
    table = ["| 연도 | 본 목록 | 총계 시트 | 차이 | 스크린(목록/총계) | 멀티플렉스(목록/현황시트) | 내부 중복 | 본목록∩휴폐관 |",
             "|---|---|---|---|---|---|---|---|"]
    details = []
    mp_list = {}
    mp_sheet = {}

    for y in years:
        secs = load_old(y) if y <= 2018 else load_new(y)
        main_df = secs["main"]
        name_c, addr_c = col(main_df, "영화관명"), col(main_df, "소재지")
        scr_c, corp_c = col(main_df, "총스크린"), col(main_df, "대기업")
        n = len(main_df)
        screens = int(pd.to_numeric(main_df[scr_c], errors="coerce").sum())
        sum_th, sum_sc = summary_seoul(y)
        mp_list[y] = int(main_df[corp_c].map(is_multiplex).sum())
        mp = multiplex_seoul(y)
        if mp:
            mp_sheet[y] = mp[0]
            mp_sheet.setdefault(y - 1, mp[1])

        names = main_df[name_c].map(norm_name)
        addrs = main_df[addr_c].map(norm_addr)
        dup_n = main_df[names.duplicated(keep=False)][name_c].tolist()
        dup_a = main_df[addrs.duplicated(keep=False)][[name_c, addr_c]].values.tolist()

        closed = pd.concat([v for k, v in secs.items() if k != "main" and re.search("폐관|휴관", k)] or [pd.DataFrame()])
        both = []
        if len(closed):
            cn = col(closed, "영화관명")
            cset = set(closed[cn].map(norm_name))
            both = [x for x, k in zip(main_df[name_c], names) if k in cset]

        table.append(f"| {y} | {n} | {sum_th} | {n - sum_th:+d} | {screens}/{sum_sc} | "
                     f"{mp_list[y]}/{'?' if y not in mp_sheet else mp_sheet[y]} | "
                     f"{len(set(dup_n))}명·{len(dup_a)}주소 | {len(both)} |")
        if dup_n or dup_a or both:
            details.append(f"### {y}")
            if dup_n:
                details.append(f"- 같은 이름: {sorted(set(map(str, dup_n)))}")
            if dup_a:
                details.append(f"- 같은 주소: {[f'{a} / {b}' for a, b in dup_a]}")
            if both:
                details.append(f"- 본 목록과 휴폐관 목록 동시 등장: {both}")
            details.append("")

    # 2014·2018 서울 시트 vs 전국 시트
    sheet_cmp = []
    for y in (2014, 2018):
        a = load_old(y, "서울")["main"]
        b = load_old(y, "전국")["main"]
        sa = set(a[col(a, "영화관명")].map(norm_name))
        sb = set(b[col(b, "영화관명")].map(norm_name))
        sheet_cmp.append(f"- {y}: 서울 시트 {len(a)}곳, 전국 시트 서울 행 {len(b)}곳, "
                         f"서울에만 {sorted(sa - sb) or '없음'}, 전국에만 {sorted(sb - sa) or '없음'}")

    # 연도 미스매치 재계산(2018은 2019 시트의 '전년' 값)
    table_mp = [f"- {y}: 목록 {mp_list[y]} / 현황시트 {mp_sheet[y]}" for y in sorted(mp_sheet) if y in mp_list]

    lines += ["## 연도별 요약", ""] + table + ["",
              "## 서울 시트 vs 전국 시트", ""] + sheet_cmp + ["",
              "## 멀티플렉스 수 대조 (현황 시트가 있는 연도)", ""] + table_mp + ["",
              "## 세부 내역", ""] + (details or ["없음"])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "kofic_seoul_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
