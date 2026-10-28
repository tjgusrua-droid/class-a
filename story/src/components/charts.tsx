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
  const rowH = 50, top = 30, x0 = 86, bw = W - x0 - 8
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
  parts?: { key: VenueType; values: (number | null)[]; down?: (number | null)[] }[] // '전체'일 때 유형별 계열(선 = 유형별 선, 막대 = 유형별 누적)
}>(function MetricChart({ years, values, down, kind, color, unit, label, year, onYear, range, partialYear, title, parts }, ref) {
  const H = 300, l = 44, r = 12, t = parts ? 44 : 26, b = 36
  const bw = (W - l - r) / years.length
  const bx = (i: number) => l + i * bw
  const vmax = Math.max(1, ...values.map((v) => v ?? 0), ...(down ?? []).map((v) => v ?? 0))
  const { top, ticks: ticks0 } = niceTicks(vmax)
  const mid = kind === 'flow' ? t + (H - t - b) / 2 : H - b
  const span = kind === 'flow' ? (H - t - b) / 2 : H - t - b
  // 축 끊기: 선 그래프에서 값이 두 무리로 크게 떨어져 있으면(빈 구간 > 최댓값의 40%) 그 사이를 잘라 붙인다
  const vals = kind === 'line' ? [...values, ...(parts ?? []).flatMap((q) => q.values)].filter((v): v is number => v != null) : []
  const uniq = [...new Set(vals)].sort((a, b) => a - b)
  let brk: { loTop: number; hiBot: number; upTop: number; loTicks: number[]; upTicks: number[] } | null = null
  const gi = uniq.slice(0, -1).reduce((bi, v, i) => (uniq[i + 1] - v > uniq[bi + 1] - uniq[bi] ? i : bi), 0)
  if (uniq.length > 2 && uniq[gi] > 0 && uniq[gi + 1] - uniq[gi] > 0.4 * uniq[uniq.length - 1]) {
    const lo = niceTicks(uniq[gi]), hiRaw = uniq[gi + 1] * 0.92, st = niceTicks(uniq[uniq.length - 1] - hiRaw)
    const step = st.ticks[1] - st.ticks[0], hiBot = Math.floor(hiRaw / step) * step, upTop = hiBot + Math.ceil((uniq[uniq.length - 1] - hiBot) / step) * step
    brk = { loTop: lo.top, hiBot, upTop, loTicks: lo.ticks, upTicks: Array.from({ length: Math.round((upTop - hiBot) / step) + 1 }, (_, i) => hiBot + i * step) }
  }
  const LO = span * 0.42, GAP = 10
  const sy = (v: number) => !brk ? (v / top) * span : v <= brk.loTop ? (v / brk.loTop) * LO : LO + GAP + ((v - brk.hiBot) / (brk.upTop - brk.hiBot)) * (span - LO - GAP)
  const ticks = brk ? [...brk.loTicks, ...brk.upTicks] : ticks0
  const xi = (y: number) => years.indexOf(y)
  // 누적 막대 조각: 값을 아래부터 쌓아 draw(아래 높이 px, 높이 px, 순번)로 그린다
  const stack = (vs: (number | null)[], draw: (y0: number, h: number, k: number) => JSX.Element) => {
    let acc = 0
    return vs.map((v, k) => { if (!v) return null; const el = draw(sy(acc), sy(v), k); acc += v; return el })
  }
  const missing = values.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0)
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {EVENTS.map((e) => xi(e.from) >= 0 && <g key={e.label}>
        <rect x={bx(xi(e.from))} y={t} width={bw * (e.to - e.from + 1)} height={H - t - b} fill="#efefef" />
        <text x={bx(xi(e.from)) + 2} y={t - 4} fontSize="9.5" fill="#888">{e.label}</text></g>)}
      {range && <rect x={bx(xi(range[0]))} y={t} width={bw * (range[1] - range[0] + 1)} height={H - t - b} fill="none" stroke="#111" strokeDasharray="3 3" />}
      {missing.length > 0 && (() => { const run = missing.filter((m, k) => m === missing[0] + k) // 처음 이어진 빈 구간만
        return <text x={bx(run[0]) + 4} y={mid - 6} fontSize="10.5" fill="#999">자료 미확보 ({years[run[0]]}–{years[run[run.length - 1]]})</text> })()}
      {ticks.map((v) => <g key={v}>
        <line x1={l} x2={W - r} y1={mid - sy(v)} y2={mid - sy(v)} stroke="#eee" />
        <text x={l - 4} y={mid - sy(v) + 3} fontSize="9.5" textAnchor="end" fill="#666">{v}</text>
        {kind === 'flow' && v > 0 && <><line x1={l} x2={W - r} y1={mid + sy(v)} y2={mid + sy(v)} stroke="#eee" /><text x={l - 4} y={mid + sy(v) + 3} fontSize="9.5" textAnchor="end" fill="#666">{v}</text></>}
      </g>)}
      <line x1={l} x2={W - r} y1={mid} y2={mid} stroke="#111" />
      {brk && <g>
        <rect x={l} y={mid - LO - GAP} width={W - l - r} height={GAP} fill="#fff" />
        <path d={`M${l - 8},${mid - LO - 2} l4,-3 l4,3 l4,-3 l4,3 M${l - 8},${mid - LO - GAP + 2} l4,-3 l4,3 l4,-3 l4,3`} fill="none" stroke="#111" />
        <text x={W - r} y={mid - LO - 2} fontSize="9.5" textAnchor="end" fill="#888">축 생략 {brk.loTop.toLocaleString()}~{brk.hiBot.toLocaleString()}{unit} (값이 없는 구간)</text>
      </g>}
      {years.map((y, i) => (
        <g key={y} onClick={() => onYear(y)} style={{ cursor: 'pointer' }}>
          <rect x={bx(i)} y={t} width={bw} height={H - t - b} fill="transparent" />
          {(kind === 'bar' || kind === 'flow') && values[i] != null && !parts && <rect x={bx(i) + 2} y={mid - sy(values[i]!)} width={bw - 4} height={sy(values[i]!)} fill={color} />}
          {kind === 'flow' && down?.[i] != null && !parts && <rect x={bx(i) + 2} y={mid} width={bw - 4} height={sy(down[i]!)} fill="#fff" stroke={color} />}
          {kind !== 'line' && parts && stack(parts.map((q) => q.values[i]), (y0, h, k) => <rect key={k} x={bx(i) + 2} y={mid - y0 - h} width={bw - 4} height={h} fill={TYPE_STYLE[parts[k].key].color} stroke="#fff" strokeWidth="0.5" />)}
          {kind === 'flow' && parts && stack(parts.map((q) => q.down?.[i] ?? null), (y0, h, k) => <rect key={k} x={bx(i) + 2} y={mid + y0} width={bw - 4} height={h} fill="#fff" stroke={TYPE_STYLE[parts[k].key].color} strokeWidth="1.2" />)}
          {(y % 5 === 0 || y === year) && <text x={bx(i) + bw / 2} y={H - b + 14} fontSize="10" textAnchor="middle" fontWeight={y === year ? 700 : 400}>{y}</text>}
          {y === partialYear && <text x={bx(i) + bw / 2} y={H - b + 26} fontSize="9" textAnchor="middle" fill="#888">~9.4</text>}
        </g>))}
      {kind === 'line' && [...(parts ?? []).map((q) => ({ vs: q.values, c: TYPE_STYLE[q.key].color, w: 1.8 })), { vs: values, c: color, w: 2.6 }].map(({ vs, c, w }) => <g key={c}>
        <polyline fill="none" stroke={c} strokeWidth={w} points={vs.map((v, i) => (v == null ? '' : `${bx(i) + bw / 2},${mid - sy(v)}`)).filter(Boolean).join(' ')} />
        {vs.map((v, i) => v != null && <circle key={i} cx={bx(i) + bw / 2} cy={mid - sy(v)} r={w} fill={c} />)}</g>)}
      {kind !== 'line' && parts && values.map((v, i) => v != null && v > 0 && <text key={i} x={bx(i) + bw / 2} y={mid - sy(v) - 3} fontSize="8.5" textAnchor="middle" fill="#111">{v}</text>)}
      {parts && <g fontSize="10" transform={`translate(${l},18)`}>
        {[{ k: '전체', c: color }, ...parts.map((q) => ({ k: q.key as string, c: TYPE_STYLE[q.key].color }))].map((x, j) => (kind === 'line' || j > 0) &&
          <g key={x.k} transform={`translate(${j * 112},0)`}><rect width="9" height="9" fill={x.c} /><text x="13" y="8.5">{x.k}</text></g>)}
      </g>}
      <line x1={bx(xi(year)) + bw / 2} x2={bx(xi(year)) + bw / 2} y1={t} y2={H - b} stroke="#c8423b" strokeWidth="1.5" />
      <text x={l} y={12} fontSize="11" fontWeight="600">{label}{kind === 'flow' ? ' — 위: 개업, 아래: 폐업' : ''}{parts && kind !== 'line' ? ' (유형별로 쌓은 높이 = 전체)' : ''}</text>
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

// 원(도넛) 그래프: 한 유형 안의 범주 구성. 조각 = 개수, 가운데 = n
export function Donut({ parts, title, n, sub }: { parts: { label: string; value: number; color: string }[]; title: string; n: number; sub?: string }) {
  const R = 52, r = 30, c = 64
  let a = -Math.PI / 2
  const arc = (v: number) => {
    const a0 = a, a1 = (a += (v / n) * Math.PI * 2), big = a1 - a0 > Math.PI ? 1 : 0
    const p = (rad: number, t: number) => `${c + rad * Math.cos(t)},${c + rad * Math.sin(t)}`
    return v >= n ? `M${c - R},${c}a${R},${R} 0 1,0 ${R * 2},0a${R},${R} 0 1,0 ${-R * 2},0M${c - r},${c}a${r},${r} 0 1,1 ${r * 2},0a${r},${r} 0 1,1 ${-r * 2},0`
      : `M${p(R, a0)}A${R},${R} 0 ${big} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${big} 0 ${p(r, a0)}Z`
  }
  return (
    <svg viewBox="0 0 128 156" role="img" aria-label={title} className="donut">
      <title>{title}</title>
      {n === 0 ? <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke="#eee" strokeWidth={R - r} /> :
        parts.filter((x) => x.value > 0).map((x) => <path key={x.label} d={arc(x.value)} fill={x.color} stroke="#fff" strokeWidth="1.2" fillRule="evenodd"><title>{x.label} {x.value}곳 ({f1((x.value / n) * 100)}%)</title></path>)}
      <text x={c} y={c + 2} textAnchor="middle" fontSize="17" fontWeight="700">{n}</text>
      <text x={c} y={c + 15} textAnchor="middle" fontSize="9" fill="#666">곳</text>
      <text x={c} y={140} textAnchor="middle" fontSize="11" fontWeight="600">{title}</text>
      {sub && <text x={c} y={150} textAnchor="middle" fontSize="9" fill="#666">{sub}</text>}
    </svg>
  )
}

// 가로 누적 막대(개수): 행 = 범주, 조각 = 유형
export const CountBars = forwardRef<SVGSVGElement, { rows: { label: string; values: Record<VenueType, number>; color?: string }[]; title: string; unit: string; rowH?: number }>(
  function CountBars({ rows, title, unit, rowH = 30 }, ref) {
    const x0 = 112, max = Math.max(1, ...rows.map((r) => TYPES.reduce((a, t) => a + r.values[t], 0)))
    const sx = (v: number) => (v / max) * (W - x0 - 60)
    return (
      <svg ref={ref} viewBox={`0 0 ${W} ${rows.length * rowH + 30}`} role="img" aria-label={title}>
        <title>{title}</title>
        <g fontSize="10.5">{TYPES.map((t, i) => <g key={t} transform={`translate(${x0 + i * 140},8)`}><rect width="10" height="10" fill={TYPE_STYLE[t].color} /><text x="14" y="9">{t}</text></g>)}</g>
        {rows.map((r, j) => {
          let x = x0
          const tot = TYPES.reduce((a, t) => a + r.values[t], 0)
          return (
            <g key={r.label} transform={`translate(0,${28 + j * rowH})`}>
              {r.color && <rect x={0} y={4} width={10} height={rowH - 12} fill={r.color} />}
              <text x={r.color ? 15 : 0} y={rowH / 2 + 1} fontSize="11.5" fontWeight="600">{r.label}</text>
              {TYPES.map((t) => { const w = sx(r.values[t]), g = <g key={t}><rect x={x} y={2} width={w} height={rowH - 12} fill={TYPE_STYLE[t].color} stroke="#fff" />
                {w > 16 && <text x={x + w / 2} y={rowH / 2 + 1} fontSize="10" fill="#fff" textAnchor="middle" fontWeight="600">{r.values[t]}</text>}</g>; x += w; return g })}
              <text x={x + 5} y={rowH / 2 + 1} fontSize="11">{tot}{unit}</text>
            </g>)
        })}
      </svg>
    )
  })

// 누적 비율 곡선: x km 안에 (같은 유형 등) 영화관이 있는 비율. 선 = 유형
export const CumLines = forwardRef<SVGSVGElement, { series: { key: VenueType; values: number[] }[]; xmax: number; xlabel: string; title: string; marks?: number[] }>(
  function CumLines({ series, xmax, xlabel, title, marks = [0.5, 1] }, ref) {
    const H = 250, l = 40, r = 12, t = 48, b = 34
    const sx = (v: number) => l + (Math.min(v, xmax) / xmax) * (W - l - r), sy = (p: number) => t + (1 - p / 100) * (H - t - b)
    const share = (vs: number[], x: number) => (vs.length ? (vs.filter((v) => v <= x).length / vs.length) * 100 : 0)
    return (
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <title>{title}</title>
        {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={l} x2={W - r} y1={sy(p)} y2={sy(p)} stroke="#eee" /><text x={l - 4} y={sy(p) + 3} fontSize="10" textAnchor="end" fill="#666">{p}%</text></g>)}
        {Array.from({ length: Math.round(xmax / 0.5) + 1 }, (_, i) => i * 0.5).map((x) => <text key={x} x={sx(x)} y={H - b + 14} fontSize="10" textAnchor="middle" fill="#666">{x}</text>)}
        <text x={W - r} y={H - 4} fontSize="10" textAnchor="end" fill="#555">{xlabel}</text>
        {marks.map((m) => <line key={m} x1={sx(m)} x2={sx(m)} y1={t} y2={H - b} stroke="#999" strokeDasharray="3 3" />)}
        {series.map(({ key, values }) => {
          const xs = [...values].sort((a, b) => a - b)
          let d = `M${sx(0)},${sy(share(xs, 0))}`
          xs.forEach((v, i) => { d += `H${sx(v)}V${sy(((i + 1) / xs.length) * 100)}` })
          d += `H${sx(xmax)}`
          return <path key={key} d={d} fill="none" stroke={TYPE_STYLE[key].color} strokeWidth="2.4" />
        })}
        <g fontSize="10.5">{series.map(({ key, values }, i) => <g key={key} transform={`translate(${l + 6},${10 + i * 13})`}>
          <rect width="10" height="10" y="-8" fill={TYPE_STYLE[key].color} /><text x="14" y="1">{key} · {marks.map((m) => `${m}km ${share(values, m).toFixed(0)}%`).join(' / ')}</text></g>)}</g>
      </svg>
    )
  })

// 아령 그래프: 유형마다 두 값(예: 같은 유형·다른 유형까지 거리 중앙값)
export function Dumbbell({ rows, a, b, unit, title }: { rows: { key: VenueType; a: number; b: number }[]; a: string; b: string; unit: string; title: string }) {
  const H = 34 + rows.length * 30, l = 128, r = 96
  const max = Math.max(0.1, ...rows.flatMap((x) => [x.a, x.b])), sx = (v: number) => l + (v / max) * (W - l - r)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      <g fontSize="10.5"><circle cx={l + 5} cy={10} r={5} fill="#111" /><text x={l + 14} y={14}>{a}</text>
        <circle cx={l + 175} cy={10} r={5} fill="#fff" stroke="#111" strokeWidth="1.5" /><text x={l + 184} y={14}>{b}</text></g>
      {rows.map((x, i) => { const y = 36 + i * 30, c = TYPE_STYLE[x.key].color
        return <g key={x.key}>
          <text x={0} y={y + 4} fontSize="11.5" fontWeight="600">{TYPE_STYLE[x.key].mark} {x.key}</text>
          <line x1={sx(x.a)} x2={sx(x.b)} y1={y} y2={y} stroke={c} strokeWidth="3" opacity=".45" />
          <circle cx={sx(x.a)} cy={y} r={6} fill={c} /><circle cx={sx(x.b)} cy={y} r={6} fill="#fff" stroke={c} strokeWidth="2" />
          <text x={sx(Math.max(x.a, x.b)) + 10} y={y + 4} fontSize="10.5">{f1(x.a)} / {f1(x.b)}{unit}</text>
        </g> })}
    </svg>
  )
}

// 생존곡선(Kaplan–Meier): 개업 후 t년이 지나도 운영 중인 비율
export function SurvivalCurves({ series, xmax, title }: { series: { key: VenueType; steps: { t: number; s: number }[]; med: number | null; n: number; end: number }[]; xmax: number; title: string }) {
  const H = 280, l = 40, r = 12, t = 54, b = 34
  const sx = (v: number) => l + (Math.min(v, xmax) / xmax) * (W - l - r), sy = (s: number) => t + (1 - s) * (H - t - b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => <g key={p}><line x1={l} x2={W - r} y1={sy(p)} y2={sy(p)} stroke={p === 0.5 ? '#bbb' : '#eee'} strokeDasharray={p === 0.5 ? '4 3' : undefined} />
        <text x={l - 4} y={sy(p) + 3} fontSize="10" textAnchor="end" fill="#666">{p * 100}%</text></g>)}
      {Array.from({ length: Math.floor(xmax / 10) + 1 }, (_, i) => i * 10).map((x) => <text key={x} x={sx(x)} y={H - b + 14} fontSize="10" textAnchor="middle" fill="#666">{x}</text>)}
      <text x={W - r} y={H - 4} fontSize="10" textAnchor="end" fill="#555">개업 후 경과 연수(년)</text>
      {series.map(({ key, steps, med, end }) => {
        let d = `M${sx(0)},${sy(1)}`
        steps.slice(1).forEach((p) => { d += `H${sx(p.t)}V${sy(p.s)}` })
        d += `H${sx(end)}`
        const c = TYPE_STYLE[key].color
        return <g key={key}><path d={d} fill="none" stroke={c} strokeWidth="2.4" />
          {med != null && <><line x1={sx(med)} x2={sx(med)} y1={sy(0.5)} y2={H - b} stroke={c} strokeDasharray="2 2" /><circle cx={sx(med)} cy={sy(0.5)} r={4} fill={c} /></>}</g>
      })}
      <g fontSize="10.5">{series.map(({ key, med, n }, i) => <g key={key} transform={`translate(${l + 6},${12 + i * 13})`}>
        <rect width="10" height="10" y="-8" fill={TYPE_STYLE[key].color} /><text x="14" y="1">{key} n={n} · 중앙 {med == null ? '50% 미도달' : `${f1(med)}년`}</text></g>)}</g>
    </svg>
  )
}
