import { useRef } from 'react'
import { CONFIG, TYPE_STYLE, TYPES, type TheaterType } from '../config'
import { mean, pct, sum, type Theater } from '../data'
import { DataTable, ShareBars } from './charts'
import { saveSvg, Sym } from './ui'

// 연구 정의·운영 특성 문안은 연구 자료가 들어오면 여기에 채운다(지금은 비어 있음)
const RESEARCH_TEXT: Record<TheaterType, { def?: string; feature?: string }> = { 멀티플렉스: {}, 독립극장: {}, 기타: {} }

export default function TypeComparison({ snap, sel, setSel }: { snap: Theater[]; sel: TheaterType | null; setSel: (t: TheaterType | null) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const by = (t: TheaterType) => snap.filter((x) => x.type === t)
  const stat = (t: TheaterType) => {
    const xs = by(t)
    return { n: xs.length, screens: sum(xs.map((x) => x.screens)), seats: sum(xs.map((x) => x.seats)),
      avgS: mean(xs.map((x) => x.screens ?? 0)), avgSeat: mean(xs.map((x) => x.seats ?? 0)) }
  }
  const S = Object.fromEntries(TYPES.map((t) => [t, stat(t)])) as Record<TheaterType, ReturnType<typeof stat>>
  const tot = { n: snap.length, screens: sum(snap.map((x) => x.screens)) }
  const ops = (t: TheaterType) => {
    const c: Record<string, number> = {}
    by(t).forEach((x) => { const k = x.operator === '~' ? '비해당(~)' : x.operator; c[k] = (c[k] ?? 0) + 1 })
    return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ')
  }
  const top = (t: TheaterType) => [...by(t)].sort((a, b) => (b.screens ?? 0) - (a.screens ?? 0)).slice(0, 2).map((x) => `${x.name}(${x.screens}관)`).join(', ')
  const pending = <span className="pending">연구 정의 입력 대기</span>

  return (
    <div className="split">
      <div className="diagram" role="table" aria-label="유형별 비교">
        {TYPES.map((t) => (
          <div key={t} className={`col ${sel && sel !== t ? 'dim' : ''}`} role="rowgroup" onClick={() => setSel(sel === t ? null : t)}>
            <h3 style={{ borderColor: TYPE_STYLE[t].color }}><Sym type={t} /> {t}</h3>
            <dl>
              <dt>분류 정의</dt><dd>{RESEARCH_TEXT[t].def ?? pending}</dd>
              <dt>운영주체</dt><dd>{ops(t) || '—'}<br /><small>영진위 ‘대기업 운영 여부’ 값</small></dd>
              <dt>상영·운영 특성</dt><dd>{RESEARCH_TEXT[t].feature ?? pending}</dd>
              <dt>대표 사례</dt><dd>{top(t) || '—'}<br /><small>스크린 수 상위</small></dd>
              <dt>영화관 수</dt><dd className="num">{S[t].n}곳 <small>({pct(S[t].n, tot.n).toFixed(1)}%)</small></dd>
              <dt>스크린 수</dt><dd className="num">{S[t].screens.toLocaleString()}개 <small>({pct(S[t].screens, tot.screens).toFixed(1)}%)</small></dd>
              <dt>좌석 수</dt><dd className="num">{S[t].seats.toLocaleString()}석</dd>
              <dt>시설당 평균</dt><dd className="num">{S[t].avgS.toFixed(1)}개관 · {Math.round(S[t].avgSeat).toLocaleString()}석</dd>
            </dl>
          </div>
        ))}
      </div>
      <div className="chart">
        <p className="chart-title">유형별 구성비 — {CONFIG.snapshotYear}년 말, 서울 {tot.n}곳(휴관 포함)</p>
        <ShareBars ref={svg} title="유형별 개소·스크린·좌석 구성비" highlight={sel} onPick={setSel} rows={[
          { label: '영화관', unit: '곳', values: Object.fromEntries(TYPES.map((t) => [t, S[t].n])) as any },
          { label: '스크린', unit: '개', values: Object.fromEntries(TYPES.map((t) => [t, S[t].screens])) as any },
          { label: '좌석', unit: '석', values: Object.fromEntries(TYPES.map((t) => [t, S[t].seats])) as any },
        ]} />
        <p className="note">유형은 <b>임시 분류</b>입니다: 영진위 ‘대기업 운영 여부’가 직영·위탁이면 멀티플렉스, 독립예술영화 전용관이 있으면 독립극장, 나머지는 기타. 연구 정의가 확정되면 <code>data/manual/theater_type.csv</code>로 바꿉니다.</p>
        <button className="ui link" onClick={() => saveSvg(svg.current, '1_유형별_구성비')}>그래프 SVG 저장</button>
        <DataTable caption="유형별 규모" head={['유형', '영화관(곳)', '스크린(개)', '좌석(석)']}
          rows={TYPES.map((t) => [t, S[t].n, S[t].screens, S[t].seats])} />
      </div>
    </div>
  )
}
