// 데이터 로딩·검증·필드 매핑. 시각화 컴포넌트는 여기서 만든 값만 쓴다.
import { CONFIG, FIELD_MAP, FILES, type FileKey, type TheaterType } from './config'

export type Status = 'ok' | 'missing' | 'invalid'
export type Loaded = { status: Status; data: any; message?: string }
export type DataSet = Record<FileKey, Loaded>

export type Theater = {
  id: string; name: string; gu: string; address: string; type: TheaterType; typeBasis: string
  status: '영업' | '휴관' | '폐관' | '전환'
  openDate: string; openYear: number | null; renamedFrom: boolean
  closeKind: string; closeDate: string; closeYear: number | null
  years: number[]; screens: number | null; seats: number | null; operator: string
  lon: number | null; lat: number | null; coordNote: string
}

const SEOUL_BBOX = [126.7, 37.4, 127.3, 37.75]

function remap(key: FileKey, props: Record<string, any>) {
  const map = FIELD_MAP[key]
  if (!map) return props
  const out = { ...props }
  for (const [to, from] of Object.entries(map)) out[to] = props[from]
  return out
}

// 좌표가 [경도, 위도] 순서인지, 서울 부근인지 첫 좌표로 검사
function firstCoord(g: any): number[] | null {
  let c = g?.coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return Array.isArray(c) ? c : null
}

async function load(key: FileKey): Promise<Loaded> {
  const { file, fields } = FILES[key]
  try {
    const res = await fetch(`data/${file}`)
    if (!res.ok) return { status: 'missing', data: null }
    if (file.endsWith('.csv')) return { status: 'ok', data: await res.text() }
    const gj = await res.json()
    const feats = (gj.features ?? []).map((f: any) => ({ ...f, properties: remap(key, f.properties ?? {}) }))
    const sample = feats.find((f: any) => f.geometry)
    const c = firstCoord(sample?.geometry)
    if (c && !(c[0] > SEOUL_BBOX[0] - 1 && c[0] < SEOUL_BBOX[2] + 1 && c[1] > SEOUL_BBOX[1] - 1 && c[1] < SEOUL_BBOX[3] + 1))
      return { status: 'invalid', data: null, message: `좌표가 서울 범위가 아닙니다 (${c.join(', ')}). EPSG:4326 [경도, 위도]인지 확인하세요.` }
    const lack = fields.filter((k) => feats.length && !(k in feats[0].properties))
    if (lack.length) return { status: 'invalid', data: null, message: `필수 필드 없음: ${lack.join(', ')}` }
    return { status: 'ok', data: { type: 'FeatureCollection', features: feats } }
  } catch (e) {
    return { status: 'missing', data: null, message: String(e) }
  }
}

export async function loadAll(): Promise<DataSet> {
  const keys = Object.keys(FILES) as FileKey[]
  const loaded = await Promise.all(keys.map(load))
  return Object.fromEntries(keys.map((k, i) => [k, loaded[i]])) as DataSet
}

const year = (d: string) => (/^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null)

export function toTheaters(fc: any): Theater[] {
  return (fc?.features ?? []).map((f: any) => {
    const p = f.properties
    const c = f.geometry?.coordinates
    return {
      id: p.id, name: p.name, gu: p.gu, address: p.address, type: p.type, typeBasis: p.type_basis,
      status: p.status, openDate: p.open_date, openYear: year(p.open_date ?? ''), renamedFrom: !!p.renamed_from,
      closeKind: p.close_kind, closeDate: p.close_date, closeYear: year(p.close_date ?? '') ?? p.close_year ?? null,
      years: p.years ?? [], screens: p.screens, seats: p.seats, operator: p.operator,
      lon: c ? c[0] : null, lat: c ? c[1] : null, coordNote: p.coord_note,
    }
  })
}

// ---- 계산 도우미 (실제 데이터로만 계산) ----

export const activeIn = (t: Theater, y: number) => t.years.includes(y)
export const located = (t: Theater) => t.lon != null && t.lat != null

// 개업: 영진위 개관일 연도. 이름·브랜드 전환으로 이어진 기록은 개업으로 세지 않는다
export const openedIn = (t: Theater, y: number) => !t.renamedFrom && t.openYear === y
// 폐업: 폐관 이벤트만. 전환은 폐업이 아님
export const closedIn = (t: Theater, y: number) => t.status === '폐관' && t.closeYear === y

export function distM(a: Theater, b: Theater) {
  const R = 6371000, r = Math.PI / 180
  const dLat = (b.lat! - a.lat!) * r, dLon = (b.lon! - a.lon!) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * r) * Math.cos(b.lat! * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearest(t: Theater, pool: Theater[], sameType = false) {
  let best: Theater | null = null, d = Infinity
  for (const o of pool) {
    if (o.id === t.id || (sameType && o.type !== t.type)) continue
    const x = distM(t, o)
    if (x < d) { d = x; best = o }
  }
  return best ? { theater: best, dist: d } : null
}

export const median = (xs: number[]) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
export const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)

export function snapshot(ts: Theater[], y = CONFIG.snapshotYear) {
  return ts.filter((t) => activeIn(t, y))
}

// 운영기간(년): 폐관한 영화관만. 개관일과 폐관일이 모두 있어야 계산
export function closedDuration(t: Theater) {
  if (t.status !== '폐관' || !t.openDate || !/^\d{4}/.test(t.closeDate || '')) return null
  const a = new Date(t.openDate.slice(0, 10).replace(/-00/g, '-01'))
  const b = new Date(t.closeDate.length === 7 ? t.closeDate + '-15' : t.closeDate.slice(0, 10))
  const y = (b.getTime() - a.getTime()) / 3.15576e10
  return isFinite(y) && y >= 0 ? y : null
}
