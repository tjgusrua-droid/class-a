// 3장 정리: 유형마다 입지 모습을 한 장의 그림 카드로(역·중심지·입점·인접)
import { CENTER_COLOR, CENTER_LEVELS, OCC_COLOR, OCCUPANCY, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { distM, f1, located, nearest, pct, type DataSet, type Venue } from '../data'
import { OccupancyIcon } from './Isometric'
import { DataTable } from './charts'
import { Sym } from './ui'

const pt = (f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

// 반경 1km 원 안에 평균 개수만큼 점, 같은 유형까지 평균 거리만큼 떨어진 점
function Neighborhood({ color, count, dist }: { color: string; count: number; dist: number }) {
  const R = 46, c = 70, n = Math.round(count), d = Math.min(dist, 2.6) * R
  return (
    <svg viewBox="0 0 260 150" className="nb" role="img" aria-label={`반경 1km 안 평균 ${f1(count)}곳, 같은 유형까지 평균 ${f1(dist)}km`}>
      <circle cx={c} cy={80} r={R} fill={color} fillOpacity={0.08} stroke={color} strokeDasharray="3 3" />
      <text x={c} y={80 + R + 16} fontSize="13" textAnchor="middle" fill="#777">반경 1km</text>
      {Array.from({ length: n }, (_, i) => { const a = (i / Math.max(1, n)) * 2 * Math.PI + 0.6, r = R * (0.45 + 0.35 * ((i * 37) % 10) / 10)
        return <circle key={i} cx={c + r * Math.cos(a)} cy={80 + r * Math.sin(a)} r={4.5} fill="#888" /> })}
      <line x1={c} y1={80} x2={c + d} y2={80} stroke={color} strokeWidth="1.5" />
      <circle cx={c} cy={80} r={7} fill={color} stroke="#fff" strokeWidth="2" />
      <circle cx={c + d} cy={80} r={6} fill="#fff" stroke={color} strokeWidth="2.5" />
      <text x={c + d} y={62} fontSize="13" fill="#333" textAnchor="middle">같은 유형</text>
      <text x={c + d / 2 + 10} y={102} fontSize="14" fontWeight="700" textAnchor="middle" fill={color}>평균 {f1(dist)}km</text>
    </svg>
  )
}

export default function LocationProfile({ data, open }: { data: DataSet; open: Venue[] }) {
  const pts = open.filter(located)
  const stations = data.stations.status === 'ok' ? data.stations.data.features : []
  const centers: any[] = data.centers.status === 'ok' ? data.centers.data.features : []
  const of = (t: VenueType) => pts.filter((v) => v.type === t)
  const levelOf = (v: Venue) => CENTER_LEVELS.find((lv) => centers.some((c) => c.properties.level === lv && c.properties.anchors.some((a: number[]) => distM(v, { lon: a[0], lat: a[1] }) <= c.properties.radius))) ?? '중심지 밖'
  const P = Object.fromEntries(TYPES.map((t) => {
    const xs = of(t), known = xs.filter((v) => v.occupancy !== '확인 불가')
    const occ = OCCUPANCY.map((c) => ({ c, k: known.filter((v) => v.occupancy === c).length })).sort((a, b) => b.k - a.k)[0]
    const lv = Object.fromEntries([...CENTER_LEVELS, '중심지 밖'].map((l) => [l, pct(xs.filter((v) => levelOf(v) === l).length, xs.length)]))
    return [t, { n: xs.length, sub: pct(xs.filter((v) => stations.some((f: any) => distM(v, pt(f)) <= 500)).length, xs.length), lv, occ, known: known.length,
      same: avg(xs.map((v) => nearest(v, pts, (o) => o.type === v.type)?.dist).filter((x): x is number => x != null)) / 1000,
      cnt: avg(xs.map((v) => pts.filter((o) => o.id !== v.id && distM(v, o) <= 1000).length)) }]
  })) as Record<VenueType, any>
  // 한 줄 초상: 계산된 값으로 문장 조각을 고른다
  const portrait = (t: VenueType) => { const p = P[t]
    return [p.sub >= 80 ? '역 가까이' : p.sub < 70 ? '역에서 조금 떨어진 곳까지' : '대체로 역 가까이',
      p.lv['3도심'] >= 35 ? '도심에 모여' : p.lv['중심지 밖'] >= 45 ? '중심지 밖 생활권까지 퍼져' : '여러 중심지에 나뉘어',
      p.known ? `${p.occ.c.replace(' 내 입점', '').replace('기타(', '').replace(')', '').replace('복합상업시설(', '')} 안에` : '',
      p.cnt === Math.max(...TYPES.map((x) => P[x].cnt)) ? '주변에 다른 영화관이 가장 많다' : p.cnt === Math.min(...TYPES.map((x) => P[x].cnt)) ? '주변에 다른 영화관이 적다' : '주변에 다른 영화관이 꽤 있다'].filter(Boolean).join(', ') }

  return (
    <div className="profile">
      <h3>정리 — 각 유형의 영화관은 어떤 모습으로 자리하는가?</h3>
      <div className="profile-grid">
        <div className="profile-rowhead"><span /><span>지하철역 500m 안</span><span>중심지 체계</span><span>주된 입점 형태</span><span>주변 영화관과의 관계</span></div>
        {TYPES.map((t) => { const p = P[t], c = TYPE_STYLE[t].color
          return <div key={t} className="profile-col" style={{ borderColor: c }}>
            <div className="p-head"><p className="find-big" style={{ color: c }}><Sym type={t} /> {t} <small>n={p.n}</small></p><p className="p-portrait">{portrait(t)}</p></div>
            <div className="p-cell"><div className="waffle">{Array.from({ length: 20 }, (_, i) => <i key={i} style={{ background: i < Math.round(p.sub / 5) ? c : '#e6e6e6' }} />)}</div>
              <p><b>{f1(p.sub)}%</b>가 역 500m 안</p></div>
            <div className="p-cell"><div className="lvbar">{[...CENTER_LEVELS, '중심지 밖'].map((l) => p.lv[l] > 0 && <i key={l} style={{ width: `${p.lv[l]}%`, background: CENTER_COLOR[l] }} title={`${l} ${f1(p.lv[l])}%`}>{p.lv[l] >= 14 ? `${p.lv[l].toFixed(0)}%` : ''}</i>)}</div>
              <p><b>{f1(p.lv['3도심'])}%</b> 3도심 · <b>{f1(p.lv['중심지 밖'])}%</b> 중심지 밖</p></div>
            <div className="p-cell"><OccupancyIcon label={p.known ? p.occ.c : ''} color={p.known ? OCC_COLOR[OCCUPANCY.indexOf(p.occ.c)] : '#ccc'} />
              <p>{p.known ? <><b>{p.occ.c.replace(' 내 입점', '')}</b> {p.occ.k}/{p.known}곳</> : '확인된 곳 없음'} <small>(확인 불가 {p.n - p.known})</small></p></div>
            <div className="p-cell"><Neighborhood color={c} count={p.cnt} dist={p.same} />
              <p>1km 안 다른 영화관 평균 <b>{f1(p.cnt)}곳</b> · 같은 유형까지 평균 <b>{f1(p.same)}km</b></p></div>
          </div> })}
      </div>
      <div className="profile-key">
        {[...CENTER_LEVELS, '중심지 밖'].map((l) => <span key={l}><i style={{ background: CENTER_COLOR[l] }} /> {l}</span>)}
        <span>회색 점 = 반경 1km 안 다른 영화관(평균 개수) · 흰 점 = 가장 가까운 같은 유형(평균 거리)</span>
      </div>
      <p className="note">영업 중 좌표가 있는 {pts.length}곳. 거리·개수는 평균, 직선거리. 중심지는 2040 중심지 개략 영역, 입점 형태는 확인된 곳만. 분포의 차이를 기술한 것이며 원인을 뜻하지 않습니다.</p>
      <DataTable caption="영업 영화관 입지 속성" head={['영화관', '유형', '자치구', '입점 형태', '중심지']} rows={pts.map((v) => [v.name, v.type, v.gu, v.occupancy, levelOf(v)])} />
    </div>
  )
}
