import { useEffect, useState } from 'react'
import { CONFIG, SOURCES, type TheaterType } from './config'
import { loadAll, located, snapshot, toTheaters, type DataSet, type Theater } from './data'
import SeoulMap from './components/SeoulMap'
import TypeComparison from './components/TypeComparison'
import Distribution from './components/Distribution'
import LocationTabs from './components/LocationTabs'
import TimelineSection from './components/TimelineSection'
import SurvivalDurationPlot from './components/SurvivalDurationPlot'
import { DataStatus, StorySection } from './components/ui'

const SCENES = [
  ['intro', '시작'],
  ['types', '1 유형'],
  ['where', '2 분포'],
  ['location', '3 입지'],
  ['change', '4 개·폐업'],
  ['closed', '5 운영기간'],
  ['sources', '출처'],
]

export default function App() {
  const [data, setData] = useState<DataSet | null>(null)
  const [sel, setSel] = useState<TheaterType | null>(null) // 모든 장면이 공유하는 유형 선택
  const [present, setPresent] = useState(false)
  const [cur, setCur] = useState('intro')
  const [reveal, setReveal] = useState(false)
  const [key, setKey] = useState(0) // 초기화용

  useEffect(() => { loadAll().then(setData) }, [])
  useEffect(() => {
    if (!data) return
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setCur(e.target.id)), { rootMargin: '-50% 0px -50% 0px' })
    SCENES.forEach(([id]) => { const el = document.getElementById(id); el && io.observe(el) })
    setTimeout(() => setReveal(true), 600)
    return () => io.disconnect()
  }, [data, key])

  if (!data) return <p className="loading">데이터를 불러오는 중…</p>
  if (data.theaters.status !== 'ok' || data.boundary.status !== 'ok')
    return <div className="scene"><DataStatus data={data} need={['boundary', 'gu', 'theaters']} title="기본 자료를 불러오지 못했습니다" /></div>

  const all: Theater[] = toTheaters(data.theaters.data)
  const snap = snapshot(all)
  const common = { data, sel, setSel }

  return (
    <div className={present ? 'present' : ''} key={key}>
      <div className="toolbar">
        <button onClick={() => setPresent(!present)} aria-pressed={present}>{present ? '발표 모드 끄기' : '발표/내보내기 모드'}</button>
        <button className="ui" onClick={() => { setSel(null); setKey(key + 1); scrollTo({ top: 0 }) }}>초기화</button>
      </div>
      <nav className="progress ui" aria-label="장면 이동">
        {SCENES.map(([id, label]) => (
          <a key={id} href={`#${id}`} aria-current={cur === id ? 'step' : undefined}><i /> <span>{label}</span></a>
        ))}
      </nav>

      <StorySection id="intro" className="intro">
        <div className="intro-text">
          <h1>서울의 영화관은 어디에 자리 잡고, 어떻게 변화해 왔을까?</h1>
          <p className="lead">영화관의 유형, 입지, 개업과 폐업의 흐름을 지도와 데이터로 살펴봅니다.</p>
          <p className="note">점 {snap.filter(located).length}개 = {CONFIG.snapshotYear}년 말 영업 중인 서울 영화관 {snap.length}곳 중 좌표가 확인된 곳</p>
        </div>
        <div className="intro-map">
          <SeoulMap data={data} label="서울 영화관 위치" reveal={reveal} points={snap.map((t) => ({ t, mark: 'fill' }))} />
        </div>
      </StorySection>

      <StorySection id="types">
        <h2><span>1</span>영화관의 분류는 어떻게 다른가?</h2>
        <p className="lead">세 유형은 개소 수보다 스크린 수에서 차이가 더 크게 드러나는지 봅니다.</p>
        <TypeComparison snap={snap} sel={sel} setSel={setSel} />
      </StorySection>

      <StorySection id="where">
        <h2><span>2</span>각 유형은 서울 어디에 모여 있는가?</h2>
        <Distribution {...common} snap={snap} />
      </StorySection>

      <StorySection id="location" className="tall">
        <h2><span>3</span>각 유형의 영화관은 어떤 입지 특성을 가지는가?</h2>
        <LocationTabs {...common} snap={snap} />
      </StorySection>

      <StorySection id="change">
        <h2><span>4</span>언제, 어디에서 생기고 사라졌는가?</h2>
        <TimelineSection {...common} all={all} />
      </StorySection>

      <StorySection id="closed">
        <h2><span>5</span>폐업한 영화관은 어떤 곳에 있었고, 얼마나 운영되었는가?</h2>
        <SurvivalDurationPlot {...common} all={all} />
      </StorySection>

      <StorySection id="sources" className="sources">
        <h2>데이터 출처와 분석 기준</h2>
        <ul>{SOURCES.map((s) => <li key={s}>{s}</li>)}</ul>
        <ul>
          <li>분석 단위: 영진위 목록의 영화관(운영 이력). 같은 자리라도 이름·브랜드가 바뀌면 다른 기록이며, 이를 ‘전환’으로 연결했습니다.</li>
          <li>연말 영업 중 = 그해 영진위 목록에 있거나 휴관 중인 곳. 폐업 = 폐관 기록. 전환은 폐업이 아닙니다.</li>
          <li>좌표: {all.length}곳 중 {all.filter(located).length}곳 확보. 좌표가 없는 곳은 지도에서만 빠지고 집계에는 들어갑니다.</li>
          <li>기준값: 역세권 {CONFIG.stationRadiusM}m · 문화시설 반경 {CONFIG.cultureRadiusM}m · 인접 기준 {CONFIG.nearRadiusM}m (<code>src/config.ts</code>).</li>
          <li>지도는 외부 지도 타일 없이 위 공간자료만으로 그립니다.</li>
        </ul>
      </StorySection>
    </div>
  )
}
