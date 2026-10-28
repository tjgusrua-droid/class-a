"""LOCALDATA(행정안전부 영화상영관 인허가)를 1차 기준으로 서울 영화관 장소·운영구간을 만든다.

단위
  license_record_id      LOCALDATA 인허가 기록(대개 상영관 1개 = 1건)
  venue_id               물리적 장소. 좌표 30m 이내 · 같은 지번 · 같은 도로명주소 중 하나라도 같으면 같은 장소
  operation_episode_id   한 장소에서 인허가 기간이 겹치며 이어진 기록 묶음 = 개업~폐업 한 번
                         (같은 날 넘겨받거나 공백 뒤 재개관하면 다른 구간)
                         같은 건물에 KOFIC가 서로 다른 극장 2곳 이상을 같은 해에 기록하면 상호로 나눈다.

KOFIC(영진위 2010~2025 정리본)는 스크린·좌석·특별관·운영주체·유형 보완용으로 연결한다.
산출: data/clean/venues_episodes.csv, data/clean/license_records.csv, data/clean/kofic_episode_links.csv
"""
import json
import re
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely.geometry import Point, shape

from build_seoul_theaters import key as kofic_key
from build_story_data import addr_keys, norm_biz

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"
VERIFIED = "2026-10-28"  # 확인일
TO_WGS = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)


def load_localdata():
    m = pd.read_csv(ROOT / "data" / "raw" / "seoul_cinema_licenses.csv", dtype=str).fillna("")
    m = m.apply(lambda c: c.str.strip())
    m = m[(m["지번주소"] + m["도로명주소"]).str.contains("서울특별시")].copy()
    m["license_record_id"] = m["개방자치단체코드"] + "-" + m["관리번호"]  # 관리번호는 자치단체 안에서만 고유
    m["x"] = pd.to_numeric(m["좌표정보(X)"], errors="coerce")
    m["y"] = pd.to_numeric(m["좌표정보(Y)"], errors="coerce")
    m["keys"] = (m["지번주소"] + " " + m["도로명주소"]).map(addr_keys)
    m["gu"] = (m["지번주소"].where(m["지번주소"] != "", m["도로명주소"])).str.extract(r"서울특별시\s+(\S+구)")[0]
    m["open"] = pd.to_datetime(m["인허가일자"], errors="coerce")
    end = m["폐업일자"].where(m["폐업일자"] != "", m["인허가취소일자"])
    m["close"] = pd.to_datetime(end.replace("", None), errors="coerce")
    m["active"] = m["영업상태명"].eq("영업/정상")
    return m.reset_index(drop=True)


def sim(a, b):
    """상호 유사도: 공통 2글자 조각 수(브랜드명 제외)."""
    strip = lambda s: re.sub(r"CGV|롯데CINEMA|롯데시네마|메가박스|씨너스|프리머스|CINEMA|시네마|극장|관$", "", s)
    sh = lambda s: {s[i:i + 2] for i in range(len(s) - 1)}
    return len(sh(strip(a)) & sh(strip(b)))


def brand(s):
    m_ = re.match(r"(CGV|씨지브이|롯데CINEMA|롯데시네마|메가박스|씨너스|프리머스|CINEQ|씨네Q)", s.upper().replace(" ", ""))
    return {"씨지브이": "CGV", "롯데CINEMA": "롯데시네마", "CINEQ": "씨네Q"}.get(m_.group(1), m_.group(1)) if m_ else ""


class DSU:
    def __init__(self, n): self.p = list(range(n))
    def f(self, a):
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]; a = self.p[a]
        return a
    def u(self, a, b): self.p[self.f(a)] = self.f(b)


def venues(m):
    d = DSU(len(m))
    xy = m[["x", "y"]].values
    for i in range(len(m)):
        for j in range(i + 1, len(m)):
            if m.at[i, "gu"] != m.at[j, "gu"]:
                continue
            close_xy = pd.notna(xy[i][0]) and pd.notna(xy[j][0]) and ((xy[i] - xy[j]) ** 2).sum() <= 30 ** 2
            near80 = pd.notna(xy[i][0]) and pd.notna(xy[j][0]) and ((xy[i] - xy[j]) ** 2).sum() <= 80 ** 2
            a, b = norm_biz(m.at[i, "사업장명"]), norm_biz(m.at[j, "사업장명"])
            same_name = near80 and brand(a) == brand(b) != "" and sim(a, b) >= 2
            if close_xy or same_name or (m.at[i, "keys"] & m.at[j, "keys"]):
                d.u(i, j)
    roots = [d.f(i) for i in range(len(m))]
    order = {r: n for n, r in enumerate(dict.fromkeys(sorted(set(roots), key=lambda r: (m.at[r, "gu"] or "", r))))}
    m["venue_id"] = [f"V{order[r] + 1:03d}" for r in roots]
    return m


def episodes(m):
    """장소 안에서 인허가 기간이 겹치는 기록을 한 운영구간으로."""
    far = pd.Timestamp("2100-01-01")
    m = m.sort_values(["venue_id", "open"]).copy()
    ep, n = [], 0
    for vid, g in m.groupby("venue_id", sort=False):
        cur_end = None
        for _, r in g.iterrows():
            o = r.open if pd.notna(r.open) else pd.Timestamp("1900-01-01")
            e = far if r.active or pd.isna(r.close) else r.close
            if cur_end is None or not (o < cur_end):  # 겹치지 않으면(같은 날 인계 포함) 새 구간
                n += 1
                cur_end = e
            else:
                cur_end = max(cur_end, e)
            ep.append((r.license_record_id, f"E{n:04d}"))
    m["operation_episode_id"] = m.license_record_id.map(dict(ep))
    return m


def lineage_edges():
    """KOFIC 이벤트의 이름·브랜드 전환(옛 극장 → 새 극장) 쌍."""
    ev = pd.read_csv(CLEAN / "seoul_events.csv")
    ev = ev[ev.event.str.startswith("전환")]
    edges = set()
    for _, r in ev.iterrows():
        note = str(r.note)
        for m_ in re.finditer(r"(?:→|\(구\))\s*([^()/]+?)(?:\s*\(|\s*같은 주소|\s*/|$)", note):
            edges.add(tuple(sorted((r.key, kofic_key(m_.group(1).strip())))))
        m_ = re.search(r"([^/]+?)(?:으로|로)\s*전환", note)
        if m_:
            edges.add(tuple(sorted((r.key, kofic_key(re.sub(r"^[\d.\s]+", "", m_.group(1)).strip())))))
    return edges


def split_concurrent(m, links, t):
    """같은 운영구간에 KOFIC 극장이 같은 해 둘 이상(동시 운영)이면 상호로 나눈다. 전환 계보로 이어진 극장은 한 묶음."""
    names = t.sort_values("year").groupby("key").name.last().map(norm_biz)
    edges = lineage_edges()
    multi = links.dropna().groupby(["operation_episode_id", "year"]).kofic_key.nunique()
    targets = multi[multi > 1].reset_index().operation_episode_id.unique()
    log = []
    for e in targets:
        ks = list(links[links.operation_episode_id == e].kofic_key.unique())
        d = DSU(len(ks))
        for i, a in enumerate(ks):
            for j, b in enumerate(ks):
                if tuple(sorted((a, b))) in edges:
                    d.u(i, j)
        rows = m[m.operation_episode_id == e]
        groups = {}
        for idx, r in rows.iterrows():
            nb = norm_biz(r["사업장명"])
            scores = [sim(nb, names[k]) + 0.5 * (brand(nb) == brand(names[k]) != "") for k in ks]
            g = f"K{d.f(scores.index(max(scores)))}" if max(scores) > 0 else f"N:{nb}"
            groups[idx] = g
        if len(set(groups.values())) < 2:
            continue
        for g in sorted(set(groups.values())):
            idxs = [i for i, v in groups.items() if v == g]
            m.loc[idxs, "operation_episode_id"] = f"{e}-{g[:1]}{len(log) + 1}"
            log.append((e, g, len(idxs)))
    # 나눈 묶음 안에서 기간 겹침으로 다시 구간화
    far = pd.Timestamp("2100-01-01")
    for e, g in m[m.operation_episode_id.str.contains("-")].groupby("operation_episode_id"):
        g = g.sort_values("open")
        cur, part = None, 0
        for idx, r in g.iterrows():
            o = r.open if pd.notna(r.open) else pd.Timestamp("1900-01-01")
            end = far if r.active or pd.isna(r.close) else r.close
            if cur is None or not (o < cur):
                part += 1; cur = end
            else:
                cur = max(cur, end)
            m.at[idx, "operation_episode_id"] = f"{e}.{part}"
    return m, log


def kofic_theaters():
    t = pd.read_csv(CLEAN / "seoul_theater_year.csv")
    t["keys"] = t.address.map(addr_keys)
    return t


def link_kofic(m, t):
    """KOFIC 극장(key)×연도 → 운영구간. 주소(구 안) 또는 상호가 맞고, 그해가 구간 안에 있으면 연결."""
    eps = m.groupby("operation_episode_id").agg(
        venue_id=("venue_id", "first"), gu=("gu", "first"), keys=("keys", lambda s: set().union(*s)),
        names=("사업장명", lambda s: {norm_biz(x) for x in s}), open=("open", "min"),
        close=("close", "max"), active=("active", "any"))
    links = []
    for k, rows in t.groupby("key"):
        kname = norm_biz(rows.name.iloc[-1])
        ks = set().union(*rows["keys"])
        for _, r in rows.iterrows():
            y0, y1 = pd.Timestamp(f"{r.year}-01-01"), pd.Timestamp(f"{r.year}-12-31")
            c = eps[(eps.gu == r.gu) & (eps["keys"].map(lambda s: bool(s & ks)) |
                                        eps.names.map(lambda s: any(len(kname) >= 4 and (kname in x or x in kname) and len(x) >= 4 for x in s)))]
            alive = c[(c.open <= y1) & (c.active | c.close.isna() | (c.close >= y0))]
            pick = alive if len(alive) else c
            if len(pick):
                # 같은 장소 후보가 여럿이면 상호가 겹치는 구간 → 기간이 그해를 덮는 구간 순
                by_addr = pick["keys"].map(lambda s: bool(s & ks)).astype(int)
                by_name = pick.names.map(lambda s: max((sim(kname, x) + 0.5 * (brand(kname) == brand(x) != "") for x in s), default=0))
                score = by_addr * 100 + by_name
                best = score.idxmax()
                links.append((k, r.year, best, "주소" + ("·상호" if by_name[best] > 0 else "") if by_addr[best] else "상호"))
            else:
                links.append((k, r.year, None, "매칭 없음"))
    return pd.DataFrame(links, columns=["kofic_key", "year", "operation_episode_id", "match"]), eps




def inherit_lineage(links, t):
    """매칭 안 된 KOFIC 극장-연도는 전환 계보로 이어진 극장이 같은 주소에서 연결된 구간을 물려받는다."""
    edges = lineage_edges()
    for i, r in links[links.match == "매칭 없음"].iterrows():
        mates = {b if a == r.kofic_key else a for a, b in edges if r.kofic_key in (a, b)}
        cand = links[links.kofic_key.isin(mates) & links.operation_episode_id.notna()]
        if len(cand):
            near = cand.iloc[(cand.year - r.year).abs().argsort()[:1]]
            links.loc[i, ["operation_episode_id", "match"]] = [near.operation_episode_id.iloc[0], "전환 계보"]
    return links


# 건축적 입점 형태: 주소 문자열(LOCALDATA·KOFIC)과 LOCALDATA 건물용도명에 적힌 건물 이름만 근거로 쓴다
OCCUPANCY = [
    ("백화점 내 입점", r"백화점|AK플라자|에비뉴엘"),
    ("쇼핑몰·아울렛 내 입점", r"아울렛|아이파크몰|롯데몰|쇼핑몰|월드컵몰|코엑스몰|스타시티|타임스퀘어|파크하비오|굿모닝시티|밀리오레|디큐브시티|메세나폴리스|팜스퀘어|트레지오|테크노\s*마트|스카이시티몰|포도몰|현대시티|스타필드|이스트폴|퀸즈파크|메가스퀘어|와이즈파크|아일렉스|스타피카소|몰오브케이|쇼핑|롯데월드몰|가든파이브|IFC|Noon Square|눈스퀘어"),
    ("복합상업시설 내 입점(대형마트)", r"홈플러스|이마트|롯데마트|건영백화점"),
    ("복합상업시설 내 입점(역사)", r"민자역사|역사\s*\d|청량리역|신촌역|\(봉래동2가,서울역\)|서울역$"),
    ("대학 또는 교육시설 내 입점", r"대학교|대학\s|미디어관|ECC"),
    ("공공·문화시설 내 입점", r"문화회관|아트센터|문화일보홀|명보아트홀|경향아트힐|애니메이션센터|예장동 8-145|아리랑로 82|센트럴시티|구민회관"),
    ("주상복합건물 내 입점", r"롯데캐슬|주상복합|베네치아|자이|래미안|휴포레"),
    ("기타(호텔 내 입점)", r"호텔|이비스"),
]


# 사용자가 확인 시트(data/manual/occupancy_review.xlsx)에 적은 확정값이 있으면 자동 분류보다 우선한다
REVIEW = ROOT / "data" / "manual" / "occupancy_review.xlsx"


def occupancy_review():
    if not REVIEW.exists():
        return {}
    r = pd.read_excel(REVIEW, sheet_name="확인시트", dtype=str).fillna("")
    r = r[r["✍ 확정 입점 형태"].str.strip() != ""]
    return {x["operation_episode_id"]: x for x in r.to_dict("records")}


def occupancy(texts, use_names):
    blob = " ".join(texts)
    for label, pat in OCCUPANCY:
        m_ = re.search(pat, blob)
        if m_:
            return label, m_.group(0).strip(), "중(주소 문자열의 건물명)"
    return "확인 불가", "", ""


MULTI_BRAND = r"CGV|씨지브이|롯데시네마|메가박스|씨너스|프리머스|CINE\s*Q|씨네Q|MEGA"
INDIE_WORDS = r"독립영화|시네마테크|아트시네마|아트하우스|예술영화|예술관"


def build_table(m, links, t):
    ev = pd.read_csv(CLEAN / "seoul_events.csv")
    review = occupancy_review()
    ref = [x for x in json.load(open(ROOT / "data" / "raw" / "reference" / "ref_homepage_venues.json", encoding="utf-8")) if x["r"] == "S"]
    archive = json.load(open(ROOT / "data" / "raw" / "reference" / "ref_homepage_archive.json", encoding="utf-8"))
    corr = pd.read_csv(ROOT / "data" / "manual" / "corrections.csv", dtype=str).fillna("")
    user_closed = {kofic_key(r.old): f"{r.old} 폐관({r.date or r.year}) {r.note}".strip()
                   for _, r in corr.iterrows() if r.type in ("close", "confirm") and "사용자" in r.source}
    scr = pd.read_csv(CLEAN / "seoul_theater_year.csv")
    override_p = ROOT / "data" / "manual" / "theater_type.csv"
    override = {kofic_key(r["name"]): r for _, r in pd.read_csv(override_p, dtype=str).fillna("").iterrows() if r["type"]} if override_p.exists() else {}
    dong = [(f["properties"]["adm_nm"].split()[-1], f["properties"]["sggnm"], shape(f["geometry"]))
            for f in json.load(open(ROOT / "data" / "raw" / "boundaries" / "seoul_admdong_2023.geojson", encoding="utf-8"))["features"]]
    out = []
    for e, g in m.groupby("operation_episode_id"):
        g = g.sort_values("open")
        lk = links[links.operation_episode_id == e]
        kk = list(dict.fromkeys(lk.sort_values("year").kofic_key))
        # 같은 해 여러 KOFIC 극장이 붙으면 LOCALDATA 상호와 가장 닮은 극장만 속성 근거로(나머지는 동시 운영 극장)
        ldn = [norm_biz(x) for x in g["사업장명"]]
        knames = scr[scr.key.isin(kk)].sort_values("year").groupby("key").name.last().map(norm_biz)
        score = {k: max(sim(knames[k], x) + 0.5 * (brand(knames[k]) == brand(x) != "") for x in ldn) for k in kk}
        top = max(score.values(), default=0)
        own = []
        for y, gy in lk.groupby("year"):
            ks_y = [k for k in gy.kofic_key if not (top > 0 and score[k] == 0)]  # 상호가 전혀 안 닮은 극장 = 동시 운영 손님
            best = max((score[k] for k in ks_y), default=None)
            own += [(k, y) for k in ks_y if score[k] == best]
        guests = sorted({k for k in kk if k not in {a for a, _ in own}})
        ky = scr.merge(pd.DataFrame(own, columns=["key", "year"]), on=["key", "year"])
        kk_own = [k for k in kk if k not in guests]
        active = g.active.any()
        status = "영업" if active else ("취소·말소" if g["영업상태명"].str.startswith("취소").all() else "폐업")
        open_d = g.open.min()
        close_d = None if active else g.close.max()
        xs, ys = g.x.dropna(), g.y.dropna()
        lon = lat = None
        if len(xs):
            lon, lat = TO_WGS.transform(xs.median(), ys.median())
        dname = dgu = ""
        if lon:
            p = Point(lon, lat)
            hit = next((d for d in dong if d[2].contains(p)), None)
            if hit:
                dname, dgu = hit[0], hit[1]
        ld_names = list(dict.fromkeys(g["사업장명"]))
        kof_hist = []
        for k in kk:
            rows_k = scr[(scr.key == k) & scr.year.isin(lk[lk.kofic_key == k].year)]
            nm = rows_k.sort_values("year").name.iloc[-1]
            kof_hist.append(f"{nm}({rows_k.year.min()}–{rows_k.year.max()})" + (" [동시 운영·별도 인허가 없음]" if k in guests else ""))
        # 유형
        ops = set(ky.operator.astype(str).str.strip())
        art = pd.to_numeric(ky.art_screens, errors="coerce").fillna(0)
        names_all = " ".join(ld_names + list(ky.name))
        refm = [x for x in ref if lon and abs(x["lon"] - lon) < 0.0008 and abs(x["lat"] - lat) < 0.0008
                and (open_d is pd.NaT or abs(x["o"] - open_d.year) <= 2)]
        typ, basis, note = "기타", "대기업 운영·독립예술 근거 없음", ""
        if ops & {"직영", "위탁"}:
            typ, basis = "멀티플렉스", "KOFIC 대기업 운영 여부(직영·위탁)"
            if (art > 0).any():
                note = f"복합 성격: 독립예술영화 전용관 {int(art.max())}관 운영(KOFIC)"
        elif (art > 0).any():
            typ, basis = "독립·예술영화관", "KOFIC 독립예술영화 전용관 수 > 0"
        elif re.search(INDIE_WORDS, names_all):
            typ, basis = "독립·예술영화관", "상호에 독립·예술영화 명칭"
        elif any(x["b"] == "indie" for x in refm):
            typ, basis = "독립·예술영화관", "참고 홈페이지 분류(독립·예술) — 근거 재확인 필요"
        elif re.search(MULTI_BRAND, names_all.upper()) or any(x["b"] in ("cgv", "lotte", "megabox") for x in refm):
            typ, basis = "멀티플렉스", "상호의 멀티플렉스 브랜드"
        subtype = ""
        if (g["공연장형태구분명"] == "자동차극장").any() or re.search("자동차", names_all):
            typ, basis, subtype = "기타", "LOCALDATA 공연장형태·상호: 자동차극장", "자동차극장"
        elif re.search(r"이동상영관|이동영화", names_all):
            typ, basis, subtype = "기타", "상호에 '이동상영관'", "이동상영관(고정 상영관 아님)"
        for k in kk:
            if k in override:
                typ, basis = override[k]["type"], override[k]["basis"] or "data/manual/theater_type.csv"
        # 충돌
        conflicts = []
        if len(kk):
            last_k = ky.year.max()
            if active and last_k < 2025:
                conflicts.append(f"LOCALDATA 영업 / KOFIC {last_k}년 이후 미수록")
            if not active and close_d is not None and pd.notna(close_d) and ky.year.max() > close_d.year:
                conflicts.append(f"LOCALDATA 폐업 {close_d.date()} / KOFIC {ky.year.max()}년까지 수록")
            first_k = ky.year.min()
            if pd.notna(open_d) and open_d.year > first_k:
                conflicts.append(f"LOCALDATA 개업 {open_d.date()} / KOFIC {first_k}년부터 수록")
        if not active and (close_d is None or pd.isna(close_d)):
            conflicts.append("폐업일 없음")
        if active and not len(kk) and pd.notna(open_d) and open_d.year < 2010:
            conflicts.append("LOCALDATA 영업 / KOFIC 2010~2025 목록에 한 번도 없음")
        if pd.notna(open_d) and (g.gu.iloc[0], open_d.date().isoformat()) in BULK_DATES:
            conflicts.append(f"개업일 {open_d.date()} = 같은 구 {BULK_DATES[(g.gu.iloc[0], open_d.date().isoformat())]}개 장소 공통 인허가일(일괄 등록일 의심)")
        ldj = norm_biz(ld_names[-1])
        aux = [a for a in archive if active and lon and abs(a["lon"] - lon) < 0.0015 and abs(a["lat"] - lat) < 0.0015
               and isinstance(a["c"], int) and "운영 중" not in a["now"]
               and sim(norm_biz(a["n"]), ldj) >= 2 and brand(norm_biz(a["n"])) == brand(ldj)]
        for a in aux:
            conflicts.append(f"보조자료(참고 홈페이지): {a['n']} {a['c']}년 폐관·{a['now']}")
        for k in kk:
            if active and k in user_closed:
                conflicts.append(f"사용자 확인: {user_closed[k]}")
        texts = list(g["지번주소"]) + list(g["도로명주소"]) + list(ky.address.astype(str))
        occ, bname, conf = occupancy(texts, ld_names)
        occ_url, occ_date, occ_note = "", VERIFIED if bname else "", "주소 문자열의 건물명 키워드로 분류(웹 출처 미확인)" if bname else "근거 자료 없음"
        rv = review.get(e)
        if rv is not None:  # 사용자 확인값
            occ, bname = rv["✍ 확정 입점 형태"].strip(), rv["✍ 건물명"].strip() or bname
            occ_url, occ_date, conf, occ_note = rv["✍ 근거 출처(URL·현장)"], rv["✍ 확인일"] or VERIFIED, "높(사용자 확인)", "확인 시트: " + rv["✍ 메모"]
        kys25 = ky[ky.year == 2025]
        out.append(dict(
            operation_episode_id=e, venue_id=g.venue_id.iloc[0], license_record_ids=";".join(g.license_record_id),
            license_count=len(g), license_active=int(g.active.sum()),
            source_name_localdata=" / ".join(ld_names[:6]), source_name_kofic=" → ".join(kof_hist),
            kofic_keys=";".join(kk),
            standardized_name=(ky.sort_values("year").name.iloc[-1] if len(ky) else norm_biz(ld_names[-1])),
            operation_status=status,
            open_date=open_d.date().isoformat() if pd.notna(open_d) else "",
            close_date=("" if active else (close_d.date().isoformat() if close_d is not None and pd.notna(close_d) else "자료 없음")),
            gu=g.gu.iloc[0] or dgu, dong=dname, lon=round(lon, 6) if lon else None, lat=round(lat, 6) if lat else None,
            address_jibun=g["지번주소"].iloc[-1], address_road=g["도로명주소"].iloc[-1],
            analysis_type=typ, type_basis=basis, type_note=note, facility_subtype=subtype,
            legal_status="영화상영관(LOCALDATA 인허가 업종)",
            kofic_years=",".join(map(str, sorted(set(ky.year)))),
            screens_kofic_latest=int(ky.sort_values("year").screens.iloc[-1]) if len(ky) and pd.notna(ky.sort_values("year").screens.iloc[-1]) else None,
            seats_kofic_latest=int(ky.sort_values("year").seats.iloc[-1]) if len(ky) and pd.notna(ky.sort_values("year").seats.iloc[-1]) else None,
            screens_kofic_2025=int(kys25.screens.sum()) if len(kys25) else None,
            seats_kofic_2025=int(kys25.seats.sum()) if len(kys25) and kys25.seats.notna().any() else None,
            data_source_status="LOCALDATA+KOFIC" if len(kk) else "LOCALDATA만",
            data_source_specs="스크린·좌석: KOFIC 연도별" if len(kk) else "스크린·좌석: 자료 없음(KOFIC 미수록)",
            source_conflict=" | ".join(conflicts),
            verification_date=VERIFIED,
            verification_note="상태·개업·폐업일 = LOCALDATA(1차 기준). " + ("충돌은 두 값을 보존" if conflicts else ""),
            building_occupancy_type=occ, building_name=bname, combined_use="", occupancy_source_url=occ_url,
            occupancy_verification_date=occ_date, occupancy_confidence=conf, occupancy_note=occ_note,
        ))
    return pd.DataFrame(out)


def kofic_only(links, t):
    """KOFIC에 있으나 LOCALDATA 운영구간과 연결되지 않은 극장(또는 다른 극장 구간에 얹힌 동시 운영 극장)."""
    unmatched = links[links.operation_episode_id.isna()].kofic_key.unique()
    multi = links.dropna().groupby(["operation_episode_id", "year"]).kofic_key.nunique()
    shared = links.dropna().merge(multi[multi > 1].rename("n").reset_index(), on=["operation_episode_id", "year"])
    names = t.sort_values("year").groupby("key").name.last()
    rows = [dict(kofic_key=k, name=names[k], reason="LOCALDATA 인허가 기록 없음") for k in unmatched]
    for k, g in shared.groupby("kofic_key"):
        rows.append(dict(kofic_key=k, name=names[k], reason=f"같은 건물 다른 극장의 LOCALDATA 구간({g.operation_episode_id.iloc[0]})에 연결 — 별도 인허가 기록 없음 가능"))
    return pd.DataFrame(rows)


def yearly(ep, t):
    data_date = pd.Timestamp(DATA_DATE)
    years = range(2000, data_date.year + 1)
    ep = ep.copy()
    ep["o"] = pd.to_datetime(ep.open_date, errors="coerce")
    ep["c"] = pd.to_datetime(ep.close_date.where(ep.close_date != "자료 없음"), errors="coerce")
    unknown_close = ep.operation_status.ne("영업") & ep.c.isna()
    bulk_open = ep.source_conflict.fillna("").str.contains("일괄 등록일")
    ep_type = ep.set_index("operation_episode_id").analysis_type
    lk = t.merge(pd.read_pickle(CLEAN / "_links.pkl"), left_on=["key", "year"], right_on=["kofic_key", "year"], how="left")
    lk["type"] = lk.operation_episode_id.map(ep_type).fillna("기타")
    det = pd.read_csv(CLEAN / "_screen_detail.csv") if (CLEAN / "_screen_detail.csv").exists() else None
    rows = []
    for ty in ["전체", "멀티플렉스", "독립·예술영화관", "기타"]:
        e = ep if ty == "전체" else ep[ep.analysis_type == ty]
        cum_o = cum_c = 0
        for y in years:
            y0, y1 = pd.Timestamp(f"{y}-01-01"), min(pd.Timestamp(f"{y}-12-31"), data_date)
            alive = (e.o <= y1) & (e.c.isna() & ~unknown_close[e.index] | (e.c >= y0))
            o_ = int(((e.o.dt.year == y) & ~bulk_open[e.index]).sum()); c_ = int((e.c.dt.year == y).sum())
            unsure = int(((e.o.dt.year == y) & bulk_open[e.index]).sum())
            cum_o += o_; cum_c += c_
            k = lk[(lk.year == y)] if ty == "전체" else lk[(lk.year == y) & (lk.type == ty)]
            sp = None
            if det is not None and y in set(det.year):
                d = det[det.year == y]
                d = d if ty == "전체" else d[d.key.map(lambda x: lk[(lk.key == x) & (lk.year == y)].type.iloc[0] if len(lk[(lk.key == x) & (lk.year == y)]) else "기타") == ty]
                sp = int((d.is_special.astype(str).str.upper() == "Y").sum())
            rows.append(dict(type=ty, year=y, partial=y == data_date.year, operating=int(alive.sum()), opened=o_, opened_unsure=unsure, closed=c_,
                             cum_opened=cum_o, cum_closed=cum_c,
                             screens=int(k.screens.sum()) if len(k) else None, seats=int(k.seats.sum()) if len(k) else None,
                             special=sp, kofic_n=len(k) if len(k) else None))
    return pd.DataFrame(rows)


def main():
    m = venues(load_localdata())
    m = episodes(m)
    t = kofic_theaters()
    links, _ = link_kofic(m, t)
    m, log = split_concurrent(m, links, t)
    links, _ = link_kofic(m, t)
    links = inherit_lineage(links, t)
    links.to_pickle(CLEAN / "_links.pkl")
    bulk = m.groupby(["gu", "인허가일자"]).venue_id.nunique()
    BULK_DATES.update({k: v for k, v in bulk[bulk >= 4].items()})
    ep = build_table(m, links, t)
    ep.to_csv(CLEAN / "venues_episodes.csv", index=False, encoding="utf-8-sig")
    m.drop(columns=["keys"]).to_csv(CLEAN / "license_records.csv", index=False, encoding="utf-8-sig")
    links.to_csv(CLEAN / "kofic_episode_links.csv", index=False, encoding="utf-8-sig")
    ko = kofic_only(links, t)
    ko.to_csv(CLEAN / "kofic_only.csv", index=False, encoding="utf-8-sig")
    yearly(ep, t).to_csv(CLEAN / "yearly_series.csv", index=False, encoding="utf-8-sig")
    print("동시 운영 분리:", len(log), "건 / 구간", len(ep), "/ 장소", ep.venue_id.nunique())
    print(ep.groupby(["operation_status", "analysis_type"]).size().unstack(fill_value=0))
    print("KOFIC만:", len(ko))


BULK_DATES = {}  # (구, 인허가일자) → 같은 날짜를 가진 장소 수(4곳 이상이면 일괄 등록일 의심)
DATA_DATE = "2026-09-04"  # LOCALDATA 파일의 최신 데이터갱신시점

if __name__ == "__main__":
    main()
