import { useRef, useState } from 'react'
import { SOURCES, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { f1, located, pct, sum, topBy, type DataSet, type Venue } from '../data'
import { DataTable, ShareBars } from './charts'
import SeoulMap from './SeoulMap'
import { DataStatus, MapLegend, saveSvg, SourceNote, Sym, TypeToggles } from './ui'

// 계산으로 만든 해석문. '군집' 대신 '상대적으로 많이 분포'
function sentence(t: VenueType, xs: Venue[]) {
  if (!xs.length) return `${t}: 자료 없음`
  const g = topBy(xs, (v) => v.gu, 2), d = topBy(xs, (v) => v.dong, 2)
  const share = pct(g.reduce((a, [, n]) => a + n, 0), xs.length)
  const gus = new Set(xs.map((v) => v.gu)).size
  return `${t}(n=${xs.length})는 ${g.map(([k, n]) => `${k} ${n}곳`).join('·')}에 상대적으로 많이 분포하며, 두 구가 전체 ${t}의 ${f1(share)}%를 차지한다. ` +
    `행정동 기준 상위는 ${d.map(([k, n]) => `${k}(${n})`).join('·')}이고, 영화관이 있는 자치구는 25개 중 ${gus}개다.` +
    (xs.length < 10 ? ' 표본이 적어 해석에 주의가 필요하다.' : '')
}

export default function Distribution({ data, open, sel, setSel }: { data: DataSet; open: Venue[]; sel: VenueType | null; setSel: (t: VenueType | null) => void }) {
  const [on, setOn] = useState<VenueType[]>([...TYPES])
  const [pick, setPick] = useState<Venue | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const by = (t: VenueType) => open.filter((v) => v.type === t)
  const known = (t: VenueType) => by(t).filter((v) => v.screens25 != null)
  const shown = open.filter((v) => on.includes(v.type))
  const focus = sel ?? null
  const guRows = topBy(open, (v) => v.gu, 25).map(([gu]) => [gu, ...TYPES.map((t) => by(t).filter((v) => v.gu === gu).length), open.filter((v) => v.gu === gu).length])
  return (
    <div className="split">
      <div className="mapcol">
        <TypeToggles value={on} onChange={setOn} counts={Object.fromEntries(TYPES.map((t) => [t, by(t).length]))} />
        <SeoulMap data={data} label="유형별 영화관 분포 지도" selectedId={pick?.id}
          points={shown.map((v) => ({ v, mark: focus && v.type !== focus ? 'dim' : 'fill' }))} onSelect={setPick} />
        <MapLegend types={on} marks={focus ? ['fill', 'dim'] : ['fill']} />
        <p className="note">좌표 없는 영업 영화관 {open.filter((v) => !located(v)).length}곳은 지도에서 빠졌습니다. 같은 건물의 영화관은 확대하면 둥글게 펼쳐 보입니다(실제 좌표는 동일).</p>
      </div>
      <div className="chart">
        <ShareBars ref={svg} title="유형별 개소·스크린·좌석 비중" highlight={sel} onPick={setSel} rows={[
          { label: '영화관', unit: '곳', values: Object.fromEntries(TYPES.map((t) => [t, by(t).length])) as any },
          { label: '스크린', unit: '개', values: Object.fromEntries(TYPES.map((t) => [t, sum(known(t).map((v) => v.screens25))])) as any },
          { label: '좌석', unit: '석', values: Object.fromEntries(TYPES.map((t) => [t, sum(known(t).map((v) => v.seats25))])) as any },
        ]} />
        <div className="interp">
          {(focus ? [focus] : TYPES).map((t) => {
            const xs = by(t)
            return (
              <div key={t}>
                <p><Sym type={t} /> <b>{t}</b> — 상위 자치구 {topBy(xs, (v) => v.gu, 3).map(([k, n]) => `${k} ${n}곳(${f1(pct(n, xs.length))}%)`).join(', ') || '자료 없음'}</p>
                <p className="sub">상위 행정동 {topBy(xs, (v) => v.dong, 3).map(([k, n]) => `${k} ${n}`).join(', ') || '자료 없음'}</p>
                <p className="auto">{sentence(t, xs)}</p>
              </div>)
          })}
        </div>
        <DataStatus data={data} need={['stations']} title="인접 지하철역: 자료 없음" note="공식 역 좌표가 들어오면 유형별 상위 지역 주변 역(반경 500m 안 영화관 수)을 계산해 보여줍니다." />
        <button className="ui link" onClick={() => saveSvg(svg.current, '2_비중')}>SVG 저장</button>
        <DataTable caption="자치구별 영업 영화관 수" head={['자치구', ...TYPES, '계']} rows={guRows} />
        <SourceNote source={SOURCES.venues} n={`영업 ${open.length}곳(${TYPES.map((t) => `${TYPE_STYLE[t].short} ${by(t).length}`).join(' · ')})`}
          method="자치구·행정동(통계청 2023.7)에 점이 속한 수를 셈. 군집 검정은 하지 않음" caution="스크린·좌석 비중은 KOFIC 2025 수록 영화관만으로 계산합니다." />
      </div>
    </div>
  )
}
