import { useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { NEAR_BANDS, OCCUPANCY, SOURCES, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { DATA_DATE } from '../config'
import { distM, duration, f1, jo, kaplanMeier, located, median, type DataSet, type Venue } from '../data'
import { BoxDot, DataTable, SurvivalCurves } from './charts'
import SeoulMap, { regionOverlay } from './SeoulMap'
import { MapLegend, savePng, saveSvg, Seg, SourceNote, TypeToggles } from './ui'

// 서울시 5개 생활권(도시기본계획의 권역 구분)
const REGION: Record<string, string> = Object.fromEntries([
  ['도심권', '종로구 중구 용산구'], ['동북권', '성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구'], ['서북권', '은평구 서대문구 마포구'],
  ['서남권', '양천구 강서구 구로구 금천구 영등포구 동작구 관악구'], ['동남권', '서초구 강남구 송파구 강동구'],
].flatMap(([r, gus]) => gus.split(' ').map((g) => [g, r])))
const ERA = (y: number) => (y < 2000 ? '1999년 이전 개업' : y < 2010 ? '2000년대 개업' : y < 2020 ? '2010년대 개업' : '2020년대 개업')

type Crit = '유형' | '개업 시기' | '건축적 입점 형태' | '최근접 영화관 거리' | '권역' | '지하철 접근성' | '중심지 위계' | '문화시설 인접'
const OFF: Record<string, string> = { '지하철 접근성': '역 자료 없음', '중심지 위계': '중심지 자료 없음', '문화시설 인접': '현재 시설 목록이라 과거 폐업 당시 환경과 다름 — 사용하지 않음' }

export default function SurvivalDurationPlot({ data, all }: { data: DataSet; all: Venue[] }) {
  const [on, setOn] = useState<VenueType[]>([...TYPES])
  const [crit, setCrit] = useState<Crit>('유형')
  const [group, setGroup] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const map = useRef<maplibregl.Map>()
  const svg = useRef<SVGSVGElement>(null)
  const closed = all.filter((v) => v.status !== '영업')
  const usable = closed.filter((v) => duration(v) != null && !v.bulkOpen)
  const excluded = { noDate: closed.filter((v) => duration(v) == null).length, bulk: closed.filter((v) => duration(v) != null && v.bulkOpen).length }
  // 최근접 영화관: 폐업일에 운영 중이던 다른 영화관 중(같은 시기끼리)
  const nearAtClose = useMemo(() => Object.fromEntries(usable.filter(located).map((v) => {
    const pool = all.filter((o) => o.id !== v.id && located(o) && o.openD && o.openD <= v.closeD! && (o.status === '영업' || (o.closeD && o.closeD >= v.closeD!)))
    const d = Math.min(...pool.map((o) => distM(v, o)))
    return [v.id, isFinite(d) ? d : null]
  })), [all])
  const band = (v: Venue) => { const d = nearAtClose[v.id]; return d == null ? null : d <= NEAR_BANDS[0] ? `${NEAR_BANDS[0]}m 이내` : d <= NEAR_BANDS[1] ? `${NEAR_BANDS[0]}m~${NEAR_BANDS[1] / 1000}km` : `${NEAR_BANDS[1] / 1000}km 초과` }
  const keyOf = (v: Venue): string | null => crit === '유형' ? v.type : crit === '개업 시기' ? ERA(v.openD!.getFullYear()) : crit === '건축적 입점 형태' ? v.occupancy
    : crit === '최근접 영화관 거리' ? band(v) : crit === '권역' ? REGION[v.gu] ?? null : null
  const order = crit === '유형' ? [...TYPES] : crit === '개업 시기' ? ['1999년 이전 개업', '2000년대 개업', '2010년대 개업', '2020년대 개업'] : crit === '건축적 입점 형태' ? OCCUPANCY
    : crit === '최근접 영화관 거리' ? [`${NEAR_BANDS[0]}m 이내`, `${NEAR_BANDS[0]}m~${NEAR_BANDS[1] / 1000}km`, `${NEAR_BANDS[1] / 1000}km 초과`] : ['도심권', '동북권', '서북권', '서남권', '동남권']
  const sel = usable.filter((v) => on.includes(v.type))
  const groups = order.map((k) => ({ key: k, type: crit === '유형' ? (k as VenueType) : undefined,
    items: sel.filter((v) => keyOf(v) === k).map((v) => ({ id: v.id, v: duration(v)!, label: `${v.name} (${v.open}~${v.close})` })) })).filter((g) => g.items.length || crit === '유형')
  const med = (k: string) => median(groups.find((g) => g.key === k)?.items.map((x) => x.v) ?? [])
  const nOf = (k: string) => groups.find((g) => g.key === k)?.items.length ?? 0
  const sentences = groups.filter((g) => g.items.length).map((g) => `${g.key}(n=${g.items.length})의 폐업 전 운영기간 중앙값은 ${f1(median(g.items.map((x) => x.v)))}년이었다${g.items.length < 5 ? ' — 표본이 적어 해석에 주의가 필요하다' : ''}.`)
  const pts = closed.filter((v) => on.includes(v.type))

  // 생존곡선: 영업 중 = 기준일까지 관측(중도절단), 폐업 = 사건. 일괄 등록일 의심 개업일·날짜 없음은 제외
  const END = new Date(DATA_DATE)
  const life = (v: Venue) => (v.openD && !v.bulkOpen ? ((v.status === '영업' ? END : v.closeD)?.getTime() ?? NaN) - v.openD.getTime() : NaN) / 3.15576e10
  const surv = TYPES.map((t) => { const xs = all.filter((v) => v.type === t && isFinite(life(v)))
    return { key: t, n: xs.length, closed: xs.filter((v) => v.status !== '영업').length, ...kaplanMeier(xs.map((v) => ({ t: +life(v).toFixed(2), event: v.status !== '영업' }))) } })
  const at = (k: typeof surv[number], y: number) => [...k.steps].reverse().find((p) => p.t <= y)?.s ?? 1
  const longest = [...surv].sort((a, b) => (b.med ?? 99) - (a.med ?? 99))[0], shortest = [...surv].sort((a, b) => (a.med ?? 99) - (b.med ?? 99))[0]

  return (<>
    <div className="survival">
      <p className="chart-title">유형별 생존곡선 — 개업 후 t년이 지나도 운영 중인 비율(Kaplan–Meier)</p>
      <div className="two wide">
        <SurvivalCurves title="유형별 생존곡선" xmax={50} series={surv} />
        <div>
          <table className="mini-table"><thead><tr><th>유형</th><th>운영구간</th><th>폐업</th><th>중앙 생존기간</th><th>10년 뒤 운영 비율</th></tr></thead>
            <tbody>{surv.map((k) => <tr key={k.key}><td>{TYPE_STYLE[k.key].mark} {k.key}</td><td>{k.n}</td><td>{k.closed}</td><td>{k.med == null ? '50% 미도달' : `${f1(k.med)}년`}</td><td>{f1(at(k, 10) * 100)}%</td></tr>)}</tbody></table>
          <div className="finding"><p className="f-title">결론</p>
            <p className="f-head">{longest.med == null ? `${jo(longest.key, '는')} 아직 절반 이상이 운영 중이라 중앙 생존기간이 나오지 않는다.` : `${jo(longest.key, '의')} 중앙 생존기간이 ${f1(longest.med)}년으로 가장 길다.`}</p>
            <p className="f-mean">{shortest.key !== longest.key && shortest.med != null ? `${jo(shortest.key, '는')} 개업 후 ${f1(shortest.med)}년이면 절반이 문을 닫아 가장 짧다.` : ''} 곡선이 오래 높게 유지될수록 오래 운영된다는 뜻이다.</p></div>
          <p className="note">중앙 생존기간 = 생존곡선이 50%로 내려오는 시점. 영업 중인 곳은 ‘기준일({DATA_DATE})까지 운영 중’으로 넣고(중도절단) 폐업으로 세지 않습니다. 2000년대 이전 개업 기록이 적어 오래된 영화관은 덜 잡힐 수 있습니다.</p>
        </div>
      </div>
      <DataTable caption="운영구간별 운영기간(영업 중은 기준일까지)" head={['영화관', '유형', '자치구', '상태', '개업일', '폐업일', '운영기간(년)']}
        rows={[...all].filter((v) => isFinite(life(v))).sort((a, b) => life(b) - life(a)).map((v) => [v.name, v.type, v.gu, v.status, v.open, v.close || '영업 중', +life(v).toFixed(1)])} />
    </div>
    <div className="split">
      <div className="mapcol">
        <TypeToggles value={on} onChange={setOn} counts={Object.fromEntries(TYPES.map((t) => [t, closed.filter((v) => v.type === t).length]))} />
        <SeoulMap data={data} label="폐업 영화관 지도" onMap={(m) => (map.current = m)} selectedId={pick} onSelect={(v) => setPick(v?.id ?? null)} extras={crit === '권역' ? regionOverlay(data) : []}
          points={pts.map((v) => ({ v, mark: group && keyOf(v) !== group ? 'dim' : 'hollow' }))} />
        <MapLegend types={on} marks={group ? ['hollow', 'dim'] : ['hollow']} extra={crit === '권역' && <span>┅ 5개 생활권(권역) 경계</span>} />
        <p className="note">폐업·취소 운영구간 {pts.length}개(좌표 없음 {pts.filter((v) => !located(v)).length}). 집단을 누르면 지도에서 강조됩니다.</p>
      </div>
      <div className="chart">
        <label className="ui">입지 조건 <select value={crit} onChange={(e) => { setCrit(e.target.value as Crit); setGroup(null) }}>
          {(['유형', '개업 시기', '건축적 입점 형태', '최근접 영화관 거리', '권역', '지하철 접근성', '중심지 위계', '문화시설 인접'] as Crit[]).map((c) =>
            <option key={c} value={c} disabled={!!OFF[c]}>{c}{OFF[c] ? ` (${OFF[c]})` : ''}</option>)}
        </select></label>
        <Seg label="강조할 집단" value={group ?? ''} onChange={(v) => setGroup(v === group ? null : v || null)} options={groups.map((g) => ({ v: g.key, label: `${g.key} ${g.items.length}` }))} />
        <p className="chart-title">폐업 영화관의 운영기간(개업일 → 폐업일, 운영구간별)</p>
        <BoxDot ref={svg} title="폐업 영화관 운영기간" unit="년" groups={groups} selected={pick} onPick={setPick} />
        <div className="interp">{sentences.map((s) => <p key={s} className="auto">{s}</p>)}
          {crit === '개업 시기' && nOf('2000년대 개업') >= 5 && nOf('2010년대 개업') >= 5 &&
            <p className="auto">2000년대 개업 폐업 영화관의 운영기간 중앙값({f1(med('2000년대 개업'))}년)은 2010년대 개업({f1(med('2010년대 개업'))}년)보다 {med('2000년대 개업') > med('2010년대 개업') ? '길게' : '짧게'} 나타났다. 2010년대 개업 시설은 관측 기간이 짧아 긴 운영기간이 아직 나타나기 어렵다.</p>}
        </div>
        <div className="explain">
          <p><b>평균과 중앙값</b> 평균은 모든 영화관의 운영기간을 더해 영화관 수로 나눈 값입니다. 매우 오래 운영된 영화관이 몇 곳 있으면 평균이 크게 올라갈 수 있습니다. 중앙값은 운영기간을 순서대로 놓았을 때 가운데에 있는 값으로, 절반은 이보다 짧게, 절반은 이보다 길게 운영되었다는 뜻입니다. 그래서 중앙값(굵은 선)을 먼저 보고 평균(◇)은 보조로 봅니다. 상자는 25~75% 범위, 점 하나는 운영구간 하나입니다.</p>
          <p>이 그래프는 ‘어떤 입지가 생존을 보장하는가’가 아니라 ‘폐업한 영화관들이 서로 다른 조건에서 얼마 동안 운영되었는가’를 보여줍니다. 분포상의 차이이며 인과관계가 아닙니다. 지금 영업 중인 영화관의 ‘현재까지 기간’은 섞지 않았습니다.</p>
        </div>
        <div className="ui">
          <button className="link" onClick={() => savePng(map.current?.getCanvas(), '5_폐업지도')}>지도 PNG 저장</button>
          <button className="link" onClick={() => saveSvg(svg.current, `5_운영기간_${crit}`)}>그래프 SVG 저장</button>
        </div>
        <SourceNote source={SOURCES.venues} n={`폐업·취소 운영구간 ${closed.length}개 중 계산 가능 ${usable.length}개`}
          method="운영기간 = 폐업일 − 개업일(LOCALDATA). 재개관·브랜드 변경으로 인허가가 새로 난 경우 별도 운영구간. 최근접 영화관 거리 = 폐업일에 운영 중이던 영화관까지"
          caution={`폐업일 없음 ${excluded.noDate}개, 개업일이 일괄 등록일로 의심되는 ${excluded.bulk}개는 제외. 건축적 입점 형태는 주소 문자열 기준(확인 불가 포함). 권역 = 서울시 5개 생활권.`} />
        <DataTable caption="폐업 영화관 운영기간" head={['영화관', '유형', '자치구', '개업일', '폐업일', '운영기간(년)', crit]}
          rows={[...sel].sort((a, b) => duration(a)! - duration(b)!).map((v) => [v.name, v.type, v.gu, v.open, v.close, +duration(v)!.toFixed(1), keyOf(v)])} />
        <p className="note">유형별 폐업 운영구간: {TYPES.map((t) => `${TYPE_STYLE[t].mark} ${t} ${closed.filter((v) => v.type === t).length}`).join(' · ')}</p>
      </div>
    </div>
  </>)
}
