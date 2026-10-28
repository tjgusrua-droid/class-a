import { useRef } from 'react'
import { SOURCES, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { f1, mean, median, pct, sum, topBy, type Venue } from '../data'
import { BoxDot, DataTable, ShareBars } from './charts'
import { saveSvg, SourceNote, Sym } from './ui'

// 분류 차원별 설명. 법적 지위 칸은 원문을 이 환경에서 확인하지 못해 '확인 필요'로 둔다
const DEF: Record<VenueType, { legal: string; analytic: string; rule: string }> = {
  멀티플렉스: {
    legal: '법령상 별도 유형 아님 — 모두 「영화 및 비디오물의 진흥에 관한 법률」의 영화상영관(LOCALDATA 업종 ‘영화상영관’). 조문 원문 확인 필요',
    analytic: '분석용 분류(연구자 정의)',
    rule: '① KOFIC 극장 현황 ‘대기업 운영 여부’가 직영·위탁 → ② (KOFIC 미수록 시) 상호의 멀티플렉스 브랜드(CGV·롯데시네마·메가박스·씨너스·프리머스·씨네Q)',
  },
  '독립·예술영화관': {
    legal: '법령상 별도 유형 아님(영화상영관). KOFIC 극장 현황에 ‘독립예술영화 전용관 수’ 항목이 있음(2019년~)',
    analytic: '분석용 분류(연구자 정의)',
    rule: '① KOFIC 독립예술영화 전용관 수 > 0 → ② 상호의 독립·예술영화 명칭(시네마테크·아트시네마·독립영화전용관 등) → ③ 참고 홈페이지 분류(근거 재확인 필요로 표시)',
  },
  기타: {
    legal: '영화상영관(LOCALDATA). 자동차극장·이동상영관은 LOCALDATA 공연장형태·상호로 구분',
    analytic: '분석용 잔여 범주 — 위 두 유형의 근거가 없는 시설',
    rule: '대기업 운영·독립예술 근거 없음. 근거 부족 시설은 ‘유형 근거 없음’으로 표시',
  },
}

export default function TypeComparison({ open, sel, setSel }: { open: Venue[]; sel: VenueType | null; setSel: (t: VenueType | null) => void }) {
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
              <h3 style={{ borderColor: TYPE_STYLE[t].color }}><Sym type={t} /> {t} <small>{S[t].n}곳</small></h3>
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
              </dl>
            </div>)
        })}
      </div>
      <div className="split even">
        <div>
          <p className="chart-title">유형별 구성비 — 개소는 LOCALDATA 영업 {open.length}곳, 스크린·좌석은 KOFIC 2025 수록 {sum(TYPES.map((t) => S[t].nk))}곳</p>
          <ShareBars ref={svg} title="유형별 개소·스크린·좌석 구성비" highlight={sel} onPick={setSel} rows={[
            { label: '영화관', unit: '곳', values: Object.fromEntries(TYPES.map((t) => [t, S[t].n])) as any },
            { label: '스크린', unit: '개', values: Object.fromEntries(TYPES.map((t) => [t, S[t].screens])) as any },
            { label: '좌석', unit: '석', values: Object.fromEntries(TYPES.map((t) => [t, S[t].seats])) as any },
          ]} />
          <button className="ui link" onClick={() => saveSvg(svg.current, '1_구성비')}>SVG 저장</button>
        </div>
        <div>
          <p className="chart-title">시설당 스크린 수 — 단위가 다른 값은 그래프를 나눠 봅니다</p>
          <BoxDot ref={svg2} title="유형별 시설당 스크린 수" unit="개" rowH={52} groups={metric((v) => v.screens25)} />
          <p className="chart-title">시설당 좌석 수</p>
          <BoxDot title="유형별 시설당 좌석 수" unit="석" rowH={52} groups={metric((v) => v.seats25)} />
          <p className="chart-title">1관당 좌석 수</p>
          <BoxDot title="유형별 1관당 좌석 수" unit="석/관" rowH={52} groups={metric((v) => (v.seats25 && v.screens25 ? v.seats25 / v.screens25 : null))} />
        </div>
      </div>
      <p className="takeaway">{TYPES.map((t) => {
        const a = pct(S[t].n, open.length), b = pct(S[t].screens, sum(TYPES.map((x) => S[x].screens)))
        return `${t}는 영업 영화관의 ${f1(a)}%, KOFIC 수록 스크린의 ${f1(b)}%로 스크린 비중이 개소 비중보다 ${b > a ? '컸다' : b < a ? '작았다' : '같았다'}.`
      }).join(' ')}</p>
      <SourceNote source={SOURCES.venues} n={<>영업 {open.length}곳(유형별 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${S[t].n}`).join(' · ')}), 스크린·좌석은 KOFIC 2025 수록분만({TYPES.map((t) => `${TYPE_STYLE[t].short} ${S[t].nk}`).join(' · ')})</>}
        caution="LOCALDATA에만 있는 영업 기록은 스크린·좌석 자료가 없어 그래프에서 빠집니다. 유형은 분석용 분류이며 법적 구분이 아닙니다." />
      <DataTable caption="유형별 규모(영업 중)" head={['유형', '영업(곳)', 'KOFIC 수록(곳)', '스크린(개)', '좌석(석)', '특별관 보유(곳)']}
        rows={TYPES.map((t) => [t, S[t].n, S[t].nk, S[t].screens, S[t].seats, S[t].special])} />
    </>
  )
}
