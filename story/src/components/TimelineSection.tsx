import { useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { ALL_COLOR, DATA_DATE, ERAS, SOURCES, TYPE_STYLE, TYPES, YEAR_MIN, type VenueType } from '../config'
import { closedIn, f1, openedIn, operatingIn, type DataSet, type Venue } from '../data'
import { DataTable, MetricChart } from './charts'
import SeoulMap, { type Point } from './SeoulMap'
import { Finding, MapLegend, savePng, saveSvg, Seg, SourceNote, TypeSelect } from './ui'

const LAST = new Date(DATA_DATE)
const YEARS = Array.from({ length: LAST.getFullYear() - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i)
const METRICS = {
  operating: { label: '연도별 운영 영화관 수', unit: '곳', kind: 'line' },
  screens: { label: '연도별 운영 스크린 수(KOFIC 수록 영화관)', unit: '개', kind: 'line' },
  seats: { label: '연도별 운영 좌석 수(KOFIC 수록 영화관)', unit: '석', kind: 'line' },
  special: { label: '연도별 특별관 스크린 수(KOFIC 스크린 상세)', unit: '개', kind: 'line' },
  flow: { label: '연도별 개업·폐업', unit: '곳', kind: 'flow' },
  opened: { label: '연도별 신규 개업 수', unit: '곳', kind: 'bar' },
  closed: { label: '연도별 폐업 수', unit: '곳', kind: 'bar' },
  cum_opened: { label: `누적 개업 수(${YEAR_MIN}년부터)`, unit: '곳', kind: 'line' },
  cum_closed: { label: `누적 폐업 수(${YEAR_MIN}년부터)`, unit: '곳', kind: 'line' },
} as const
type MetricKey = keyof typeof METRICS

export default function TimelineSection({ data, all }: { data: DataSet; all: Venue[] }) {
  const [sel, setSel] = useState<VenueType | null>(null) // 이 장면에서만 쓰는 선택
  const [year, setYear] = useState(2025)
  const [era, setEra] = useState<string | null>(null)
  const [metric, setMetric] = useState<MetricKey>('operating')
  const map = useRef<maplibregl.Map>()
  const svg = useRef<SVGSVGElement>(null)
  const yearly: any[] = data.yearly.status === 'ok' ? data.yearly.data : []
  const row = (y: number) => yearly.find((r) => r.year === y && r.type === (sel ?? '전체'))
  const series = (k: string, t: string = sel ?? '전체') => YEARS.map((y) => yearly.find((r) => r.year === y && r.type === t)?.[k] ?? null)
  const M = METRICS[metric]
  const values = metric === 'flow' ? series('opened') : series(metric)
  const E = ERAS.find((e) => e.id === era)
  const range: [number, number] = E ? [E.from, E.to] : [year, year]
  const vs = all.filter((v) => !sel || v.type === sel)
  const inR = (y?: number) => y != null && y >= range[0] && y <= range[1]
  const points: Point[] = []
  for (const v of vs) {
    if (closedIn(v, v.closeD?.getFullYear() ?? -1) && inR(v.closeD!.getFullYear())) points.push({ v, mark: 'hollow' })
    else if (operatingIn(v, range[1], LAST)) points.push({ v, mark: !v.bulkOpen && inR(v.openD?.getFullYear()) ? 'new' : 'fill' })
  }
  const yr = row(year)
  const sumR = (k: string, e: (typeof ERAS)[number]) => YEARS.filter((y) => y >= e.from && y <= e.to).reduce((a, y) => a + (row(y)?.[k] ?? 0), 0)
  const unsure = YEARS.reduce((a, y) => a + (row(y)?.opened_unsure ?? 0), 0)
  const color = sel ? TYPE_STYLE[sel].color : ALL_COLOR

  const eraRows = ERAS.map((e) => { const n = Math.min(e.to, LAST.getFullYear()) - e.from + 1; return { e, n, o: sumR('opened', e), c: sumR('closed', e) } })
  const a0 = row(YEAR_MIN)?.operating, a1 = row(2025)?.operating

  return (
    <div className="tl">
      <div className="tl-map">
        <SeoulMap data={data} label={`${range[0]}–${range[1]} 영화관 운영·개업·폐업 지도`} points={points} onMap={(m) => (map.current = m)} />
        <MapLegend types={sel ? [sel] : [...TYPES]} marks={['fill', 'new', 'hollow']} />
        <p className="note">{E ? `${E.label}: 구간 끝 해에 운영 중(채움), 구간 안 개업(검은 테), 구간 안 폐업(외곽선)` : `${year}년: 운영 중(채움), 이 해 개업(검은 테), 이 해 폐업(외곽선)`} · 지도 {points.filter((p) => p.v.lon != null).length}곳(좌표 없음 {points.filter((p) => p.v.lon == null).length}곳)</p>
      </div>
      <div className="tl-side">
        <div className="row"><TypeSelect value={sel} onChange={setSel} /></div>
        <div className="row ui">
          <label className="slider">연도 <input type="range" min={YEAR_MIN} max={YEARS[YEARS.length - 1]} value={year} onChange={(e) => { setYear(+e.target.value); setEra(null) }} /> <b>{year}</b></label>
          <Seg label="시기" value={era ?? ''} onChange={(v) => setEra(v === era ? null : v || null)} options={ERAS.map((e) => ({ v: e.id, label: e.label }))} />
        </div>
        <div className="keyfig">
          <div><b>{yr?.operating ?? '—'}</b><span>{year}년 운영</span></div>
          <div><b>{yr?.opened ?? '—'}</b><span>개업{yr?.opened_unsure ? ` (+불확실 ${yr.opened_unsure})` : ''}</span></div>
          <div><b>{yr?.closed ?? '—'}</b><span>폐업</span></div>
          <div><b>{yr?.screens ?? '자료 미확보'}</b><span>스크린(KOFIC)</span></div>
        </div>
        {a0 != null && a1 != null && <Finding items={[
          { head: <>{sel ?? '전체'} 운영 영화관은 {YEAR_MIN}년 {a0}곳에서 2025년 {a1}곳이 되었다.</>,
            mean: <>연평균 개업은 {eraRows.map((x) => `${x.e.label} ${f1(x.o / x.n)}곳`).join(' → ')}, 연평균 폐업은 {eraRows.map((x) => `${f1(x.c / x.n)}곳`).join(' → ')}로 바뀌었다.</> }]} />}
        <div className="row ui metricpick" role="group" aria-label="지표 선택">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)}>{METRICS[k].label.replace(/\(.*\)/, '').replace('연도별 ', '')}</button>)}
        </div>
        <MetricChart ref={svg} title={M.label} label={`${M.label} — ${sel ?? '전체'}`} years={YEARS} values={values} down={metric === 'flow' ? series('closed') : undefined}
          kind={M.kind} color={color}
          parts={sel ? undefined : TYPES.map((t) => ({ key: t, values: series(metric === 'flow' ? 'opened' : metric, t), down: metric === 'flow' ? series('closed', t) : undefined }))}
          unit={M.unit} year={year} onYear={(y) => { setYear(y); setEra(null) }} range={E ? range : null} partialYear={LAST.getFullYear()} />
        <div className="ui">
          <button className="link" onClick={() => savePng(map.current?.getCanvas(), `4_지도_${range.join('-')}`)}>지도 PNG 저장</button>
          <button className="link" onClick={() => saveSvg(svg.current, `4_${metric}`)}>그래프 SVG 저장</button>
        </div>
        <details className="table ui">
          <summary>시기별 개업·폐업 표 · 자료 기준</summary>
          <table className="mini-table">
            <thead><tr><th>시기</th><th>기간</th><th>개업 총수 (연평균)</th><th>폐업 총수 (연평균)</th></tr></thead>
            <tbody>{eraRows.map(({ e, n, o, c }) => <tr key={e.id} className={era === e.id ? 'on' : ''}><td>{e.label}</td><td>{n}년{e.to >= LAST.getFullYear() ? '(2026은 9월까지)' : ''}</td><td>{o} ({f1(o / n)})</td><td>{c} ({f1(c / n)})</td></tr>)}</tbody>
          </table>
          <SourceNote source={SOURCES.venues}
            n={`운영구간 ${vs.length}개(${sel ?? '전체'})`}
            method={<>t년 운영 = 개업일 ≤ t년 말 이고 (영업 중이거나 폐업일 ≥ t년 1월 1일). 개업·폐업 = LOCALDATA 날짜. 스크린·좌석 = KOFIC 2010~2025, 특별관 = 2019~2025(그 밖은 자료 미확보, 현재 값을 과거로 옮기지 않음)</>}
            caution={<>같은 구에서 4곳 이상이 같은 날 인허가된 날짜(1998-03-09 강남, 2003-02-12 종로, 2003-05-20 중구)는 일괄 등록일로 보고 개업 수에서 뺐습니다(전체 {unsure}건, 운영 수에는 포함). 그래서 2003년 운영 수가 크게 오르지만 실제 개업 증가가 아닙니다. 음영(금융위기·코로나19)은 시기 표시일 뿐 원인을 뜻하지 않습니다. 값이 두 무리로 떨어지면 세로축 중간을 생략합니다.</>} />
        </details>
        <DataTable caption={`연도별 지표 — ${sel ?? '전체'}`} head={['연도', '운영', '개업', '폐업', '누적 개업', '누적 폐업', '스크린', '좌석', '특별관']}
          rows={YEARS.map((y) => { const r = row(y); return [y, r?.operating, r?.opened, r?.closed, r?.cum_opened, r?.cum_closed, r?.screens, r?.seats, r?.special] })} />
      </div>
    </div>
  )
}
