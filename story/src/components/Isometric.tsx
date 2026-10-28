// 유형별 개념 다이어그램(아이소메트릭). 상영관 칸 수 = 실제 자료의 시설당 스크린 수 중앙값(KOFIC 2025)
import { TYPE_STYLE, type VenueType } from '../config'

const S = 6 // 한 칸 크기(px)
const iso = (x: number, y: number, z: number) => [150 + (x - y) * 0.866 * S, 70 + (x + y) * 0.5 * S - z * S]
const pts = (ps: number[][]) => ps.map(([x, y, z]) => iso(x, y, z).join(',')).join(' ')

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))
  return `rgb(${c.join(',')})`
}

// 직육면체: 윗면·왼쪽 앞면·오른쪽 앞면
function Box({ x, y, z, w, d, h, color, line = '#333' }: { x: number; y: number; z: number; w: number; d: number; h: number; color: string; line?: string }) {
  return (
    <g stroke={line} strokeWidth="0.7" strokeLinejoin="round">
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={shade(color, -0.12)} />
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={shade(color, -0.28)} />
      <polygon points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={shade(color, 0.25)} />
    </g>
  )
}

// 상영관 n개를 바닥 w×d 안에 격자로 배치
function Screens({ n, x, y, z, w, d, color }: { n: number; x: number; y: number; z: number; w: number; d: number; color: string }) {
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols)
  const cw = w / cols, cd = d / rows
  const cells = Array.from({ length: n }, (_, i) => ({ c: i % cols, r: Math.floor(i / cols) })).sort((a, b) => a.c + a.r - (b.c + b.r))
  return <>{cells.map(({ c, r }) => <Box key={`${c}-${r}`} x={x + c * cw + 0.25} y={y + r * cd + 0.25} z={z} w={cw - 0.5} d={cd - 0.5} h={1.6} color={color} line="#fff" />)}</>
}

function Label({ x, y, z, t, dx = 0 }: { x: number; y: number; z: number; t: string; dx?: number }) {
  const [px, py] = iso(x, y, z)
  return <g fontSize="10.5" fill="#333"><line x1={px} y1={py} x2={px + dx} y2={py - 14} stroke="#999" /><text x={px + dx} y={py - 17} textAnchor={dx < 0 ? 'end' : 'start'}>{t}</text></g>
}

export function TypeIsometric({ type, screens }: { type: VenueType; screens: number | null }) {
  const c = TYPE_STYLE[type].color, n = Math.max(1, Math.min(16, Math.round(screens ?? 1)))
  return (
    <svg viewBox="-90 -8 440 218" role="img" aria-label={`${type} 개념도`} className="iso">
      <title>{type} 개념도 — 상영관 {screens ?? '자료 없음'}개(중앙값)</title>
      <polygon points={pts([[-4, -4, 0], [22, -4, 0], [22, 22, 0], [-4, 22, 0]])} fill="#f1f1ee" stroke="#ddd" />
      {type === '멀티플렉스' && <>
        {[0, 1, 2].map((f) => <Box key={f} x={0} y={0} z={f * 3} w={16} d={14} h={3} color="#d6d6d2" />)}
        <Box x={0} y={0} z={9} w={16} d={14} h={0.4} color="#bdbdb8" />
        <Screens n={n} x={0.5} y={0.5} z={9.4} w={15} d={13} color={c} />
        <Label x={16} y={0} z={11} t={`상영관 ${screens == null ? '—' : +screens.toFixed(1)}개(중앙값)`} dx={12} />
        <Label x={0} y={14} z={4} t="상업시설(백화점·쇼핑몰 등)" dx={-8} />
      </>}
      {type === '독립·예술영화관' && <>
        <Box x={3} y={3} z={0} w={10} d={8} h={3} color="#e4e1d8" />
        <Box x={3} y={3} z={3} w={10} d={8} h={0.3} color="#cfcac0" />
        <Screens n={n} x={4} y={4} z={3.3} w={8} d={6} color={c} />
        <Box x={14} y={5} z={0} w={4} d={5} h={2} color="#efece4" />
        <Label x={12} y={4} z={5} t={`상영관 ${screens == null ? '—' : +screens.toFixed(1)}개(중앙값)`} dx={14} />
        <Label x={3} y={11} z={2} t="소규모 건물·문화시설" dx={-8} />
      </>}
      {type === '기타' && <>
        <Box x={1} y={3} z={0} w={9} d={8} h={4} color={c} />
        <Label x={10} y={3} z={4} t="단관·소규모 상영관" dx={12} />
        <Box x={14} y={2} z={0} w={0.4} d={6} h={4} color="#fafafa" />
        <Box x={17} y={4} z={0} w={2.4} d={1.4} h={0.9} color="#888" />
        <Box x={17} y={7} z={0} w={2.4} d={1.4} h={0.9} color="#888" />
        <Label x={19.4} y={8.4} z={0.9} t="자동차극장·이동상영관" dx={10} />
      </>}
    </svg>
  )
}
