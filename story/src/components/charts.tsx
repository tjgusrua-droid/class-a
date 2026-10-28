// SVG로 직접 그린 그래프. 모든 그래프에 단위·범례·표본 수를 쓴다.
import { forwardRef } from 'react'
import { EVENTS, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { f1, mean, quantile } from '../data'

const W = 560

// 100% 누적 막대: 유형별 구성비. rows = 지표(개소·스크린·좌석). 단위가 다른 값은 각자 100% 막대로만 비교
export const ShareBars = forwardRef<SVGSVGElement, {
  rows: { label: string; unit: string; values: Record<VenueType, number | null> }[]
  highlight: VenueType | null; onPick: (t: VenueType | null) => void; title: string
}>(function ShareBars({ rows, highlight, onPick, title }, ref) {
  const rowH = 58, top = 30, x0 = 86, bw = W - x0 - 8
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${top + rows.length * rowH + 4}`} role="img" aria-label={title}>
      <title>{title}</title>
      <g fontSize="11" fill="#444">{TYPES.map((t, i) => (
        <g key={t} transform={`translate(${x0 + i * 150},10)`} onClick={() => onPick(highlight === t ? null : t)} style={{ cursor: 'pointer' }}>
          <rect width="10" height="10" y="-1" fill={TYPE_STYLE[t].color} /><text x="14" y="8">{TYPE_STYLE[t].mark} {t}</text>
        </g>))}</g>
      {rows.map((r, j) => {
        const known = TYPES.filter((t) => r.values[t] != null)
        const total = known.reduce((a, t) => a + (r.values[t] ?? 0), 0)
        let x = x0
        return (
          <g key={r.label} transform={`translate(0,${top + j * rowH})`}>
            <text x={0} y={16} fontSize="13" fontWeight="600">{r.label}</text>
            <text x={0} y={31} fontSize="10.5" fill="#666">계 {total.toLocaleString()}{r.unit}</text>
            {TYPES.map((t) => {
              const v = r.values[t] ?? 0, w = total ? (v / total) * bw : 0
              const g = (
                <g key={t} opacity={highlight && highlight !== t ? 0.25 : 1} onClick={() => onPick(highlight === t ? null : t)} style={{ cursor: 'pointer' }}>
                  <rect x={x} y={2} width={w} height={24} fill={TYPE_STYLE[t].color} stroke="#fff" />
                  {w > 44 && <text x={x + 5} y={18} fontSize="11" fill="#fff" fontWeight="600">{f1((v / total) * 100)}%</text>}
                </g>)
              x += w
              return g
            })}
            <text x={x0} y={41} fontSize="10" fill="#444">{TYPES.map((t) => `${TYPE_STYLE[t].mark} ${r.values[t] == null ? '자료 없음' : `${f1(total ? (r.values[t]! / total) * 100 : 0)}% (${r.values[t]!.toLocaleString()})`}`).join('   ')}</text>
          </g>)
      })}
    </svg>
  )
})

function niceTicks(max: number) {
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => max / s <= 6) ?? 10000
  const top = Math.max(step, Math.ceil(max / step) * step)
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(2)) }
}

// 상자수염+점: 집단별 실제 값 전부(점), 25~75%(상자), 중앙값(굵은 선), 평균(◇), n
export const BoxDot = forwardRef<SVGSVGElement, {
  groups: { key: string; type?: VenueType; items: { id: string; v: number; label: string }[] }[]
  unit: string; selected?: string | null; onPick?: (id: string) => void; title: string; rowH?: number
}>(function BoxDot({ groups, unit, selected, onPick, title, rowH = 62 }, ref) {
  const l = 128, r = 14, top = 10
  const all = groups.flatMap((g) => g.items.map((x) => x.v))
  const { top: xmax, ticks } = niceTicks(Math.max(0.001, ...all))
  const sx = (v: number) => l + (v / xmax) * (W - l - r)
  const H = top + groups.length * rowH + 30
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {ticks.map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={top} y2={H - 26} stroke="#eee" />
        <text x={sx(v)} y={H - 13} fontSize="10" textAnchor="middle" fill="#555">{v}</text></g>)}
      <text x={W - r} y={H - 1} fontSize="10" textAnchor="end" fill="#555">단위: {unit}</text>
      {groups.map((g, j) => {
        const y0 = top + j * rowH + rowH / 2, vs = g.items.map((x) => x.v)
        const q1 = quantile(vs, 0.25), md = quantile(vs, 0.5), q3 = quantile(vs, 0.75), mn = mean(vs)
        const color = g.type ? TYPE_STYLE[g.type].color : '#333'
        return (
          <g key={g.key}>
            <text x={0} y={y0 - 4} fontSize="11.5" fontWeight="600">{g.type && `${TYPE_STYLE[g.type].mark} `}{g.key}</text>
            <text x={0} y={y0 + 11} fontSize="10" fill={vs.length < 5 ? '#c8423b' : '#555'}>n = {vs.length}{vs.length < 5 && vs.length > 0 ? ' (적음)' : ''}</text>
            {vs.length === 0 && <text x={l} y={y0 + 4} fontSize="11" fill="#888">자료 없음</text>}
            {vs.length > 1 && <rect x={sx(q1)} y={y0 - 13} width={Math.max(1, sx(q3) - sx(q1))} height={26} fill={color} fillOpacity={0.12} stroke={color} strokeOpacity={0.6} />}
            {g.items.map((x, i) => (
              <circle key={x.id} cx={sx(x.v)} cy={y0 + (((i * 7919) % 17) - 8) * 1.4} r={selected === x.id ? 5.5 : 3.4}
                fill={color} fillOpacity={0.6} stroke={selected === x.id ? '#111' : '#fff'} strokeWidth={selected === x.id ? 2 : 0.8}
                onClick={() => onPick?.(x.id)} style={{ cursor: onPick ? 'pointer' : 'default' }}><title>{x.label}: {f1(x.v)}{unit}</title></circle>))}
            {vs.length > 0 && <>
              <line x1={sx(md)} x2={sx(md)} y1={y0 - 16} y2={y0 + 16} stroke="#111" strokeWidth="2.5" />
              <path d={`M${sx(mn)} ${y0 + 15} l5 5 l-5 5 l-5 -5z`} fill="#fff" stroke="#111" />
              <text x={W - r} y={y0 - 16} fontSize="10" textAnchor="end" fill="#333">중앙값 {f1(md)} · 평균 {f1(mn)}{vs.length > 1 ? ` · 25~75% ${f1(q1)}~${f1(q3)}` : ''}</text>
            </>}
          </g>)
      })}
    </svg>
  )
})

// 연도별 지표 한 개: 막대 또는 선. null = 자료 미확보(빈칸). 개업·폐업은 기준선 위·아래
export const MetricChart = forwardRef<SVGSVGElement, {
  years: number[]; values: (number | null)[]; down?: (number | null)[]; kind: 'bar' | 'line' | 'flow'
  color: string; unit: string; label: string; year: number; onYear: (y: number) => void
  range: [number, number] | null; partialYear?: number; title: string
}>(function MetricChart({ years, values, down, kind, color, unit, label, year, onYear, range, partialYear, title }, ref) {
  const H = 300, l = 44, r = 12, t = 26, b = 36
  const bw = (W - l - r) / years.length
  const bx = (i: number) => l + i * bw
  const vmax = Math.max(1, ...values.map((v) => v ?? 0), ...(down ?? []).map((v) => v ?? 0))
  const { top, ticks } = niceTicks(vmax)
  const mid = kind === 'flow' ? t + (H - t - b) / 2 : H - b
  const span = kind === 'flow' ? (H - t - b) / 2 : H - t - b
  const sy = (v: number) => (v / top) * span
  const xi = (y: number) => years.indexOf(y)
  const missing = values.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0)
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {EVENTS.map((e) => xi(e.from) >= 0 && <g key={e.label}>
        <rect x={bx(xi(e.from))} y={t} width={bw * (e.to - e.from + 1)} height={H - t - b} fill="#efefef" />
        <text x={bx(xi(e.from)) + 2} y={t - 4} fontSize="9.5" fill="#888">{e.label}</text></g>)}
      {range && <rect x={bx(xi(range[0]))} y={t} width={bw * (range[1] - range[0] + 1)} height={H - t - b} fill="none" stroke="#111" strokeDasharray="3 3" />}
      {missing.length > 0 && <text x={bx(missing[0]) + 4} y={mid - 6} fontSize="10.5" fill="#999">자료 미확보 ({years[missing[0]]}–{years[missing[missing.length - 1]]})</text>}
      {ticks.map((v) => <g key={v}>
        <line x1={l} x2={W - r} y1={mid - sy(v)} y2={mid - sy(v)} stroke="#eee" />
        <text x={l - 4} y={mid - sy(v) + 3} fontSize="9.5" textAnchor="end" fill="#666">{v}</text>
        {kind === 'flow' && v > 0 && <><line x1={l} x2={W - r} y1={mid + sy(v)} y2={mid + sy(v)} stroke="#eee" /><text x={l - 4} y={mid + sy(v) + 3} fontSize="9.5" textAnchor="end" fill="#666">{v}</text></>}
      </g>)}
      <line x1={l} x2={W - r} y1={mid} y2={mid} stroke="#111" />
      {years.map((y, i) => (
        <g key={y} onClick={() => onYear(y)} style={{ cursor: 'pointer' }}>
          <rect x={bx(i)} y={t} width={bw} height={H - t - b} fill="transparent" />
          {(kind === 'bar' || kind === 'flow') && values[i] != null && <rect x={bx(i) + 2} y={mid - sy(values[i]!)} width={bw - 4} height={sy(values[i]!)} fill={color} />}
          {kind === 'flow' && down?.[i] != null && <rect x={bx(i) + 2} y={mid} width={bw - 4} height={sy(down[i]!)} fill="#fff" stroke={color} />}
          {(y % 5 === 0 || y === year) && <text x={bx(i) + bw / 2} y={H - b + 14} fontSize="10" textAnchor="middle" fontWeight={y === year ? 700 : 400}>{y}</text>}
          {y === partialYear && <text x={bx(i) + bw / 2} y={H - b + 26} fontSize="9" textAnchor="middle" fill="#888">~9.4</text>}
        </g>))}
      {kind === 'line' && <polyline fill="none" stroke={color} strokeWidth="2.2"
        points={values.map((v, i) => (v == null ? '' : `${bx(i) + bw / 2},${mid - sy(v)}`)).filter(Boolean).join(' ')} />}
      {kind === 'line' && values.map((v, i) => v != null && <circle key={i} cx={bx(i) + bw / 2} cy={mid - sy(v)} r={2.6} fill={color} />)}
      <line x1={bx(xi(year)) + bw / 2} x2={bx(xi(year)) + bw / 2} y1={t} y2={H - b} stroke="#c8423b" strokeWidth="1.5" />
      <text x={l} y={12} fontSize="11" fontWeight="600">{label}{kind === 'flow' ? ' — 위: 개업, 아래: 폐업' : ''}</text>
      <text x={W - r} y={12} fontSize="10" textAnchor="end" fill="#555">단위: {unit} · {year}년 {values[xi(year)] == null ? '자료 미확보' : `${values[xi(year)]!.toLocaleString()}${unit}`}{kind === 'flow' && down?.[xi(year)] != null ? ` / 폐업 ${down[xi(year)]}` : ''}</text>
    </svg>
  )
})

export function DataTable({ head, rows, caption }: { head: string[]; rows: (string | number | null)[][]; caption: string }) {
  return (
    <details className="table ui">
      <summary>데이터 표 보기</summary>
      <table><caption>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c ?? '자료 없음'}</td>)}</tr>)}</tbody>
      </table>
    </details>
  )
}
