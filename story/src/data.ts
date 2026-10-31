// 데이터 로딩·검증·필드 매핑과 계산. 시각화 컴포넌트는 여기서 만든 값만 쓴다.
import { FIELD_MAP, FILES, type FileKey, type VenueType } from './config'

export type Status = 'ok' | 'missing' | 'invalid'
export type Loaded = { status: Status; data: any; message?: string }
export type DataSet = Record<FileKey, Loaded>

// 분석 단위 = LOCALDATA 운영구간(한 장소에서 개업~폐업 한 번)
export type Venue = {
  id: string; venue: string; name: string; ldNames: string; koficNames: string
  type: VenueType; typeBasis: string; typeNote: string; subtype: string
  status: '영업' | '폐업' | '취소·말소'
  chainOp: string // 멀티플렉스 체인 운영 방식: 직영·위탁·확인 불가
  types: [number, number, VenueType, string][] // 연도별 유형 구간 [시작, 끝, 유형, 브랜드] — 인수·전환 반영
  typeHistory: string
  open: string; close: string; openD: Date | null; closeD: Date | null; bulkOpen: boolean
  gu: string; dong: string; address: string
  screens: number | null; seats: number | null; screens25: number | null; seats25: number | null; special25: number | null; art25: number | null; operator25: string
  koficYears: string; licenses: number; occupancy: string; occBuilding: string; occConf: string; floor: number | null; founded: number | null // 실제 개관 연도(참고 자료로 확인한 곳만)
  conflict: string; source: string
  lon: number | null; lat: number | null
}

function remap(key: FileKey, props: Record<string, any>) {
  const map = FIELD_MAP[key]
  if (!map) return props
  const out = { ...props }
  for (const [to, from] of Object.entries(map)) out[to] = props[from]
  return out
}

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
    if (!gj.features) return { status: 'ok', data: gj }
    const feats = gj.features.map((f: any) => ({ ...f, properties: remap(key, f.properties ?? {}) }))
    const c = firstCoord(feats.find((f: any) => f.geometry)?.geometry)
    if (c && !(c[0] > 125.7 && c[0] < 128.3 && c[1] > 36.4 && c[1] < 38.7))
      return { status: 'invalid', data: null, message: `좌표가 서울 부근이 아닙니다 (${c.join(', ')}). EPSG:4326 [경도, 위도]인지 확인하세요.` }
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

const date = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s) : null)

export function toVenues(fc: any): Venue[] {
  return (fc?.features ?? []).map((f: any) => {
    const p = f.properties, c = f.geometry?.coordinates
    return {
      id: p.id, venue: p.venue, name: p.name, ldNames: p.ld_names, koficNames: p.kofic_names,
      type: p.type, chainOp: p.chain_op ?? '', types: p.types ?? [], typeHistory: p.type_history ?? '', typeBasis: p.type_basis, typeNote: p.type_note, subtype: p.subtype,
      status: p.status, open: p.open, close: p.close, openD: date(p.open), closeD: date(p.close), bulkOpen: p.bulk_open,
      gu: p.gu, dong: p.dong, address: p.address,
      screens: p.screens, seats: p.seats, screens25: p.screens25, seats25: p.seats25, special25: p.special25, art25: p.art25, operator25: p.operator25,
      koficYears: p.kofic_years, licenses: p.licenses, occupancy: p.occupancy, occBuilding: p.occ_building, occConf: p.occ_conf, floor: p.floor ?? null, founded: p.founded ?? null,
      conflict: p.conflict, source: p.source, lon: c ? c[0] : null, lat: c ? c[1] : null,
    }
  })
}

// ---- 계산 도우미 (실제 데이터로만 계산) ----
export const located = (v: Venue) => v.lon != null && v.lat != null
export const isOpen = (v: Venue) => v.status === '영업'
// 연도 t 에 운영: 개업일 ≤ t년 말, 폐업일이 없거나(영업) t년 1월 1일 이후
export const operatingIn = (v: Venue, y: number, until?: Date) => {
  const end = until && until.getFullYear() === y ? until : new Date(`${y}-12-31`)
  return !!v.openD && v.openD <= end && (isOpen(v) || (!!v.closeD && v.closeD >= new Date(`${y}-01-01`)))
}
export const openedIn = (v: Venue, y: number) => !v.bulkOpen && v.openD?.getFullYear() === y
export const closedIn = (v: Venue, y: number) => !isOpen(v) && v.closeD?.getFullYear() === y
// 운영기간(년): 폐업 운영구간만, 개업·폐업일이 모두 있어야
export const duration = (v: Venue) => (!isOpen(v) && v.openD && v.closeD ? (v.closeD.getTime() - v.openD.getTime()) / 3.15576e10 : null)

export function distM(a: { lon: number | null; lat: number | null }, b: { lon: number | null; lat: number | null }) {
  const R = 6371000, r = Math.PI / 180
  const dLat = (b.lat! - a.lat!) * r, dLon = (b.lon! - a.lon!) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * r) * Math.cos(b.lat! * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearest(v: Venue, pool: Venue[], filter: (o: Venue) => boolean = () => true) {
  let best: Venue | null = null, d = Infinity
  for (const o of pool) {
    if (o.id === v.id || !filter(o)) continue
    const x = distM(v, o)
    if (x < d) { d = x; best = o }
  }
  return best ? { venue: best, dist: d } : null
}

export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i)
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)
}
export const median = (xs: number[]) => quantile(xs, 0.5)
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
export const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
export const f1 = (x: number) => (isFinite(x) ? x.toFixed(1) : '—')

// 자치구·행정동 등 범주별 개수 상위
export function topBy(vs: Venue[], key: (v: Venue) => string, n = 3) {
  const c = new Map<string, number>()
  vs.forEach((v) => { const k = key(v); if (k) c.set(k, (c.get(k) ?? 0) + 1) })
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

// 조사: 받침 여부에 따라 은/는, 이/가, 과/와, 을/를. jo('독립·예술영화전용관', '는') → '독립·예술영화관은'
export function jo(w: string, p: string) {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  const has = c >= 0 && c <= 11171 && c % 28 !== 0
  const pair: Record<string, [string, string]> = { 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'], 과: ['과', '와'], 와: ['과', '와'], 을: ['을', '를'], 를: ['을', '를'] }
  return w + (pair[p] ? pair[p][has ? 0 : 1] : p)
}

// Kaplan–Meier 생존곡선: t = 운영기간(년), event = 폐업했는가(영업 중이면 중도절단)
export function kaplanMeier(items: { t: number; event: boolean }[]) {
  const ts = [...new Set(items.map((x) => x.t))].sort((a, b) => a - b)
  let s = 1, atRisk = items.length
  const steps = [{ t: 0, s: 1, n: atRisk }]
  for (const t of ts) {
    const here = items.filter((x) => x.t === t), d = here.filter((x) => x.event).length
    if (d && atRisk) { s *= 1 - d / atRisk; steps.push({ t, s, n: atRisk }) }
    atRisk -= here.length
  }
  const med = steps.find((x) => x.s <= 0.5)?.t ?? null
  return { steps, med, end: ts[ts.length - 1] ?? 0 }
}

// 문 연 해: 실제 개관 연도가 확인된 곳은 그 해, 아니면 LOCALDATA 인허가일(일괄 등록일 의심이면 알 수 없음)
export const openYear = (v: Venue): number | null => v.founded ?? (v.openD && !v.bulkOpen ? v.openD.getFullYear() : null)
export const eraOf = (y: number) => (y < 1960 ? '1960년 전' : y < 2000 ? `${Math.floor(y / 10) * 10}년대` : `${Math.floor(y / 10) * 10}년대`)

// 그해의 유형(인수·전환 반영). 구간 밖이면 가장 가까운 구간, 없으면 대표 유형
export function typeAt(v: Venue, y: number): VenueType {
  const t = v.types
  if (!t.length) return v.type
  const hit = t.find(([a, b]) => y >= a && y <= b)
  return (hit ?? (y < t[0][0] ? t[0] : t[t.length - 1]))[2]
}
