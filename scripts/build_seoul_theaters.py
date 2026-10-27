"""영진위 연도별 파일(2010~2025)에서 서울 극장 연도별 상태표를 만들고 파일 오류를 점검한다.

집계 규칙
  - 영업 = 그해 본 목록에 있는 극장
  - 휴관 = 휴폐관 목록에서 휴관으로 분류된 극장 (본 목록에는 없음). 집계에 포함한다.
  - 폐관·브랜드전환(옛 이름)은 집계에서 뺀다. 부분 폐관(n관)은 극장 단위 상태를 바꾸지 않는다.
  - 한 해에 같은 극장이 본 목록과 휴폐관 목록에 함께 나오면 하나로 합친다(본 목록 우선).

산출물
  data/clean/seoul_theater_year.csv   연도 × 극장 상태표 (영업/휴관)
  data/clean/seoul_events.csv         개관·폐관·휴관·전환·부분폐관 이벤트
  data/clean/seoul_closure_timeline.csv  휴관 극장별 연도 진행
  data/verify/file_errors.md          파일 오류·확인 필요 항목
"""
import re
from pathlib import Path

import pandas as pd

from verify_kofic_seoul import col, find_sheet, load_new, load_old, norm_name, workbook

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
VERIFY = ROOT / "data" / "verify"
YEARS = range(2010, 2026)

# 연도마다 표기가 다른 같은 극장
ALIASES = {
    "아리랑시네미디어센터": "아리랑시네센터",
    "허리우드극장": "허리우드클래식",
    "허리우드클래식CINEMA": "허리우드클래식",
    "KT&G상상마당CINEMA": "CINEMA상상마당",
    "CGVSALON서초": "CGV살롱서초",
    "픽쳐하우스": "픽처하우스",
}
# 영진위 기준: 2년 이상 휴관은 실질 폐관으로 본다
MAX_HYU_YEARS = 2


def key(name):
    k = norm_name(name)
    return ALIASES.get(k, k)


def addr_keys(s):
    """도로명(○○로/길 N)과 지번(○○동/가 N-M) 후보 키."""
    s = re.sub(r"\s+", "", str(s))
    keys = set()
    for m in re.finditer(r"([가-힣0-9]+?(?:로|길))(\d+(?:-\d+)?)(?![\d가])", s):
        keys.add(m.group(1) + m.group(2))
    for m in re.finditer(r"([가-힣]+\d*(?:동|가))(\d+(?:-\d+)?)", s):
        keys.add(re.sub(r"\d+동$", "동", m.group(1)) + m.group(2))
    return keys


def same_place(a, b):
    return bool(addr_keys(a) & addr_keys(b))


def classify(name, note, in_main):
    """휴폐관 목록 한 행의 성격."""
    note = "" if pd.isna(note) else str(note)
    last = re.split(r"/", note)[-1]
    if in_main or re.search(r"\d+관$", str(name).strip()) or "부분" in note:
        return "부분폐관"
    if "전환" in last and "직영" not in last:
        return "전환"
    if re.search(r"휴관|영업중단", last) and not re.search(r"영업종료|폐관|폐업|폐점", last):
        return "휴관"
    if not note.strip():
        return "폐관(비고없음)"
    return "폐관"


def parse_date(note):
    note = "" if pd.isna(note) else str(note)
    m = re.findall(r"(20)?(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})", note)
    if m:
        _, yy, mm, dd = m[-1]
        return f"20{yy}-{int(mm):02d}-{int(dd):02d}"
    m = re.findall(r"(20\d{2})년\s*(\d{1,2})월(?:\s*(\d{1,2})일)?", note)
    if m:
        yy, mm, dd = m[-1]
        return f"{yy}-{int(mm):02d}" + (f"-{int(dd):02d}" if dd else "")
    return ""


def apply_corrections(tbl, ev, errors):
    """data/manual/corrections.csv 의 확인된 사실로 상태표·이벤트·오류 목록을 고친다.

    rename : old 가 year 부터 new 로 바뀜 → old 의 폐관 이벤트를 전환으로, year 이후 old 의 휴관 행 삭제
    close  : old 의 폐관 날짜 확정
    address: old 의 year 이후 주소 교체
    """
    path = ROOT / "data" / "manual" / "corrections.csv"
    if not path.exists():
        return tbl, ev, errors, []
    resolved = []

    def settle(year, *names):
        nonlocal errors
        hit = [e for e in errors if int(e[:4]) >= year and any(n in e for n in names)]
        errors = [e for e in errors if e not in hit]
        resolved.extend(hit)

    for _, c in pd.read_csv(path, dtype=str).fillna("").iterrows():
        y, ok = int(c.year), key(c.old)
        if c.type == "rename":
            nk = key(c.new)
            m = (ev.key == ok) & (ev.year >= y) & ev.event.str.startswith("폐관")
            ev.loc[m, ["year", "event", "note"]] = [y, "전환", f"→ {c.new} ({c.source})"]
            m = (ev.key == nk) & (ev.year == y) & ev.event.str.contains("목록비교")
            ev.loc[m, ["event", "note"]] = ["전환", f"(구){c.old} ({c.source})"]
            tbl = tbl[~((tbl.key == ok) & (tbl.year >= y) & (tbl.status == "휴관"))]
            settle(y, c.old.strip(), c.new.strip())
        elif c.type == "close":
            m = (ev.key == ok) & (ev.year == y) & ev.event.str.startswith("폐관")
            ev.loc[m, ["event", "date", "note"]] = ["폐관", c.date, c.source]
            settle(y, c.old.strip())
        elif c.type == "address":
            tbl.loc[(tbl.key == ok) & (tbl.year >= y), "address"] = c.address
    return tbl, ev, errors, resolved


def year_frames(y):
    secs = load_old(y) if y <= 2018 else load_new(y)
    main = secs["main"]
    extra = [(k, v) for k, v in secs.items() if k != "main" and len(v)]
    news = pd.DataFrame()
    if y >= 2020:
        xl = pd.ExcelFile(workbook(y))
        n = xl.parse(find_sheet(xl, "신규"))
        news = n[n[col(n, "광역단체")].astype(str).str.startswith("서울")]
    return main, extra, news


def main():
    rows, events, errors = [], [], []
    prev_keys, prev_hyu = set(), {}
    names_by_year = {}

    for y in YEARS:
        main_df, extra, news = year_frames(y)
        nc, ac = col(main_df, "영화관명"), col(main_df, "소재지")
        sc, cc = col(main_df, "총스크린"), col(main_df, "대기업")
        seat = col(main_df, "총좌석")
        gu = col(main_df, "기초단체")
        mkeys = {}
        for _, r in main_df.iterrows():
            k = key(r[nc])
            mkeys[k] = r[nc]
            rows.append(dict(year=y, key=k, name=str(r[nc]).strip(), gu=r[gu], address=str(r[ac]).strip(),
                             screens=r[sc], seats=r[seat], operator=str(r[cc]).strip(),
                             status="영업", note="" if pd.isna(r[col(main_df, "비고")]) else str(r[col(main_df, "비고")]).strip()))
        hyu = {}
        listed = set()
        for label, df in extra:
            if "개관" in label and "폐관" not in label:
                for _, r in df.iterrows():
                    k = key(r[col(df, "영화관명")])
                    errors.append(f"{y}: 부록 '{label.strip()}'에 {r[col(df, '영화관명')]} — "
                                  f"{'같은 해 본 목록에 없음' if k not in mkeys else '본 목록에도 있음'} (라벨 연도 확인)")
                continue
            if label.startswith(str(y - 1)):
                errors.append(f"{y}: 부록 제목이 '{label.strip()}' (연도 표기 오류로 보임)")
            n_c, b_c = col(df, "영화관명"), col(df, "비고")
            for _, r in df.iterrows():
                k = key(re.sub(r"\s*\d+관$", "", str(r[n_c]).strip()))
                listed.add(k)
                kind = classify(r[n_c], r[b_c], k in mkeys)
                events.append(dict(year=y, key=k, name=str(r[n_c]).strip(), event=kind,
                                   date=parse_date(r[b_c]), note="" if pd.isna(r[b_c]) else str(r[b_c]).strip()))
                if kind == "휴관":
                    hyu[k] = r
                if kind == "폐관(비고없음)":
                    errors.append(f"{y}: 휴폐관 목록의 {r[n_c]} 비고가 비어 있음 → 폐관으로 간주, 확인 필요")
        for k, r in hyu.items():
            g = col(r.to_frame().T, "기초단체") if any("기초" in str(c) for c in r.index) else None
            rows.append(dict(year=y, key=k, name=str(r[col(r.to_frame().T, '영화관명')]).strip(),
                             gu=r[g] if g else "", address=str(r.get(col(r.to_frame().T, "소재지"), "")).strip(),
                             screens=r.get(col(r.to_frame().T, "총스크린"), ""), seats="",
                             operator=str(r.get(col(r.to_frame().T, "대기업"), "")).strip(),
                             status="휴관", note=str(r[col(r.to_frame().T, '비고')]).strip()))

        # 전년도 휴관 극장이 올해 아무 데도 없는 경우: 휴관 2년 미만이면 지속, 이상이면 실질 폐관
        for k, r in prev_hyu.items():
            if k in mkeys or k in listed:
                continue
            prev = next(x for x in reversed(rows) if x["key"] == k and x["year"] == y - 1)
            hyu_years = {x["year"] for x in rows if x["key"] == k and x["status"] == "휴관"}
            span = 0
            while (y - 1 - span) in hyu_years:
                span += 1
            if span < MAX_HYU_YEARS:
                rows.append({**prev, "year": y, "status": "휴관", "note": "전년 휴관, 올해 기록 없음 → 휴관 지속(추정)"})
                hyu[k] = r
                errors.append(f"{y}: {prev['name']} — 전년 휴관 후 올해 기록 없음 → 휴관 지속으로 추정")
            else:
                events.append(dict(year=y, key=k, name=prev["name"], event="폐관(장기휴관)", date="",
                                   note=f"{span}년 휴관 후 기록 없음 → 영진위 기준 실질 폐관"))
                errors.append(f"{y}: {prev['name']} — {span}년 휴관 후 기록 끊김 → 실질 폐관 처리")

        # 신규개관 시트 / 연도 간 등장·소멸
        for _, r in news.iterrows():
            events.append(dict(year=y, key=key(r[col(news, "영화관명")]), name=str(r[col(news, "영화관명")]).strip(),
                               event="개관", date=str(r[col(news, "개관일")])[:10], note=""))
        new_keys = {key(x) for x in news[col(news, "영화관명")]} if len(news) else set()
        addr_now = {x["key"]: x["address"] for x in rows if x["year"] == y}
        if y > YEARS.start:
            gone = sorted(prev_keys - set(mkeys) - listed - set(prev_hyu) - set(hyu))
            came = sorted(set(mkeys) - prev_keys - set(prev_hyu) - new_keys)
            for g in gone:
                match = [c for c in came if same_place(prev_addr[g], addr_now[c])]
                if match:
                    c = match[0]
                    came.remove(c)
                    events.append(dict(year=y, key=c, name=str(mkeys[c]).strip(), event="전환(목록비교)", date="",
                                       note=f"(구){names_by_year[y - 1][g]} 같은 주소"))
                    if y >= 2020:
                        errors.append(f"{y}: {names_by_year[y - 1][g]} → {mkeys[c]} — 같은 주소에서 이름이 바뀌었는데 휴폐관·신규 시트에 기록 없음")
                else:
                    errors.append(f"{y}: {names_by_year[y - 1][g]} — 전년 본 목록에 있었는데 올해 어디에도 기록 없음"
                                  + (" (2019년은 휴폐관 시트 자체가 없음)" if y == 2019 else ""))
                    events.append(dict(year=y, key=g, name=str(names_by_year[y - 1][g]).strip(),
                                       event="폐관(목록비교)", date="", note="휴폐관 기록 없이 목록에서 사라짐"))
            for c in came:
                events.append(dict(year=y, key=c, name=str(mkeys[c]).strip(), event="개관(목록비교)", date="", note=""))
                if y >= 2020:
                    errors.append(f"{y}: {mkeys[c]} — 본 목록에 새로 나왔는데 신규개관 시트에 없음")
        names_by_year[y] = mkeys
        prev_keys, prev_hyu = set(mkeys), hyu
        prev_addr = {k: v for k, v in addr_now.items()}

    tbl, ev, errors, resolved = apply_corrections(pd.DataFrame(rows), pd.DataFrame(events), errors)
    CLEAN.mkdir(parents=True, exist_ok=True)
    tbl.to_csv(CLEAN / "seoul_theater_year.csv", index=False, encoding="utf-8-sig")
    ev.to_csv(CLEAN / "seoul_events.csv", index=False, encoding="utf-8-sig")

    h = tbl[tbl.status == "휴관"]
    tl = []
    spells = []
    for k, g in h.groupby("key"):
        yrs = sorted(g.year)
        cur = [yrs[0]]
        for a in yrs[1:]:
            if a == cur[-1] + 1:
                cur.append(a)
            else:
                spells.append((k, g[g.year.isin(cur)]))
                cur = [a]
        spells.append((k, g[g.year.isin(cur)]))
    for k, g in spells:
        yrs = sorted(g.year)
        after = tbl[(tbl.key == k) & (tbl.year > yrs[-1]) & (tbl.status == "영업")]
        closed = ev[(ev.key == k) & (ev.year > yrs[-1]) & ev.event.str.startswith("폐관")]
        moved = ev[(ev.key == k) & (ev.year > yrs[-1]) & (ev.event == "전환")]
        end = (f"{after.year.min()} 재개관" if len(after) else
               f"{moved.year.min()} 전환 {moved.note.iloc[0].split(' (')[0]}" if len(moved) else
               f"{closed.year.min()} 폐관" if len(closed) else
               "2025 현재 휴관" if yrs[-1] == 2025 else "기록 끊김")
        tl.append(dict(name=g.name.iloc[-1], 휴관연도=",".join(map(str, yrs)), 휴관연수=len(yrs),
                       결말=end, 비고=g.note.iloc[-1]))
    pd.DataFrame(tl).sort_values("휴관연도").to_csv(CLEAN / "seoul_closure_timeline.csv", index=False, encoding="utf-8-sig")

    cnt = tbl.groupby(["year", "status"]).size().unstack(fill_value=0)
    cnt["합계(영업+휴관)"] = cnt.sum(axis=1)
    VERIFY.mkdir(parents=True, exist_ok=True)
    out = ["# 서울 극장 파일 오류·확인 필요 항목", "", "## 연도별 집계 (폐관 제외)", "",
           cnt.to_markdown(), "", "## 휴관 진행", "", pd.DataFrame(tl).to_markdown(index=False), "",
           "## 오류·확인 필요 (미해결)", ""] + [f"- {e}" for e in errors] + ["",
           "## 수동 보정으로 해결됨 (data/manual/corrections.csv)", ""] + [f"- {e}" for e in resolved]
    (VERIFY / "file_errors.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out))


if __name__ == "__main__":
    main()
