"""연도별 유형(인수·전환 반영)과 개업·폐업·인수합병 사건 연표.

같은 운영구간 안에서도 유형이 바뀔 수 있다. 예: 브로드웨이시네마(일반, ~2012) → 롯데시네마 브로드웨이(체인, 2013~) → 메가박스(2024).
그래서 운영구간 × 연도마다 유형을 정한다.

연도별 유형 판단(우선순위)
  ① data/manual/type_history.csv 확인값(구간·시작 연도·유형·브랜드)
  ② 그해 KOFIC 기록: 운영형태 직영·위탁이거나 상호가 4대 체인 브랜드 → 멀티플렉스. 아니면 독립예술 전용관 수 > 0 → 독립·예술영화전용관
  ③ KOFIC 기록이 없는 해: 앞뒤 KOFIC 해의 값을 이어 쓴다(2010년 전은 첫 KOFIC 해 값).
     단 브랜드가 생기기 전 해는 체인일 수 없다(CGV 1998 · 롯데시네마 1999 · 메가박스 2000 · 프리머스 2002 · 씨너스 2004 · 씨네Q 2015, 대략).
     KOFIC 기록이 없는 구간은 LOCALDATA 상호의 브랜드로 판단한다.
  체인이 아닌 해는 구간의 독립·예술 근거가 있으면 독립·예술영화전용관, 없으면 일반영화관.

사건(연표)
  개업 · 폐업              운영구간의 LOCALDATA 날짜(일괄 등록일로 의심되는 개업일은 '등록(개업일 불확실)')
  체인 인수·가맹           같은 구간에서 비체인 → 멀티플렉스
  체인 이탈                같은 구간에서 멀티플렉스 → 비체인
  브랜드 변경(인수합병)    같은 구간에서 체인 브랜드가 바뀜(예: 롯데시네마 → 메가박스, 씨너스 → 메가박스)
  같은 자리 승계           한 장소에서 앞 구간이 끝나고 1년 안에 새 구간이 시작(새 인허가로 넘겨받음). 앞뒤 유형·브랜드를 적는다

산출: data/clean/episode_type_year.csv, data/clean/cinema_events_timeline.csv, venues_episodes.csv 에 유형 변천 열 추가
"""
import sys
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
CLEAN = ROOT / "data" / "clean"
DATA_YEAR = 2026
BRAND_START = {"CGV": 1998, "롯데시네마": 1999, "메가박스": 2000, "프리머스": 2002, "씨너스": 2004, "씨네Q": 2015}
BRAND_RE = r"(CGV|씨지브이|롯데CINEMA|롯데시네마|메가박스|MEGABOX|씨너스|CINUS|프리머스|PRIMUS|CINEQ|씨네Q)"
INDIE_WORDS = r"독립영화|시네마테크|아트시네마|아트하우스|예술영화|예술관|인디"
MULTI, INDIE, GEN = "멀티플렉스", "독립·예술영화전용관", "일반영화관"


def brand_of(s):
    m = re.search(BRAND_RE, str(s).upper().replace(" ", ""))
    if not m:
        return ""
    b = m.group(1)
    return {"씨지브이": "CGV", "롯데CINEMA": "롯데시네마", "롯데": "롯데시네마", "MEGABOX": "메가박스", "CINUS": "씨너스",
            "PRIMUS": "프리머스", "CINEQ": "씨네Q"}.get(b, b)


def year_of(s):
    s = str(s)
    return int(s[:4]) if s[:4].isdigit() else None


def type_years(ep, lic, links, t, manual):
    """운영구간 × 연도 → (유형, 브랜드, 근거)."""
    t = t.copy()
    t["operator"] = t.operator.astype(str).str.strip()
    t["art"] = pd.to_numeric(t.art_screens, errors="coerce").fillna(0)
    kk = links.dropna(subset=["operation_episode_id"]).merge(t, left_on=["kofic_key", "year"], right_on=["key", "year"])
    rows = []
    for r in ep.itertuples():
        y0 = year_of(r.open_date)
        if y0 is None:
            continue
        y1 = year_of(r.close_date) if r.operation_status != "영업" and year_of(r.close_date) else DATA_YEAR
        y1 = max(y0, y1)
        names = lic[lic.operation_episode_id == r.operation_episode_id]
        k = kk[kk.operation_episode_id == r.operation_episode_id]
        # 해마다 KOFIC 상태: 같은 해에 극장이 여럿이면(동시 운영) 체인이 하나라도 있으면 체인
        kof = {}
        for y, g in k.groupby("year"):
            b = next((brand_of(n) for n in g.name if brand_of(n)), "")
            chain = bool(set(g.operator) & {"직영", "위탁"}) or bool(b)
            op = next((o for o in g.operator if o in ("직영", "위탁")), "")
            kof[int(y)] = dict(chain=chain, brand=b if chain else "", art=bool((g.art > 0).any()), name=" / ".join(dict.fromkeys(g.name)), op=op)
        indie_base = r.analysis_type == INDIE or re.search(INDIE_WORDS, f"{r.source_name_localdata} {r.standardized_name}") is not None \
            or any(v["art"] and not v["chain"] for v in kof.values())
        ld_brand = next((brand_of(n) for n in names["사업장명"] if brand_of(n)), "") or brand_of(r.standardized_name)
        ky = sorted(kof)
        # 체인 시작 연도: KOFIC 체인 극장의 '개관일'(가장 이른 값) → 없으면 브랜드 상호가 붙은 LOCALDATA 인허가 중 가장 이른 인허가일
        ck = k[k.operator.isin(["직영", "위탁"]).astype(bool) | k.name.map(lambda n: bool(brand_of(n))).astype(bool)] if len(k) else k
        cs = [year_of(o) for o in ck.opened.astype(str) if year_of(o)]
        bl = [year_of(o) for n, o in zip(names["사업장명"], names["인허가일자"]) if brand_of(n) and year_of(o)]
        chain_start = min(cs) if cs else (min(bl) if bl else None)
        no_chain = r.facility_subtype != ""  # 자동차극장·이동상영관은 체인 상호여도 멀티플렉스로 보지 않음
        man = manual[manual.operation_episode_id == r.operation_episode_id].sort_values("from_year")
        for y in range(y0, y1 + 1):
            src, st = "", None
            if y in kof:
                st, src = kof[y], "KOFIC 그해 기록"
            elif ky:
                near = max([x for x in ky if x < y], default=None)
                st = kof[near] if near is not None else kof[ky[0]]
                src = f"KOFIC {near if near is not None else ky[0]}년 값을 이어 씀"
                if near is None and st["chain"] and chain_start and y < chain_start:
                    st, src = dict(st, chain=False), f"KOFIC 체인 개관일({chain_start}) 전 → 비체인"
            else:
                on = bool(ld_brand) and (chain_start is None or y >= chain_start)
                st = dict(chain=on, brand=ld_brand, art=False, name="", op="")
                src = ("LOCALDATA 상호의 체인 브랜드" if on else f"브랜드 상호 인허가({chain_start}) 전") if ld_brand else "LOCALDATA 상호(체인 브랜드 없음)"
            chain, b = st["chain"] and not no_chain, st["brand"] or ld_brand
            if chain and b and y < BRAND_START.get(b, 0):
                chain, src = False, f"{b} 설립({BRAND_START[b]}) 전이라 비체인"
            typ = MULTI if chain else (INDIE if indie_base or st.get("art") else GEN)
            m = man[man.from_year <= y]
            if len(m):
                mm = m.iloc[-1]
                typ, b, src = mm.type, mm.brand if isinstance(mm.brand, str) else "", f"확인값: {mm.basis}"
            rows.append(dict(operation_episode_id=r.operation_episode_id, venue_id=r.venue_id, year=y, type=typ,
                             brand=b if typ == MULTI else "", chain_operation=st.get("op", "") if typ == MULTI else "",
                             kofic_name=st.get("name", "") if y in kof else "", basis=src))
    return pd.DataFrame(rows)


def history_text(g):
    out, cur = [], None
    for r in g.itertuples():
        lab = r.type + (f"·{r.brand}" if r.brand else "")
        if cur and cur[0] == lab:
            cur[2] = r.year
        else:
            cur = [lab, r.year, r.year]
            out.append(cur)
    return " → ".join(f"{a}({b}–{'' if c == DATA_YEAR else c})" if b != c else f"{a}({b})" for a, b, c in out)


def events(ep, ty):
    ev = []
    by = {k: g.sort_values("year") for k, g in ty.groupby("operation_episode_id")}
    at = lambda eid, y: (lambda g: g[g.year == y].iloc[0] if len(g[g.year == y]) else (g.iloc[0] if len(g) else None))(by.get(eid, pd.DataFrame()))
    bulk = ep.source_conflict.fillna("").str.contains("일괄 등록일")
    for r, b in zip(ep.itertuples(), bulk):
        yo, yc = year_of(r.open_date), year_of(r.close_date)
        base = dict(venue_id=r.venue_id, operation_episode_id=r.operation_episode_id, name=r.standardized_name, gu=r.gu)
        if yo:
            s = at(r.operation_episode_id, yo)
            ev.append(dict(base, date=r.open_date, year=yo, event="등록(개업일 불확실)" if b else "개업",
                           type_after=s.type if s is not None else r.analysis_type, brand_after=s.brand if s is not None else "",
                           note="같은 구 4곳 이상이 같은 날 인허가된 일괄 등록일" if b else ""))
        if r.operation_status != "영업" and yc:
            s = at(r.operation_episode_id, yc)
            ev.append(dict(base, date=r.close_date, year=yc, event="폐업", type_before=s.type if s is not None else r.analysis_type,
                           brand_before=s.brand if s is not None else "", note=r.operation_status))
        g = by.get(r.operation_episode_id)
        if g is None:
            continue
        prev, lastname = None, ""
        for x in g.itertuples():
            if prev is not None and (prev.type, prev.brand) != (x.type, x.brand):
                if prev.type != MULTI and x.type == MULTI:
                    e = "체인 인수·가맹"
                elif prev.type == MULTI and x.type != MULTI:
                    e = "체인 이탈"
                elif prev.type == MULTI and x.type == MULTI:
                    e = "브랜드 변경(인수합병)"
                else:
                    e = "유형 변경"
                ev.append(dict(base, date="", year=x.year, event=e, type_before=prev.type, brand_before=prev.brand,
                               type_after=x.type, brand_after=x.brand, note=f"{lastname or '이전 상호(기록 없음)'} → {x.kofic_name or r.standardized_name} ({x.basis})"))
            prev, lastname = x, x.kofic_name or lastname
    # 같은 자리 승계: 한 장소에서 앞 구간이 끝나고 1년 안에 다음 구간이 시작
    e2 = ep.assign(o=pd.to_datetime(ep.open_date, errors="coerce"), c=pd.to_datetime(ep.close_date, errors="coerce")).sort_values("o")
    for v, g in e2.groupby("venue_id"):
        g = g.dropna(subset=["o"]).sort_values("o")
        for a, b in zip(g.itertuples(), g.iloc[1:].itertuples()):
            if pd.isna(a.c) or not (-366 <= (b.o - a.c).days <= 366) or a.standardized_name == b.standardized_name:
                continue
            sa, sb = at(a.operation_episode_id, a.c.year), at(b.operation_episode_id, b.o.year)
            ta, tb = (sa.type if sa is not None else a.analysis_type), (sb.type if sb is not None else b.analysis_type)
            ba, bb = (sa.brand if sa is not None else ""), (sb.brand if sb is not None else "")
            kind = "같은 자리 승계(체인 인수)" if ta != MULTI and tb == MULTI else "같은 자리 승계(브랜드 변경)" if ta == MULTI and tb == MULTI and ba != bb else "같은 자리 승계"
            ev.append(dict(venue_id=v, operation_episode_id=b.operation_episode_id, name=b.standardized_name, gu=b.gu, date=b.open_date, year=b.o.year,
                           event=kind, type_before=ta, brand_before=ba, type_after=tb, brand_after=bb, note=f"{a.standardized_name}(~{a.close_date}) → {b.standardized_name}"))
    cols = ["year", "date", "event", "name", "gu", "type_before", "brand_before", "type_after", "brand_after", "note", "venue_id", "operation_episode_id"]
    return pd.DataFrame(ev).reindex(columns=cols).fillna("").sort_values(["year", "date", "event"], key=lambda s: s.astype(str)).reset_index(drop=True)


def load():
    ep = pd.read_csv(CLEAN / "venues_episodes.csv", dtype=str).fillna("")
    lic = pd.read_csv(CLEAN / "license_records.csv", dtype=str).fillna("")
    links = pd.read_csv(CLEAN / "kofic_episode_links.csv")
    t = pd.read_csv(CLEAN / "seoul_theater_year.csv")
    mf = ROOT / "data" / "manual" / "type_history.csv"
    manual = pd.read_csv(mf, comment="#") if mf.exists() else pd.DataFrame(columns=["operation_episode_id", "from_year", "type", "brand", "basis"])
    return ep, lic, links, t, manual


def run():
    ep, lic, links, t, manual = load()
    ty = type_years(ep, lic, links, t, manual)
    ty.to_csv(CLEAN / "episode_type_year.csv", index=False, encoding="utf-8-sig")
    hist = ty.groupby("operation_episode_id").apply(history_text)
    first = ty.sort_values("year").groupby("operation_episode_id").type.first()
    last = ty.sort_values("year").groupby("operation_episode_id").type.last()
    ep["type_history"] = ep.operation_episode_id.map(hist).fillna("")
    ep["type_at_open"] = ep.operation_episode_id.map(first).fillna(ep.analysis_type)
    ep["type_changed"] = ep.operation_episode_id.map(ty.groupby("operation_episode_id").type.nunique() > 1).fillna(False)
    # 대표 유형(analysis_type) = 마지막(영업 중이면 지금, 폐업이면 문 닫을 때) 유형
    ep["analysis_type"] = ep.operation_episode_id.map(last).fillna(ep.analysis_type)
    lastop = ty.sort_values("year").groupby("operation_episode_id").chain_operation.last().fillna("")
    ep["chain_operation"] = [(lastop.get(i, "") or "확인 불가") if t == MULTI else "" for i, t in zip(ep.operation_episode_id, ep.analysis_type)]
    ep.to_csv(CLEAN / "venues_episodes.csv", index=False, encoding="utf-8-sig")
    # 연도별 집계를 그해 유형으로 다시 계산(인수·전환 반영)
    from build_venues import yearly
    yearly(ep, t, ty).to_csv(CLEAN / "yearly_series.csv", index=False, encoding="utf-8-sig")
    ev = events(ep, ty)
    ev.to_csv(CLEAN / "cinema_events_timeline.csv", index=False, encoding="utf-8-sig")
    print("유형이 바뀐 운영구간", int(ep.type_changed.sum()), "· 사건", len(ev))
    print(ev.event.value_counts().to_string())
    return ep, ty, ev


if __name__ == "__main__":
    run()
