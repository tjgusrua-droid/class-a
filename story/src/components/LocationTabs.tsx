import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CONFIG, CULTURE_CATS, TYPES, TYPE_STYLE, type TheaterType } from '../config'
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
  const [cultOn, setCultOn] = useState<string[]>(CULTURE_CATS)
  const cultSvg = useRef<SVGSVGElement>(null)
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
  if (step === 4 && ok(['culture'])) extras.push({ id: 'culture',
    data: { ...data.culture.data, features: data.culture.data.features.filter((f: any) => cultOn.includes(f.properties.category)) },
    layers: [{ type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 14, 4], 'circle-color': '#fff', 'circle-stroke-color': '#444', 'circle-stroke-width': 1 } }] })

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
    if (i === 4) return ok(['culture']) ? <>
      <div className="chips ui" role="group" aria-label="문화시설 분류">
        {CULTURE_CATS.map((c) => <label key={c}><input type="checkbox" checked={cultOn.includes(c)}
          onChange={() => setCultOn(cultOn.includes(c) ? cultOn.filter((x) => x !== c) : CULTURE_CATS.filter((x) => x === c || cultOn.includes(x)))} /> {c}</label>)}
      </div>
      <CultureChart ref={cultSvg} ts={pts.filter((t) => !sel || t.type === sel)} fc={data.culture.data} cats={cultOn} />
      <p className="note">영화관 반경 {CONFIG.cultureRadiusM}m 안의 문화시설(영화관 제외, {data.culture.data.features.length.toLocaleString()}곳). 막대 = 해당 분류가 1곳 이상 있는 영화관 비율, 숫자 = 영화관당 개수의 중앙값·평균. 가깝다는 사실이 시설 간 협력이나 이용 연계를 뜻하지는 않습니다.</p>
      <button className="ui link" onClick={() => saveSvg(cultSvg.current, '3-5_문화시설_인접성')}>SVG 저장</button>
    </> :
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

// 3-5: 분류(행) × 유형(막대). 반경 안에 1곳 이상 있는 영화관 비율과 개수 중앙값·평균
const CultureChart = forwardRef<SVGSVGElement, { ts: Theater[]; fc: any; cats: string[] }>(function CultureChart({ ts, fc, cats }, ref) {
  const counts = useMemo(() => new Map(ts.map((t) => [t.id, cultureCounts(fc, t)])), [ts, fc])
  const types = TYPES.filter((t) => ts.some((x) => x.type === t))
  const W = 560, l = 132, bh = 11, rowH = types.length * (bh + 3) + 16, top = 26
  const H = top + cats.length * rowH + 36
  const rows = cats.map((c) => types.map((t) => {
    const xs = ts.filter((x) => x.type === t).map((x) => counts.get(x.id)?.[c] ?? 0)
    return { t, share: pct(xs.filter((v) => v > 0).length, xs.length), med: median(xs), avg: mean(xs) }
  }))
  const sx = (p: number) => l + (p / 100) * (W - l - 160)
  return (
    <>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="유형별 문화시설 인접성">
        <title>영화관 반경 {CONFIG.cultureRadiusM}m 안 문화시설 — 유형별</title>
        <g fontSize="10.5" fill="#444">
          {types.map((t, i) => <text key={t} x={l + i * 112} y={12}>{TYPE_STYLE[t].mark} {t} n={ts.filter((x) => x.type === t).length}</text>)}
        </g>
        {[0, 50, 100].map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={top - 6} y2={H - 32} stroke="#eee" /><text x={sx(v)} y={H - 20} fontSize="10" textAnchor="middle" fill="#555">{v}%</text></g>)}
        {rows.map((r, j) => (
          <g key={cats[j]} transform={`translate(0,${top + j * rowH})`}>
            <text x={0} y={bh + 2} fontSize="11.5" fontWeight="600">{cats[j]}</text>
            {r.map((x, i) => (
              <g key={x.t} transform={`translate(0,${i * (bh + 3)})`}>
                <rect x={l} y={0} width={Math.max(0.5, sx(x.share) - l)} height={bh} fill={TYPE_STYLE[x.t].color} />
                <text x={sx(x.share) + 4} y={bh - 1} fontSize="9.5" fill="#333">{x.share.toFixed(0)}% · 중앙값 {x.med} · 평균 {x.avg.toFixed(1)}</text>
              </g>
            ))}
          </g>
        ))}
        <text x={l} y={H - 4} fontSize="10" fill="#555">막대: 1곳 이상 있는 영화관 비율(%) · 숫자 단위: 곳</text>
      </svg>
      <DataTable caption={`영화관 반경 ${CONFIG.cultureRadiusM}m 내 문화시설`} head={['분류', '유형', '1곳 이상(%)', '중앙값(곳)', '평균(곳)']}
        rows={rows.flatMap((r, j) => r.map((x) => [cats[j], x.t, x.share.toFixed(1), x.med, x.avg.toFixed(2)]))} />
    </>
  )
})
