import { useEffect, useState } from 'react'
import { DATA_LABEL, SOURCES } from './config'
import { isOpen, loadAll, located, toVenues, type DataSet } from './data'
import SeoulMap from './components/SeoulMap'
import DataAudit from './components/DataAudit'
import TypeComparison from './components/TypeComparison'
import Distribution from './components/Distribution'
import LocationTabs from './components/LocationTabs'
import LocationProfile from './components/LocationProfile'
import TimelineSection from './components/TimelineSection'
import SurvivalDurationPlot from './components/SurvivalDurationPlot'
import SurvivalSection from './components/SurvivalSection'
import { DataStatus, StorySection } from './components/ui'

const SCENES = [['intro', '시작'], ['audit', '자료 검증'], ['types', '1 유형'], ['where', '2 분포'], ['location', '3 입지'], ['profile', '3 정리'], ['change', '4 변화'], ['closed', '5 생존'], ['advice', '5 제언'], ['sources', '출처']]

export default function App() {
  const [data, setData] = useState<DataSet | null>(null)
  const [present, setPresent] = useState(false)
  const [cur, setCur] = useState('intro')
  const [reveal, setReveal] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => { loadAll().then(setData) }, [])
  useEffect(() => {
    if (!data) return
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setCur(e.target.id)), { rootMargin: '-50% 0px -50% 0px' })
    SCENES.forEach(([id]) => { const el = document.getElementById(id); el && io.observe(el) })
    setTimeout(() => setReveal(true), 600)
    return () => io.disconnect()
  }, [data, key])

  if (!data) return <p className="loading">데이터를 불러오는 중…</p>
  if (data.venues.status !== 'ok' || data.boundary.status !== 'ok')
    return <div className="scene"><DataStatus data={data} need={['boundary', 'gu', 'venues']} title="기본 자료를 불러오지 못했습니다" /></div>

  const all = toVenues(data.venues.data)
  const open = all.filter(isOpen)

  return (
    <div className={present ? 'present' : ''} key={key}>
      <div className="toolbar">
        <button onClick={() => setPresent(!present)} aria-pressed={present}>{present ? '발표 모드 끄기' : '발표/내보내기 모드'}</button>
        <button className="ui" onClick={() => { setKey(key + 1); scrollTo({ top: 0 }) }}>초기화</button>
      </div>
      <nav className="progress ui" aria-label="장면 이동">
        {SCENES.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={cur === id ? 'step' : undefined}><i /> <span>{label}</span></a>)}
      </nav>

      <StorySection id="intro" className="intro">
        <div className="intro-text">
          <h1>서울의 영화관은 어디에 자리 잡고, 어떻게 변화해 왔을까?</h1>
          <p className="lead">영화관의 유형, 입지, 개업과 폐업의 흐름을 지도와 데이터로 살펴봅니다.</p>
          <p className="note">점 {open.filter(located).length}개 = 2026년 현재 영업 중인 서울 영화관 {open.length}곳 중 좌표가 있는 곳 · <span className="dateline">{DATA_LABEL}</span></p>
        </div>
        <div className="intro-map"><SeoulMap data={data} label="서울 영화관 위치" reveal={reveal} points={open.map((v) => ({ v, mark: 'fill' }))} /></div>
      </StorySection>

      <StorySection id="audit">
        <h2><span>0</span>어떤 자료로, 몇 곳을 셌는가?</h2>
        <DataAudit data={data} />
      </StorySection>

      <StorySection id="types">
        <h2><span>1</span>영화관의 분류는 어떻게 다른가?</h2>
        <p className="lead">법적 구분이 아니라 연구를 위한 분석용 분류입니다. 개소 수와 스크린·좌석 규모가 유형마다 어떻게 다른지 봅니다.</p>
        <TypeComparison open={open} />
      </StorySection>

      <StorySection id="where">
        <h2><span>2</span>각 유형은 서울 어디에 모여 있는가?</h2>
        <p className="lead">유형을 켜고 끄며 분포를 비교하고, 오른쪽에서 계산된 상위 지역을 확인합니다.</p>
        <Distribution data={data} open={open} />
      </StorySection>

      <StorySection id="location" className="tall">
        <h2><span>3</span>각 유형의 영화관은 어떤 입지 특성을 가지는가?</h2>
        <LocationTabs data={data} open={open} />
      </StorySection>

      <StorySection id="profile" className="profile-scene">
        <LocationProfile data={data} open={open} />
      </StorySection>

      <StorySection id="change">
        <h2><span>4</span>언제, 어디에서 생기고 얼마나 유지되었는가?</h2>
        <p className="lead">2000년부터 연도를 움직이면 지도와 그래프가 함께 바뀝니다.</p>
        <TimelineSection data={data} all={all} />
      </StorySection>

      <StorySection id="closed">
        <h2><span>5</span>영화관은 얼마나 오래 운영되는가?</h2>
        <SurvivalSection all={all} />
      </StorySection>

      <StorySection id="advice">
        <h2><span>5</span>어떤 조건에서 오래 남았나 — 폐업 지도와 제언</h2>
        <SurvivalDurationPlot data={data} all={all} />
      </StorySection>

      <StorySection id="sources" className="sources">
        <h2>데이터 출처와 분석 기준</h2>
        <ul>{Object.values(SOURCES).map((s) => <li key={s}>{s}</li>)}</ul>
        <ul>
          <li>기준: {DATA_LABEL}. ‘2026년 현재’ = LOCALDATA 영업/정상 상태.</li>
          <li>분석 단위: 운영구간(한 장소에서 인허가 기간이 이어진 개업~폐업 한 번). 장소(venue)·인허가 기록·운영구간을 구분하며, 재개관·새 인허가는 다른 운영구간입니다.</li>
          <li>자료 충돌: 두 원자료 값을 모두 보존하고 최종값은 LOCALDATA. 충돌 내용은 각 영화관 정보와 감사표에 표시합니다.</li>
          <li>거리·버퍼: 직선거리(구면). 역세권 버퍼 합집합은 EPSG:5186(m)에서 계산 후 EPSG:4326으로 표시.</li>
          <li>지도는 외부 지도 타일 없이 위 공간자료만으로 그립니다. 지하철 노선 형상은 공식 자료가 없어 역만 표시합니다. 2040 중심지는 대표 역 기준 개략 영역이며, 상권 자료는 아직 없습니다.</li>
        </ul>
      </StorySection>
    </div>
  )
}
