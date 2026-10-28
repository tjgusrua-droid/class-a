import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CONFIG, TYPES, TYPE_STYLE, type TheaterType } from '../config'
import { building, centers, cultureCounts, subway, type Categorizer } from '../analysis'
import { located, mean, median, nearest, pct, type DataSet, type Theater } from '../data'
import { DataTable, DotPlot } from './charts'
import SeoulMap, { type Overlay } from './SeoulMap'
import { DataStatus, MapLegend, ready, saveSvg, Sym, TypeFilter } from './ui'

const STEPS = ['지하철 접근성', '중심지 체계', '상권 특성', '건축물 내 입점 형태', '문화시설과의 인접성', '영화관 간 인접성']
const GRAYS = ['#222', '#666', '#aaa', '#d6d6d6', '#eee']

// 유형별 범주 구성비(100% 막대). 범주 색은 유형 색과 겹치지 않게 회색 단계로
function CategoryBars({ ts, cat }: { ts: Theater[]; cat: Categorizer }) {
  return (
    <div className="catbars">
      <div className="catkey">{cat.categories.map((c, i) => <span key={c}><i style={{ background: GRAYS[i] }} /> {c}</span>)}</div>
      {TYPES.map((t) => {
        const xs = ts.filter((x) => x.type === t).map(cat.of).filter((x): x is string => !!x)
        return (
          <div key={t} className="catrow">
            <span><Sym type={t} /> {t} <small>n={xs.length}</small></span>
            <div>{cat.categories.map((c, i) => { const p = pct(xs.filter((x) => x === c).length, xs.length); return p > 0 && <i key={c} style={{ width: `${p}%`, background: GRAYS[i] }} title={`${c} ${p.toFixed(1)}%`}>{p >= 12 ? `${p.toFixed(0)}%` : ''}</i> })}</div>
          </div>
        )
      })}
      <small>단위: 유형 내 구성비(%)</small>
    </div>
  )
}

export default function LocationTabs({ data, snap, sel, setSel }: { data: DataSet; snap: Theater[]; sel: TheaterType | null; setSel: (t: TheaterType | null) => void }) {
  const [step, setStep] = useState(0)
  const [pick, setPick] = useState<string | null>(null)
  const [sameType, setSameType] = useState(false)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const svg = useRef<SVGSVGElement>(null)
  const pts = snap.filter(located)

  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.i))), { rootMargin: '-62% 0px -37% 0px' })
    refs.current.forEach((r) => r && io.observe(r))
    return () => io.disconnect()
  }, [])

  // 3-6 최근접 거리 (기준 연도 영업 중, 좌표 있는 영화관)
  const nn = useMemo(() => Object.fromEntries(pts.map((t) => [t.id, { any: nearest(t, pts), same: nearest(t, pts, true) }])), [snap])
  const picked = pts.find((t) => t.id === pick)
  const pn = picked && nn[picked.id][sameType ? 'same' : 'any']

  const ok = (k: Parameters<typeof ready>[1]) => ready(data, k)
  const cats: (Categorizer | null)[] = [
    ok(['subwayStations']) ? subway(data.subwayStations.data) : null,
    ok(['centers']) ? centers(data.centers.data) : null,
    null,
    ok(['building']) ? building(data.building.data) : null,
  ]
  const extras: Overlay[] = []
  if (step === 0 && ok(['subwayLines'])) extras.push({ id: 'sub-lines', data: data.subwayLines.data, layers: [{ type: 'line', paint: { 'line-color': '#888', 'line-width': 1.5 } }] })
  if (step === 0 && ok(['subwayStations'])) extras.push({ id: 'sub-st', data: data.subwayStations.data, layers: [
    { type: 'circle', paint: { 'circle-color': 'rgba(0,0,0,0.04)', 'circle-stroke-color': '#999', 'circle-stroke-width': 0.5,
      // 역세권 반경(m)을 화면 픽셀로: 512px 타일, 위도 37.55° 기준 1px = 62047/2^z m
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, CONFIG.stationRadiusM / 62047, 22, (CONFIG.stationRadiusM / 62047) * 2 ** 22] } },
    { type: 'circle', paint: { 'circle-radius': ['case', ['to-boolean', ['get', 'transfer']], 4, 2.5], 'circle-color': '#fff', 'circle-stroke-color': '#111', 'circle-stroke-width': ['case', ['to-boolean', ['get', 'transfer']], 2.5, 1] } }] })
  if (step === 1 && ok(['centers'])) extras.push({ id: 'centers', data: data.centers.data, layers: [{ type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#000', 'fill-opacity': 0.08, 'fill-outline-color': '#333' } }] })
  if (step === 4 && ok(['culture'])) extras.push({ id: 'culture', data: data.culture.data, layers: [{ type: 'circle', paint: { 'circle-radius': 2.5, 'circle-color': '#fff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1 } }] })

  const panel = (i: number): ReactNode => {
    if (i === 0) return cats[0] ? <CategoryBars ts={pts} cat={cats[0]} /> :
      <DataStatus data={data} need={['subwayLines', 'subwayStations']} note={<>범주: 비역세권 · 일반역 역세권 · 환승역 역세권. 역세권 기준 {CONFIG.stationRadiusM}m (<code>config.ts</code>에서 변경).</>} />
    if (i === 1) return cats[1] ? <CategoryBars ts={pts} cat={cats[1]} /> :
      <DataStatus data={data} need={['centers']} note="2040 서울도시기본계획 3도심·7광역중심·12지역중심의 범위(폴리곤)가 필요합니다. 점 좌표만 있으면 범위를 임의로 그리지 않습니다." />
    if (i === 2) return <DataStatus data={data} need={['commerce']} title="상권 지표 검토 중" note="서울시 상권활성화지수와 상권 추정매출·점포 지표는 서로 다른 개념이라 따로 받습니다(indicator 필드). 지표가 확정되면 상권 폴리곤을 단계색으로 표시합니다." />
    if (i === 3) return <>
      <p className="note">‘영화관 중심의 독립 건물’은 건물 형태를 뜻하며, 운영 유형인 ‘독립극장’과 다른 개념입니다. 복합용도 건물은 판매·문화공공·업무주거 등·복수 용도로 다시 나눕니다.</p>
      {cats[3] ? <CategoryBars ts={pts} cat={cats[3]} /> : <DataStatus data={data} need={['building']} />}
    </>
    if (i === 4) return ok(['culture']) ? <CultureTable ts={pts} fc={data.culture.data} /> :
      <DataStatus data={data} need={['culture']} note={<>「문화예술진흥법」 시행령 별표 1 기준 문화시설(영화관 제외). 반경 {CONFIG.cultureRadiusM}m (<code>config.ts</code>에서 1km로 변경 가능). 가깝다는 사실이 시설 간 연계를 뜻하지는 않습니다.</>} />
    return <>
      <div className="row ui">
        <div className="seg"><button aria-pressed={!sameType} onClick={() => setSameType(false)}>가장 가까운 영화관</button><button aria-pressed={sameType} onClick={() => setSameType(true)}>가장 가까운 같은 유형</button></div>
        <button className="link" onClick={() => saveSvg(svg.current, '3-6_최근접거리')}>SVG 저장</button>
      </div>
      <DotPlot ref={svg} title="유형별 최근접 영화관까지 거리" unit="km" selected={pick} onPick={setPick}
        groups={TYPES.filter((t) => !sel || t === sel).map((t) => ({ key: t, type: t, items: pts.filter((x) => x.type === t && nn[x.id][sameType ? 'same' : 'any'])
          .map((x) => ({ id: x.id, v: nn[x.id][sameType ? 'same' : 'any']!.dist / 1000, label: x.name })) }))} />
      <p className="note">{CONFIG.snapshotYear}년 말 영업 중이고 좌표가 있는 {pts.length}곳. 같은 건물의 영화관끼리는 거리가 0입니다. 점이나 지도의 영화관을 누르면 최근접 영화관까지 선을 긋습니다.
        {picked && pn && <><br /><b>{picked.name}</b> → {pn.theater.name} ({pn.theater.type}, {pn.theater.status}) {(pn.dist / 1000).toFixed(2)}km</>}</p>
    </>
  }

  return (
    <div className="loc">
      <nav className="steps ui" aria-label="입지 항목">
        {STEPS.map((s, i) => <button key={s} aria-current={step === i} onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth' })}>{i + 1}. {s}</button>)}
      </nav>
      <div className="loc-grid">
        <div className="loc-map">
          <SeoulMap data={data} label="입지 특성 지도" highlight={sel} extras={extras}
            points={pts.map((t) => ({ t, mark: 'fill' }))}
            line={step === 5 && picked && pn ? [[picked.lon!, picked.lat!], [pn.theater.lon!, pn.theater.lat!]] : null}
            onSelect={(ts) => setPick(ts[0]?.id ?? null)} />
          <MapLegend types={[...TYPES]} marks={['fill']} extra={<>
            {extras.some((e) => e.id === 'sub-st') && <span>○ 일반역 · ◎ 환승역 · 옅은 원 = 역세권 {CONFIG.stationRadiusM}m</span>}
            {extras.some((e) => e.id === 'centers') && <span>회색 면 = 중심지 범위</span>}
            {extras.some((e) => e.id === 'culture') && <span>○ 문화시설</span>}
            {step === 5 && picked && <span>- - 최근접 연결선</span>}
          </>} />
        </div>
        <div className="loc-steps">
          {STEPS.map((s, i) => (
            <div key={s} className="step" data-i={i} ref={(r) => (refs.current[i] = r)}>
              <p className="eyebrow">3-{i + 1}</p>
              <h3>{s}</h3>
              {i === 5 && <TypeFilter value={sel} onChange={setSel} />}
              {panel(i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CultureTable({ ts, fc }: { ts: Theater[]; fc: any }) {
  const rows = TYPES.map((t) => {
    const xs = ts.filter((x) => x.type === t).map((x) => cultureCounts(fc, x))
    const cats = [...new Set(xs.flatMap(Object.keys))]
    return { t, n: xs.length, cats: cats.map((c) => ({ c, med: median(xs.map((x) => x[c] ?? 0)), avg: mean(xs.map((x) => x[c] ?? 0)), share: pct(xs.filter((x) => (x[c] ?? 0) > 0).length, xs.length) })) }
  })
  return <>
    {rows.map((r) => <p key={r.t} style={{ color: TYPE_STYLE[r.t].color }}><b>{r.t}</b> n={r.n}</p>)}
    <DataTable caption={`영화관 반경 ${CONFIG.cultureRadiusM}m 내 문화시설`} head={['유형', '분류', '중앙값(개)', '평균(개)', '1개 이상 있는 비율(%)']}
      rows={rows.flatMap((r) => r.cats.map((c) => [r.t, c.c, c.med, c.avg.toFixed(2), c.share.toFixed(1)]))} />
  </>
}
