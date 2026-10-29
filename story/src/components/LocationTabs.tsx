import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CENTER_COLOR, CENTER_LEVELS, CULTURE_CATS, CULTURE_RADII, OCC_COLOR, OCCUPANCY, RADII, SOURCES, TYPES, TYPE_STYLE, type VenueType } from '../config'
import { distM, f1, jo, located, median, nearest, pct, type DataSet, type Venue } from '../data'
import { CountBars, DataTable, Donut, MeanBars } from './charts'
import { OccupancyTiles } from './Isometric'
import SeoulMap, { regionOverlay, stationOverlay, type Overlay } from './SeoulMap'
import { DataStatus, Finding, MapLegend, Seg, SourceNote, Sym, TypeToggles } from './ui'

const STEPS = ['지하철 접근성', '서울시 중심지 체계', '상권 특성', '건축적 입점 형태', '문화시설 인접성', '영화관 간 인접성']
const NO_MAP = [2, 3] // 지도가 필요 없는 단계(상권 자료 없음, 입점 형태는 모식도로)
const GRAYS = ['#222', '#6a6a6a', '#aaa', '#dcdcdc']
const BANDS = ['500m 이내', '0.5~1km', '1~2km', '2km 초과']
const band = (m: number) => BANDS[m <= 500 ? 0 : m <= 1000 ? 1 : m <= 2000 ? 2 : 3]
const BUF = { 일반역: { color: '#5b8fb9', opacity: 0.16 }, 환승역: { color: '#d0703c', opacity: 0.22 } }

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
    </div>
  )
}

const pt = (f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })
const mix = (a: string, b: string, k: number, alpha = 1) => { const h = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16))
  const [p, q] = [h(a), h(b)]; return `rgba(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(',')},${alpha})` }
const narrowNow = () => matchMedia('(max-width: 1000px)').matches

export default function LocationTabs({ data, open }: { data: DataSet; open: Venue[] }) {
  const [step, setStep] = useState(0)
  const [narrow, setNarrow] = useState(narrowNow)
  const [on, setOn] = useState<VenueType[]>([...TYPES])
  const [showGu, setShowGu] = useState(true)
  const [radius, setRadius] = useState(500)
  const [bufKinds, setBufKinds] = useState({ 일반역: true, 환승역: true })
  const [buf, setBuf] = useState(BUF)
  const [bufLine, setBufLine] = useState({ color: '#3d3d3d', width: 0.6 })
  const [cultOn, setCultOn] = useState<string[]>(CULTURE_CATS)
  const [cultR, setCultR] = useState<number | 'nearest'>(500)
  const [nnMetric, setNnMetric] = useState<'same' | 'other' | 'any'>('same')
  const [dens, setDens] = useState<VenueType | '전체'>('독립·예술영화관')
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
    layers: [{ type: 'fill', paint: { 'fill-color': ['match', ['get', 'kind'], '환승역', buf.환승역.color, buf.일반역.color], 'fill-opacity': ['match', ['get', 'kind'], '환승역', buf.환승역.opacity, buf.일반역.opacity] } },
      { type: 'line', paint: { 'line-color': bufLine.color, 'line-width': bufLine.width, 'line-opacity': 0.6 } }] })
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
        {(['일반역', '환승역'] as const).map((k) => <span key={k} className="bufctl">
          <label><input type="checkbox" checked={bufKinds[k]} onChange={() => setBufKinds({ ...bufKinds, [k]: !bufKinds[k] })} /> {k} 버퍼</label>
          <input type="color" aria-label={`${k} 버퍼 색`} value={buf[k].color} onChange={(e) => setBuf({ ...buf, [k]: { ...buf[k], color: e.target.value } })} />
          <input type="range" aria-label={`${k} 버퍼 투명도`} min={0} max={0.6} step={0.02} value={buf[k].opacity} onChange={(e) => setBuf({ ...buf, [k]: { ...buf[k], opacity: +e.target.value } })} />
        </span>)}
        <span className="bufctl">경계선 <input type="color" aria-label="버퍼 경계선 색" value={bufLine.color} onChange={(e) => setBufLine({ ...bufLine, color: e.target.value })} />
          <input type="range" aria-label="버퍼 경계선 굵기" min={0} max={3} step={0.2} value={bufLine.width} onChange={(e) => setBufLine({ ...bufLine, width: +e.target.value })} /></span>
      </div>
      {stations.length ? <CategoryBars vs={pts} cats={['환승역세권', '일반역세권', '비역세권']} of={subwayCat} title="유형별 역세권 구성" /> : <DataStatus data={data} need={['stations', 'buffers']} />}
      <p className="note">환승역 반경 안 → 환승역세권(우선), 그 밖에 일반역 반경 안 → 일반역세권, 나머지 → 비역세권. 같은 조건의 버퍼는 합집합. 역 {stations.filter((f: any) => f.properties.inside).length}곳(환승 {stations.filter((f: any) => f.properties.inside && f.properties.transfer).length}) · 노선은 OSM 선형(반투명).</p>
      {stations.length > 0 && (() => {
        const sub = (t: VenueType) => shareOf(t, (v) => subwayCat(v) !== '비역세권'), tr = (t: VenueType) => shareOf(t, (v) => subwayCat(v) === '환승역세권')
        const hi = best(TYPES, sub), lo = best(TYPES, sub, false), th = best(TYPES, tr)
        return <Finding items={[
          { head: <>역 {radius}m 안에 있는 비율 {TYPES.map((t) => <span key={t} className="tnum" style={{ color: TYPE_STYLE[t].color }}><Sym type={t} /> {TYPE_STYLE[t].short} {f1(sub(t))}%</span>)}</>,
            mean: <>{jo(hi, '가')} 지하철역 가까이 자리하는 경향이 가장 뚜렷하고, {jo(lo, '는')} 역에서 떨어진 곳에 있는 비율이 {f1(100 - sub(lo))}%로 상대적으로 높다. 환승역 주변 비율은 {jo(th, '가')} {f1(tr(th))}%로 가장 높다.</> },
        ]} />
      })()}
    </>
    if (i === 1) {
      if (!centers.length) return <DataStatus data={data} need={['centers']} />
      const rows = [...CENTER_LEVELS, '중심지 밖'].map((lv) => ({ label: lv, color: CENTER_COLOR[lv], values: Object.fromEntries(TYPES.map((t) => [t, ofType(t).filter((v) => levelOf(v) === lv).length])) as Record<VenueType, number> }))
      const per = centers.map((c) => ({ label: c.properties.name, color: CENTER_COLOR[c.properties.level], values: Object.fromEntries(TYPES.map((t) => [t, ofType(t).filter((v) => inCenter(v, c)).length])) as Record<VenueType, number> }))
        .filter((r) => TYPES.some((t) => r.values[t] > 0)).sort((a, b) => TYPES.reduce((s, t) => s + b.values[t] - a.values[t], 0)).slice(0, 8)
      const doc = (t: VenueType) => shareOf(t, (v) => levelOf(v) === '3도심'), out = (t: VenueType) => shareOf(t, (v) => levelOf(v) === '중심지 밖')
      const hd = best(TYPES, doc), ho = best(TYPES, out)
      return <>
        <p className="explain-lead"><b>서울시 중심지 체계</b>(2040 서울도시기본계획)는 중심지를 세 단계로 나눈다. <b style={{ color: CENTER_COLOR['3도심'] }}>3도심</b>(서울도심·영등포여의도·강남)은 서울 전체를 이끄는 핵심 중심, <b style={{ color: CENTER_COLOR['7광역중심'] }}>7광역중심</b>은 권역을 대표하는 중심, <b style={{ color: CENTER_COLOR['12지역중심'] }}>12지역중심</b>은 생활권의 중심이다. 지도에서는 위계를 색과 크기로 구분했다.</p>
        <p className="chart-title">위계별 영화관 수</p><CountBars title="중심지 위계별 영화관 수" unit="곳" rows={rows} rowH={26} />
        <p className="chart-title">중심지별 영화관 수(상위 8곳)</p><CountBars title="중심지별 영화관 수" unit="곳" rows={per} rowH={22} />
        <p className="note">면은 대표 역 기준 개략 위치(반경 도심 1.2km·광역 0.9km·지역 0.6km, 공식 범위 아님). 겹치면 높은 위계로 셉니다. 면에 마우스를 올리면 대표 역이 보입니다.</p>
        <Finding items={[
          { head: <>3도심 안 비율은 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${f1(doc(t))}%`).join(', ')}였다.</>,
            mean: <>{jo(hd, '는')} 도심에 상대적으로 집중되어 있고, {jo(ho, '는')} {f1(out(ho))}%가 중심지 밖에 있어 중심지 체계 바깥의 생활권에도 넓게 자리한다.</> },
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
          <p className="note">근거: 주소에 적힌 건물명 키워드(자동) 또는 확인 시트의 확정값. ‘확인 불가’ {unk}곳은 <code>data/manual/occupancy_review.xlsx</code>에서 함께 채웁니다(제안값은 확정 전까지 쓰지 않음).</p>
        </div>
        <div>
          <div className="donuts">{TYPES.map((t) => <Donut key={t} title={t} n={ofType(t).length} sub={`확인 ${occTop(t).n}곳`}
            parts={OCCUPANCY.map((o, k) => ({ label: o, value: ofType(t).filter((v) => v.occupancy === o).length, color: OCC_COLOR[k] }))} />)}</div>
          <Finding items={[...TYPES.map((t) => { const o = occTop(t)
            return o.n ? { head: <>{jo(t, '는')} 주로 {occShort(o.c)} 안에 들어선 형태로 존재한다.</>,
              mean: <>입점 형태가 확인된 {o.n}곳 중 {o.k}곳({f1(pct(o.k, o.n))}%){o.n < 10 ? ' — 확인 표본이 적어 경향으로만 본다' : ''}.</> }
              : { head: <>{nT(t, '는')} 아직 입점 형태를 확인한 곳이 없다.</> } }),
            { head: <>영업 영화관의 {f1(pct(unk, pts.length))}%는 아직 ‘확인 불가’이다.</>, mean: <>위 결과는 확인된 곳만의 경향이다.</> }]} />
        </div>
      </div>
    }
    if (i === 4) {
      if (data.culture.status !== 'ok') return <DataStatus data={data} need={['culture']} />
      return <>
        <div className="toggles ui">{CULTURE_CATS.map((c) => <label key={c}><input type="checkbox" checked={cultOn.includes(c)}
          onChange={() => setCultOn(cultOn.includes(c) ? cultOn.filter((x) => x !== c) : CULTURE_CATS.filter((x) => x === c || cultOn.includes(x)))} /> {c}</label>)}</div>
        <Seg label="분석 기준" value={cultR} onChange={setCultR} options={[...CULTURE_RADII.map((r) => ({ v: r as number | 'nearest', label: `반경 ${r}m` })), { v: 'nearest' as const, label: '최근접 거리' }]} />
        {cultStats && <div className="tablewrap"><table className="mini-table culture"><thead><tr><th>분류 · 반경 안 1곳 이상 있는 비율</th>{TYPES.map((t) => <th key={t}><Sym type={t} /> n={cultStats.find((x) => x.t === t)!.n}</th>)}</tr></thead>
          <tbody>{cultOn.map((c) => <tr key={c}><td>{c}</td>{cultStats.map((x) => { const r = x.cats.find((y) => y.c === c)!
            return <td key={x.t}><span className="bar" style={{ width: `${r.share * 0.6}px`, background: TYPE_STYLE[x.t].color }} /> {f1(r.share)}%</td> })}</tr>)}</tbody>
        </table></div>}
        {cultStats ? (() => {
          const rank = (t: VenueType) => [...cultStats.find((x) => x.t === t)!.cats].sort((a, b) => b.share - a.share)
          const winner = (c: string) => best(TYPES, (t) => cultStats.find((x) => x.t === t)!.cats.find((y) => y.c === c)!.share)
          const byType = TYPES.map((t) => ({ t, cats: cultOn.filter((c) => winner(c) === t && cultStats.find((x) => x.t === t)!.cats.find((y) => y.c === c)!.share > 0) })).filter((x) => x.cats.length)
          return <Finding items={[
            ...TYPES.map((t) => { const [a, b] = rank(t)
              return { head: <>{jo(t, '는')} {a.c}과 가장 많이 인접해 있다.</>,
                mean: <>반경 {cultR}m 안에 {a.c}이 있는 비율 {f1(a.share)}%{b && b.share > 0 ? `, 다음은 ${b.c} ${f1(b.share)}%` : ''}.</> } }),
            { head: <>시설 분류별로 가장 가까이 있는 유형</>, mean: <>{byType.map((x) => `${x.t} — ${x.cats.join('·')}`).join(' / ')}</> },
          ]} />
        })() : (() => { const md = (t: VenueType) => avg(ofType(t).map(cultNearest)), lo = best(TYPES, md, false)
          return <Finding items={[{ head: <>최근접 문화시설까지 평균 거리는 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${Math.round(md(t))}m`).join(', ')}였다.</>, mean: <>{jo(lo, '가')} 문화시설과 가장 가까이 자리한다.</> }]} /> })()}
        <p className="note">문화시설 {cult.length.toLocaleString()}곳(선택 분류). 가깝다는 사실이 시설 간 협력이나 이용 연계를 뜻하지 않습니다.</p>
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
        { head: <>{jo(ch, '은')} 반경 1km 안에 다른 영화관이 평균 {f1(cntMean(ch))}곳으로 가장 많이 모여 있다.</>,
          mean: <>{jo(cl, '는')} 평균 {f1(cntMean(cl))}곳으로 주변에 다른 영화관이 적다.</> },
        { head: <>같은 유형까지 거리(중앙값) {TYPES.map((t) => <span key={t} className="tnum" style={{ color: TYPE_STYLE[t].color }}><Sym type={t} /> {TYPE_STYLE[t].short} {f1(nnMid(t))}km</span>)}</>,
          mean: <>{jo(mn, '은')} 같은 유형끼리 가장 가까이 모여 있고, {jo(mx, '는')} 가장 떨어져 있다. 평균({TYPES.map((t) => `${TYPE_STYLE[t].short} ${f1(nnMean(t, 'same'))}km`).join(' · ')})은 멀리 떨어진 몇 곳 때문에 중앙값보다 크다.</> },
      ]} />
      <p className="note">밀도 = 영화관 점의 커널 밀도(반경 약 2km, 색이 진할수록 많이 모임). 거리 = 직선거리, 같은 건물은 0km. 가깝다는 것을 경쟁으로 해석하지 않습니다.
        {picked && pn && <> · <b>{picked.name}</b> → {pn.venue.name} {f1(pn.dist / 1000)}km</>}</p>
    </>
  }

  const mapOn = !NO_MAP.includes(step)
  return (
    <div className="loc" ref={wrap} style={narrow ? undefined : { height: `${STEPS.length * 100}vh` }}>
      {/* 넓은 화면: 단계마다 스크롤 멈춤 지점(한 번 스크롤 = 한 단계) */}
      {!narrow && STEPS.map((_, i) => <div key={i} className="snap" aria-hidden style={{ top: `${((i + 0.5) / STEPS.length) * (STEPS.length - 1) * 100}vh` }} />)}
      <div className="stage">
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
              onSelect={(v) => setPick(v?.id ?? null)} resetKey={step} dark={step === 5} pointScale={step === 5 ? 0.5 : 1} />
            <MapLegend types={step === 5 ? (dens === '전체' ? [...TYPES] : [dens]) : on} marks={['fill']} extra={<>
              {extras.some((e) => e.id === 'stations') && <span>━ 노선(반투명) · ○ 역</span>}
              {extras.some((e) => e.id === 'buffers') && (['일반역', '환승역'] as const).filter((k) => bufKinds[k]).map((k) => <span key={k}><i className="lg-box" style={{ background: buf[k].color, opacity: Math.min(1, buf[k].opacity * 3) }} /> {k} {radius}m</span>)}
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
            <SourceNote source={step === 4 ? SOURCES.culture : step === 0 || step === 5 ? `${SOURCES.venues} · ${SOURCES.subway}` : step === 1 ? SOURCES.centers : SOURCES.venues} n={`영업 중 좌표 있는 영화관 ${pts.length}곳`} />
          </div>
        </div>
      </div>
    </div>
  )
}
