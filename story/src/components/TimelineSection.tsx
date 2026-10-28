import { useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { CONFIG, ERAS, TYPES, type TheaterType } from '../config'
import { activeIn, closedIn, openedIn, type DataSet, type Theater } from '../data'
import { DataTable, TimelineChart } from './charts'
import SeoulMap, { type Point } from './SeoulMap'
import { MapLegend, savePng, saveSvg, TypeFilter } from './ui'

const YEARS = Array.from({ length: CONFIG.yearMax - CONFIG.yearMin + 1 }, (_, i) => CONFIG.yearMin + i)

export default function TimelineSection({ data, all, sel, setSel }: { data: DataSet; all: Theater[]; sel: TheaterType | null; setSel: (t: TheaterType | null) => void }) {
  const [year, setYear] = useState(CONFIG.yearMax)
  const [era, setEra] = useState<string | null>(null)
  const map = useRef<maplibregl.Map>()
  const svg = useRef<SVGSVGElement>(null)
  const ts = all.filter((t) => !sel || t.type === sel)
  const opened = YEARS.map((y) => ts.filter((t) => openedIn(t, y)).length)
  const closed = YEARS.map((y) => ts.filter((t) => closedIn(t, y)).length)
  const active = YEARS.map((y) => ts.filter((t) => activeIn(t, y)).length)
  const E = ERAS.find((e) => e.id === era)
  const range: [number, number] = E ? [E.from, E.to] : [year, year]
  const inR = (y: number | null) => y != null && y >= range[0] && y <= range[1]

  // 지도: 구간 끝 해에 영업 중(채움), 구간 안에 개업(검은 테), 구간 안에 폐업(외곽선)
  const points: Point[] = []
  for (const t of ts) {
    if (t.status === '폐관' && inR(t.closeYear)) points.push({ t, mark: 'hollow' })
    else if (activeIn(t, range[1])) points.push({ t, mark: !t.renamedFrom && inR(t.openYear) ? 'new' : 'fill' })
  }
  const span = (e: (typeof ERAS)[number]) => {
    const ys = YEARS.filter((y) => y >= e.from && y <= e.to)
    const o = ys.reduce((a, y) => a + opened[YEARS.indexOf(y)], 0), c = ys.reduce((a, y) => a + closed[YEARS.indexOf(y)], 0)
    return { n: ys.length, o, c }
  }
  const renamed = ts.filter((t) => t.closeKind === '전환' && t.closeYear != null && t.closeYear >= CONFIG.yearMin).length

  return (
    <div className="split">
      <div className="mapcol">
        <SeoulMap data={data} label={`${range[0]}–${range[1]} 영화관 개업·폐업 지도`} points={points} onMap={(m) => (map.current = m)} />
        <MapLegend types={sel ? [sel] : [...TYPES]} marks={['fill', 'new', 'hollow']} />
      </div>
      <div className="chart">
        <div className="row ui">
          <TypeFilter value={sel} onChange={setSel} />
        </div>
        <div className="row ui">
          <div className="seg" role="group" aria-label="시기 선택">
            {ERAS.map((e) => <button key={e.id} disabled={!e.ready} aria-pressed={era === e.id} onClick={() => setEra(era === e.id ? null : e.id)}
              title={e.ready ? '' : '2010년 이전 폐업 기록이 없어 데이터 준비 중'}>{e.label}{!e.ready && ' (준비 중)'}</button>)}
          </div>
          <label className="slider">연도 <input type="range" min={CONFIG.yearMin} max={CONFIG.yearMax} value={year} onChange={(e) => { setYear(+e.target.value); setEra(null) }} /> <b>{year}</b></label>
        </div>
        <TimelineChart ref={svg} title="연도별 개업·폐업과 연말 영업 중 영화관 수" years={YEARS} opened={opened} closed={closed} active={active}
          range={E ? range : null} year={year} onYear={(y) => { setYear(y); setEra(null) }} />
        <table className="mini-table">
          <thead><tr><th>시기</th><th>기간</th><th>개업 (연평균)</th><th>폐업 (연평균)</th></tr></thead>
          <tbody>{ERAS.map((e) => { const s = span(e); return (
            <tr key={e.id} className={era === e.id ? 'on' : ''}><td>{e.label}</td>
              {e.ready ? <><td>{s.n}년</td><td>{s.o}곳 ({(s.o / s.n).toFixed(1)})</td><td>{s.c}곳 ({(s.c / s.n).toFixed(1)})</td></> : <td colSpan={3}>데이터 준비 중</td>}
            </tr>) })}</tbody>
        </table>
        <p className="note">개업 = 영진위 개관일 연도, 폐업 = 폐관 기록 연도. 이름·브랜드만 바뀐 {renamed}건은 개·폐업으로 세지 않았습니다. 2010년 목록에 이미 있던 극장의 개업은 그 이전이므로 막대에 없습니다. 음영은 시기 표시일 뿐 원인을 뜻하지 않습니다.</p>
        <div className="ui">
          <button className="link" onClick={() => savePng(map.current?.getCanvas(), `4_개폐업지도_${range.join('-')}`)}>지도 PNG 저장</button>
          <button className="link" onClick={() => saveSvg(svg.current, '4_개폐업_연도별')}>그래프 SVG 저장</button>
        </div>
        <DataTable caption="연도별 개업·폐업·영업 중(곳)" head={['연도', '개업', '폐업', '연말 영업 중']} rows={YEARS.map((y, i) => [y, opened[i], closed[i], active[i]])} />
      </div>
    </div>
  )
}
