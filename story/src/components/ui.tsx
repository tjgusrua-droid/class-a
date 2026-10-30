// 작은 공용 컴포넌트: 장면, 범례, 토글, 데이터 상태, 출처, 내보내기
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ALL_COLOR, DATA_LABEL, FILES, TYPE_STYLE, TYPES, type FileKey, type VenueType } from '../config'
import type { DataSet } from '../data'

export function StorySection({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    // 발표 모드에서는 장면에 다시 들어올 때마다 등장 효과를 되풀이한다(나가면 'in'을 뗀다)
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? setSeen(true) : document.querySelector('.present') && setSeen(false)), { rootMargin: '0px 0px -25% 0px' })
    io.observe(ref.current!)
    return () => io.disconnect()
  }, [])
  return <section id={id} ref={ref} className={`scene ${seen ? 'in' : ''} ${className}`}>{children}</section>
}

export function Sym({ type, mark = 'fill', gray }: { type: VenueType; mark?: string; gray?: boolean }) {
  const { color, shape } = TYPE_STYLE[type]
  const c = gray ? '#666' : color
  const f = mark === 'hollow' ? '#fff' : c
  const path = shape === 'circle' ? <circle cx="7" cy="7" r="5" /> : shape === 'square' ? <rect x="2.5" y="2.5" width="9" height="9" /> : <path d="M7 1 L13 7 L7 13 L1 7Z" />
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="sym">
      <g fill={f} stroke={mark === 'hollow' ? c : '#fff'} strokeWidth="1.5" opacity={mark === 'dim' ? 0.3 : 1}>{path}</g>
      {mark === 'new' && <circle cx="7" cy="7" r="6.4" fill="none" stroke="#111" strokeWidth="1" />}
    </svg>
  )
}

// 지도 범례: 지금 지도에 그린 기호만
export function MapLegend({ types, marks, extra }: { types: VenueType[]; marks: string[]; extra?: ReactNode }) {
  const label: Record<string, string> = { fill: '영업 중(채움)', hollow: '폐업(외곽선)', new: '이 해 개업(검은 테)', dim: '그 밖의 영화관(흐림)' }
  return (
    <div className="legend" aria-label="지도 범례">
      {types.map((t) => <span key={t}><Sym type={t} mark={marks.length === 1 ? marks[0] : 'fill'} /> {t}{marks.length === 1 && marks[0] !== 'fill' ? ` (${label[marks[0]]})` : ''}</span>)}
      {marks.length > 1 && marks.map((m) => <span key={m}><Sym type="멀티플렉스" mark={m} gray /> {label[m]}</span>)}
      <span><i className="lg-line" /> 자치구 경계</span>
      <span><i className="lg-line river" /> 한강(개략)</span>
      {extra}
    </div>
  )
}

// 유형 켜고 끄기(지도·그래프 공용). value = 켜진 유형들
export function TypeToggles({ value, onChange, counts }: { value: VenueType[]; onChange: (v: VenueType[]) => void; counts?: Record<string, number> }) {
  return (
    <div className="toggles ui" role="group" aria-label="영화관 유형">
      {TYPES.map((t) => (
        <label key={t}><input type="checkbox" checked={value.includes(t)} onChange={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : TYPES.filter((x) => x === t || value.includes(x)))} />
          <Sym type={t} /> {t}{counts && <small> {counts[t] ?? 0}</small>}</label>
      ))}
    </div>
  )
}

// 단일 선택(전체 또는 한 유형). '전체'는 중립색
export function TypeSelect({ value, onChange }: { value: VenueType | null; onChange: (t: VenueType | null) => void }) {
  return (
    <div className="seg ui" role="group" aria-label="유형 선택">
      <button aria-pressed={value === null} onClick={() => onChange(null)}><i className="dot" style={{ background: ALL_COLOR }} /> 전체</button>
      {TYPES.map((t) => <button key={t} aria-pressed={value === t} onClick={() => onChange(t)}><Sym type={t} /> {t}</button>)}
    </div>
  )
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg ui" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.v)} disabled={o.disabled} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  )
}

// 자료가 없을 때: 가짜 값 대신 필요한 파일·필드·상태
export function DataStatus({ data, need, title = '자료 없음', note }: { data: DataSet; need: FileKey[]; title?: string; note?: ReactNode }) {
  return (
    <div className="status" role="status">
      <p className="status-title">{title}</p>
      {note && <p>{note}</p>}
      <table>
        <thead><tr><th>필요한 파일</th><th>필수 필드</th><th>상태</th></tr></thead>
        <tbody>{need.map((k) => (
          <tr key={k}><td><code>public/data/{FILES[k].file}</code></td><td>{FILES[k].fields.join(', ') || '—'}</td>
            <td>{data[k].status === 'ok' ? '불러옴' : data[k].status === 'invalid' ? `오류: ${data[k].message}` : '없음'}</td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export const ready = (data: DataSet, need: FileKey[]) => need.every((k) => data[k].status === 'ok')

// 장면 하단: 출처·기준일·분석 단위·표본 수·주의
export function SourceNote({ source, n, method, caution }: { source: string; n?: ReactNode; method?: ReactNode; caution?: ReactNode }) {
  return (
    <p className="source">
      <b>자료</b> {source} · {DATA_LABEL}
      {n && <> · <b>표본</b> {n}</>}
      {method && <> · <b>계산</b> {method}</>}
      {caution && <><br /><b>주의</b> {caution}</>}
    </p>
  )
}

export function saveSvg(svg: SVGSVGElement | null, name: string) {
  if (!svg) return
  const src = new XMLSerializer().serializeToString(svg)
  download(URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' })), `${name}.svg`)
}
export function savePng(canvas: HTMLCanvasElement | undefined, name: string) {
  if (canvas) download(canvas.toDataURL('image/png'), `${name}.png`)
}
function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href; a.download = name; a.click()
}

// 연구 결과 문장: 소제목과 같은 크기의 큰 글씨. head = 결과, mean = 의미
export function Finding({ title = '결론', items }: { title?: string; items: { head: ReactNode; mean?: ReactNode }[] }) {
  return (
    <div className="finding">
      <p className="f-title">{title}</p>
      {items.map((x, i) => <div key={i}><p className="f-head">{x.head}</p>{x.mean && <p className="f-mean">{x.mean}</p>}</div>)}
    </div>
  )
}

// 세부 설명: 마우스를 올리면 말풍선으로 보이고, 클릭하면 고정(다시 클릭하거나 바깥을 누르면 닫힘)
export function More({ children, label = '자세히' }: { children: ReactNode; label?: string }) {
  const btn = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false), [pin, setPin] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null)
  const open = hover || pin
  useEffect(() => {
    if (!open || !btn.current) return
    const place = () => { const r = btn.current!.getBoundingClientRect(), w = Math.min(380, innerWidth - 24), up = r.bottom > innerHeight * 0.6
      setPos({ left: Math.max(12, Math.min(r.left, innerWidth - w - 12)), top: up ? r.top - 8 : r.bottom + 8, up }) }
    place()
    const close = (e: MouseEvent) => { if (pin && !btn.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.more-pop')) setPin(false) }
    addEventListener('scroll', place, true); addEventListener('mousedown', close)
    return () => { removeEventListener('scroll', place, true); removeEventListener('mousedown', close) }
  }, [open, pin])
  return (
    <span className="more-info ui">
      <button ref={btn} type="button" aria-expanded={open} aria-pressed={pin} onClick={() => setPin(!pin)}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>ⓘ {label}</button>
      {open && pos && createPortal(<div className={`more-pop ${pos.up ? 'up' : ''}`} role="tooltip" style={{ left: pos.left, top: pos.top }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>{children}{pin && <small className="more-hint">다시 누르면 닫혀요</small>}</div>, document.body)}
    </span>
  )
}

// 숫자가 바뀔 때 세며 움직인다: 늘면 통통 튀며(초록), 줄면 축 처지며(빨강). 처음엔 화면에 보일 때 0에서 센다
export function CountUp({ value, sign = false }: { value: number | null | undefined; sign?: boolean }) {
  const [shown, setShown] = useState<number | null>(null)
  const [dir, setDir] = useState('')
  const from = useRef(0), ref = useRef<HTMLSpanElement>(null), seen = useRef(false), raf = useRef(0)
  useEffect(() => {
    if (value == null) return
    const run = () => {
      const a = from.current, d = value - a
      cancelAnimationFrame(raf.current)
      if (!d || matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return }
      setDir(d > 0 ? 'up' : 'down')
      const dur = 250 + Math.min(Math.abs(d), 30) * 40, t0 = performance.now()
      const tick = (t: number) => { const k = Math.min(1, (t - t0) / dur)
        setShown(Math.round(a + d * (1 - (1 - k) ** 2)))
        if (k < 1) raf.current = requestAnimationFrame(tick); else { from.current = value; setTimeout(() => setDir(''), 420) } }
      raf.current = requestAnimationFrame(tick)
    }
    if (seen.current) { run(); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { seen.current = true; io.disconnect(); run() } }, { threshold: 0.5 })
    io.observe(ref.current!)
    return () => io.disconnect()
  }, [value])
  if (value == null) return <span>—</span>
  const v = shown ?? 0
  return <span ref={ref} className="cu" data-dir={dir}>{sign && v > 0 ? '+' : ''}{v}</span>
}
