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

// 직육면체(렌더 느낌): 굵은 외곽선 없이 면의 밝기 차이로만 입체를 만들고, 모서리에 아주 옅은 하이라이트만
export function Box({ x, y, z, w, d, h, color, line = 'rgba(255,255,255,0.45)' }: { x: number; y: number; z: number; w: number; d: number; h: number; color: string; line?: string }) {
  return (
    <g stroke={line} strokeWidth="0.35" strokeLinejoin="round">
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={shade(color, -0.06)} />
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={shade(color, -0.2)} />
      <polygon points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={shade(color, 0.32)} />
    </g>
  )
}

// 상영관 n개를 바닥 w×d 안에 격자로 배치
function Screens({ n, x, y, z, w, d, color }: { n: number; x: number; y: number; z: number; w: number; d: number; color: string }) {
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols)
  const cw = w / cols, cd = d / rows
  const cells = Array.from({ length: n }, (_, i) => ({ c: i % cols, r: Math.floor(i / cols) })).sort((a, b) => a.c + a.r - (b.c + b.r))
  return <>{cells.map(({ c, r }) => <Box key={`${c}-${r}`} x={x + c * cw + 0.25} y={y + r * cd + 0.25} z={z} w={cw - 0.5} d={cd - 0.5} h={1.6} color={color} />)}</>
}

function Label({ x, y, z, t, dx = 0 }: { x: number; y: number; z: number; t: string; dx?: number }) {
  const [px, py] = iso(x, y, z)
  return <g fontSize="10.5" fill="#444"><line x1={px} y1={py} x2={px + dx} y2={py - 14} stroke="#bbb" strokeWidth="0.6" /><text x={px + dx} y={py - 17} textAnchor={dx < 0 ? 'end' : 'start'}>{t}</text></g>
}

export function TypeIsometric({ type, screens }: { type: VenueType; screens: number | null }) {
  const c = TYPE_STYLE[type].color, n = Math.max(1, Math.min(16, Math.round(screens ?? 1)))
  return (
    <svg viewBox="-90 -8 470 218" role="img" aria-label={`${type} 개념도`} className="iso">
      <title>{type} 개념도 — 상영관 {screens ?? '자료 없음'}개(중앙값)</title>
      <defs><filter id="isoblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter></defs>
      <polygon points={pts([[-4, -4, 0], [22, -4, 0], [22, 22, 0], [-4, 22, 0]])} fill="#f2f2f2" />
      <polygon points={pts([[2, 4, 0], [20, 4, 0], [20, 20, 0], [2, 20, 0]])} fill="#000" opacity="0.10" filter="url(#isoblur)" />
      {type === '멀티플렉스' && <>
        {[0, 1, 2].map((f) => <Box key={f} x={0} y={0} z={f * 3} w={16} d={14} h={3} color="#d6d6d2" />)}
        <Box x={0} y={0} z={9} w={16} d={14} h={0.4} color="#bdbdb8" />
        <Screens n={n} x={0.5} y={0.5} z={9.4} w={15} d={13} color={c} />
        <Label x={16} y={0} z={11} t={`상영관 ${screens == null ? '—' : +screens.toFixed(1)}개(중앙값)`} dx={12} />
        <Label x={0} y={14} z={4} t="상업시설(백화점·쇼핑몰 등)" dx={-8} />
      </>}
      {type === '독립·예술영화전용관' && <>
        <Box x={3} y={3} z={0} w={10} d={8} h={3} color="#e4e1d8" />
        <Box x={3} y={3} z={3} w={10} d={8} h={0.3} color="#cfcac0" />
        <Screens n={n} x={4} y={4} z={3.3} w={8} d={6} color={c} />
        <Box x={14} y={5} z={0} w={4} d={5} h={2} color="#efece4" />
        <Label x={12} y={4} z={5} t={`상영관 ${screens == null ? '—' : +screens.toFixed(1)}개(중앙값)`} dx={14} />
        <Label x={3} y={11} z={2} t="소규모 건물·문화시설" dx={-8} />
      </>}
      {type === '일반영화관' && <>
        <Box x={1} y={3} z={0} w={9} d={8} h={4} color={c} />
        <Label x={10} y={3} z={4} t="단관·소규모 상영관" dx={12} />
        <Box x={14} y={2} z={0} w={0.4} d={6} h={4} color="#fafafa" />
        <Box x={17} y={4} z={0} w={2.4} d={1.4} h={0.9} color="#888" />
        <Box x={17} y={7} z={0} w={2.4} d={1.4} h={0.9} color="#888" />
        <Label x={19.4} y={4} z={0.9} t="자동차극장·이동상영관" dx={26} />
      </>}
    </svg>
  )
}

// 입점 형태별 건물 모식도(작은 그림 여러 개). 색칠한 덩어리 = 영화관이 들어선 자리
const F = 1.3 // 한 층 높이
function Floors({ x, y, w, d, from, n, color = '#d9d9d5' }: { x: number; y: number; w: number; d: number; from: number; n: number; color?: string }) {
  return <>{Array.from({ length: n }, (_, i) => <Box key={i} x={x} y={y} z={(from + i) * F} w={w} d={d} h={F} color={color} />)}</>
}
const SCENE: Record<string, (c: string) => JSX.Element> = {
  '백화점 내 입점': (c) => <><Floors x={0} y={0} w={16} d={12} from={0} n={6} /><Box x={0} y={0} z={6 * F} w={16} d={12} h={2 * F} color={c} /></>,
  '쇼핑몰·아울렛 내 입점': (c) => <><Floors x={-2} y={0} w={22} d={16} from={0} n={3} /><Box x={6} y={0} z={3 * F} w={12} d={10} h={1.6 * F} color={c} /></>,
  '복합상업시설 내 입점(대형마트)': (c) => <><Floors x={-2} y={0} w={20} d={15} from={0} n={2} /><Box x={8} y={2} z={2 * F} w={9} d={9} h={1.5 * F} color={c} />
    {[0, 4, 8].map((k) => <Box key={k} x={-2 + k} y={17} z={0} w={2.4} d={1.4} h={0.8} color="#999" />)}</>,
  '복합상업시설 내 입점(역사)': (c) => <><Box x={-4} y={7} z={0} w={26} d={0.6} h={0.3} color="#777" /><Box x={-4} y={9} z={0} w={26} d={0.6} h={0.3} color="#777" />
    <Floors x={2} y={0} w={14} d={12} from={1} n={3} /><Box x={2} y={0} z={4 * F} w={14} d={12} h={1.6 * F} color={c} /></>,
  '주상복합건물 내 입점': (c) => <><Floors x={0} y={0} w={16} d={12} from={0} n={3} /><Box x={0} y={0} z={3 * F} w={16} d={12} h={F} color={c} />
    <Floors x={4} y={3} w={6} d={6} from={4} n={8} color="#ecebe6" /></>,
  '공공·문화시설 내 입점': (c) => <><Floors x={0} y={0} w={18} d={12} from={0} n={3} color="#e6e1d6" /><Box x={0} y={0} z={F} w={8} d={12} h={F} color={c} /></>,
  '대학 또는 교육시설 내 입점': (c) => <><Floors x={-2} y={0} w={8} d={14} from={0} n={4} color="#e6e1d6" /><Floors x={10} y={0} w={8} d={8} from={0} n={3} color="#e6e1d6" />
    <Box x={10} y={0} z={3 * F} w={8} d={8} h={F} color={c} /></>,
  '기타(호텔 내 입점)': (c) => <><Box x={2} y={2} z={0} w={10} d={10} h={F} color={c} /><Floors x={2} y={2} w={10} d={10} from={1} n={10} color="#ecebe6" /></>,
  '업무·근린상업 건물 내 입점': (c) => <><Floors x={2} y={2} w={10} d={10} from={0} n={5} /><Box x={2} y={2} z={5 * F} w={10} d={10} h={2 * F} color={c} /><Floors x={2} y={2} w={10} d={10} from={7} n={2} /></>,
  '단독 건물(영화관 전용·중심)': (c) => <Box x={0} y={0} z={0} w={14} d={12} h={4 * F} color={c} />,
}

export function OccupancyTiles({ items }: { items: { label: string; color: string; counts: string; n: number }[] }) {
  return (
    <div className="occtiles">
      {items.filter((x) => SCENE[x.label]).map((x) => (
        <figure key={x.label} className={x.n ? '' : 'none'}>
          <svg viewBox="40 -30 240 220" role="img" aria-label={`${x.label} 모식도`}>
            <polygon points={pts([[-6, -4, 0], [24, -4, 0], [24, 20, 0], [-6, 20, 0]])} fill="#f2f2f2" />
            <polygon points={pts([[0, 4, 0], [22, 4, 0], [22, 18, 0], [0, 18, 0]])} fill="#000" opacity="0.09" filter="url(#isoblur2)" />
            <defs><filter id="isoblur2"><feGaussianBlur stdDeviation="3" /></filter></defs>
            {SCENE[x.label](x.color)}
          </svg>
          <figcaption><b style={{ color: x.color === '#c4c4c4' ? '#666' : x.color }}>{x.label.replace(' 내 입점', '')}</b><br />{x.counts}</figcaption>
        </figure>))}
    </div>
  )
}

// 입점 형태 하나의 모식도(정리 페이지용)
export function OccupancyIcon({ label, color }: { label: string; color: string }) {
  if (!SCENE[label]) return <svg viewBox="40 -30 240 220" className="occicon" role="img" aria-label="입점 형태 확인 불가"><text x="160" y="90" textAnchor="middle" fontSize="16" fill="#999">확인 불가</text></svg>
  return (
    <svg viewBox="40 -30 240 220" className="occicon" role="img" aria-label={`${label} 모식도`}>
      <polygon points={pts([[-6, -4, 0], [24, -4, 0], [24, 20, 0], [-6, 20, 0]])} fill="#f2f2f2" />
      {SCENE[label](color)}
    </svg>
  )
}
