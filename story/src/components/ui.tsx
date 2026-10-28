// 작은 공용 컴포넌트: 장면, 범례, 데이터 상태, 내보내기 버튼
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FILES, TYPE_STYLE, TYPES, type FileKey, type TheaterType } from '../config'
import type { DataSet } from '../data'

export function StorySection({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '0px 0px -25% 0px' })
    io.observe(ref.current!)
    return () => io.disconnect()
  }, [])
  return <section id={id} ref={ref} className={`scene ${seen ? 'in' : ''} ${className}`}>{children}</section>
}

// 지도 범례: 지금 화면에 그린 기호만 넘겨받아 그린다
export function MapLegend({ types, marks, extra }: { types: TheaterType[]; marks: ('fill' | 'hollow' | 'new')[]; extra?: ReactNode }) {
  const markLabel = { fill: '영업 중 (채움)', hollow: '폐업 (외곽선)', new: '이 해 개업 (검은 테)' }
  return (
    <div className="legend" aria-label="지도 범례">
      {types.map((t) => <span key={t}><Sym type={t} mark="fill" /> {t}</span>)}
      {marks.length > 1 && marks.map((m) => <span key={m}><Sym type="멀티플렉스" mark={m} gray /> {markLabel[m]}</span>)}
      <span><i className="lg-line" /> 자치구 경계</span>
      <span><i className="lg-line river" /> 한강(개략)</span>
      {extra}
    </div>
  )
}

export function Sym({ type, mark = 'fill', gray }: { type: TheaterType; mark?: string; gray?: boolean }) {
  const { color, shape } = TYPE_STYLE[type]
  const c = gray ? '#666' : color
  const f = mark === 'hollow' ? '#fff' : c
  const path = shape === 'circle' ? <circle cx="7" cy="7" r="5" /> : shape === 'square' ? <rect x="2.5" y="2.5" width="9" height="9" /> : <path d="M7 1 L13 7 L7 13 L1 7Z" />
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <g fill={f} stroke={mark === 'hollow' ? c : '#fff'} strokeWidth="1.5">{path}</g>
      {mark === 'new' && <circle cx="7" cy="7" r="6.4" fill="none" stroke="#111" strokeWidth="1" />}
    </svg>
  )
}

// 유형 필터(그래프 범례 겸용). 지도와 그래프가 같은 상태를 쓴다
export function TypeFilter({ value, onChange }: { value: TheaterType | null; onChange: (t: TheaterType | null) => void }) {
  return (
    <div className="seg ui" role="group" aria-label="유형 선택">
      <button aria-pressed={value === null} onClick={() => onChange(null)}>전체</button>
      {TYPES.map((t) => (
        <button key={t} aria-pressed={value === t} onClick={() => onChange(value === t ? null : t)}>
          <Sym type={t} /> {t}
        </button>
      ))}
    </div>
  )
}

// 자료가 없을 때 보여주는 안내. 가짜 값 대신 필요한 파일·필드를 알린다
export function DataStatus({ data, need, title = '데이터 준비 중', note }: { data: DataSet; need: FileKey[]; title?: string; note?: ReactNode }) {
  return (
    <div className="status" role="status">
      <p className="status-title">{title}</p>
      {note && <p>{note}</p>}
      <table>
        <thead><tr><th>필요한 파일</th><th>필수 필드</th><th>상태</th></tr></thead>
        <tbody>
          {need.map((k) => (
            <tr key={k}>
              <td><code>public/data/{FILES[k].file}</code></td>
              <td>{FILES[k].fields.join(', ') || '—'}</td>
              <td>{data[k].status === 'ok' ? '불러옴' : data[k].status === 'invalid' ? `오류: ${data[k].message}` : '없음'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ready(data: DataSet, need: FileKey[]) {
  return need.every((k) => data[k].status === 'ok')
}

// 그래프 SVG 저장
export function saveSvg(svg: SVGSVGElement | null, name: string) {
  if (!svg) return
  const src = new XMLSerializer().serializeToString(svg)
  download(URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' })), `${name}.svg`)
}
// 지도 PNG 저장(현재 화면, 고해상도는 브라우저 배율을 따른다)
export function savePng(canvas: HTMLCanvasElement | undefined, name: string) {
  if (canvas) download(canvas.toDataURL('image/png'), `${name}.png`)
}
function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href; a.download = name; a.click()
}
