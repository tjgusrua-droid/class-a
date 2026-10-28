// SVG로 직접 그린 가벼운 그래프들. 모든 그래프에 단위·범례·표본 수를 쓴다.
import { forwardRef } from 'react'
import { EVENTS, TYPE_STYLE, TYPES, type TheaterType } from '../config'
import { mean, median } from '../data'
import { Sym } from './ui'

const W = 560
const f1 = (x: number) => (isFinite(x) ? x.toFixed(1) : '—')

// 100% 누적 막대: 유형별 구성비. rows = 지표(개소·스크린·좌석)
export const ShareBars = forwardRef<SVGSVGElement, {
  rows: { label: string; unit: string; values: Record<TheaterType, number> }[]
  highlight: TheaterType | null; onPick: (t: TheaterType | null) => void; title: string
}>(function ShareBars({ rows, highlight, onPick, title }, ref) {
  const rowH = 58, top = 34, x0 = 78, bw = W - x0 - 10
  return (
    <figure>
      <svg ref={ref} viewBox={`0 0 ${W} ${top + rows.length * rowH + 10}`} role="img" aria-label={title}>
        <title>{title}</title>
        <g fontSize="11" fill="#555">
          {TYPES.map((t, i) => (
            <g key={t} transform={`translate(${x0 + i * 120},10)`} onClick={() => onPick(highlight === t ? null : t)} style={{ cursor: 'pointer' }}>
              <rect width="10" height="10" y="-1" fill={TYPE_STYLE[t].color} /><text x="15" y="8">{TYPE_STYLE[t].mark} {t}</text>
            </g>
          ))}
        </g>
        {rows.map((r, j) => {
          const total = TYPES.reduce((a, t) => a + r.values[t], 0)
          let x = x0
          return (
            <g key={r.label} transform={`translate(0,${top + j * rowH})`}>
              <text x={0} y={16} fontSize="13" fontWeight="600">{r.label}</text>
              <text x={0} y={32} fontSize="11" fill="#666">계 {total.toLocaleString()}{r.unit}</text>
              {TYPES.map((t) => {
                const w = total ? (r.values[t] / total) * bw : 0
                const g = (
                  <g key={t} opacity={highlight && highlight !== t ? 0.25 : 1} onClick={() => onPick(highlight === t ? null : t)} style={{ cursor: 'pointer' }}>
                    <rect x={x} y={2} width={w} height={26} fill={TYPE_STYLE[t].color} stroke="#fff" />
                    {w > 46 && <text x={x + 5} y={19} fontSize="11.5" fill="#fff" fontWeight="600">{f1((r.values[t] / total) * 100)}%</text>}
                  </g>
                )
                x += w
                return g
              })}
              <text x={x0} y={43} fontSize="10.5" fill="#444">
                {TYPES.map((t) => `${TYPE_STYLE[t].mark} ${t} ${f1(total ? (r.values[t] / total) * 100 : 0)}% (${r.values[t].toLocaleString()})`).join('   ')}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
})

// 연도별 개업(위)·폐업(아래) 막대 + 연말 영업 중 수(선)
export const TimelineChart = forwardRef<SVGSVGElement, {
  years: number[]; opened: number[]; closed: number[]; active: number[]
  range: [number, number] | null; year: number; onYear: (y: number) => void; title: string
}>(function TimelineChart({ years, opened, closed, active, range, year, onYear, title }, ref) {
  const H = 346, l = 40, r = 44, t = 20, mid = 170, scale = 14
  const maxBar = Math.max(1, ...opened, ...closed)
  const k = Math.min(scale, 120 / maxBar)
  const maxA = Math.max(1, ...active)
  const bx = (i: number) => l + (i * (W - l - r)) / years.length
  const bw = (W - l - r) / years.length
  const ay = (v: number) => t + (1 - v / maxA) * 110
  const xi = (y: number) => years.indexOf(y)
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {EVENTS.map((e) => xi(e.from) >= 0 && (
        <g key={e.label}>
          <rect x={bx(xi(e.from))} y={t} width={bw * (Math.min(e.to, years[years.length - 1]) - e.from + 1)} height={H - t - 44} fill="#eee" />
          <text x={bx(xi(e.from)) + 3} y={H - 48} fontSize="10" fill="#777">{e.label} 기간</text>
        </g>
      ))}
      {range && <rect x={bx(xi(range[0]))} y={t} width={bw * (range[1] - range[0] + 1)} height={H - t - 44} fill="none" stroke="#111" strokeDasharray="3 3" />}
      <line x1={l} x2={W - r} y1={mid} y2={mid} stroke="#111" />
      {years.map((y, i) => (
        <g key={y} onClick={() => onYear(y)} style={{ cursor: 'pointer' }} opacity={range && (y < range[0] || y > range[1]) ? 0.3 : 1}>
          <rect x={bx(i)} y={t} width={bw} height={H - t - 44} fill="transparent" />
          <rect x={bx(i) + 3} y={mid - opened[i] * k} width={bw - 6} height={opened[i] * k} fill="#2b2b2b" />
          <rect x={bx(i) + 3} y={mid} width={bw - 6} height={closed[i] * k} fill="#fff" stroke="#2b2b2b" />
          {opened[i] > 0 && <text x={bx(i) + bw / 2} y={mid - opened[i] * k - 3} fontSize="10" textAnchor="middle">{opened[i]}</text>}
          {closed[i] > 0 && <text x={bx(i) + bw / 2} y={mid + closed[i] * k + 11} fontSize="10" textAnchor="middle">{closed[i]}</text>}
          <text x={bx(i) + bw / 2} y={H - 26} fontSize="10" textAnchor="middle" fontWeight={y === year ? 700 : 400}>{String(y).slice(2)}</text>
          {y === year && <rect x={bx(i) + 1} y={t} width={bw - 2} height={H - t - 44} fill="none" stroke="#d1495b" strokeWidth="2" />}
        </g>
      ))}
      <polyline fill="none" stroke="#1f4e9c" strokeWidth="2" points={active.map((v, i) => `${bx(i) + bw / 2},${ay(v)}`).join(' ')} />
      {active.map((v, i) => <circle key={i} cx={bx(i) + bw / 2} cy={ay(v)} r="2.5" fill="#1f4e9c" />)}
      <text x={W - r + 4} y={ay(active[active.length - 1]) + 4} fontSize="10" fill="#1f4e9c">{active[active.length - 1]}곳</text>
      <g fontSize="10" fill="#555">
        <text x={2} y={mid - 4}>개업 ▲</text><text x={2} y={mid + 12}>폐업 ▼</text>
        <text x={l} y={12} fill="#1f4e9c">— 연말 영업 중 영화관 수(곳, 휴관 포함)</text>
        <text x={W - r} y={H - 1} textAnchor="end">연도 (’10–’25) · 막대 단위: 곳</text>
      </g>
    </svg>
  )
})

// 점그래프: 집단별 실제 값 하나하나를 점으로. 중앙값(세로선)·평균(◇)·표본 수 표시
export const DotPlot = forwardRef<SVGSVGElement, {
  groups: { key: string; type?: TheaterType; items: { id: string; v: number; label: string }[] }[]
  unit: string; max?: number; selected?: string | null; onPick?: (id: string) => void; title: string
}>(function DotPlot({ groups, unit, max, selected, onPick, title }, ref) {
  const rowH = 70, l = 108, r = 16, top = 12
  const all = groups.flatMap((g) => g.items.map((x) => x.v))
  const raw = max ?? Math.max(1, ...all)
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].find((s) => raw / s <= 6) ?? 100
  const xmax = Math.ceil(raw / step) * step
  const sx = (v: number) => l + (Math.min(v, xmax) / xmax) * (W - l - r)
  const H = top + groups.length * rowH + 34
  const ticks = Array.from({ length: Math.round(xmax / step) + 1 }, (_, i) => +(i * step).toFixed(2))
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {ticks.map((v) => (
        <g key={v}><line x1={sx(v)} x2={sx(v)} y1={top} y2={H - 30} stroke="#eee" />
          <text x={sx(v)} y={H - 16} fontSize="10" textAnchor="middle" fill="#555">{v}</text></g>
      ))}
      <text x={W - r} y={H - 2} fontSize="10" textAnchor="end" fill="#555">단위: {unit}</text>
      {groups.map((g, j) => {
        const y0 = top + j * rowH + rowH / 2
        const vs = g.items.map((x) => x.v)
        const md = median(vs), mn = mean(vs)
        const color = g.type ? TYPE_STYLE[g.type].color : '#333'
        return (
          <g key={g.key}>
            <text x={0} y={y0 - 4} fontSize="12" fontWeight="600">{g.type && `${TYPE_STYLE[g.type].mark} `}{g.key}</text>
            <text x={0} y={y0 + 12} fontSize="10.5" fill="#555">n = {vs.length}</text>
            {g.items.map((x, i) => (
              <circle key={x.id} cx={sx(x.v)} cy={y0 + (((i * 7919) % 23) - 11) * 1.3} r={selected === x.id ? 5.5 : 3.6}
                fill={color} fillOpacity={0.55} stroke={selected === x.id ? '#111' : '#fff'} strokeWidth={selected === x.id ? 2 : 0.8}
                onClick={() => onPick?.(x.id)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
                <title>{x.label}: {f1(x.v)} {unit}</title>
              </circle>
            ))}
            {vs.length > 0 && <>
              <line x1={sx(md)} x2={sx(md)} y1={y0 - 22} y2={y0 + 22} stroke="#111" strokeWidth="2" />
              <text x={sx(md)} y={y0 - 25} fontSize="10" textAnchor="middle">중앙값 {f1(md)}</text>
              <path d={`M${sx(mn)} ${y0 + 20} l5 5 l-5 5 l-5 -5z`} fill="#fff" stroke="#111" />
              <text x={sx(mn) + 8} y={y0 + 30} fontSize="10">평균 {f1(mn)}</text>
            </>}
          </g>
        )
      })}
    </svg>
  )
})

// 그래프 대체 텍스트용 데이터 표
export function DataTable({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption: string }) {
  return (
    <details className="table ui">
      <summary>데이터 표 보기</summary>
      <table><caption>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  )
}

export function TypeKey() {
  return <span className="typekey">{TYPES.map((t) => <span key={t}><Sym type={t} /> {t}</span>)}</span>
}
