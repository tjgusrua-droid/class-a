import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { CONFIG, TYPES, type TheaterType } from '../config'
import { located, pct, sum, type DataSet, type Theater } from '../data'
import { ShareBars } from './charts'
import SeoulMap from './SeoulMap'
import { MapLegend, savePng, saveSvg, Sym, TypeFilter } from './ui'

const useWide = () => {
  const q = '(min-width: 1000px)'
  const [w, setW] = useState(matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q); const f = () => setW(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return w
}

export default function Distribution({ data, snap, sel, setSel }: { data: DataSet; snap: Theater[]; sel: TheaterType | null; setSel: (t: TheaterType | null) => void }) {
  const wide = useWide()
  const [tab, setTab] = useState<TheaterType>('멀티플렉스')
  const maps = useRef<Record<string, maplibregl.Map>>({})
  const svg = useRef<SVGSVGElement>(null)
  const tot = { n: snap.length, s: sum(snap.map((x) => x.screens)) }
  const st = (t: TheaterType) => {
    const xs = snap.filter((x) => x.type === t)
    return { n: xs.length, s: sum(xs.map((x) => x.screens)), noXY: xs.filter((x) => !located(x)).length }
  }
  const shown = wide ? TYPES : [sel ?? tab]

  const one = (t: TheaterType) => {
    const s = st(t)
    return (
      <figure key={t} className={`mini ${sel && sel !== t ? 'dim' : ''}`}>
        <figcaption><b><Sym type={t} /> {t}</b> {s.n}곳 · 개소 {pct(s.n, tot.n).toFixed(1)}% · 스크린 {pct(s.s, tot.s).toFixed(1)}%</figcaption>
        <SeoulMap data={data} syncId="types" label={`${t} 영화관 분포 지도`}
          points={snap.filter((x) => x.type === t).map((x) => ({ t: x, mark: 'fill' }))}
          onMap={(m) => (maps.current[t] = m)} />
        {s.noXY > 0 && <small>좌표 미확보 {s.noXY}곳은 지도에서 빠짐</small>}
      </figure>
    )
  }

  return (
    <div className="dist">
      <div className="row ui">
        {wide ? <TypeFilter value={sel} onChange={setSel} /> : (
          <div className="seg" role="tablist">{TYPES.map((t) => <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => { setTab(t); setSel(null) }}><Sym type={t} /> {t}</button>)}</div>
        )}
        <span className="hint">세 지도는 같은 범위·축척으로 함께 움직입니다. 확대: +/− 버튼 또는 Ctrl+스크롤</span>
      </div>
      <div className="maps3">{shown.map(one)}</div>
      <div className="dist-side">
        <MapLegend types={shown} marks={['fill']} />
        <ShareBars ref={svg} title="유형별 개소·스크린 비중" highlight={sel} onPick={setSel} rows={[
          { label: '영화관', unit: '곳', values: Object.fromEntries(TYPES.map((t) => [t, st(t).n])) as any },
          { label: '스크린', unit: '개', values: Object.fromEntries(TYPES.map((t) => [t, st(t).s])) as any },
        ]} />
        <p className="note">{CONFIG.snapshotYear}년 말 영업 중(휴관 포함) {tot.n}곳 기준. 점 하나가 영화관 하나이며, 같은 건물에 여러 곳이 있으면 점이 겹칩니다 — 클릭하면 목록으로 보입니다.</p>
        <div className="ui">
          <button className="link" onClick={() => shown.forEach((t) => savePng(maps.current[t]?.getCanvas(), `2_분포_${t}`))}>지도 PNG 저장</button>
          <button className="link" onClick={() => saveSvg(svg.current, '2_개소_스크린_비중')}>그래프 SVG 저장</button>
        </div>
      </div>
    </div>
  )
}
