import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CENTER_COLOR, CENTER_LEVELS, CULTURE_CATS, CULTURE_RADII, OCC_COLOR, OCCUPANCY, RADII, SOURCES, TYPES, TYPE_STYLE, type VenueType } from '../config'
import { distM, f1, jo, located, median, nearest, pct, type DataSet, type Venue } from '../data'
import { CountBars, DataTable, Donut, MeanBars } from './charts'
import { OccupancyTiles } from './Isometric'
import SeoulMap, { regionOverlay, stationOverlay, type Overlay } from './SeoulMap'
import { DataStatus, Finding, MapLegend, Seg, SourceNote, Sym, TypeToggles, More } from './ui'

const STEPS = ['지하철 접근성', '서울시 중심지 체계', '상권 특성', '건축적 입점 형태', '문화시설 인접성', '영화관 간 인접성']
const NO_MAP = [2, 3] // 지도가 필요 없는 단계(상권 자료 없음, 입점 형태는 모식도로)
const GRAYS = ['#222', '#6a6a6a', '#aaa', '#dcdcdc']
const BANDS = ['500m 이내', '0.5~1km', '1~2km', '2km 초과']
const band = (m: number) => BANDS[m <= 500 ? 0 : m <= 1000 ? 1 : m <= 2000 ? 2 : 3]
const BUF_COLOR = '#3a3f47'

// 유형별 범주 구성비(100% 막대)
function CategoryBars({ vs, cats, of, title }: { vs: Venue[]; cats: string[]; of: (v: Venue) => string | null; title: string }) {
  return (
    <div className="catbars" aria-label={title}>
      <div className="catkey">{cats.map((c, i) => <span key={c}><i style={{ background: GRAYS[i] }} /> {c}</span>)}</div>
      {TYPES.map((t) => {
        const xs = vs.filter((v) => v.type === t).map(of).filter((x): x is string => !!x)
        return (
          <div key={t} className="catrow">
            <span><Sym type={t} /> {t} <small>n={xs.length}</small></span>
            <div>{cats.map((c, i) => { const p = pct(xs.filter((x) => x === c).length, xs.length)
              return p > 0 && <i key={c} style={{ width: `${p}%`, background: GRAYS[i], color: i < 2 ? '#fff' : '#222' }} title={`${c} ${f1(p)}%`}>{p >= 12 ? `${p.toFixed(0)}%` : ''}</i> })}</div>
          </div>)
      })}
      <p className="axisnote">가로 막대 = 각 유형 안에서의 비율(%), 합계 100%</p>
    </div>
  )
}

// 중심지 체계 그림: 위에서부터 3도심 → 7광역중심 → 12지역중심. 색 = 위계, 원 넓이 = 그 중심지(개략 영역) 안 영업 영화관 수(0곳은 회색 점)
function CenterDiagram({ centers, count }: { centers: any[]; count: (c: any) => number }) {
  const rows = CENTER_LEVELS.map((lv) => ({ lv, items: centers.filter((c) => c.properties.level === lv) }))
  const W = 560, rowY = [42, 120, 190], X0 = 120
  const rad = (n: number) => (n ? 7 + Math.sqrt(n) * 4.6 : 4)
  const ink = (lv: string) => (lv === '7광역중심' ? '#3b2c00' : '#fff')
  return (
    <svg viewBox={`0 0 ${W} 232`} role="img" aria-label="서울시 중심지 체계: 3도심, 7광역중심, 12지역중심" className="centerdiagram">
      {rows.map(({ lv, items }, i) => { const gap = (W - X0) / items.length
        return <g key={lv}>
          <line x1={X0} x2={W} y1={rowY[i]} y2={rowY[i]} stroke="#eceae6" strokeWidth="1" />
          <circle cx={6} cy={rowY[i] - 8} r={5} fill={CENTER_COLOR[lv]} />
          <text x={16} y={rowY[i] - 4} fontSize="13" fontWeight="700" fill="#222">{lv.replace(/^(\d+)/, '$1 ')}</text>
          <text x={16} y={rowY[i] + 12} fontSize="10" fill="#888">{['서울 전체의 중심', '권역의 중심', '생활권의 중심'][i]}</text>
          {items.map((c, k) => { const x = X0 + gap * (k + 0.5), n = count(c), r = rad(n)
            return <g key={c.properties.name}>
              <title>{c.properties.name} · 영화관 {n}곳</title>
              <circle cx={x} cy={rowY[i]} r={r} fill={n ? CENTER_COLOR[lv] : '#d9d9d6'} />
              {n > 0 && <text x={x} y={rowY[i] + (n >= 10 ? 5 : 4)} fontSize={n >= 10 ? 14 : 11} fontWeight="700" textAnchor="middle" fill={ink(lv)}>{n}</text>}
              <text x={x} y={rowY[i] + Math.max(r, 12) + (i === 2 && k % 2 ? 22 : 12)} fontSize={i === 2 ? 9 : 10} textAnchor="middle" fill="#555">{c.properties.name}</text>
            </g> })}
        </g> })}
    </svg>
  )
}

// 3-5 연결 다이어그램: 왼쪽 영화관 유형 ↔ 오른쪽 문화시설. 선 굵기 = 그 시설이 반경 안에 1곳 이상 있는 영화관 비율
function NeighborDiagram({ rows, r }: { rows: { t: VenueType; n: number; cats: { c: string; share: number }[] }[]; r: number }) {
  const cats = rows[0]?.cats.map((x) => x.c) ?? [], W = 560, H = Math.max(190, cats.length * 30 + 30)
  const ly = (i: number) => 30 + (i + 0.5) * ((H - 40) / rows.length), ry = (j: number) => 22 + (j + 0.5) * ((H - 30) / cats.length)
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`반경 ${r}m 안 문화시설과 영화관 유형의 연결`} className="nbdiagram">
      <text x={4} y={12} fontSize="10.5" fontWeight="700" fill="#555">영화관 유형</text>
      <text x={W - 4} y={12} fontSize="10.5" fontWeight="700" fill="#555" textAnchor="end">반경 {r}m 안 문화시설</text>
      {rows.map((x, i) => x.cats.map((y, j) => y.share > 0 && (
        <path key={`${x.t}-${y.c}`} d={`M150,${ly(i)} C300,${ly(i)} 300,${ry(j)} 420,${ry(j)}`} fill="none" stroke={TYPE_STYLE[x.t].color}
          strokeOpacity={y.share >= 50 ? 0.75 : 0.25} strokeWidth={Math.max(0.6, y.share / 6)}><title>{x.t} ↔ {y.c}: {f1(y.share)}%</title></path>)))}
      {rows.map((x, i) => <g key={x.t}>
        <circle cx={142} cy={ly(i)} r={8} fill={TYPE_STYLE[x.t].color} />
        <text x={128} y={ly(i) + 4} fontSize="12.5" fontWeight="700" textAnchor="end">{x.t}</text>
        <text x={128} y={ly(i) + 18} fontSize="10" textAnchor="end" fill="#777">{x.n}곳</text>
      </g>)}
      {cats.map((c, j) => { const top = [...rows].sort((a, b) => b.cats[j].share - a.cats[j].share)[0]
        return <g key={c}>
          <rect x={420} y={ry(j) - 9} width={6} height={18} rx={2} fill="#333" />
          <text x={432} y={ry(j) + 4} fontSize="11.5" fill="#222">{c}</text>
          {top.cats[j].share >= 10 && <text x={W - 4} y={ry(j) + 4} fontSize="10" textAnchor="end" fill={TYPE_STYLE[top.t].color} fontWeight="700">{f1(top.cats[j].share)}%</text>}
        </g> })}
      <text x={W - 4} y={H + 14} fontSize="10.5" textAnchor="end" fill="#333" fontWeight="600">선 굵기 = 그 시설이 반경 안에 1곳 이상 있는 영화관 비율 · 오른쪽 숫자 = 가장 높은 유형의 비율</text>
    </svg>
  )
}

const pt = (f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })
const mix = (a: string, b: string, k: number, alpha = 1) => { const h = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16))
  const [p, q] = [h(a), h(b)]; return `rgba(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(',')},${alpha})` }
const narrowNow = () => matchMedia('(max-width: 1000px)').matches

export default function LocationTabs({ data, open, title }: { data: DataSet; open: Venue[]; title?: ReactNode }) {
  const [step, setStep] = useState(0)
  const [narrow, setNarrow] = useState(narrowNow)
  const [on, setOn] = useState<VenueType[]>([...TYPES])
  const [showGu, setShowGu] = useState(true)
  const [radius, setRadius] = useState(500)
  const [bufKinds, setBufKinds] = useState({ 일반역: true, 환승역: true })
  const [bufW, setBufW] = useState({ 일반역: 0.7, 환승역: 2 }) // 역세권 경계선 두께(px)
  const [cultOn, setCultOn] = useState<string[]>(CULTURE_CATS)
  const [cultR, setCultR] = useState<number | 'nearest'>(500)
  const [nnMetric, setNnMetric] = useState<'same' | 'other' | 'any'>('same')
  const [dens, setDens] = useState<VenueType | '전체'>('독립·예술영화전용관')
  const [subOn, setSubOn] = useState(true) // 3-6 배경 지하철
  const [pick, setPick] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const pts = open.filter(located)

  // 넓은 화면: 이 장면 높이 안에서 스크롤 위치로 단계를 고른다(지도·그래프가 한 화면에서 항상 같은 단계를 보여줌)
  useEffect(() => {
    const mq = matchMedia('(max-width: 1000px)'), onMq = () => setNarrow(mq.matches)
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  }, [])
  useEffect(() => {
    if (narrow) return
    const onScroll = () => {
      const r = wrap.current!.getBoundingClientRect(), prog = -r.top / Math.max(1, r.height - innerHeight)
      setStep(Math.max(0, Math.min(STEPS.length - 1, Math.floor(prog * STEPS.length))))
    }
    addEventListener('scroll', onScroll, { passive: true }); onScroll()
    return () => removeEventListener('scroll', onScroll)
  }, [narrow])
  const go = (i: number) => {
    if (narrow) return setStep(i)
    const el = wrap.current!, top = el.getBoundingClientRect().top + scrollY
    scrollTo({ top: top + ((i + 0.5) / STEPS.length) * (el.offsetHeight - innerHeight), behavior: 'smooth' })
  }

  // 3-1: 환승역 반경 안이면 환승역세권(우선), 아니면 일반역 반경, 둘 다 아니면 비역세권
  const stations = data.stations.status === 'ok' ? data.stations.data.features : []
  const subwayCat = (v: Venue) => {
    if (!stations.length) return null
    const near = stations.filter((f: any) => distM(v, pt(f)) <= radius)
    return near.some((f: any) => f.properties.transfer) ? '환승역세권' : near.length ? '일반역세권' : '비역세권'
  }
  // 역별 영화관 수: 서울 안 역 반경(선택한 역세권 범위) 안 영업 영화관, 유형별
  const topSt = useMemo(() => stations.filter((f: any) => f.properties.inside).map((f: any) => {
    const near = pts.filter((v) => distM(v, pt(f)) <= radius)
    return { name: f.properties.name, lon: pt(f).lon, lat: pt(f).lat, n: near.length, values: Object.fromEntries(TYPES.map((t) => [t, near.filter((v) => v.type === t).length])) as Record<VenueType, number> }
  }).filter((x: any) => x.n > 0).sort((a: any, b: any) => b.n - a.n).slice(0, 8), [open, radius, stations.length])
  const cult = data.culture.status === 'ok' ? data.culture.data.features.filter((f: any) => cultOn.includes(f.properties.category)) : []
  const cultStats = useMemo(() => cultR === 'nearest' ? null : TYPES.map((t) => {
    const xs = pts.filter((v) => v.type === t)
    return { t, n: xs.length, cats: cultOn.map((c) => {
      const counts = xs.map((v) => cult.filter((f: any) => f.properties.category === c && distM(v, pt(f)) <= cultR).length)
      return { c, share: pct(counts.filter((x) => x > 0).length, xs.length), med: median(counts) }
    }), all: xs.map((v) => cult.filter((f: any) => distM(v, pt(f)) <= cultR).length) }
  }), [open, cultOn, cultR, data.culture.status])
  const cultNearest = (v: Venue) => Math.min(...cult.map((f: any) => distM(v, pt(f))))
  // 3-6: 기준일 영업 중 영화관끼리
  const nn = useMemo(() => Object.fromEntries(pts.map((v) => [v.id, {
    any: nearest(v, pts), same: nearest(v, pts, (o) => o.type === v.type), other: nearest(v, pts, (o) => o.type !== v.type),
    count: pts.filter((o) => o.id !== v.id && distM(v, o) <= 1000).length }])), [open])
  const picked = pts.find((v) => v.id === pick)
  const pn = picked ? nn[picked.id][nnMetric] : null
  // 3-2: 중심지 개략 영역(대표 역 반경). 겹치면 높은 위계 우선
  const centers: any[] = data.centers.status === 'ok' ? data.centers.data.features : []
  const inCenter = (v: Venue, c: any) => c.properties.anchors.some((a: number[]) => distM(v, { lon: a[0], lat: a[1] }) <= c.properties.radius)
  const levelOf = (v: Venue) => CENTER_LEVELS.find((lv) => centers.some((c) => c.properties.level === lv && inCenter(v, c))) ?? '중심지 밖'
  // 결론 문장용 계산
  const ofType = (t: VenueType) => pts.filter((v) => v.type === t)
  const shareOf = (t: VenueType, f: (v: Venue) => boolean) => pct(ofType(t).filter(f).length, ofType(t).length)
  const best = <T,>(xs: T[], f: (x: T) => number, hi = true) => [...xs].sort((a, b) => (hi ? f(b) - f(a) : f(a) - f(b)))[0]
  const nT = (t: VenueType, p = '') => `${t}(n=${ofType(t).length})` + jo(t, p).slice(t.length)
  const gus = (t: VenueType) => new Set(ofType(t).map((v) => v.gu)).size
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
  const nnMean = (t: VenueType, k: 'any' | 'same' | 'other') => avg(ofType(t).map((v) => nn[v.id][k]?.dist).filter((x): x is number => x != null)) / 1000
  const cntMean = (t: VenueType) => avg(ofType(t).map((v) => nn[v.id].count))
  const occTop = (t: VenueType) => { const xs = ofType(t).filter((v) => v.occupancy !== '확인 불가'); const o = OCCUPANCY.map((c) => ({ c, k: xs.filter((v) => v.occupancy === c).length })).sort((a, b) => b.k - a.k)[0]
    return { n: xs.length, ...o } }
  const occShort = (c: string) => c.replace(' 내 입점', '').replace('복합상업시설(', '').replace(')', '').replace('기타(', '').replace('(영화관 전용·중심', '')

  const dc = dens === '전체' ? '#e8e8e8' : TYPE_STYLE[dens].color // 전체 = 중립색(밝은 회색)
  const densPts = dens === '전체' ? pts : ofType(dens)
  const extras: Overlay[] = []
  if (step === 0 && data.buffers.status === 'ok') extras.push({ id: 'buffers', place: 'under',
    data: { ...data.buffers.data, features: data.buffers.data.features.filter((f: any) => f.properties.radius === radius && (bufKinds as any)[f.properties.kind]) },
    // 색 대신 선 두께로 구분: 일반역 = 가는 선, 환승역 = 굵은 선(같은 회색). 안쪽은 아주 옅게만
    layers: [{ type: 'fill', paint: { 'fill-color': BUF_COLOR, 'fill-opacity': 0.05 } },
      { type: 'line', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': BUF_COLOR, 'line-opacity': 0.35, 'line-width': ['match', ['get', 'kind'], '환승역', bufW.환승역, bufW.일반역] } }] })
  if (step === 0 || (step === 5 && subOn)) extras.push(...stationOverlay(data, step === 5))
  if (step === 1) extras.push(...regionOverlay(data))
  const lvColor = ['match', ['get', 'level'], '3도심', CENTER_COLOR['3도심'], '7광역중심', CENTER_COLOR['7광역중심'], CENTER_COLOR['12지역중심']]
  if (step === 1 && centers.length) extras.push({ id: 'centers', place: 'under', data: data.centers.data,
    hover: (p) => `${p.name} · ${p.level} (대표 역: ${(Array.isArray(p.anchor_names) ? p.anchor_names : JSON.parse(p.anchor_names)).join(', ')})`,
    label: { text: (p) => p.name, color: '#333' },
    layers: [{ type: 'line', paint: { 'line-color': lvColor, 'line-width': 16, 'line-blur': 14, 'line-opacity': 0.4 } },
      { type: 'fill', paint: { 'fill-color': lvColor, 'fill-opacity': 0.3 } }] })
  if (step === 4 && cult.length) extras.push({ id: 'culture', place: 'over', data: { type: 'FeatureCollection', features: cult },
    layers: [{ type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 14, 4], 'circle-color': '#fff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1 } }] })
    // 3-6 밀도: 영화관 점의 커널 밀도(히트맵). 반경은 확대 수준에 맞춰 약 1.5km
  if (step === 5) extras.push({ id: 'density', place: 'under', data: { type: 'FeatureCollection', features: densPts.map((v) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [v.lon, v.lat] } })) },
    layers: [{ type: 'heatmap', paint: { 'heatmap-weight': 1, 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 14, 1.5],
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 9, 15, 14, 480], 'heatmap-opacity': 0.95,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.08, mix(dc, '#1e1e1e', 0.55, 0.55), 0.35, mix(dc, '#1e1e1e', 0.15), 0.7, dc, 1, mix(dc, '#ffffff', 0.7)] } }] })
  const mapPts = pts.filter((v) => (step === 5 ? densPts.includes(v) : on.includes(v.type))).map((v) => ({ v, mark: 'fill' as const }))
  const line: [number, number][] | null = step === 5 && picked && pn ? [[picked.lon!, picked.lat!], [pn.venue.lon!, pn.venue.lat!]] : null

  const panel = (i: number): ReactNode => {
    if (i === 0) return <>
      <div className="ctrl ui">
        <Seg label="역세권 범위" value={radius} onChange={setRadius} options={RADII.map((r) => ({ v: r, label: `${r}m` }))} />
      </div>
      {topSt.length > 0 && <>
        <p className="chart-title">영화관이 많은 역 <small>역 {radius}m 안 영업 영화관 수 · 상위 {topSt.length}곳</small></p>
        <CountBars title="영화관이 많은 역" unit="곳" rowH={20} rows={topSt.map((x: any, k: number) => ({ label: `${k + 1}  ${x.name}역`, values: x.values }))} />
      </>}
      <More label="역세권 범위 표시 설정"><div className="ctrl ui">
        {(['일반역', '환승역'] as const).map((k) => <span key={k} className="bufctl">
          <label><input type="checkbox" checked={bufKinds[k]} onChange={() => setBufKinds({ ...bufKinds, [k]: !bufKinds[k] })} /> {k} 범위</label>
          <input type="range" aria-label={`${k} 범위 선 두께`} min={0.4} max={4} step={0.2} value={bufW[k]} onChange={(e) => setBufW({ ...bufW, [k]: +e.target.value })} />
        </span>)}
      </div></More>
      {stations.length ? <CategoryBars vs={pts} cats={['환승역세권', '일반역세권', '비역세권']} of={subwayCat} title="유형별 역세권 구성" /> : <DataStatus data={data} need={['stations', 'buffers']} />}
      <More>환승역 반경 안 → 환승역세권(우선), 그 밖에 일반역 반경 안 → 일반역세권, 나머지 → 비역세권. 같은 조건의 버퍼는 합집합. 역 {stations.filter((f: any) => f.properties.inside).length}곳(환승 {stations.filter((f: any) => f.properties.inside && f.properties.transfer).length}) · 노선은 OSM 선형(반투명).</More>
      {stations.length > 0 && (() => {
        const sub = (t: VenueType) => shareOf(t, (v) => subwayCat(v) !== '비역세권'), tr = (t: VenueType) => shareOf(t, (v) => subwayCat(v) === '환승역세권')
        const hi = best(TYPES, sub), lo = best(TYPES, sub, false), th = best(TYPES, tr)
        return <Finding items={[
          { head: <>역 {radius}m 안에 있는 비율 {TYPES.map((t) => <span key={t} className="tnum" style={{ color: TYPE_STYLE[t].color }}><Sym type={t} /> {TYPE_STYLE[t].short} {f1(sub(t))}%</span>)}</>,
            mean: <>{jo(hi, '가')} 지하철역 가까이 자리하는 경향이 가장 뚜렷하고, {jo(lo, '는')} 역에서 떨어진 곳에 있는 비율이 {f1(100 - sub(lo))}%로 상대적으로 높습니다. 환승역 주변 비율은 {jo(th, '가')} {f1(tr(th))}%로 가장 높습니다.</> },
        ]} />
      })()}
    </>
    if (i === 1) {
      if (!centers.length) return <DataStatus data={data} need={['centers']} />
      const rows = [...CENTER_LEVELS, '중심지 밖'].map((lv) => ({ label: lv, color: CENTER_COLOR[lv], values: Object.fromEntries(TYPES.map((t) => [t, ofType(t).filter((v) => levelOf(v) === lv).length])) as Record<VenueType, number> }))
      const doc = (t: VenueType) => shareOf(t, (v) => levelOf(v) === '3도심'), out = (t: VenueType) => shareOf(t, (v) => levelOf(v) === '중심지 밖')
      const hd = best(TYPES, doc), ho = best(TYPES, out)
      return <>
        <CenterDiagram centers={centers} count={(c) => pts.filter((v) => inCenter(v, c)).length} />
        <More label="중심지 체계란?">서울시는 도시기본계획(2040 서울도시기본계획)에서 일자리·상업·문화가 모이는 곳을 ‘중심지’로 정하고 크기에 따라 세 단계로 나눕니다. <b>3도심</b>(서울도심·영등포여의도·강남)은 서울 전체와 수도권을 이끄는 가장 큰 중심, <b>7광역중심</b>(용산·청량리왕십리·창동상계·상암수색·마곡·가산대림·잠실)은 동북·서북·서남·동남 같은 권역을 대표하는 중심, <b>12지역중심</b>은 동네 생활권의 중심입니다. 지도의 원은 대표 역을 기준으로 그린 대략적인 위치이며 공식 경계가 아닙니다(반경 도심 1.2km·광역 0.9km·지역 0.6km). 오른쪽 그림의 원이 클수록 그 중심지 안 영업 영화관이 많습니다(회색 점 = 0곳).</More>
        <p className="chart-title">위계별 영화관 수</p><CountBars title="중심지 위계별 영화관 수" unit="곳" rows={rows} rowH={26} />
        <More>면은 대표 역 기준 개략 위치(반경 도심 1.2km·광역 0.9km·지역 0.6km, 공식 범위 아님). 겹치면 높은 위계로 셉니다. 면에 마우스를 올리면 대표 역이 보입니다.</More>
        <Finding items={[
          { head: <>3도심 안 비율은 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${f1(doc(t))}%`).join(', ')}였습니다.</>,
            mean: <>{jo(hd, '는')} 도심에 상대적으로 집중되어 있고, {jo(ho, '는')} {f1(out(ho))}%가 중심지 밖에 있어 중심지 체계 바깥의 생활권에도 넓게 자리합니다.</> },
        ]} />
      </>
    }
    if (i === 2) return <>
      <DataStatus data={data} need={['commerce']} title="상권 지표 검토 중 — 본 분석에 넣지 않음"
        note={<>후보 변수(점포 수, 개·폐업, 추정매출, 집객시설, 상주·생활인구, 상권변화지표, 공실, 상권 유형)와 연도 맞춤 원칙은 <code>data/verify/commerce_proposal.md</code>에 정리했습니다. 현재 상권 값을 과거 폐업 영화관의 당시 환경처럼 쓰지 않으며, 임의 지수는 만들지 않습니다.</>} />
    </>
    if (i === 3) {
      const unk = pts.filter((v) => v.occupancy === '확인 불가').length
      const cnt = (o: string) => TYPES.map((t) => `${TYPE_STYLE[t].short} ${ofType(t).filter((v) => v.occupancy === o).length}`).join(' · ')
      return <div className="two wide">
        <div>
          <p className="chart-title">입점 방식 모식도 — 색 덩어리 = 영화관이 들어선 자리, 아래 숫자 = 영업 영화관 수</p>
          <OccupancyTiles items={OCCUPANCY.map((o, k) => ({ label: o, color: OCC_COLOR[k], counts: cnt(o), n: pts.filter((v) => v.occupancy === o).length }))} />
          <More>근거: 주소에 적힌 건물명 키워드(자동) 또는 확인 시트의 확정값. ‘확인 불가’ {unk}곳은 <code>data/manual/occupancy_review.xlsx</code>에서 함께 채웁니다(제안값은 확정 전까지 쓰지 않음).</More>
        </div>
        <div>
          <div className="donuts">{TYPES.map((t) => <Donut key={t} title={t} n={ofType(t).length} sub={`확인 ${occTop(t).n}곳`}
            parts={OCCUPANCY.map((o, k) => ({ label: o, value: ofType(t).filter((v) => v.occupancy === o).length, color: OCC_COLOR[k] }))} />)}</div>
          <Finding items={[...TYPES.map((t) => { const o = occTop(t)
            return o.n ? { head: <>{jo(t, '는')} 주로 {occShort(o.c)} 안에 들어선 형태로 존재합니다.</>,
              mean: <>입점 형태가 확인된 {o.n}곳 중 {o.k}곳({f1(pct(o.k, o.n))}%){o.n < 10 ? ' — 확인 표본이 적어 경향으로만 봅니다' : ''}.</> }
              : { head: <>{nT(t, '는')} 아직 입점 형태를 확인한 곳이 없습니다.</> } }),
            { head: <>영업 영화관의 {f1(pct(unk, pts.length))}%는 아직 ‘확인 불가’입니다.</>, mean: <>위 결과는 확인된 곳만의 경향입니다.</> }]} />
        </div>
      </div>
    }
    if (i === 4) {
      if (data.culture.status !== 'ok') return <DataStatus data={data} need={['culture']} />
      return <>
        <div className="toggles ui">{CULTURE_CATS.map((c) => <label key={c}><input type="checkbox" checked={cultOn.includes(c)}
          onChange={() => setCultOn(cultOn.includes(c) ? cultOn.filter((x) => x !== c) : CULTURE_CATS.filter((x) => x === c || cultOn.includes(x)))} /> {c}</label>)}</div>
        <Seg label="분석 기준" value={cultR} onChange={setCultR} options={[...CULTURE_RADII.map((r) => ({ v: r as number | 'nearest', label: `반경 ${r}m` })), { v: 'nearest' as const, label: '최근접 거리' }]} />
        {cultStats && <NeighborDiagram r={cultR as number} rows={cultStats.map((x) => ({ t: x.t, n: x.n, cats: x.cats }))} />}
        {cultStats && <More label="숫자 표로 보기"><div className="tablewrap"><table className="mini-table culture"><thead><tr><th>분류 · 반경 안 1곳 이상 있는 비율</th>{TYPES.map((t) => <th key={t}><Sym type={t} /> n={cultStats.find((x) => x.t === t)!.n}</th>)}</tr></thead>
          <tbody>{cultOn.map((c) => <tr key={c}><td>{c}</td>{cultStats.map((x) => { const r = x.cats.find((y) => y.c === c)!
            return <td key={x.t}><span className="bar" style={{ width: `${r.share * 0.6}px`, background: TYPE_STYLE[x.t].color }} /> {f1(r.share)}%</td> })}</tr>)}</tbody>
        </table></div></More>}
        {cultStats ? (() => {
          const rank = (t: VenueType) => [...cultStats.find((x) => x.t === t)!.cats].sort((a, b) => b.share - a.share)
          const winner = (c: string) => best(TYPES, (t) => cultStats.find((x) => x.t === t)!.cats.find((y) => y.c === c)!.share)
          // 그 시설이 반경 안에 있는 비율이 10% 이상인 시설만(아주 작은 비율로 '가장 가깝습니다'고 말하지 않음)
          const byType = TYPES.map((t) => ({ t, cats: cultOn.filter((c) => winner(c) === t && cultStats.find((x) => x.t === t)!.cats.find((y) => y.c === c)!.share >= 10) })).filter((x) => x.cats.length)
          const tops = TYPES.map((t) => rank(t)[0].c), same = tops.every((c) => c === tops[0])
          const lead = best(TYPES, (t) => rank(t)[0].share)
          return <Finding items={[
            same ? { head: <>세 유형 모두 {tops[0]}과 가장 가까이 있고, {jo(lead, '이')} 가장 가깝습니다.</>,
                mean: <>반경 {cultR}m 안에 {tops[0]}이 있는 비율 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${f1(rank(t)[0].share)}%`).join(' · ')}</> }
              : { head: <>유형마다 가장 가까운 시설이 다릅니다.</>, mean: <>{TYPES.map((t) => `${TYPE_STYLE[t].short} — ${rank(t)[0].c} ${f1(rank(t)[0].share)}%`).join(' · ')}</> },
            ...byType.filter((x) => x.cats.length > 1).map((x) => ({ head: <>{jo(x.t, '는')} {x.cats.join('·')}과도 가장 가까이 있습니다.</>,
              mean: <>이 시설들이 반경 {cultR}m 안에 있는 비율이 세 유형 중 가장 높다(비율 10% 이상인 시설만).</> })),
          ]} />
        })() : (() => { const md = (t: VenueType) => avg(ofType(t).map(cultNearest)), lo = best(TYPES, md, false)
          return <Finding items={[{ head: <>최근접 문화시설까지 평균 거리는 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${Math.round(md(t))}m`).join(', ')}였습니다.</>, mean: <>{jo(lo, '가')} 문화시설과 가장 가까이 자리합니다.</> }]} /> })()}
        <More>문화시설 {cult.length.toLocaleString()}곳(선택 분류). 가깝다는 사실이 시설 간 협력이나 이용 연계를 뜻하지 않습니다.</More>
      </>
    }
    const lab = { same: '같은 유형', other: '다른 유형', any: '아무' }[nnMetric]
    const ch = best(TYPES, cntMean), cl = best(TYPES, cntMean, false)
    const nnMid = (t: VenueType) => median(ofType(t).map((v) => nn[v.id].same?.dist).filter((x): x is number => x != null)) / 1000
    const mx = best(TYPES, nnMid), mn = best(TYPES, nnMid, false)
    return <>
      <div className="ctrl ui">
        <Seg label="밀도 지도 유형" value={dens} onChange={(t) => { setDens(t); setPick(null) }} options={[{ v: '전체' as const, label: '전체' }, ...TYPES.map((t) => ({ v: t, label: TYPE_STYLE[t].short }))]} />
        <label><input type="checkbox" checked={subOn} onChange={() => setSubOn(!subOn)} /> 지하철 노선·역</label>
        <span className="ramp">옅음<i style={{ background: `linear-gradient(90deg, ${mix(dc, '#1e1e1e', 0.55)}, ${dc}, ${mix(dc, '#ffffff', 0.7)})` }} />진함 = 많이 모임</span>
      </div>
      <p className="chart-title">① 반경 1km 안에 다른 영화관이 평균 몇 곳 있나</p>
      <MeanBars title="반경 1km 안 다른 영화관 수 평균" unit="곳" rows={TYPES.map((t) => ({ key: t, value: cntMean(t) }))} />
      <p className="chart-title">② 가장 가까운 {lab} 영화관이 얼마나 떨어져 있나 <Seg label="거리 기준" value={nnMetric} onChange={setNnMetric} options={[{ v: 'same' as const, label: '같은 유형' }, { v: 'other' as const, label: '다른 유형' }]} /></p>
      <CategoryBars vs={pts} cats={BANDS} title={`가장 가까운 ${lab} 영화관까지 거리 구간`} of={(v) => { const d = nn[v.id][nnMetric]?.dist; return d == null ? null : band(d) }} />
      <Finding items={[
        { head: <>{jo(ch, '은')} 반경 1km 안에 다른 영화관이 평균 {f1(cntMean(ch))}곳으로 가장 많이 모여 있습니다.</>,
          mean: <>{jo(cl, '는')} 평균 {f1(cntMean(cl))}곳으로 주변에 다른 영화관이 적습니다.</> },
        { head: <>같은 유형까지 거리(중앙값) {TYPES.map((t) => <span key={t} className="tnum" style={{ color: TYPE_STYLE[t].color }}><Sym type={t} /> {TYPE_STYLE[t].short} {f1(nnMid(t))}km</span>)}</>,
          mean: <>{jo(mn, '은')} 같은 유형끼리 가장 가까이 모여 있고, {jo(mx, '는')} 가장 떨어져 있습니다. 평균({TYPES.map((t) => `${TYPE_STYLE[t].short} ${f1(nnMean(t, 'same'))}km`).join(' · ')})은 멀리 떨어진 몇 곳 때문에 중앙값보다 큽니다.</> },
      ]} />
      <More>밀도 = 영화관 점의 커널 밀도(반경 약 2km, 색이 진할수록 많이 모임). 거리 = 직선거리, 같은 건물은 0km. 가깝다는 것을 경쟁으로 해석하지 않습니다.
        {picked && pn && <> · <b>{picked.name}</b> → {pn.venue.name} {f1(pn.dist / 1000)}km</>}</More>
    </>
  }

  const mapOn = !NO_MAP.includes(step)
  return (
    <div className="loc" ref={wrap} style={narrow ? undefined : { height: `${STEPS.length * 100}vh` }}>
      {/* 넓은 화면: 단계마다 스크롤 멈춤 지점(한 번 스크롤 = 한 단계) */}
      {!narrow && STEPS.map((_, i) => <div key={i} className="snap" aria-hidden style={{ top: i ? `${((i + 0.02) / STEPS.length) * (STEPS.length - 1) * 100}vh` : 0 }} />)}
      <div className="stage">
        {title}
        <nav className="steps ui" aria-label="입지 항목">
          {STEPS.map((s, i) => <button key={s} aria-current={step === i} onClick={() => go(i)}>3-{i + 1} {s}</button>)}
        </nav>
        <div className={`stage-body ${mapOn ? '' : 'nomap'}`}>
          {mapOn && <div className="loc-map">
            <div className="layerpanel ui" aria-label="레이어">
              {step !== 5 && <TypeToggles value={on} onChange={setOn} />}
              <label><input type="checkbox" checked={showGu} onChange={() => setShowGu(!showGu)} /> 행정구역 경계</label>
            </div>
            <SeoulMap data={data} label={`입지 특성 지도 — 3-${step + 1} ${STEPS[step]}`} extras={extras} points={mapPts} line={line} selectedId={pick} showGu={showGu}
              onSelect={(v) => setPick(v?.id ?? null)} resetKey={step} dark={step === 5} pointScale={step === 5 ? 0.5 : 0.78} />
            <MapLegend types={step === 5 ? (dens === '전체' ? [...TYPES] : [dens]) : on} marks={['fill']} extra={<>
              {extras.some((e) => e.id === 'stations') && <span>━ 노선(반투명) · ○ 역</span>}
              {extras.some((e) => e.id === 'buffers') && (['일반역', '환승역'] as const).filter((k) => bufKinds[k]).map((k) => <span key={k}><i className="lg-ring" style={{ borderWidth: Math.max(1, Math.round(bufW[k])), borderColor: BUF_COLOR }} /> {k} {radius}m 범위({k === '환승역' ? '굵은 선' : '가는 선'})</span>)}
              {extras.some((e) => e.id === 'centers') && CENTER_LEVELS.map((lv) => <span key={lv}><i className="lg-box" style={{ background: CENTER_COLOR[lv] }} /> {lv}</span>)}
              {extras.some((e) => e.id === 'culture') && <span>○ 문화시설({cult.length})</span>}
              {extras.some((e) => e.id === 'density') && <span>색의 진하기 = {dens === '전체' ? '전체' : TYPE_STYLE[dens].short} 영화관 밀도</span>}
              {extras.some((e) => e.id === 'regions') && <span>┅ 5개 생활권(권역) 경계</span>}
              {line && <span>- - 최근접 연결선</span>}
            </>} />
          </div>}
          <div className="loc-panel" key={step}>
            <p className="eyebrow">3-{step + 1}</p>
            <h3>{STEPS[step]}</h3>
            {panel(step)}
            <More label="자료·기준">
              <SourceNote source={step === 4 ? SOURCES.culture : step === 0 || step === 5 ? `${SOURCES.venues} · ${SOURCES.subway}` : step === 1 ? SOURCES.centers : SOURCES.venues} n={`영업 중 좌표 있는 영화관 ${pts.length}곳`} />
            </More>
          </div>
        </div>
      </div>
    </div>
  )
}
