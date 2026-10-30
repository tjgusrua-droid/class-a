import { useRef, useState } from 'react'
import { SOURCES, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { f1, jo, mean, median, pct, sum, topBy, type Venue, openYear } from '../data'
import { BoxDot, DataTable, ShareBars } from './charts'
import { atYear, survOf } from './SurvivalSection'
import { saveSvg, Seg, SourceNote, Sym, More } from './ui'
import { TypeIsometric } from './Isometric'

// 한두 문장으로 된 쉬운 설명(영화진흥위원회 구분 기준). 작은영화관(영화관 없는 군 지역의 공공 영화관)은 서울에 없어 뺀다
const EASY: Record<VenueType, string> = {
  멀티플렉스: '대기업 4대 체인(CGV·롯데시네마·메가박스·씨네Q) 브랜드로 운영하는 복합 상영관입니다. 본사가 직접 운영하는 직영점과, 지역 사업자가 브랜드·예매망을 빌려 쓰는 위탁점이 있습니다.',
  '독립·예술영화전용관': '상업영화 비중을 줄이고 독립영화·예술영화를 일정 비율 이상 전문적으로 상영하도록 지정·지원받는 전용 극장입니다.',
  일반영화관: '대기업 체인에 속하지 않고 개인·회사가 독자적으로 운영하는 극장입니다(비체인). 서울극장·대한극장 같은 옛 개봉관과 단관 극장이 여기에 속합니다.',
}

// 분류 차원별 설명. 법적 지위 칸은 원문을 이 환경에서 확인하지 못해 '확인 필요'로 둔다
const DEF: Record<VenueType, { legal: string; analytic: string; rule: string }> = {
  멀티플렉스: {
    legal: '법령상 별도 유형 아님 — 모두 「영화 및 비디오물의 진흥에 관한 법률」의 영화상영관(LOCALDATA 업종 ‘영화상영관’). 조문 원문 확인 필요',
    analytic: '영화진흥위원회 구분 ‘멀티플렉스 체인’(5개 이상 스크린 또는 4대 체인 브랜드 운영). 이 연구에서는 체인 운영 여부로 판단',
    rule: '① KOFIC 극장 현황 운영형태가 직영·위탁 → ② (KOFIC 미수록 시) 상호의 4대 체인 브랜드(CGV·롯데시네마·메가박스·씨네Q, 합쳐진 옛 체인 씨너스·프리머스 포함). 직영·위탁은 KOFIC 가장 최근 연도 값',
  },
  '독립·예술영화전용관': {
    legal: '법령상 별도 유형 아님(영화상영관). KOFIC 극장 현황에 ‘독립예술영화 전용관 수’ 항목이 있음(2019년~)',
    analytic: '영화진흥위원회 구분 ‘독립·예술영화전용관’',
    rule: '① KOFIC 독립예술영화 전용관 수 > 0(체인 소속이 아닐 때) → ② 상호의 독립·예술영화 명칭(시네마테크·아트시네마·독립영화전용관 등) → ③ 참고 홈페이지 분류(근거 재확인 필요로 표시)',
  },
  일반영화관: {
    legal: '영화상영관(LOCALDATA). 자동차극장·이동상영관도 체인이 아니어서 여기에 넣고 세부 구분으로 표시',
    analytic: '영화진흥위원회 구분 ‘일반영화관(비체인계)’. 스크린이 5개 이상이어도 체인이 아니면 여기(서울극장 8관·대한극장 11관·아트레온 9관 등)',
    rule: '4대 체인이 아니고 독립·예술영화전용관 근거도 없는 곳',
  },
}

// 유형 특징 한 장: 계산한 값 다섯 가지(상영관·좌석·있는 곳·층·문 연 시기·오래 남는 정도)
function Traits({ t, open, all }: { t: VenueType; open: Venue[]; all: Venue[] }) {
  const xs = open.filter((v) => v.type === t), k = xs.filter((v) => v.screens25 != null)
  const pick = (vals: string[]) => { const c: Record<string, number> = {}; vals.forEach((x) => (c[x] = (c[x] ?? 0) + 1)); const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return top ? { k: top[0], p: Math.round((top[1] / vals.length) * 100), n: vals.length } : null }
  const occ = pick(xs.filter((v) => v.occupancy !== '확인 불가').map((v) => v.occupancy.replace(' 내 입점', '').replace('기타(', '').replace(')', '').replace('복합상업시설(', '')))
  const fl = pick(xs.filter((v) => v.floor != null).map((v) => (v.floor! < 0 ? '지하' : v.floor! <= 3 ? '1~3층' : '4층 이상')))
  // 문 연 시기는 지금까지 있었던 곳 전체(폐업 포함)로: 오래된 극장은 대부분 문을 닫아 영업 중인 곳만 보면 빠진다
  // 행안부 인허가일은 2000년대 초 재등록 날짜가 많아 시기 비율은 믿기 어렵다 → 실제 개관 연도가 확인된 가장 오래된 곳을 보여 준다
  const allT = all.filter((v) => v.type === t)
  const oldest = [...allT].filter((v) => openYear(v) != null).sort((a, b) => openYear(a)! - openYear(b)!)[0]
  const s20 = atYear(survOf(all.filter((v) => v.type === t)), 20)
  const scr = k.length ? median(k.map((v) => v.screens25!)) : null, seat = k.filter((v) => v.seats25 != null).map((v) => v.seats25!)
  const rows: [string, string, string][] = [
    ['상영관', scr == null ? '자료 없음' : `${+scr.toFixed(1)}개`, `좌석 ${seat.length ? Math.round(median(seat)).toLocaleString() : '—'}석 · 중앙값`],
    ['주 입점', occ ? occ.k : '확인 중', occ ? `확인된 ${occ.n}곳 중 ${occ.p}%` : ''],
    ['층', fl ? fl.k : '확인 중', fl ? `층이 적힌 ${fl.n}곳 중 ${fl.p}%` : ''],
    ['가장 오래됨', oldest ? `${openYear(oldest)}년` : '—', oldest ? `${oldest.name.replace('아산 M ', '')}${oldest.founded ? ' · 실제 개관' : ' · 등록일 기준'}` : ''],
    ['20년 생존', `${Math.round(s20 * 100)}%`, '생존곡선 기준'],
  ]
  return <dl className="traits">{rows.map(([a, b, c]) => <div key={a}><dt>{a}</dt><dd><b>{b}</b><small>{c}</small></dd></div>)}</dl>
}

export default function TypeComparison({ open, all }: { open: Venue[]; all: Venue[] }) {
  const [sel, setSel] = useState<VenueType | null>(null) // 이 장면에서만 쓰는 선택
  const [rangeOf, setRangeOf] = useState<'screens' | 'seats' | 'per'>('screens')
  const svg = useRef<SVGSVGElement>(null), svg2 = useRef<SVGSVGElement>(null)
  const by = (t: VenueType) => open.filter((v) => v.type === t)
  const k = (t: VenueType) => by(t).filter((v) => v.screens25 != null) // KOFIC 2025 속성이 있는 곳
  const S = Object.fromEntries(TYPES.map((t) => {
    const xs = k(t)
    return [t, { n: by(t).length, nk: xs.length, screens: sum(xs.map((v) => v.screens25)), seats: sum(xs.map((v) => v.seats25)),
      special: xs.filter((v) => (v.special25 ?? 0) > 0).length, art: xs.filter((v) => (v.art25 ?? 0) > 0).length }]
  })) as Record<VenueType, { n: number; nk: number; screens: number; seats: number; special: number; art: number }>
  const ops = (t: VenueType) => topBy(k(t), (v) => (v.operator25 === '~' ? '비해당' : v.operator25), 3).map(([a, b]) => `${a} ${b}`).join(' · ') || '자료 없음'
  const occ = (t: VenueType) => topBy(by(t).filter((v) => v.occupancy !== '확인 불가'), (v) => v.occupancy, 1)[0]
  const ex = (t: VenueType) => [...k(t)].sort((a, b) => (b.screens25 ?? 0) - (a.screens25 ?? 0)).slice(0, 2).map((v) => `${v.name}(${v.screens25}관)`).join(', ')
  const metric = (f: (v: Venue) => number | null) => TYPES.filter((t) => !sel || t === sel).map((t) => ({
    key: t, type: t, items: k(t).map((v) => ({ id: v.id, v: f(v) ?? NaN, label: v.name })).filter((x) => isFinite(x.v)) }))

  return (
    <>
      <div className="deftable" role="table" aria-label="유형별 정의와 특성">
        {TYPES.map((t) => {
          const xs = k(t), o = occ(t)
          return (
            <div key={t} className={`col ${sel && sel !== t ? 'dim' : ''}`} role="rowgroup" onClick={() => setSel(sel === t ? null : t)} tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSel(sel === t ? null : t)}>
              <h3 style={{ borderColor: TYPE_STYLE[t].color }}><Sym type={t} /> {t} <small>{S[t].n}곳{t === '멀티플렉스' ? ` · 직영 ${by(t).filter((v) => v.chainOp === '직영').length} · 위탁 ${by(t).filter((v) => v.chainOp === '위탁').length}` : ''}</small></h3>
              <p className="easy">{EASY[t]}</p>
              <TypeIsometric type={t} screens={xs.length ? median(xs.map((v) => v.screens25!)) : null} />
              <Traits t={t} open={open} all={all} />
              <span onClick={(e) => e.stopPropagation()}><More label="분류 근거·세부 특성">
              <dl>
                <dt>법적·제도적 지위</dt><dd>{DEF[t].legal}</dd>
                <dt>분석용 분류 여부</dt><dd>{DEF[t].analytic}</dd>
                <dt>분류 기준(근거 순서)</dt><dd>{DEF[t].rule}</dd>
                <dt>운영주체(KOFIC 2025)</dt><dd>{ops(t)} <small>n={xs.length}</small></dd>
                <dt>상영 프로그램</dt><dd>독립예술영화 전용관 보유 {S[t].art}곳 / {xs.length}곳</dd>
                <dt>스크린·좌석(중앙값 / 평균)</dt><dd className="num">{f1(median(xs.map((v) => v.screens25!)))} / {f1(mean(xs.map((v) => v.screens25!)))}관 · {Math.round(median(xs.filter((v) => v.seats25 != null).map((v) => v.seats25!))) || '—'} / {Math.round(mean(xs.filter((v) => v.seats25 != null).map((v) => v.seats25!))) || '—'}석</dd>
                <dt>1관당 좌석(전체 합 기준)</dt><dd className="num">{S[t].screens ? Math.round(S[t].seats / S[t].screens) : '—'}석</dd>
                <dt>특별관 보유</dt><dd>{S[t].special}곳 / {xs.length}곳 ({f1(pct(S[t].special, xs.length))}%)</dd>
                <dt>대표 입점 형태</dt><dd>{o ? `${o[0]} ${o[1]}곳` : '확인 불가'} <small>(확인 불가 {by(t).filter((v) => v.occupancy === '확인 불가').length}곳)</small></dd>
                <dt>대표 사례(스크린 상위)</dt><dd>{ex(t) || '자료 없음'}</dd>
              </dl></More></span>
            </div>)
        })}
      </div>
      <div className="split even charts2">
        <div>
          <p className="chart-title">유형별 구성비 <small>개소 = LOCALDATA 영업 {open.length}곳 · 스크린·좌석 = KOFIC 2025 수록 {sum(TYPES.map((t) => S[t].nk))}곳</small></p>
          <ShareBars ref={svg} title="유형별 개소·스크린·좌석 구성비" highlight={sel} onPick={setSel} rows={[
            { label: '영화관', unit: '곳', values: Object.fromEntries(TYPES.map((t) => [t, S[t].n])) as any },
            { label: '스크린', unit: '개', values: Object.fromEntries(TYPES.map((t) => [t, S[t].screens])) as any },
            { label: '좌석', unit: '석', values: Object.fromEntries(TYPES.map((t) => [t, S[t].seats])) as any },
          ]} />
          <button className="ui link" onClick={() => saveSvg(svg.current, '1_구성비')}>SVG 저장</button>
        </div>
        <div>
          <p className="chart-title">유형별 규모의 범위 <Seg label="범위 지표" value={rangeOf} onChange={setRangeOf} options={[{ v: 'screens' as const, label: '시설당 스크린' }, { v: 'seats' as const, label: '시설당 좌석' }, { v: 'per' as const, label: '1관당 좌석' }]} /></p>
          <BoxDot ref={svg2} title="유형별 규모의 범위" xlabel={rangeOf === 'screens' ? '영화관 한 곳의 스크린 수' : rangeOf === 'seats' ? '영화관 한 곳의 좌석 수' : '상영관 하나의 좌석 수'} unit={rangeOf === 'screens' ? '개' : rangeOf === 'seats' ? '석' : '석/관'} rowH={44}
            groups={metric(rangeOf === 'screens' ? (v) => v.screens25 : rangeOf === 'seats' ? (v) => v.seats25 : (v) => (v.seats25 && v.screens25 ? v.seats25 / v.screens25 : null))} />
          <p className="legendnote">점 = 영화관 · 상자 = 가운데 50% · 굵은 선 = 중앙값 · ◇ = 평균</p>
        </div>
      </div>
      <p className="takeaway">{(() => {
        const sh = (t: VenueType) => ({ a: pct(S[t].n, open.length), b: pct(S[t].screens, sum(TYPES.map((x) => S[x].screens))) })
        const up = TYPES.filter((t) => sh(t).b > sh(t).a), down = TYPES.filter((t) => sh(t).b < sh(t).a)
        return <>스크린 비중이 개소 비중보다 {up.map((t) => `${TYPE_STYLE[t].short}는 크고(${f1(sh(t).a)}% → ${f1(sh(t).b)}%)`).join(', ')}{down.length ? `, ${down.map((t) => `${TYPE_STYLE[t].short}(${f1(sh(t).a)}% → ${f1(sh(t).b)}%)`).join('·')}는 작습니다` : ''}.</>
      })()}</p>
      <More label="자료·기준"><SourceNote source={SOURCES.venues} n={<>영업 {open.length}곳(유형별 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${S[t].n}`).join(' · ')}), 스크린·좌석은 KOFIC 2025 수록분만({TYPES.map((t) => `${TYPE_STYLE[t].short} ${S[t].nk}`).join(' · ')})</>}
        caution="LOCALDATA에만 있는 영업 기록은 스크린·좌석 자료가 없어 그래프에서 빠집니다. 유형은 분석용 분류이며 법적 구분이 아닙니다." /></More>
      <DataTable caption="유형별 규모(영업 중)" head={['유형', '영업(곳)', 'KOFIC 수록(곳)', '스크린(개)', '좌석(석)', '특별관 보유(곳)']}
        rows={TYPES.map((t) => [t, S[t].n, S[t].nk, S[t].screens, S[t].seats, S[t].special])} />
    </>
  )
}
