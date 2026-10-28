import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { TYPES, TYPE_STYLE } from '../config'
import type { DataSet, Theater } from '../data'
import { tooltipHtml } from './TheaterTooltip'

export type Mark = 'fill' | 'hollow' | 'new' // 영업 / 폐업 / 새로 개업
export type Point = { t: Theater; mark: Mark }

type Props = {
  data: DataSet
  points: Point[]
  sizeBy?: 'none' | 'screens'
  highlight?: string | null // 강조할 유형. 나머지는 흐리게
  line?: [number, number][] | null // 선택한 영화관 → 최근접 영화관
  reveal?: boolean // false → true 가 되면 점이 천천히 나타난다
  syncId?: string // 같은 syncId 지도끼리 위치·축척을 맞춘다
  onSelect?: (ts: Theater[]) => void
  onMap?: (m: maplibregl.Map) => void
  extras?: Overlay[] // 지하철·중심지·문화시설 등 추가 레이어(자료가 있을 때만)
  label: string
}
export type Overlay = { id: string; data: any; layers: any[] }

const groups: Record<string, Set<maplibregl.Map>> = {}

// 유형(모양·색) × 표시(채움/외곽선/개업) 아이콘을 캔버스로 그린다. 글꼴 서버가 필요 없다.
function icon(shape: string, color: string, mark: Mark) {
  const s = 40, c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.beginPath()
  const r = 13
  if (shape === 'circle') g.arc(s / 2, s / 2, r, 0, Math.PI * 2)
  if (shape === 'square') g.rect(s / 2 - r * 0.9, s / 2 - r * 0.9, r * 1.8, r * 1.8)
  if (shape === 'diamond') { g.moveTo(s / 2, s / 2 - r * 1.2); g.lineTo(s / 2 + r * 1.2, s / 2); g.lineTo(s / 2, s / 2 + r * 1.2); g.lineTo(s / 2 - r * 1.2, s / 2); g.closePath() }
  if (mark === 'hollow') {
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill()
    g.lineWidth = 4; g.strokeStyle = color; g.stroke()
  } else {
    g.fillStyle = color; g.fill()
    g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke()
    if (mark === 'new') { g.lineWidth = 3; g.strokeStyle = '#111'; g.beginPath(); g.arc(s / 2, s / 2, r + 5, 0, Math.PI * 2); g.stroke() }
  }
  return g.getImageData(0, 0, s, s)
}

function bbox(fc: any): [number, number, number, number] {
  const b = [180, 90, -180, -90]
  const walk = (c: any) => (typeof c[0] === 'number' ? (b[0] = Math.min(b[0], c[0]), b[1] = Math.min(b[1], c[1]), b[2] = Math.max(b[2], c[0]), b[3] = Math.max(b[3], c[1])) : c.forEach(walk))
  fc?.features?.forEach((f: any) => f.geometry && walk(f.geometry.coordinates))
  return b[0] < b[2] ? (b as any) : [126.76, 37.41, 127.19, 37.72]
}

const pointsFC = (points: Point[]) => ({
  type: 'FeatureCollection',
  features: points.filter((p) => p.t.lon != null).map((p) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [p.t.lon, p.t.lat] },
    properties: { id: p.t.id, type: p.t.type, icon: `${p.t.type}-${p.mark}`, screens: p.t.screens ?? 1 },
  })),
})

export default function SeoulMap(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map>()
  const latest = useRef(p)
  latest.current = p

  useEffect(() => {
    const d = p.data
    const m = new maplibregl.Map({
      container: box.current!,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f3f3f1' } }] },
      bounds: bbox(d.boundary.data), fitBoundsOptions: { padding: 16 },
      attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      preserveDrawingBuffer: true, cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl 키를 누른 채 스크롤하면 지도가 확대·축소됩니다',
        'CooperativeGesturesHandler.MacHelpText': '⌘ 키를 누른 채 스크롤하면 지도가 확대·축소됩니다',
        'CooperativeGesturesHandler.MobileHelpText': '두 손가락으로 지도를 움직이세요',
      },
    })
    m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.current = m
    ;((window as any).__maps ??= []).push(m) // 자동 점검(브라우저 테스트)용
    m.on('load', () => {
      const add = (id: string, key: keyof DataSet, layers: any[]) => {
        if (d[key].status !== 'ok') return
        m.addSource(id, { type: 'geojson', data: d[key].data })
        layers.forEach((l) => m.addLayer({ ...l, source: id }))
      }
      add('gu', 'gu', [
        { id: 'gu-fill', type: 'fill', paint: { 'fill-color': '#ffffff' } },
        { id: 'gu-line', type: 'line', paint: { 'line-color': '#c4c4c4', 'line-width': 0.8 } },
      ])
      add('roads', 'roads', [{ id: 'roads', type: 'line', paint: { 'line-color': '#dcdcdc', 'line-width': 1.4 } }])
      add('river', 'river', [{ id: 'river', type: 'line', paint: { 'line-color': '#a9cbe0', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 14] } }])
      add('boundary', 'boundary', [{ id: 'boundary', type: 'line', paint: { 'line-color': '#444', 'line-width': 1.4 } }])
      for (const t of TYPES) for (const mk of ['fill', 'hollow', 'new'] as Mark[]) m.addImage(`${t}-${mk}`, icon(TYPE_STYLE[t].shape, TYPE_STYLE[t].color, mk), { pixelRatio: 2 })
      m.addSource('link', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'link', type: 'line', source: 'link', paint: { 'line-color': '#111', 'line-width': 2, 'line-dasharray': [2, 1] } })
      m.addSource('theaters', { type: 'geojson', data: pointsFC(latest.current.points) as any })
      m.addLayer({
        id: 'theaters', type: 'symbol', source: 'theaters',
        layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'screens'] },
        paint: { 'icon-opacity': latest.current.reveal === false ? 0 : 0.92, 'icon-opacity-transition': { duration: 2500, delay: 0 } } as any,
      })
      // 자치구 이름: 글꼴 서버 없이 HTML 표식으로
      d.gu.data?.features.forEach((f: any) => {
        const el = document.createElement('div')
        el.className = 'gu-label'; el.textContent = f.properties.name
        new maplibregl.Marker({ element: el }).setLngLat([f.properties.label_lon, f.properties.label_lat]).addTo(m)
      })
      apply(m, latest.current)
      latest.current.onMap?.(m)
    })
    m.on('click', 'theaters', (e) => {
      const ids = new Set(e.features!.map((f) => f.properties!.id))
      const ts = latest.current.points.map((x) => x.t).filter((t) => ids.has(t.id))
      new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(ts.map(tooltipHtml).join('<hr>')).addTo(m)
      latest.current.onSelect?.(ts)
    })
    m.on('mouseenter', 'theaters', () => (m.getCanvas().style.cursor = 'pointer'))
    m.on('mouseleave', 'theaters', () => (m.getCanvas().style.cursor = ''))
    // 같은 그룹 지도의 중심·확대 수준을 맞춘다(같은 축척 유지)
    if (p.syncId) {
      const g = (groups[p.syncId] ??= new Set())
      g.add(m)
      m.on('move', (e: any) => {
        if (!e.originalEvent) return
        g.forEach((o) => o !== m && o.jumpTo({ center: m.getCenter(), zoom: m.getZoom() }))
      })
    }
    return () => { groups[p.syncId ?? '']?.delete(m); m.remove() }
  }, [])

  useEffect(() => { if (map.current) apply(map.current, p) })

  return <div className="map" ref={box} role="img" aria-label={p.label} />
}

function apply(m: maplibregl.Map, p: Props) {
  const src = m.getSource('theaters') as maplibregl.GeoJSONSource | undefined
  if (!src) return
  const on = new Set((p.extras ?? []).map((o) => o.id))
  for (const o of p.extras ?? []) {
    if (!m.getSource(o.id)) {
      m.addSource(o.id, { type: 'geojson', data: o.data })
      o.layers.forEach((l, i) => m.addLayer({ ...l, id: `${o.id}-${i}`, source: o.id }, 'link'))
    }
  }
  for (const l of m.getStyle().layers) {
    const sid = (l as any).source
    if (sid && !['gu', 'roads', 'river', 'boundary', 'theaters', 'link'].includes(sid))
      m.setLayoutProperty(l.id, 'visibility', on.has(sid) ? 'visible' : 'none')
  }
  src.setData(pointsFC(p.points) as any)
  m.setLayoutProperty('theaters', 'icon-size', p.sizeBy === 'screens'
    ? ['*', 0.42, ['sqrt', ['get', 'screens']]] // 면적이 스크린 수에 비례
    : ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1])
  if (p.reveal !== false) m.setPaintProperty('theaters', 'icon-opacity', p.highlight ? ['case', ['==', ['get', 'type'], p.highlight], 0.95, 0.15] : 0.92)
  ;(m.getSource('link') as maplibregl.GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: p.line ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.line } }] : [],
  })
}
