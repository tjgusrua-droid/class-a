// 5장 ①: 유형별 생존곡선과 폐업 영화관의 운영기간
import { DATA_DATE, TYPE_STYLE, TYPES, type VenueType } from '../config'
import { f1, jo, kaplanMeier, median, type Venue } from '../data'
import { DataTable, SurvivalCurves } from './charts'
import { Finding, More } from './ui'

const END = new Date(DATA_DATE)
// 운영기간(년): 영업 중이면 기준일까지(중도절단). 일괄 등록일 의심 개업일·날짜 없음은 NaN
export const life = (v: Venue) => (v.openD && !v.bulkOpen ? ((v.status === '영업' ? END : v.closeD)?.getTime() ?? NaN) - v.openD.getTime() : NaN) / 3.15576e10
export const survOf = (xs: Venue[]) => kaplanMeier(xs.filter((v) => isFinite(life(v))).map((v) => ({ t: +life(v).toFixed(2), event: v.status !== '영업' })))
export const atYear = (k: { steps: { t: number; s: number }[] }, y: number) => [...k.steps].reverse().find((p) => p.t <= y)?.s ?? 1
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

export default function SurvivalSection({ all }: { all: Venue[] }) {
  const valid = all.filter((v) => isFinite(life(v)))
  const row = (label: string, xs: Venue[]) => { const k = survOf(xs), cl = xs.filter((v) => v.status !== '영업').map(life)
    return { label, n: xs.length, closed: cl.length, mean: avg(cl), mid: median(cl), k, s10: atYear(k, 10), s15: atYear(k, 15), s20: atYear(k, 20) } }
  const rows = [row('전체', valid), ...TYPES.map((t) => row(t, valid.filter((v) => v.type === t)))]
  const [A, ...T] = rows
  const series = TYPES.map((t, i) => ({ key: t as VenueType, n: T[i].n, ...T[i].k }))
  const shortT = [...T].sort((a, b) => a.mid - b.mid)[0], longT = [...T].sort((a, b) => b.mid - a.mid)[0]
  return (
    <div className="survival">
      <div className="two wide">
        <div>
          <p className="chart-title">유형별 생존곡선 — 개업 후 t년이 지나도 운영 중인 비율(Kaplan–Meier)</p>
          <SurvivalCurves title="유형별 생존곡선" xmax={50} series={series} />
        </div>
        <div>
          <Finding items={[
            { head: <>문을 닫은 영화관 {A.closed}곳은 개업 후 평균 {f1(A.mean)}년(중앙값 {f1(A.mid)}년) 운영되었다.</>,
              mean: <>유형별 중앙값은 {T.map((x) => `${TYPE_STYLE[x.label as VenueType].short} ${f1(x.mid)}년`).join(', ')} — {jo(shortT.label, '이')} 가장 짧고 {jo(longT.label, '가')} 가장 길다.</> },
            { head: <>운영 중인 곳까지 넣으면 개업 10년 뒤 {f1(A.s10 * 100)}%, 20년 뒤 {f1(A.s20 * 100)}%가 아직 운영 중이다.</>,
              mean: <>20년 뒤 비율은 {T.map((x) => `${TYPE_STYLE[x.label as VenueType].short} ${f1(x.s20 * 100)}%`).join(', ')}로, {jo([...T].sort((a, b) => b.s20 - a.s20)[0].label, '가')} 가장 오래 남아 있다.</> },
          ]} />
          <div className="tablewrap"><table className="mini-table surv">
            <thead><tr><th>유형</th><th>운영구간</th><th>폐업</th><th>폐업한 곳 운영기간<br />평균 / 중앙값</th><th>10년 뒤</th><th>15년 뒤</th><th>20년 뒤</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.label} className={x.label === '전체' ? 'on' : ''}><td>{x.label === '전체' ? '전체' : `${TYPE_STYLE[x.label as VenueType].mark} ${x.label}`}</td><td>{x.n}</td><td>{x.closed}</td>
              <td>{f1(x.mean)} / {f1(x.mid)}년</td>{[x.s10, x.s15, x.s20].map((s, i) => <td key={i}>{f1(s * 100)}%</td>)}</tr>)}</tbody>
          </table></div>
          <More>‘n년 뒤’ = 생존곡선(Kaplan–Meier)으로 계산한, 개업 후 n년이 지나도 운영 중인 비율. 영업 중인 곳은 기준일({DATA_DATE})까지 운영 중으로 넣고 폐업으로 세지 않습니다. 폐업한 곳 운영기간 = 개업일→폐업일. 개업일이 일괄 등록일로 의심되거나 날짜가 없는 곳은 제외. 2000년 이전 폐업 기록은 적습니다.</More>
        </div>
      </div>
      <DataTable caption="운영구간별 운영기간(영업 중은 기준일까지)" head={['영화관', '유형', '자치구', '상태', '개업일', '폐업일', '운영기간(년)']}
        rows={[...valid].sort((a, b) => life(b) - life(a)).map((v) => [v.name, v.type, v.gu, v.status, v.open, v.close || '영업 중', +life(v).toFixed(1)])} />
    </div>
  )
}
