// 3장 입지 지표 어댑터. 각 함수는 실제 파일이 들어왔을 때만 호출된다.
// 지표가 바뀌면 이 파일만 고치고 화면 컴포넌트는 그대로 둔다.
import { CONFIG } from './config'
import { distM, type Theater } from './data'

export type Categorizer = { categories: string[]; of: (t: Theater) => string | null }

const truthy = (v: any) => v === true || v === 1 || /^(y|yes|true|1|환승)$/i.test(String(v ?? '').trim())
const asPoint = (f: any) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }) as Theater

// 3-1 지하철 접근성
export function subway(stations: any): Categorizer {
  const st = stations.features.filter((f: any) => f.geometry?.type === 'Point')
  return {
    categories: ['환승역 역세권', '일반역 역세권', '비역세권'],
    of: (t) => {
      const near = st.filter((f: any) => distM(t, asPoint(f)) <= CONFIG.stationRadiusM)
      if (!near.length) return '비역세권'
      return near.some((f: any) => truthy(f.properties.transfer)) ? '환승역 역세권' : '일반역 역세권'
    },
  }
}

// 3-2 중심지 체계: 중심지 범위(폴리곤)가 있을 때만. 점 자료로는 범위를 만들지 않는다
export function centers(fc: any): Categorizer | null {
  const polys = fc.features.filter((f: any) => /Polygon/.test(f.geometry?.type))
  if (!polys.length) return null
  return {
    categories: ['도심', '광역중심', '지역중심', '중심지 외 지역'],
    of: (t) => polys.find((f: any) => inside([t.lon!, t.lat!], f.geometry))?.properties.level ?? '중심지 외 지역',
  }
}

// 3-4 건축물 내 입점 형태 (CSV: id, building_type, mixed_type)
export function building(csv: string): Categorizer {
  const rows = parseCsv(csv)
  const byId = new Map(rows.map((r) => [r.id, r]))
  return {
    categories: ['영화관 중심의 독립 건물', '다른 용도와 함께 사용하는 건물', '확인 불가'],
    of: (t) => byId.get(t.id)?.building_type || null,
  }
}

// 3-5 문화시설: 반경 안 분류별 개수. 영화관은 문화시설 수에서 제외
export function cultureCounts(fc: any, t: Theater) {
  const out: Record<string, number> = {}
  for (const f of fc.features) {
    const c = f.properties.category
    if (!f.geometry || /영화/.test(c)) continue
    out[c] = (out[c] ?? 0) + (distM(t, asPoint(f)) <= CONFIG.cultureRadiusM ? 1 : 0)
  }
  return out
}

// 3-3 상권: 지표 확정 전. 상권활성화지수와 추정매출은 다른 개념이므로 indicator 필드로 구분해 받는다
export function commerce(_fc: any): Categorizer | null {
  return null
}

function inside([x, y]: number[], g: any): boolean {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  return polys.some((rings: number[][][]) => {
    let c = false
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
    return c
  })
}

export function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.replace(/^﻿/, '').trim().split(/\r?\n/)
  const keys = head.split(',').map((s) => s.trim())
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v.trim()])))
}
