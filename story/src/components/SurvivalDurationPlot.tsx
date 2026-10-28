import { useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { CONFIG, TYPES, type TheaterType } from '../config'
import { activeIn, closedDuration, located, nearest, type DataSet, type Theater } from '../data'
import { DataTable, DotPlot } from './charts'
import SeoulMap from './SeoulMap'
import { MapLegend, savePng, saveSvg, TypeFilter } from './ui'

const OPEN_ERAS = [
  { id: 'all', label: '전체', ok: () => true },
  { id: '-1999', label: '~1999 개업', ok: (y: number) => y < 2000 },
  { id: '2000s', label: '2000년대 개업', ok: (y: number) => y >= 2000 && y < 2010 },
  { id: '2010s', label: '2010년 이후 개업', ok: (y: number) => y >= 2010 },
]
// 3장 기준 재사용. 자료가 있는 기준만 활성화한다
const CRITERIA = ['유형', '영화관 간 인접성', '지하철 접근성', '중심지 위계', '건축물 내 입점 형태', '문화시설과의 인접성']

export default function SurvivalDurationPlot({ data, all, sel, setSel }: { data: DataSet; all: Theater[]; sel: TheaterType | null; setSel: (t: TheaterType | null) => void }) {
  const [era, setEra] = useState('all')
  const [crit, setCrit] = useState('유형')
  const [pick, setPick] = useState<string | null>(null)
  const map = useRef<maplibregl.Map>()
  const svg = useRef<SVGSVGElement>(null)
  const E = OPEN_ERAS.find((e) => e.id === era)!
  const closedAll = all.filter((t) => t.status === '폐관')
  const dur = closedAll.map((t) => ({ t, d: closedDuration(t) })).filter((x) => x.d != null && (!sel || x.t.type === sel) && E.ok(x.t.openYear!)) as { t: Theater; d: number }[]
  const noDur = closedAll.filter((t) => closedDuration(t) == null)

  // 영화관 간 인접성: 폐업 직전 해에 영업 중이던 다른 영화관 중 가장 가까운 곳이 기준 거리 안인지
  const near = (t: Theater) => {
    if (!located(t)) return null
    const y = (t.closeYear ?? CONFIG.yearMax) - 1
    const n = nearest(t, all.filter((o) => located(o) && activeIn(o, y)))
    return n ? (n.dist <= CONFIG.nearRadiusM ? `${CONFIG.nearRadiusM}m 이내에 다른 영화관` : `${CONFIG.nearRadiusM}m 안에 없음`) : null
  }
  const groups = crit === '유형'
    ? TYPES.filter((t) => !sel || t === sel).map((t) => ({ key: t, type: t, items: dur.filter((x) => x.t.type === t) }))
    : [`${CONFIG.nearRadiusM}m 이내에 다른 영화관`, `${CONFIG.nearRadiusM}m 안에 없음`].map((k) => ({ key: k, items: dur.filter((x) => near(x.t) === k) }))
  const plotGroups = groups.map((g) => ({ ...g, items: g.items.map((x) => ({ id: x.t.id, v: x.d, label: `${x.t.name} (${x.t.openDate}~${x.t.closeDate})` })) }))

  const pts = all.filter((t) => (activeIn(t, CONFIG.yearMax) || t.status === '폐관') && (!sel || t.type === sel))
  return (
    <div className="split">
      <div className="mapcol">
        <SeoulMap data={data} label="유지·폐업 영화관 지도" onMap={(m) => (map.current = m)}
          points={pts.map((t) => ({ t, mark: t.status === '폐관' ? 'hollow' : 'fill' }))} highlight={null}
          onSelect={(ts) => setPick(ts.find((t) => t.status === '폐관')?.id ?? null)} />
        <MapLegend types={sel ? [sel] : [...TYPES]} marks={['fill', 'hollow']} />
      </div>
      <div className="chart">
        <div className="row ui"><TypeFilter value={sel} onChange={setSel} /></div>
        <div className="row ui">
          <div className="seg" role="group" aria-label="개업 시기">{OPEN_ERAS.map((e) => <button key={e.id} aria-pressed={era === e.id} onClick={() => setEra(e.id)}>{e.label}</button>)}</div>
          <label>입지 기준 <select value={crit} onChange={(e) => setCrit(e.target.value)}>
            {CRITERIA.map((c) => <option key={c} value={c} disabled={!['유형', '영화관 간 인접성'].includes(c)}>{c}{['유형', '영화관 간 인접성'].includes(c) ? '' : ' (데이터 준비 중)'}</option>)}
          </select></label>
        </div>
        <p className="chart-title">폐업한 영화관의 운영기간 (개관일 → 폐관일)</p>
        <DotPlot ref={svg} title="폐업 영화관 운영기간" unit="년" groups={plotGroups} selected={pick} onPick={setPick} />
        <p className="note">폐업 영화관만 대상입니다(2010~2025 폐관 {closedAll.length}곳 중 개관일·폐관일이 모두 있는 {closedAll.length - noDur.length}곳). 지금 영업 중인 영화관의 ‘현재까지 기간’은 끝나지 않은 값이라 섞지 않았습니다. 이름·브랜드 전환은 폐업이 아닙니다. 점 하나 = 영화관 하나, 극단값도 모두 표시합니다.
          {crit === '영화관 간 인접성' && <> 인접성 = 폐업 직전 해에 영업 중이던 다른 영화관까지 거리가 {CONFIG.nearRadiusM}m 이내인지.</>}
          {' '}집단 간 차이가 운영기간의 원인이라는 뜻은 아닙니다.</p>
        <div className="ui">
          <button className="link" onClick={() => savePng(map.current?.getCanvas(), '5_유지폐업지도')}>지도 PNG 저장</button>
          <button className="link" onClick={() => saveSvg(svg.current, '5_운영기간')}>그래프 SVG 저장</button>
        </div>
        <DataTable caption="폐업 영화관 운영기간" head={['영화관', '유형', '개관일', '폐관일', '운영기간(년)']}
          rows={dur.sort((a, b) => a.d - b.d).map((x) => [x.t.name, x.t.type, x.t.openDate, x.t.closeDate, x.d.toFixed(1)])} />
        {noDur.length > 0 && <p className="note">운영기간 계산 불가(날짜 없음): {noDur.map((t) => t.name).join(', ')}</p>}
      </div>
    </div>
  )
}
