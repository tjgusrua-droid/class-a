import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { TYPES, TYPE_STYLE } from '../config'
import type { DataSet, Venue } from '../data'
import { TooltipBody } from './TheaterTooltip'

export type Mark = 'fill' | 'hollow' | 'new' | 'dim' // 영업 / 폐업 / 이 해 개업 / 흐리게
export type Point = { v: Venue; mark: Mark; color?: string } // color: 유형 색 대신 쓸 색(예: 입점 형태)
// place: under = 행정경계 아래(버퍼·중심지 영역), over = 경계·지명 위, 영화관 아래(역·문화시설)
// label: 지물 이름표(캔버스 글자). 영화관 점보다 아래에 놓인다
export type Overlay = { id: string; data: any; layers: any[]; place: 'under' | 'over'; hover?: (p: any) => string; label?: { text: (p: any) => string; color: string; size?: number; box?: boolean } }

// 지하철 노선(OSM 선형, 노선 고유색, 반투명)과 역(서울열린데이터광장). 영화관 점이 가장 먼저 보이도록 둘 다 영화관 아래·옅게
export const stationOverlay = (data: DataSet, dark = false): Overlay[] => [
  ...(data.lines.status === 'ok' ? [{ id: 'sublines', place: 'over' as const, data: data.lines.data, hover: (p: any) => p.name,
    layers: [{ type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-opacity': dark ? 0.5 : 0.38,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 14, 4] } }] }] : []),
  ...(data.stations.status === 'ok' ? [{ id: 'stations', place: 'over' as const, data: data.stations.data,
    hover: (p: any) => `${p.name}역 · ${(Array.isArray(p.lines) ? p.lines : JSON.parse(p.lines)).join(', ')}`,
    layers: [{ type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['get', 'transfer'], 2.2, 1.3], 14, ['case', ['get', 'transfer'], 6, 4]],
      'circle-color': dark ? '#333' : '#fff', 'circle-opacity': 0.9, 'circle-stroke-color': dark ? '#888' : '#9a9a9a', 'circle-stroke-width': ['case', ['get', 'transfer'], 1, 0.5] } }] }] : []),
]

// 서울시 5개 생활권(권역): 진한 회색 경계, 이름은 서울 바깥 태그 + 지시선
export const regionOverlay = (data: DataSet): Overlay[] => data.regions.status !== 'ok' ? [] : [
  { id: 'regions', place: 'over', data: data.regions.data,
    layers: [{ type: 'line', paint: { 'line-color': '#4d4d4d', 'line-width': 2.2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } }] },
  { id: 'regiontags', place: 'over', label: { text: (p) => p.name, color: '#222', size: 1.2, box: true },
    data: { type: 'FeatureCollection', features: data.regions.data.features.map((f: any) => ({ type: 'Feature', properties: f.properties, geometry: { type: 'LineString', coordinates: [f.properties.anchor, f.properties.label] } })) },
    layers: [{ type: 'line', paint: { 'line-color': '#4d4d4d', 'line-width': 1.2 } }] },
  { id: 'regiondots', place: 'over', data: { type: 'FeatureCollection', features: data.regions.data.features.map((f: any) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: f.properties.anchor } })) },
    layers: [{ type: 'circle', paint: { 'circle-radius': 3.2, 'circle-color': '#4d4d4d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } }] },
]

type Props = {
  data: DataSet
  points: Point[]
  label: string
  extras?: Overlay[]
  line?: [number, number][] | null
  selectedId?: string | null
  onSelect?: (v: Venue | null) => void
  onMap?: (m: maplibregl.Map) => void
  reveal?: boolean
  height?: string
  showGu?: boolean // 행정구역 경계·이름
  resetKey?: unknown // 값이 바뀌면 처음 범위로 돌아간다(장면 전환 등)
  dark?: boolean // 어두운 바탕(밀도 지도)
  pointScale?: number // 영화관 기호 크기 배율(밀도 지도에서는 작게)
}

const BASE = ['gu', 'gulabel', 'river', 'boundary', 'venues', 'link']
const mobile = () => matchMedia('(max-width: 700px)').matches

function shapeIcon(shape: string, color: string, mark: Mark | 'sel') {
  const s = 44, c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!, r = 12, m = s / 2
  const path = () => {
    g.beginPath()
    if (shape === 'circle') g.arc(m, m, r, 0, Math.PI * 2)
    if (shape === 'square') g.rect(m - r * 0.9, m - r * 0.9, r * 1.8, r * 1.8)
    if (shape === 'diamond') { g.moveTo(m, m - r * 1.25); g.lineTo(m + r * 1.25, m); g.lineTo(m, m + r * 1.25); g.lineTo(m - r * 1.25, m); g.closePath() }
  }
  path()
  if (mark === 'sel') { g.lineWidth = 4; g.strokeStyle = '#111'; g.beginPath(); g.arc(m, m, r + 7, 0, Math.PI * 2); g.stroke() }
  else if (mark === 'hollow') { g.fillStyle = '#fff'; g.fill(); g.lineWidth = 4; g.strokeStyle = color; g.stroke() }
  else {
    g.globalAlpha = mark === 'dim' ? 0.25 : 1
    g.fillStyle = color; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke()
    if (mark === 'new') { g.globalAlpha = 1; g.lineWidth = 3; g.strokeStyle = '#111'; g.beginPath(); g.arc(m, m, r + 6, 0, Math.PI * 2); g.stroke() }
  }
  return g.getImageData(0, 0, s, s)
}

// 자치구 이름을 캔버스 이미지로 만들어 심볼 레이어에 쓴다(글꼴 서버 없이, 영화관 점보다 아래에 놓기 위해)
function textIcon(t: string, color = '#8c8c8c', weight = 500, box = false) {
  const c = document.createElement('canvas'), g = c.getContext('2d')!
  g.font = `${weight} 22px "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif`
  c.width = Math.ceil(g.measureText(t).width) + 8; c.height = 30
  g.font = `${weight} 22px "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif`
  if (box) { g.fillStyle = '#fff'; g.fillRect(1, 1, c.width - 2, c.height - 2); g.lineWidth = 2; g.strokeStyle = '#4d4d4d'; g.strokeRect(1, 1, c.width - 2, c.height - 2) }
  else { g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeText(t, 4, 22) }
  g.fillStyle = color; g.fillText(t, 4, 22)
  return g.getImageData(0, 0, c.width, c.height)
}

function bbox(fc: any): [number, number, number, number] {
  const b = [180, 90, -180, -90]
  const walk = (c: any) => (typeof c[0] === 'number' ? (b[0] = Math.min(b[0], c[0]), b[1] = Math.min(b[1], c[1]), b[2] = Math.max(b[2], c[0]), b[3] = Math.max(b[3], c[1])) : c.forEach(walk))
  fc?.features?.forEach((f: any) => f.geometry && walk(f.geometry.coordinates))
  return b[0] < b[2] ? (b as any) : [126.76, 37.41, 127.19, 37.72]
}

// 같은 좌표의 여러 운영구간은 화면에서만 둥글게 펼쳐 보인다(실제 좌표는 그대로)
function pointsFC(points: Point[], selectedId?: string | null) {
  const groups = new Map<string, Point[]>()
  points.filter((p) => p.v.lon != null).forEach((p) => {
    const k = `${p.v.lon!.toFixed(5)},${p.v.lat!.toFixed(5)}`
    groups.set(k, [...(groups.get(k) ?? []), p])
  })
  const feats: any[] = []
  groups.forEach((g) => g.forEach((p, i) => {
    const n = g.length, rr = n > 1 ? 10 + n * 2 : 0, a = (i / n) * Math.PI * 2 - Math.PI / 2
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.v.lon, p.v.lat] },
      properties: { id: p.v.id, icon: p.color ? `${p.v.type}-${p.mark}-${p.color}` : `${p.v.type}-${p.mark}`, selicon: `${p.v.type}-sel`, sel: p.v.id === selectedId, stack: n,
        off: [Math.round(rr * Math.cos(a)), Math.round(rr * Math.sin(a))], z: p.mark === 'dim' ? 0 : p.mark === 'hollow' ? 1 : 2 } })
  }))
  return { type: 'FeatureCollection', features: feats }
}

export default function SeoulMap(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map>()
  const latest = useRef(p)
  latest.current = p
  const [tip, setTip] = useState<{ items: Venue[]; lngLat: [number, number]; pinned: boolean } | null>(null)
  const [hint, setHint] = useState<{ x: number; y: number; t: string } | null>(null) // 역 등 보조 레이어 이름
  const [, force] = useState(0)
  const home = () => { const m = map.current; m && m.fitBounds(bbox(p.data.boundary.data), { padding: 18, duration: 600 }) } // 지도·페이지 이동 시 고정 툴팁 위치 갱신

  useEffect(() => {
    const d = p.data
    const m = new maplibregl.Map({
      container: box.current!,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f4f4f2' } }] },
      bounds: bbox(d.boundary.data), fitBoundsOptions: { padding: 18 },
      attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      preserveDrawingBuffer: true,
    })
    m.touchZoomRotate.disableRotation()
    if (matchMedia('(pointer: coarse)').matches) m.dragPan.disable() // 손가락 한 개는 페이지 스크롤, 두 손가락은 확대·축소·이동
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.current = m
    ;((window as any).__maps ??= []).push(m) // 자동 점검(브라우저 테스트)용
    m.on('load', () => {
      const src = (id: string, data: any) => m.addSource(id, { type: 'geojson', data })
      if (d.gu.status === 'ok') {
        src('gu', d.gu.data)
        m.addLayer({ id: 'gu-fill', type: 'fill', source: 'gu', paint: { 'fill-color': '#ffffff' } })
      }
      if (d.river.status === 'ok') {
        src('river', d.river.data)
        m.addLayer({ id: 'river', type: 'line', source: 'river', paint: { 'line-color': '#a9cbe0', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 14] } })
      }
      m.addLayer({ id: 'anchor-under', type: 'background', paint: { 'background-opacity': 0 } }) // 버퍼·중심지 자리
      if (d.gu.status === 'ok') {
        m.addLayer({ id: 'gu-line', type: 'line', source: 'gu', paint: { 'line-color': '#bdbdbd', 'line-width': 0.8 } })
        d.gu.data.features.forEach((f: any) => m.addImage(`gu:${f.properties.name}`, textIcon(f.properties.name), { pixelRatio: 2 }))
        src('gulabel', { type: 'FeatureCollection', features: d.gu.data.features.map((f: any) => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: 'Point', coordinates: [f.properties.label_lon, f.properties.label_lat] } })) })
        m.addLayer({ id: 'gu-label', type: 'symbol', source: 'gulabel', layout: { 'icon-image': ['concat', 'gu:', ['get', 'name']], 'icon-allow-overlap': true } })
      }
      if (d.boundary.status === 'ok') {
        src('boundary', d.boundary.data)
        m.addLayer({ id: 'boundary', type: 'line', source: 'boundary', paint: { 'line-color': '#444', 'line-width': 1.4 } })
      }
      m.addLayer({ id: 'anchor-over', type: 'background', paint: { 'background-opacity': 0 } }) // 역·문화시설 자리
      src('link', { type: 'FeatureCollection', features: [] })
      m.addLayer({ id: 'link', type: 'line', source: 'link', paint: { 'line-color': '#111', 'line-width': 2, 'line-dasharray': [2, 1] } })
      for (const t of TYPES) for (const mk of ['fill', 'hollow', 'new', 'dim', 'sel'] as const) m.addImage(`${t}-${mk}`, shapeIcon(TYPE_STYLE[t].shape, TYPE_STYLE[t].color, mk), { pixelRatio: 2 })
      src('venues', pointsFC(latest.current.points))
      const lay = { 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-offset': ['get', 'off'], 'symbol-sort-key': ['get', 'z'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.62, 14, 1] } as any
      m.addLayer({ id: 'venues', type: 'symbol', source: 'venues', layout: { ...lay, 'icon-image': ['get', 'icon'] },
        paint: { 'icon-opacity': latest.current.reveal === false ? 0 : 1, 'icon-opacity-transition': { duration: 2200, delay: 0 } } as any })
      m.addLayer({ id: 'venues-sel', type: 'symbol', source: 'venues', filter: ['==', ['get', 'sel'], true], layout: { ...lay, 'icon-image': ['get', 'selicon'] } })
      apply(m, latest.current)
      latest.current.onMap?.(m)
    })
    const items = (e: any) => {
      const ids = new Set(e.features.map((f: any) => f.properties.id))
      return latest.current.points.map((x) => x.v).filter((v) => ids.has(v.id))
    }
    m.on('mousemove', 'venues', (e: any) => {
      m.getCanvas().style.cursor = 'pointer'
      if (mobile()) return
      const its = items(e), ll = e.features[0].geometry.coordinates // 이벤트 객체는 나중에 비워지므로 바로 계산
      setTip((t) => (t?.pinned ? t : { items: its, lngLat: ll, pinned: false }))
    })
    m.on('mousemove', (e) => {
      const hov = (latest.current.extras ?? []).filter((o) => o.hover)
      const ids = hov.flatMap((o) => o.layers.map((_, i) => `${o.id}-${i}`)).filter((id) => m.getLayer(id))
      const f = ids.length && !m.queryRenderedFeatures(e.point, { layers: ['venues'] }).length ? m.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ids })[0] : null
      const o = f && hov.find((x) => (f.layer.id as string).startsWith(x.id + '-'))
      setHint(o ? { x: e.point.x + 10, y: e.point.y - 26, t: o.hover!(f!.properties) } : null)
    })
    m.on('mouseleave', 'venues', () => { m.getCanvas().style.cursor = ''; setTip((t) => (t?.pinned ? t : null)) })
    m.on('click', (e) => {
      const f = m.queryRenderedFeatures(e.point, { layers: ['venues'] })
      if (!f.length) { setTip(null); latest.current.onSelect?.(null); return }
      const its = items({ features: f })
      setTip({ items: its, lngLat: (f[0].geometry as any).coordinates, pinned: true })
      latest.current.onSelect?.(its[0])
    })
    const rerender = () => force((x) => x + 1)
    m.on('move', rerender)
    addEventListener('scroll', rerender, { passive: true })
    return () => { removeEventListener('scroll', rerender); m.remove() }
  }, [])

  useEffect(() => { if (map.current) apply(map.current, p) })
  useEffect(() => { home(); setTip(null) }, [p.resetKey])
  // 지도가 화면 밖으로 나가면 처음 범위로 되돌려 둔다
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) { const m = map.current; m && m.fitBounds(bbox(p.data.boundary.data), { padding: 18, duration: 0 }) } })
    io.observe(box.current!)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTip(null); latest.current.onSelect?.(null) } }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [])

  let tipEl = null
  if (tip && map.current) {
    const r = box.current!.getBoundingClientRect(), pt = map.current.project(tip.lngLat)
    const x = r.left + pt.x, y = r.top + pt.y
    const inView = pt.x >= 0 && pt.y >= 0 && pt.x <= r.width && pt.y <= r.height
    if (inView || mobile()) tipEl = createPortal(<Tip x={x} y={y} items={tip.items} pinned={tip.pinned} close={() => { setTip(null); p.onSelect?.(null) }} />, document.body)
  }

  return (
    <div className="mapwrap">
      <div className="map" ref={box} role="application" aria-label={p.label} style={p.height ? { height: p.height } : undefined} />
      {hint && <div className="maphint" style={{ left: hint.x, top: hint.y }}>{hint.t}</div>}
      <button className="maphome ui" onClick={home} title="처음 범위로" aria-label="지도를 처음 범위로">⤢ 처음 범위</button>
      {tipEl}
    </div>
  )
}

// 툴팁: body 에 띄워 지도 경계에 잘리지 않게. 화면 끝이면 방향을 바꾸고, 모바일은 하단 패널
function Tip({ x, y, items, pinned, close }: { x: number; y: number; items: Venue[]; pinned: boolean; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x + 16, top: y + 16, side: 'right' })
  useLayoutEffect(() => {
    if (mobile() || !ref.current) return
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight, gap = 16
    let left = x + gap, top = y + gap, side = 'right'
    if (left + w > innerWidth - 8) { left = x - gap - w; side = 'left' }
    if (top + h > innerHeight - 8) top = y - gap - h
    setPos({ left: Math.max(8, left), top: Math.max(8, top), side })
  }, [x, y, items])
  const body = (
    <>
      {pinned && <button className="tipclose" onClick={close} aria-label="정보 닫기">×</button>}
      {items.length > 1 && <p className="tipstack">이 위치의 운영구간 {items.length}개</p>}
      {items.map((v) => <TooltipBody key={v.id} v={v} />)}
      {!pinned && <p className="tiphint">클릭하면 고정</p>}
    </>
  )
  if (mobile()) return <div className="sheet" role="dialog" aria-label="영화관 정보">{body}</div>
  return (
    <>
      <svg className="tipline" width="100%" height="100%"><line x1={x} y1={y} x2={pos.side === 'right' ? pos.left : pos.left + (ref.current?.offsetWidth ?? 0)} y2={pos.top + 12} /></svg>
      <div ref={ref} className={`tip ${pinned ? 'pinned' : ''}`} style={{ left: pos.left, top: pos.top }} role="tooltip">{body}</div>
    </>
  )
}

function apply(m: maplibregl.Map, p: Props) {
  const src = m.getSource('venues') as maplibregl.GeoJSONSource | undefined
  if (!src) return
  for (const x of p.points) if (x.color) {
    const id = `${x.v.type}-${x.mark}-${x.color}`
    if (!m.hasImage(id)) m.addImage(id, shapeIcon(TYPE_STYLE[x.v.type].shape, x.color, x.mark), { pixelRatio: 2 })
  }
  src.setData(pointsFC(p.points, p.selectedId) as any)
  if (p.reveal !== false) m.setPaintProperty('venues', 'icon-opacity', 1)
  const k = p.pointScale ?? 1
  for (const id of ['venues', 'venues-sel']) m.setLayoutProperty(id, 'icon-size', ['interpolate', ['linear'], ['zoom'], 9, 0.62 * k, 14, 1 * k])
  m.setPaintProperty('bg', 'background-color', p.dark ? '#1e1e1e' : '#f4f4f2')
  if (m.getLayer('gu-fill')) m.setPaintProperty('gu-fill', 'fill-color', p.dark ? '#2a2a2a' : '#ffffff')
  if (m.getLayer('gu-line')) m.setPaintProperty('gu-line', 'line-color', p.dark ? '#4a4a4a' : '#bdbdbd')
  if (m.getLayer('boundary')) m.setPaintProperty('boundary', 'line-color', p.dark ? '#888' : '#444')
  if (m.getLayer('gu-label')) m.setPaintProperty('gu-label', 'icon-opacity', p.dark ? 0.35 : 1)
  for (const id of ['gu-line', 'gu-label']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', p.showGu === false ? 'none' : 'visible')
  ;(m.getSource('link') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection',
    features: p.line ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.line } }] : [] })
  const on = new Set((p.extras ?? []).map((o) => o.id))
  for (const o of p.extras ?? []) {
    const s = m.getSource(o.id) as maplibregl.GeoJSONSource | undefined
    if (s) {
      s.setData(o.data)
      o.layers.forEach((l, i) => { for (const [k, v] of Object.entries(l.paint ?? {})) m.setPaintProperty(`${o.id}-${i}`, k, v) }) // 색·투명도·굵기 즉시 반영
    } else {
      m.addSource(o.id, { type: 'geojson', data: o.data })
      o.layers.forEach((l, i) => m.addLayer({ ...l, id: `${o.id}-${i}`, source: o.id }, o.place === 'under' ? 'anchor-under' : 'anchor-over'))
      if (o.label) {
        const L = o.label
        o.data.features.forEach((f: any) => { const t = L.text(f.properties); if (!m.hasImage(`lbl:${t}`)) m.addImage(`lbl:${t}`, textIcon(L.box ? ` ${t} ` : t, L.color, 700, L.box), { pixelRatio: 2 }) })
        m.addSource(`${o.id}-lbl`, { type: 'geojson', data: { type: 'FeatureCollection', features: o.data.features.map((f: any) => ({ type: 'Feature', properties: { t: L.text(f.properties), a: f.properties.tagAnchor ?? 'center' }, geometry: { type: 'Point', coordinates: f.properties.label } })) } })
        m.addLayer({ id: `${o.id}-lbl`, type: 'symbol', source: `${o.id}-lbl`, layout: { 'icon-image': ['concat', 'lbl:', ['get', 't']], 'icon-allow-overlap': true, 'icon-anchor': ['get', 'a'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.8 * (L.size ?? 1), 13, 1.1 * (L.size ?? 1)] } }, 'anchor-over')
      }
    }
  }
  for (const l of m.getStyle().layers) {
    const sid = (l as any).source
    if (sid && !BASE.includes(sid)) m.setLayoutProperty(l.id, 'visibility', on.has(sid.replace(/-lbl$/, '')) ? 'visible' : 'none')
  }
}
