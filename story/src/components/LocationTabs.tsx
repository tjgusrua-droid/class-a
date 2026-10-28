import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CULTURE_CATS, CULTURE_RADII, OCCUPANCY, RADII, SOURCES, TYPES, TYPE_STYLE, type VenueType } from '../config'
import { distM, f1, located, median, nearest, pct, type DataSet, type Venue } from '../data'
import { parseCsv } from '../analysis'
import { BoxDot, DataTable } from './charts'
import SeoulMap, { type Overlay } from './SeoulMap'
import { DataStatus, MapLegend, ready, saveSvg, Seg, SourceNote, Sym, TypeToggles } from './ui'

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

export default function LocationTabs({ data, open, sel }: { data: DataSet; open: Venue[]; sel: VenueType | null }) {
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
    }) }
  }), [open, cultOn, cultR, data.culture.status])
  const cultNearest = (v: Venue) => Math.min(...cult.map((f: any) => distM(v, pt(f))))
  // 3-6: 기준일 영업 중 영화관끼리
  const nn = useMemo(() => Object.fromEntries(pts.map((v) => [v.id, {
    any: nearest(v, pts), same: nearest(v, pts, (o) => o.type === v.type), other: nearest(v, pts, (o) => o.type !== v.type),
    count: pts.filter((o) => o.id !== v.id && distM(v, o) <= 1000).length }])), [open])
  const picked = pts.find((v) => v.id === pick)
  const pn = picked && nnMetric !== 'count' ? nn[picked.id][nnMetric] : null
  const centersOk = ready(data, ['centers'])
  const centerNames = data.centerNames.status === 'ok' ? parseCsv(data.centerNames.data) : []

  const extras: Overlay[] = []
  if (step === 0 && data.buffers.status === 'ok') extras.push({ id: 'buffers', place: 'under',
    data: { ...data.buffers.data, features: data.buffers.data.features.filter((f: any) => f.properties.radius === radius && (bufKinds as any)[f.properties.kind]) },
    layers: [{ type: 'fill', paint: { 'fill-color': bufStyle.color, 'fill-opacity': bufStyle.opacity } }, { type: 'line', paint: { 'line-color': bufStyle.line, 'line-width': bufStyle.width } }] })
  if ((step === 0 || step === 1) && stations.length) extras.push({ id: 'stations', place: 'over', data: data.stations.data,
    layers: [{ type: 'circle', paint: { 'circle-radius': ['case', ['to-boolean', ['get', 'transfer']], 4.5, 2.6], 'circle-color': '#fff', 'circle-stroke-color': '#111', 'circle-stroke-width': ['case', ['to-boolean', ['get', 'transfer']], 2.4, 1] } }] })
  if (step === 1 && centersOk) extras.push({ id: 'centers', place: 'under', data: data.centers.data,
    layers: [{ type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#000', 'fill-opacity': 0.08 } },
      { type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111', 'circle-stroke-width': 2 } }] })
  if (step === 4 && cult.length) extras.push({ id: 'culture', place: 'over', data: { type: 'FeatureCollection', features: cult },
    layers: [{ type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 14, 4], 'circle-color': '#fff', 'circle-stroke-color': '#555', 'circle-stroke-width': 1 } }] })

  const mapPts = pts.filter((v) => on.includes(v.type)).map((v) => ({ v, mark: (step === 3 && !occOn.includes(v.occupancy)) || (sel && v.type !== sel) ? 'dim' as const : 'fill' as const }))
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
      <p className="note">분류 규칙: 환승역 반경 안 → 환승역세권(우선), 그 밖에 일반역 반경 안 → 일반역세권, 나머지 → 비역세권. 같은 조건의 버퍼는 합집합으로 그립니다.</p>
    </>
    if (i === 1) return <>
      {centersOk ? <p className="note">중심지 자료를 불러왔습니다. 범위(폴리곤)이면 안에 든 영화관을, 점이면 접근 거리만 계산합니다.</p> :
        <DataStatus data={data} need={['centers']} note="2040 서울도시기본계획의 공식 중심지 공간자료를 이 환경에서 받을 수 없었습니다. 중심지 범위를 임의의 원으로 그리지 않습니다. 계획도를 QGIS에서 지오리퍼런싱해 만든 경우 출처·표현 단위·구축 방법을 함께 넣어 주세요." />}
      <table className="mini-table"><caption>2040 서울도시기본계획 중심지 체계(명칭은 원문 대조 필요)</caption>
        <thead><tr><th>위계</th><th>중심지</th><th>위치</th></tr></thead>
        <tbody>{['3도심', '7광역중심', '12지역중심'].map((lv) => <tr key={lv}><td>{lv}</td><td>{centerNames.filter((c) => c.level === lv).map((c) => c.name).join(', ')}</td><td>자료 없음</td></tr>)}</tbody>
      </table>
      <p className="note">중심지 접근성과 지하철 접근성은 서로 다른 변수로 따로 비교합니다(두 자료가 모두 들어오면 위계별 역세권 구성을 함께 보여줍니다).</p>
    </>
    if (i === 2) return <DataStatus data={data} need={['commerce']} title="상권 지표 검토 중 — 본 분석에 넣지 않음"
      note={<>후보 변수(점포 수, 개·폐업, 추정매출, 집객시설, 상주·생활인구, 상권변화지표, 공실, 상권 유형)와 연도 맞춤 원칙은 <code>data/verify/commerce_proposal.md</code>에 정리했습니다. 현재 상권 값을 과거 폐업 영화관의 당시 환경처럼 쓰지 않으며, 임의 지수는 만들지 않습니다.</>} />
    if (i === 3) return <>
      <div className="toggles ui">{OCCUPANCY.map((o) => <label key={o}><input type="checkbox" checked={occOn.includes(o)}
        onChange={() => setOccOn(occOn.includes(o) ? occOn.filter((x) => x !== o) : OCCUPANCY.filter((x) => x === o || occOn.includes(x)))} /> {o} <small>{pts.filter((v) => v.occupancy === o).length}</small></label>)}</div>
      <CategoryBars vs={pts} cats={OCCUPANCY} of={(v) => v.occupancy} title="유형별 건축적 입점 형태" />
      <p className="note">근거: LOCALDATA·KOFIC 주소에 적힌 건물명(백화점·아울렛·민자역사 등) 키워드. 확신도 ‘중’, 웹 출처 확인 전입니다. 근거가 없으면 ‘확인 불가’로 둡니다. 어떤 건물 구조에 입점했는지를 보여줄 뿐, 영화 전후 활동 가능성과 같은 뜻이 아닙니다. 끈 항목의 영화관은 흐리게 표시됩니다.</p>
    </>
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
            <span className="muted">역·버퍼·중심지·입점 형태·문화시설 레이어는 해당 단계에서 켜집니다{!stations.length && ' (역 자료 없음)'}</span>
          </div>
          <SeoulMap data={data} label="입지 특성 지도" extras={extras} points={mapPts} line={line} selectedId={pick} showGu={showGu}
            onSelect={(v) => setPick(v?.id ?? null)} />
          <MapLegend types={on} marks={mapPts.some((p) => p.mark === 'dim') ? ['fill', 'dim'] : ['fill']} extra={<>
            {extras.some((e) => e.id === 'stations') && <span>○ 일반역 · ◎ 환승역</span>}
            {extras.some((e) => e.id === 'buffers') && <span><i className="lg-box" style={{ background: bufStyle.color }} /> 역세권 {radius}m(합집합)</span>}
            {extras.some((e) => e.id === 'centers') && <span>회색 면·원 = 중심지</span>}
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
      <DataTable caption="영업 영화관 입지 속성" head={['영화관', '유형', '자치구', '입점 형태', '최근접 영화관(km)']}
        rows={pts.map((v) => [v.name, v.type, v.gu, v.occupancy, nn[v.id].any ? +(nn[v.id].any!.dist / 1000).toFixed(2) : null])} />
    </div>
  )
}
