import { useMemo, useState } from 'react'
import { SOURCES, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { distM, f1, jo, located, pct, topBy, type DataSet, type Venue } from '../data'
import { DataTable } from './charts'
import SeoulMap, { stationOverlay, type Overlay } from './SeoulMap'
import { MapLegend, SourceNote, Sym, TypeToggles, More } from './ui'

type Spot = { lon: number; lat: number; name: string }
type Cluster = { at: Spot; members: Venue[]; names: string[]; center?: string }
const R = 1000 // 모임 판정 반경(m)

// 역 반경 1km 안에 같은 유형이 가장 많이 모인 곳을 두 번까지 찾는다(첫 모임에 든 영화관은 빼고 다시 찾음)
function clusters(xs: Venue[], st: Spot[], centers: any[]): Cluster[] {
  let rest = xs.filter(located)
  const out: Cluster[] = []
  for (let k = 0; k < 2; k++) {
    let best: { at: Spot; members: Venue[] } | null = null
    for (const s of st) { const m = rest.filter((v) => distM(v, s) <= R); if (!best || m.length > best.members.length) best = { at: s, members: m } }
    if (!best || best.members.length < 2) break
    const near = (v: Venue) => st.reduce((a, s) => (distM(v, s) < distM(v, a) ? s : a)).name
    const c = centers.find((f) => f.properties.anchors.some((a: number[]) => distM(best!.at, { lon: a[0], lat: a[1] }) <= f.properties.radius))
    out.push({ ...best, names: topBy(best.members, near, 3).map(([n]) => n), center: c?.properties.name })
    rest = rest.filter((v) => !best!.members.includes(v))
  }
  return out
}

// 모인 영화관들을 감싸는 외곽선: 각 점 둘레 r m 원을 이어 볼록 껍질을 만든다(점들에서 r만큼 밀어낸 선)
function hull(members: Venue[], r = 420) {
  const k = 111320, ps: number[][] = []
  members.forEach((v) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * 2 * Math.PI
    ps.push([v.lon! + (r * Math.cos(a)) / (k * Math.cos((v.lat! * Math.PI) / 180)), v.lat! + (r * Math.sin(a)) / k]) } })
  ps.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (xs: number[][]) => xs.reduce<number[][]>((h, p) => { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); return h }, [])
  const lo = half(ps), up = half([...ps].reverse())
  const ring = [...lo.slice(0, -1), ...up.slice(0, -1)]
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
}

// 데이터를 모르는 사람도 한 번에 읽을 수 있는 결론 문장
function headline(t: VenueType, n: number, gus: number, cs: Cluster[]) {
  const [a, b] = cs
  if (!a) return { head: `${jo(t, '는')} 2곳 이상 모인 역 주변이 없다.`, mean: '' }
  const p = pct(a.members.length, n), where = `${a.center ? `${a.center} 일대의 ` : ''}${a.names.join('·')}역 주변`
  if (p >= 25) return { head: `${jo(t, '는')} ${where}에 모여 있다.`,
    mean: `${n}곳 중 ${a.members.length}곳(${f1(p)}%)이 이 반경 1km 안에 있다${b && b.members.length >= 2 ? `. 두 번째로 ${b.center ? `${b.center} 일대의 ` : ''}${b.names.join('·')}역 주변에 ${b.members.length}곳이 모여 있다` : ''}.` }
  return { head: `${jo(t, '는')} 특정 지역에 몰리지 않고 서울 곳곳에 퍼져 있다.`,
    mean: `가장 많이 모인 ${where}도 ${n}곳 중 ${a.members.length}곳(${f1(p)}%)에 그치며, 영화관이 있는 자치구가 25개 중 ${gus}개다.` }
}

export default function Distribution({ data, open }: { data: DataSet; open: Venue[] }) {
  const [sel, setSel] = useState<VenueType | null>(null) // 이 장면에서만 쓰는 선택
  const [on, setOn] = useState<VenueType[]>([...TYPES])
  const [showSt, setShowSt] = useState(true)
  const [pick, setPick] = useState<Venue | null>(null)
  const by = (t: VenueType) => open.filter((v) => v.type === t)
  const st: Spot[] = data.stations.status === 'ok' ? data.stations.data.features.filter((f: any) => f.properties.inside)
    .map((f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: f.properties.name })) : []
  const centers: any[] = data.centers.status === 'ok' ? data.centers.data.features : []
  const cl = useMemo(() => Object.fromEntries(TYPES.map((t) => [t, st.length ? clusters(by(t), st, centers) : []])) as Record<VenueType, Cluster[]>, [open, st.length])
  const shown = open.filter((v) => on.includes(v.type))
  const focus = sel
  const guRows = topBy(open, (v) => v.gu, 25).map(([gu]) => [gu, ...TYPES.map((t) => by(t).filter((v) => v.gu === gu).length), open.filter((v) => v.gu === gu).length])
  // 모여 있는 유형(첫 모임이 25% 이상)만, 3곳 이상 모인 곳의 외곽선
  const clustered = (t: VenueType) => cl[t][0] && pct(cl[t][0].members.length, by(t).filter(located).length) >= 25
  const rings: Overlay = { id: 'clusters', place: 'under', data: { type: 'FeatureCollection', features: TYPES.filter((t) => on.includes(t) && (!focus || focus === t) && clustered(t))
    .flatMap((t) => cl[t].filter((c) => c.members.length >= 3).map((c) => ({ type: 'Feature', properties: { color: TYPE_STYLE[t].color, t }, geometry: hull(c.members) }))) },
    layers: [{ type: 'fill', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 } }, { type: 'line', paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.9 } }] }

  return (
    <div className="dist">
      <div className="dist-map">
        <div className="row ui">
          <TypeToggles value={on} onChange={setOn} counts={Object.fromEntries(TYPES.map((t) => [t, by(t).length]))} />
          <label className="chk"><input type="checkbox" checked={showSt} onChange={() => setShowSt(!showSt)} /> 지하철 노선·역</label>
        </div>
        <SeoulMap data={data} label="유형별 영화관 분포 지도" selectedId={pick?.id} extras={[...(showSt ? stationOverlay(data) : []), rings]}
          points={shown.map((v) => ({ v, mark: focus && v.type !== focus ? 'dim' : 'fill' }))} onSelect={setPick} />
        <MapLegend types={on} marks={focus ? ['fill', 'dim'] : ['fill']} extra={<>
          {showSt && <span>━ 지하철 노선 · ○ 역</span>}
          <span>테두리 = 같은 유형이 3곳 이상 모인 곳</span></>} />
      </div>
      <div className="dist-text">
        <div className="headlines">
          {(focus ? [focus] : TYPES).map((t) => { const h = headline(t, by(t).filter(located).length, new Set(by(t).map((v) => v.gu)).size, cl[t])
            return <div key={t} className="headline" style={{ borderLeftColor: TYPE_STYLE[t].color }} onClick={() => setSel(sel === t ? null : t)}>
              <p className="find-big"><Sym type={t} /> {h.head}</p>{h.mean && <p className="find-sub">{h.mean}</p>}</div> })}
        </div>
        <More>문장은 ‘역 반경 1km 안에 같은 유형이 가장 많은 곳’을 계산해 자동으로 만듭니다(25% 이상이 한곳에 있으면 ‘모여 있다’). 문장을 누르면 그 유형만 강조합니다. 자치구 상위: {TYPES.map((t) => `${TYPE_STYLE[t].short} ${topBy(by(t), (v) => v.gu, 2).map(([k, n]) => `${k} ${n}`).join('·')}`).join(' / ')}</More>
        <details className="table ui">
          <summary>자치구별 표 · 자료와 계산 방법</summary>
          <DataTable caption="자치구별 영업 영화관 수" head={['자치구', ...TYPES, '계']} rows={guRows} />
          <SourceNote source={`${SOURCES.venues} · ${SOURCES.subway}`} n={`영업 ${open.length}곳(${TYPES.map((t) => `${TYPE_STYLE[t].short} ${by(t).length}`).join(' · ')})`}
            method="역 반경 1km(직선거리) 안 같은 유형 영화관 수가 가장 많은 역을 찾고, 그 영화관들을 뺀 뒤 한 번 더 찾음. 역 이름 = 모인 영화관들의 가장 가까운 역 상위 3곳. 군집 검정은 하지 않음"
            caution={`좌표 없는 영업 영화관 ${open.filter((v) => !located(v)).length}곳은 지도에서 빠짐. 중심지 이름은 2040 중심지 개략 영역 기준. 유형별 개소·스크린·좌석 비중은 1장 구성비 그래프 참고.`} />
        </details>
      </div>
    </div>
  )
}
