// 개업·폐업·인수합병 연표: 가로 = 연도, 위 = 새로 연 곳, 가운데 = 인수·합병(유형·브랜드가 바뀐 곳), 아래 = 문 닫은 곳.
// 점 하나 = 사건 하나, 색 = 그때의 유형(개업·인수 = 바뀐 뒤, 폐업 = 닫을 때)
import { useMemo, useState } from 'react'
import { DATA_DATE, SOURCES, TYPE_STYLE, TYPES, type VenueType } from '../config'
import type { DataSet } from '../data'
import { DataStatus, Finding, More, Seg, SourceNote } from './ui'

type Ev = { year: string; date: string; event: string; name: string; gu: string; type_before: string; brand_before: string; type_after: string; brand_after: string; note: string }
const MA = ['체인 인수·가맹', '브랜드 변경(인수합병)', '체인 이탈', '같은 자리 승계(체인 인수)', '같은 자리 승계(브랜드 변경)']
const lane = (e: string) => (e === '개업' || e.startsWith('등록') ? 'open' : e === '폐업' ? 'close' : MA.includes(e) ? 'ma' : 'other')
const Y0 = 1980, Y1 = new Date(DATA_DATE).getFullYear()

export default function EventTimeline({ data }: { data: DataSet }) {
  const [pick, setPick] = useState<number | null>(null)
  const [hover, setHover] = useState<{ e: Ev; x: number; y: number } | null>(null)
  const [show, setShow] = useState<'ma' | 'all'>('ma')
  const evs: Ev[] = data.events.status === 'ok' ? data.events.data : []
  const W = 760, H = 420, L = 34, R = 10, mid = 228, step = 6.2
  const sx = (y: number) => L + ((y - Y0 + 0.5) / (Y1 - Y0 + 1)) * (W - L - R)
  const colorOf = (e: Ev) => TYPE_STYLE[(lane(e.event) === 'close' ? e.type_before : e.type_after) as VenueType]?.color ?? '#999'
  const dots = useMemo(() => {
    const stack: Record<string, number> = {}, max: Record<string, number> = {}
    const shown = evs.filter((e) => lane(e.event) !== 'other' && +e.year >= Y0)
    shown.forEach((e) => { const k = `${lane(e.event)}${e.year}`; max[lane(e.event)] = Math.max(max[lane(e.event)] ?? 0, (stack[k] = (stack[k] ?? 0) + 1)) })
    Object.keys(stack).forEach((k) => (stack[k] = 0))
    // 칸 높이에 맞춰 점 간격을 줄인다(가장 많은 해가 칸을 넘지 않게)
    const st = (ln: string, room: number) => Math.min(step, room / Math.max(1, max[ln] ?? 1))
    const so = st('open', mid - 34 - 40), sc = st('close', H - 44 - (mid + 34))
    return shown.map((e) => {
      const ln = lane(e.event), k = `${ln}${e.year}`, i = (stack[k] = (stack[k] ?? 0) + 1) - 1
      const y = ln === 'open' ? mid - 34 - i * so : ln === 'close' ? mid + 34 + i * sc : mid - 16 + (i % 6) * 6
      return { e, x: sx(+e.year), y, ln }
    })
  }, [evs])
  if (data.events.status !== 'ok') return <DataStatus data={data} need={['events']} />
  const ma = evs.filter((e) => MA.includes(e.event))
  const toChain = ma.filter((e) => e.type_before !== '멀티플렉스' && e.type_after === '멀티플렉스').length
  const swap = ma.filter((e) => e.type_before === '멀티플렉스' && e.type_after === '멀티플렉스').length
  const byYear = Object.entries(ma.reduce<Record<string, number>>((a, e) => ((a[e.year] = (a[e.year] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1])
  const pre = evs.filter((e) => +e.year < Y0 && lane(e.event) !== 'other').length
  const list = (pick ? evs.filter((e) => +e.year === pick) : show === 'ma' ? ma : evs).filter((e) => lane(e.event) !== 'other' || pick)
  const brandTxt = (t: string, b: string) => (b ? b : t ? TYPE_STYLE[t as VenueType]?.short ?? t : '')

  return (
    <div className="evt">
      <div className="evt-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연도별 개업·인수합병·폐업 연표" onMouseLeave={() => setHover(null)}>
          {[1980, 1990, 2000, 2010, 2020].map((y) => <g key={y}><line x1={sx(y) - 3} x2={sx(y) - 3} y1={20} y2={H - 26} stroke="#eee" /><text x={sx(y) - 3} y={H - 10} fontSize="11" textAnchor="middle" fill="#666">{y}</text></g>)}
          <text x={W - R} y={H - 10} fontSize="10.5" fill="#888" textAnchor="end">연도 →</text>
          <rect x={L} y={mid - 24} width={W - L - R} height={40} fill="#f6f4ef" rx={6} />
          <text x={L + 4} y={52} fontSize="12" fontWeight="700" fill="#222">↑ 새로 연 곳</text>
          <text x={L + 8} y={mid} fontSize="12" fontWeight="700" fill="#222">인수·합병 · 체인 전환</text>
          <text x={L + 4} y={H - 34} fontSize="12" fontWeight="700" fill="#222">↓ 문 닫은 곳</text>
          {pick && <rect x={sx(pick) - 4} y={18} width={8} height={H - 44} fill="#111" opacity={0.08} rx={3} />}
          {[2008, 2020].map((y) => <text key={y} x={sx(y)} y={14} fontSize="9.5" textAnchor="middle" fill="#999">{y === 2008 ? '금융위기' : '코로나19'}</text>)}
          {dots.map(({ e, x, y, ln }, i) => <circle key={i} className="evt-dot" cx={x} cy={y} r={ln === 'ma' ? 3.6 : 2.8} fill={e.event.startsWith('등록') ? '#fff' : colorOf(e)}
            stroke={e.event.startsWith('등록') ? colorOf(e) : ln === 'ma' ? '#111' : 'none'} strokeWidth={ln === 'ma' ? 0.9 : 1}
            style={{ animationDelay: `${0.2 + (x - L) / 700}s` }}
            onMouseEnter={() => setHover({ e, x, y })} onClick={() => setPick(pick === +e.year ? null : +e.year)} />)}
          {hover && (() => { const { e, x, y } = hover, left = x > W - 230
            return <g pointerEvents="none" transform={`translate(${left ? x - 222 : x + 10},${Math.max(24, Math.min(y - 20, H - 90))})`}>
              <rect width={212} height={58} rx={6} fill="#fff" stroke="#222" />
              <text x={8} y={17} fontSize="11.5" fontWeight="700">{e.name.length > 18 ? e.name.slice(0, 18) + '…' : e.name}</text>
              <text x={8} y={33} fontSize="10.5" fill="#444">{e.date || e.year} · {e.event}</text>
              <text x={8} y={48} fontSize="10.5" fill="#444">{lane(e.event) === 'ma' ? `${brandTxt(e.type_before, e.brand_before)} → ${brandTxt(e.type_after, e.brand_after)}` : TYPE_STYLE[(e.type_after || e.type_before) as VenueType]?.short ?? ''}{e.gu ? ` · ${e.gu}` : ''}</text>
            </g> })()}
        </svg>
        <div className="evt-key">
          {TYPES.map((t) => <span key={t}><i style={{ background: TYPE_STYLE[t].color }} /> {t}</span>)}
          <span><i className="ring" /> 인수·합병(검은 테)</span><span><i className="hollow" /> 일괄 등록일(개업일 불확실)</span>
          {pre > 0 && <span className="muted">· {Y0}년 전 {pre}건은 표에만</span>}
        </div>
      </div>
      <div className="evt-side">
        <Finding items={[
          { head: <>인수·합병으로 유형이나 브랜드가 바뀐 경우는 {ma.length}건입니다.</>,
            mean: <>일반영화관이 체인에 인수·가맹된 경우 {toChain}건, 체인끼리 브랜드가 바뀐 경우 {swap}건입니다. 가장 많았던 해는 {byYear.slice(0, 2).map(([y, n]) => `${y}년(${n}건)`).join('·')}입니다.</> }]} />
        <div className="row ui">
          <Seg label="목록" value={pick ? 'all' : show} onChange={(v) => { setPick(null); setShow(v) }} options={[{ v: 'ma' as const, label: '인수·합병만' }, { v: 'all' as const, label: '모든 사건' }]} />
          {pick && <button className="link" onClick={() => setPick(null)}>{pick}년 선택 해제</button>}
        </div>
        <ol className="evt-list" aria-label="사건 목록">
          {list.slice().reverse().map((e, i) => <li key={i} data-lane={lane(e.event)}>
            <b>{e.year}</b>
            <span className="nm">{e.name}</span>
            <span className="ev">{lane(e.event) === 'ma'
              ? <><em style={{ color: TYPE_STYLE[e.type_before as VenueType]?.color }}>{brandTxt(e.type_before, e.brand_before)}</em> → <em style={{ color: TYPE_STYLE[e.type_after as VenueType]?.color }}>{brandTxt(e.type_after, e.brand_after)}</em></>
              : e.event}</span>
          </li>)}
        </ol>
        <More label="자료·기준"><SourceNote source={SOURCES.venues}
          n={`사건 ${evs.length}건(개업 ${evs.filter((e) => e.event === '개업').length} · 폐업 ${evs.filter((e) => e.event === '폐업').length} · 인수·합병 ${ma.length})`}
          method={<>인수·합병 = 같은 인허가 구간에서 KOFIC 운영형태(직영·위탁)나 상호의 체인 브랜드가 해마다 어떻게 바뀌었는지로 판단. ‘같은 자리 승계’ = 한 장소에서 앞 영업이 끝나고 1년 안에 새 인허가로 다른 영화관이 문을 엶. 2010년 전은 KOFIC 개관일·LOCALDATA 상호로 추정</>}
          caution={<>KOFIC 기록이 없는 2010년 전의 인수 연도는 추정입니다. 점을 누르면 그해 사건만 목록에 보입니다.</>} /></More>
      </div>
    </div>
  )
}
