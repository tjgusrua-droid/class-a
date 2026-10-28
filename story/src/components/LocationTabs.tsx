import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CENTER_COLOR, CENTER_LEVELS, CULTURE_CATS, CULTURE_RADII, OCC_COLOR, OCCUPANCY, RADII, SOURCES, TYPES, TYPE_STYLE, type VenueType } from '../config'
import { distM, f1, jo, located, median, nearest, pct, type DataSet, type Venue } from '../data'
import { BoxDot, CountBars, DataTable, Donut } from './charts'
import SeoulMap, { stationOverlay, type Overlay } from './SeoulMap'
import { DataStatus, Finding, MapLegend, saveSvg, Seg, SourceNote, Sym, TypeToggles } from './ui'

const STEPS = ['지하철 접근성', '서울시 중심지 체계', '상권 특성', '건축적 입점 형태', '문화시설 인접성', '영화관 간 인접성']
const GRAYS = ['#222', '#555', '#888', '#b5b5b5', '#d9d9d9', '#ececec', '#f5f5f5', '#fafafa', '#fff']

// 유형별 범주 구성비(100% 막대, 범주는 회색 단계로 유형 색과 구분)
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
              return p > 0 && <i key={c} style={{ width: `${p}%`, background: GRAYS[i], color: i < 3 ? '#fff' : '#222' }} title={`${c} ${f1(p)}%`}>{p >= 12 ? `${p.toFixed(0)}%` : ''}</i> })}</div>
          </div>)
      })}
      <small>단위: 유형 안 구성비(%)</small>
    </div>
  )
}

const pt = (f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })

export default function LocationTabs({ data, open }: { data: DataSet; open: Venue[] }) {
  const [step, setStep] = useState(0)
  const [on, setOn] = useState<VenueType[]>([...TYPES])
  const [showGu, setShowGu] = useState(true)
  const [radius, setRadius] = useState(500)
  const [bufKinds, setBufKinds] = useState({ 일반역: true, 환승역: true })
  const [bufStyle, setBufStyle] = useState({ color: '#5b8fb9', opacity: 0.18, line: '#3d6f96', width: 1 })
  const [occOn, setOccOn] = useState<string[]>(OCCUPANCY)
  const [cultOn, setCultOn] = useState<string[]>(CULTURE_CATS)
  const [cultR, setCultR] = useState<number | 'nearest'>(500)
  const [nnMetric, setNnMetric] = useState<'any' | 'same' | 'other' | 'count'>('any')
  const [pick, setPick] = useState<string | null>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const svg = useRef<SVGSVGElement>(null)
  const pts = open.filter(located)

  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.i))), { rootMargin: '-62% 0px -37% 0px' })
    refs.current.forEach((r) => r && io.observe(r))
    return () => io.disconnect()
  }, [])

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
  const pn = picked && nnMetric !== 'count' ? nn[picked.id][nnMetric] : null
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
  const nnMed = (t: VenueType, k: 'any' | 'same' | 'other') => median(ofType(t).map((v) => nn[v.id][k]?.dist).filter((x): x is number => x != null)) / 1000
  const cntMed = (t: VenueType) => median(ofType(t).map((v) => nn[v.id].count))
  const occTop = (t: VenueType) => { const xs = ofType(t).filter((v) => v.occupancy !== '확인 불가'); const o = OCCUPANCY.map((c) => ({ c, k: xs.filter((v) => v.occupancy === c).length })).sort((a, b) => b.k - a.k)[0]
    return { n: xs.length, ...o } }
  const occShort = (c: string) => c.replace(' 내 입점', '').replace('복합상업시설(', '').replace(')', '').replace('기타(', '')

  const extras: Overlay[] = []
  if (step === 0 && data.buffers.status === 'ok') extras.push({ id: 'buffers', place: 'under',
    data: { ...data.buffers.data, features: data.buffers.data.features.filter((f: any) => f.properties.radius === radius && (bufKinds as any)[f.properties.kind]) },
    layers: [{ type: 'fill', paint: { 'fill-color': bufStyle.color, 'fill-opacity': bufStyle.opacity } }, { type: 'line', paint: { 'line-color': bufStyle.line, 'line-width': bufStyle.width } }] })
  if (step === 0) extras.push(...stationOverlay(data))
  const lvColor = ['match', ['get', 'level'], '3도심', CENTER_COLOR['3도심'], '7광역중심', CENTER_COLOR['7광역중심'], CENTER_COLOR['12지역중심']]
  if (step === 1 && centers.length) extras.push({ id: 'centers', place: 'under', data: data.centers.data,
    hover: (p) => `${p.name} · ${p.level} (대표 역: ${(Array.isArray(p.anchor_names) ? p.anchor_names : JSON.parse(p.anchor_names)).join(', ')})`,
    label: { text: (p) => p.name, color: '#4a2a6a' },
    layers: [{ type: 'line', paint: { 'line-color': lvColor, 'line-width': 16, 'line-blur': 14, 'line-opacity': 0.45 } },
      { type: 'fill', paint: { 'fill-color': lvColor, 'fill-opacity': 0.32 } }] })
  if (step === 4 && cult.length) extras.push({ id: 'culture', place: 'over', data: { type: 'FeatureCollection', features: cult },
    layers: [{ type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 14, 4], 'circle-color': '#fff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1 } }] })

  const mapPts = pts.filter((v) => on.includes(v.type)).map((v) => ({ v, mark: (step === 3 && !occOn.includes(v.occupancy)) ? 'dim' as const : 'fill' as const,
    color: step === 3 ? OCC_COLOR[OCCUPANCY.indexOf(v.occupancy)] : undefined }))
  const line: [number, number][] | null = step === 5 && picked && pn ? [[picked.lon!, picked.lat!], [pn.venue.lon!, pn.venue.lat!]] : null

  const panel = (i: number): ReactNode => {
    if (i === 0) return <>
      <div className="ctrl ui">
        <Seg label="역세권 범위" value={radius} onChange={setRadius} options={RADII.map((r) => ({ v: r, label: `${r}m` }))} />
        <label><input type="checkbox" checked={bufKinds.일반역} onChange={() => setBufKinds({ ...bufKinds, 일반역: !bufKinds.일반역 })} /> 일반역 버퍼</label>
        <label><input type="checkbox" checked={bufKinds.환승역} onChange={() => setBufKinds({ ...bufKinds, 환승역: !bufKinds.환승역 })} /> 환승역 버퍼</label>
        <label>채움 <input type="color" value={bufStyle.color} onChange={(e) => setBufStyle({ ...bufStyle, color: e.target.value })} /></label>
        <label>투명도 <input type="range" min={0} max={0.6} step={0.02} value={bufStyle.opacity} onChange={(e) => setBufStyle({ ...bufStyle, opacity: +e.target.value })} /></label>
        <label>경계선 <input type="color" value={bufStyle.line} onChange={(e) => setBufStyle({ ...bufStyle, line: e.target.value })} /></label>
        <label>굵기 <input type="range" min={0} max={3} step={0.5} value={bufStyle.width} onChange={(e) => setBufStyle({ ...bufStyle, width: +e.target.value })} /></label>
      </div>
      {stations.length ? <CategoryBars vs={pts} cats={['환승역세권', '일반역세권', '비역세권']} of={subwayCat} title="유형별 역세권 구성" /> :
        <DataStatus data={data} need={['stations', 'buffers']} note={<>공식 지하철역 좌표(역명·노선·위경도)가 아직 없습니다. <code>data/raw/subway/stations.csv</code>에 넣고 <code>scripts/build_subway.py</code>를 실행하면 역(환승 노선 수 포함)과 반경별 버퍼 합집합(EPSG:5186에서 계산)이 만들어집니다. 정확한 노선 형상이 없으면 노선은 그리지 않습니다.</>} />}
      <p className="note">분류 규칙: 환승역 반경 안 → 환승역세권(우선), 그 밖에 일반역 반경 안 → 일반역세권, 나머지 → 비역세권. 같은 조건의 버퍼는 합집합으로 그립니다. 역 {stations.filter((f: any) => f.properties.inside).length}곳(서울 안, 환승역 {stations.filter((f: any) => f.properties.inside && f.properties.transfer).length}곳) + 경계 밖 1km 안 역. 노선 형상은 공식 자료가 없어 그리지 않습니다.</p>
      {stations.length > 0 && (() => {
        const sub = (t: VenueType) => shareOf(t, (v) => subwayCat(v) !== '비역세권'), tr = (t: VenueType) => shareOf(t, (v) => subwayCat(v) === '환승역세권')
        const hi = best(TYPES, sub), lo = best(TYPES, sub, false), th = best(TYPES, tr)
        return <Finding items={[
          { head: <>역 {radius}m 안(역세권)에 있는 비율은 {TYPES.map((t) => `${t} ${f1(sub(t))}%`).join(', ')}였다.</>,
            mean: <>{jo(hi, '가')} 지하철역 가까이 자리하는 경향이 가장 뚜렷하고, {jo(lo, '는')} 역에서 떨어진 곳에 있는 비율이 {f1(100 - sub(lo))}%로 상대적으로 높다.</> },
          { head: <>환승역 {radius}m 안 비율은 {jo(th, '가')} {f1(tr(th))}%로 가장 높았다.</>, mean: <>{jo(th, '는')} 여러 노선이 만나는 역 주변에 상대적으로 많이 자리한다.</> },
        ]} />
      })()}
    </>
    if (i === 1) {
      if (!centers.length) return <DataStatus data={data} need={['centers']} />
      const rows = [...CENTER_LEVELS, '중심지 밖'].map((lv) => ({ label: lv, color: CENTER_COLOR[lv], values: Object.fromEntries(TYPES.map((t) => [t, ofType(t).filter((v) => levelOf(v) === lv).length])) as Record<VenueType, number> }))
      const per = centers.map((c) => ({ label: c.properties.name, color: CENTER_COLOR[c.properties.level], values: Object.fromEntries(TYPES.map((t) => [t, ofType(t).filter((v) => inCenter(v, c)).length])) as Record<VenueType, number> }))
        .filter((r) => TYPES.some((t) => r.values[t] > 0)).sort((a, b) => TYPES.reduce((s, t) => s + b.values[t] - a.values[t], 0))
      const doc = (t: VenueType) => shareOf(t, (v) => levelOf(v) === '3도심'), out = (t: VenueType) => shareOf(t, (v) => levelOf(v) === '중심지 밖')
      const hd = best(TYPES, doc), ho = best(TYPES, out)
      return <>
        <p className="chart-title">중심지 위계별 영업 영화관 수(겹치면 높은 위계 우선)</p>
        <CountBars title="중심지 위계별 영화관 수" unit="곳" rows={rows} />
        <p className="chart-title">중심지별 영화관 수(영화관이 있는 곳만)</p>
        <CountBars title="중심지별 영화관 수" unit="곳" rows={per} />
        <p className="note">지도 위 보라색 면은 2040 서울도시기본계획 중심지의 <b>개략 위치</b>입니다. 대표 역을 중심으로 위계별 반경(도심 1.2km·광역 0.9km·지역 0.6km)을 그린 표현이며 공식 범위가 아닙니다. 면에 마우스를 올리면 이름과 대표 역이 보입니다. 경계 근처 영화관은 표현 반경에 따라 바뀔 수 있습니다.</p>
        <Finding items={[
          { head: <>3도심 개략 영역 안 비율은 {TYPES.map((t) => `${t} ${f1(doc(t))}%`).join(', ')}였다.</>,
            mean: <>{jo(hd, '는')} 도심에 상대적으로 집중되어 있다.</> },
          { head: <>중심지(도심·광역·지역) 밖 비율은 {jo(ho, '가')} {f1(out(ho))}%로 가장 높았다.</>,
            mean: <>{jo(ho, '는')} 중심지 체계 바깥의 생활권에도 넓게 자리한다.</> },
        ]} />
      </>
    }
    if (i === 2) return <DataStatus data={data} need={['commerce']} title="상권 지표 검토 중 — 본 분석에 넣지 않음"
      note={<>후보 변수(점포 수, 개·폐업, 추정매출, 집객시설, 상주·생활인구, 상권변화지표, 공실, 상권 유형)와 연도 맞춤 원칙은 <code>data/verify/commerce_proposal.md</code>에 정리했습니다. 현재 상권 값을 과거 폐업 영화관의 당시 환경처럼 쓰지 않으며, 임의 지수는 만들지 않습니다.</>} />
    if (i === 3) {
      const unk = pct(pts.filter((v) => v.occupancy === '확인 불가').length, pts.length)
      return <>
        <div className="occkey ui" role="group" aria-label="입점 형태">{OCCUPANCY.map((o, k) => <label key={o}><input type="checkbox" checked={occOn.includes(o)}
          onChange={() => setOccOn(occOn.includes(o) ? occOn.filter((x) => x !== o) : OCCUPANCY.filter((x) => x === o || occOn.includes(x)))} /> <i style={{ background: OCC_COLOR[k] }} />{o} <small>{pts.filter((v) => v.occupancy === o).length}</small></label>)}</div>
        <div className="donuts">{TYPES.map((t) => <Donut key={t} title={t} n={ofType(t).length} sub={`확인 ${occTop(t).n}곳`}
          parts={OCCUPANCY.map((o, k) => ({ label: o, value: ofType(t).filter((v) => v.occupancy === o).length, color: OCC_COLOR[k] }))} />)}</div>
        <p className="note">지도에서는 점의 모양이 유형, 색이 입점 형태입니다. 근거: LOCALDATA·KOFIC 주소에 적힌 건물명(백화점·아울렛·민자역사 등) 키워드. 웹 출처 확인 전이며 근거가 없으면 ‘확인 불가’(회색)입니다. 끈 항목의 영화관은 흐리게 표시됩니다.</p>
        <Finding items={[...TYPES.map((t) => { const o = occTop(t)
          return o.n ? { head: <>{nT(t, '는')} 입점 형태가 확인된 {o.n}곳 중 {o.k}곳({f1(pct(o.k, o.n))}%)이 {o.c}이다.</>,
            mean: <>{jo(t, '는')} 주로 {occShort(o.c)} 안에 들어선 형태로 존재한다{o.n < 10 ? '(확인 표본이 적어 경향으로만 본다)' : ''}.</> }
            : { head: <>{nT(t, '는')} 주소만으로 입점 형태를 확인한 곳이 없다.</> } }),
          { head: <>영업 영화관의 {f1(unk)}%는 아직 ‘확인 불가’이다.</>, mean: <>위 결과는 확인된 곳만의 경향이며, 건물 정보를 보완하면 바뀔 수 있다.</> }]} />
      </>
    }
    if (i === 4) {
      if (data.culture.status !== 'ok') return <DataStatus data={data} need={['culture']} />
      return <>
        <div className="toggles ui">{CULTURE_CATS.map((c) => <label key={c}><input type="checkbox" checked={cultOn.includes(c)}
          onChange={() => setCultOn(cultOn.includes(c) ? cultOn.filter((x) => x !== c) : CULTURE_CATS.filter((x) => x === c || cultOn.includes(x)))} /> {c}</label>)}</div>
        <Seg label="분석 기준" value={cultR} onChange={setCultR} options={[...CULTURE_RADII.map((r) => ({ v: r as number | 'nearest', label: `반경 ${r}m` })), { v: 'nearest' as const, label: '최근접 문화시설 거리' }]} />
        {cultStats ? <>
          <div className="tablewrap"><table className="mini-table culture"><thead><tr><th>분류</th>{TYPES.map((t) => <th key={t}><Sym type={t} /> n={cultStats.find((x) => x.t === t)!.n}</th>)}</tr></thead>
            <tbody>{cultOn.map((c) => <tr key={c}><td>{c}</td>{cultStats.map((x) => { const r = x.cats.find((y) => y.c === c)!
              return <td key={x.t}><span className="bar" style={{ width: `${r.share * 0.6}px`, background: TYPE_STYLE[x.t].color }} /> {f1(r.share)}%<br /><small>중앙값 {r.med}곳</small></td> })}</tr>)}</tbody>
          </table></div>
          <div className="interp">{cultStats.map((x) => { const best = [...x.cats].sort((a, b) => b.share - a.share)[0]
            return best && <p key={x.t} className="auto"><Sym type={x.t} /> {x.t}(n={x.n})는 반경 {cultR}m 안에 {best.c}이 있는 비율이 {f1(best.share)}%로 선택한 분류 중 가장 높았다.{x.n < 10 ? ' 표본이 적어 단정하기 어렵다.' : ''}</p> })}</div>
        </> : <BoxDot title="유형별 최근접 문화시설 거리" unit="km" groups={TYPES.map((t) => ({ key: t, type: t, items: pts.filter((v) => v.type === t).map((v) => ({ id: v.id, v: cultNearest(v) / 1000, label: v.name })) }))} />}
        {cultStats && (() => {
          const any = (t: VenueType) => pct(cultStats.find((x) => x.t === t)!.all.filter((k) => k > 0).length, cultStats.find((x) => x.t === t)!.n)
          const md = (t: VenueType) => median(cultStats.find((x) => x.t === t)!.all), hi = best(TYPES, md), lo = best(TYPES, md, false)
          return <Finding items={[
            { head: <>반경 {cultR}m 안 문화시설(선택 분류) 수의 중앙값은 {TYPES.map((t) => `${t} ${md(t)}곳`).join(', ')}이었다.</>,
              mean: <>{hi} 주변에 문화시설이 가장 촘촘하게 모여 있고, {lo} 주변은 상대적으로 적다. 1곳 이상 있는 비율은 {TYPES.map((t) => `${TYPE_STYLE[t].short} ${f1(any(t))}%`).join(', ')}로 나타났다.</> }]} />
        })()}
        {!cultStats && (() => { const md = (t: VenueType) => median(ofType(t).map(cultNearest)), lo = best(TYPES, md, false)
          return <Finding items={[{ head: <>최근접 문화시설까지 거리 중앙값은 {TYPES.map((t) => `${t} ${Math.round(md(t))}m`).join(', ')}였다.</>, mean: <>{jo(lo, '가')} 문화시설과 가장 가까이 자리한다.</> }]} /> })()}
        <p className="note">문화시설 {cult.length.toLocaleString()}곳(선택 분류). 셀 = 해당 분류가 반경 안에 1곳 이상 있는 영화관 비율 · 영화관당 개수 중앙값. 가깝다는 사실이 시설 간 협력이나 이용 연계를 뜻하지 않습니다.</p>
      </>
    }
    const label = { any: '가장 가까운 다른 영화관까지 거리', same: '가장 가까운 같은 유형 영화관까지 거리', other: '가장 가까운 다른 유형 영화관까지 거리', count: '반경 1km 안 다른 영화관 수' }[nnMetric]
    return <>
      <Seg label="지표" value={nnMetric} onChange={setNnMetric} options={[{ v: 'any' as const, label: '최근접(전체)' }, { v: 'same' as const, label: '같은 유형' }, { v: 'other' as const, label: '다른 유형' }, { v: 'count' as const, label: '1km 안 개수' }]} />
      <BoxDot ref={svg} title={label} unit={nnMetric === 'count' ? '곳' : 'km'} selected={pick} onPick={setPick}
        groups={TYPES.map((t) => ({ key: t, type: t, items: pts.filter((v) => v.type === t && (nnMetric === 'count' || nn[v.id][nnMetric]))
          .map((v) => ({ id: v.id, v: nnMetric === 'count' ? nn[v.id].count : nn[v.id][nnMetric]!.dist / 1000, label: v.name })) }))} />
      <p className="note"><b>정의</b>: {label}. 기준일 영업 중이고 좌표가 있는 {pts.length}곳끼리 직선거리(km)를 계산했습니다. 같은 건물의 영화관끼리는 0km입니다. 예를 들어 평균 0.9km는 각 영화관에서 가장 가까운 다른 영화관까지 거리의 평균이 0.9km라는 뜻이며, 1km마다 영화관이 있다거나 규칙적으로 분포한다는 뜻이 아닙니다. 가깝다는 것을 경쟁으로 해석하지 않습니다.
        {picked && pn && <><br /><b>{picked.name}</b> → {pn.venue.name} ({pn.venue.type}, {pn.venue.status}) {f1(pn.dist / 1000)}km</>}</p>
      <button className="ui link" onClick={() => saveSvg(svg.current, '3-6_인접성')}>SVG 저장</button>
      {(() => {
        const ch = best(TYPES, cntMed), cl = best(TYPES, cntMed, false), sf = best(TYPES, (t) => nnMed(t, 'same')), sn = best(TYPES, (t) => nnMed(t, 'same'), false), of = best(TYPES, (t) => nnMed(t, 'other'))
        return <Finding title="결론 — 영화관 간 인접성" items={[
          { head: <>반경 1km 안 다른 영화관 수(중앙값)는 {TYPES.map((t) => `${t} ${cntMed(t)}곳`).join(', ')}으로, {nT(ch, '이')} 가장 높은 밀집도를 보였고 {jo(cl, '는')} 가장 낮았다.</>,
            mean: <>{jo(ch, '은')} 여러 영화관이 모인 곳에 함께 자리하고, {jo(cl, '는')} 주변에 다른 영화관이 적은 곳에 흩어져 있다.</> },
          { head: <>같은 유형 영화관까지 거리(중앙값)는 {TYPES.map((t) => `${t} ${f1(nnMed(t, 'same'))}km`).join(', ')}로, {jo(sf, '는')} 같은 유형과의 인접성이 다른 분류에 비해 가장 낮았다.</>,
            mean: <>이는 {jo(sf, '가')} 서울 {gus(sf) === 25 ? '25개 자치구 모두에' : `25개 자치구 중 ${gus(sf)}개 자치구에`} 퍼져 있는 분포와 맞닿아 있다. 반대로 {jo(sn, '은')} {gus(sn)}개 자치구에만 있으며 같은 유형끼리 가까이 모여 있다.</> },
          { head: <>다른 유형 영화관까지 거리(중앙값)는 {nT(of, '가')} {f1(nnMed(of, 'other'))}km로 가장 멀었다.</>,
            mean: <>{jo(of, '는')} 다른 유형의 영화관과 섞이지 않고 따로 떨어진 곳에 자리하는 경우가 많다. (표본 20곳 미만인 유형은 경향으로만 본다)</> },
        ]} />
      })()}
    </>
  }

  return (
    <div className="loc">
      <nav className="steps ui" aria-label="입지 항목">
        {STEPS.map((s, i) => <button key={s} aria-current={step === i} onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth' })}>3-{i + 1} {s}</button>)}
      </nav>
      <div className="loc-grid">
        <div className="loc-map">
          <div className="layerpanel ui" aria-label="레이어">
            <TypeToggles value={on} onChange={setOn} />
            <label><input type="checkbox" checked={showGu} onChange={() => setShowGu(!showGu)} /> 행정구역 경계</label>
            <span className="muted">역·버퍼·중심지·입점 형태·문화시설 레이어는 해당 단계에서 켜집니다</span>
          </div>
          <SeoulMap data={data} label="입지 특성 지도" extras={extras} points={mapPts} line={line} selectedId={pick} showGu={showGu}
            onSelect={(v) => setPick(v?.id ?? null)} />
          <MapLegend types={on} marks={mapPts.some((p) => p.mark === 'dim') ? ['fill', 'dim'] : ['fill']} extra={<>
            {extras.some((e) => e.id === 'stations') && <span>○ 일반역 · ◎ 환승역(마우스를 올리면 역명)</span>}
            {step === 3 && OCCUPANCY.map((o, k) => occOn.includes(o) && <span key={o}><i className="lg-box" style={{ background: OCC_COLOR[k], borderRadius: '50%' }} /> {occShort(o)}</span>)}
            {extras.some((e) => e.id === 'buffers') && <span><i className="lg-box" style={{ background: bufStyle.color }} /> 역세권 {radius}m(합집합)</span>}
            {extras.some((e) => e.id === 'centers') && CENTER_LEVELS.map((lv) => <span key={lv}><i className="lg-box" style={{ background: CENTER_COLOR[lv] }} /> {lv}(개략)</span>)}
            {extras.some((e) => e.id === 'culture') && <span>○ 문화시설({cult.length})</span>}
            {line && <span>- - 최근접 연결선</span>}
          </>} />
        </div>
        <div className="loc-steps">
          {STEPS.map((s, i) => (
            <div key={s} className="step" data-i={i} ref={(r) => (refs.current[i] = r)}>
              <p className="eyebrow">3-{i + 1}</p>
              <h3>{s}</h3>
              {panel(i)}
              <SourceNote source={i === 4 ? SOURCES.culture : SOURCES.venues} n={`영업 중 좌표 있는 영화관 ${pts.length}곳`} />
            </div>
          ))}
        </div>
      </div>
      <div className="summary3">
        <h3>정리 — 각 유형의 영화관은 어떤 모습으로 자리하는가</h3>
        {TYPES.map((t) => { const o = occTop(t)
          return <div key={t} className="s-type" style={{ borderColor: TYPE_STYLE[t].color }}>
            <p><b><Sym type={t} /> {nT(t)}</b></p>
            <p>{stations.length > 0 && <>{f1(shareOf(t, (v) => subwayCat(v) !== '비역세권'))}%가 역 {radius}m 안에 있고, </>}
              {centers.length > 0 && <>{f1(shareOf(t, (v) => levelOf(v) === '3도심'))}%가 3도심, {f1(shareOf(t, (v) => levelOf(v) === '중심지 밖'))}%가 중심지 밖에 있다. </>}
              {o.n ? <>입점 형태가 확인된 곳은 주로 {occShort(o.c)} 안에 있으며({o.k}/{o.n}곳), </> : <>입점 형태는 아직 확인되지 않았고, </>}
              같은 유형 영화관과는 중앙값 {f1(nnMed(t, 'same'))}km 떨어져 있고 반경 1km 안에 다른 영화관이 중앙값 {cntMed(t)}곳 있다.</p>
          </div> })}
        <p className="note">수치는 위 단계에서 고른 반경·분류를 따릅니다. 분포의 차이를 기술한 것이며 원인을 뜻하지 않습니다. 상권(3-3)은 지표가 정해지지 않아 넣지 않았습니다.</p>
      </div>
      <DataTable caption="영업 영화관 입지 속성" head={['영화관', '유형', '자치구', '입점 형태', '최근접 영화관(km)']}
        rows={pts.map((v) => [v.name, v.type, v.gu, v.occupancy, nn[v.id].any ? +(nn[v.id].any!.dist / 1000).toFixed(2) : null])} />
    </div>
  )
}
