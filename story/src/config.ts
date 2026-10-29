// 분석 기준·파일·색상 설정. 값을 바꿀 때는 이 파일만 고친다.

export const DATA_DATE = '2026-09-04' // LOCALDATA 파일의 최신 데이터갱신시점
export const VERIFIED = '2026-10-28' // 확인일
export const DATA_LABEL = `LOCALDATA ${DATA_DATE} 갱신본 기준 · ${VERIFIED} 확인`

export const RADII = [300, 500, 800, 1000] // 역세권·문화시설 반경 선택지(m)
export const CULTURE_RADII = [300, 500, 1000]
export const NEAR_BANDS = [500, 1000] // 최근접 영화관 거리 구간(m)
export const YEAR_MIN = 2000

export type VenueType = '멀티플렉스' | '독립·예술영화관' | '기타'
export const TYPES: VenueType[] = ['멀티플렉스', '독립·예술영화관', '기타']
// 유형은 색으로만 구분한다(모양은 모두 원). '전체'는 중립색(검정)
export const TYPE_STYLE: Record<VenueType, { color: string; shape: 'circle' | 'square' | 'diamond'; mark: string; short: string }> = {
  멀티플렉스: { color: '#2a5caa', shape: 'circle', mark: '●', short: '멀티' },
  '독립·예술영화관': { color: '#c8423b', shape: 'circle', mark: '●', short: '독립·예술' },
  기타: { color: '#d99a1e', shape: 'circle', mark: '●', short: '기타' },
}
export const ALL_COLOR = '#111111'

export const ERAS = [
  { id: '2000s', label: '2000년대', from: 2000, to: 2009 },
  { id: '2010s', label: '2010년대', from: 2010, to: 2019 },
  { id: '2020s', label: '2020년대', from: 2020, to: 2026 },
]
// 그래프 배경 표시용(원인을 뜻하지 않음)
export const EVENTS = [
  { label: '금융위기', from: 2008, to: 2008 },
  { label: '코로나19', from: 2020, to: 2022 },
]

export const CULTURE_CATS = ['공연시설', '전시시설', '도서시설', '지역문화활동시설', '문화 보급·전수시설', '종합시설', '문학관·창작공간']
export const OCCUPANCY = ['백화점 내 입점', '쇼핑몰·아울렛 내 입점', '복합상업시설 내 입점(대형마트)', '복합상업시설 내 입점(역사)',
  '주상복합건물 내 입점', '공공·문화시설 내 입점', '대학 또는 교육시설 내 입점', '기타(호텔 내 입점)', '업무·근린상업 건물 내 입점', '단독 건물(영화관 전용·중심)', '확인 불가']
// 입점 형태 색(유형 색인 파랑·빨강·노랑과 겹치지 않게). 확인 불가 = 회색
export const OCC_COLOR = ['#0f9d8a', '#7b4fb3', '#e05fa0', '#5a9e2f', '#8c5a2b', '#00a3c4', '#ef7d2d', '#6b6b2a', '#5f6b7a', '#111111', '#c4c4c4']
// 2040 중심지 위계 색(개략 영역)
export const CENTER_LEVELS = ['3도심', '7광역중심', '12지역중심']
export const CENTER_COLOR: Record<string, string> = { '3도심': '#6a3d9a', '7광역중심': '#0f8b8d', '12지역중심': '#a8754a', '중심지 밖': '#e6e6e6' }

// 각 장면이 필요로 하는 파일과 필수 필드. 없으면 DataStatus가 이 정보를 보여준다
export const FILES = {
  boundary: { file: 'seoul_boundary.geojson', fields: [] as string[] },
  gu: { file: 'seoul_gu.geojson', fields: ['name'] },
  river: { file: 'han_river.geojson', fields: [] },
  venues: { file: 'venues.geojson', fields: ['id', 'type', 'status', 'open'] },
  yearly: { file: 'yearly.json', fields: [] },
  audit: { file: 'audit.json', fields: [] },
  culture: { file: 'cultural_facilities.geojson', fields: ['name', 'category'] },
  stations: { file: 'subway_stations.geojson', fields: ['name', 'transfer', 'n_lines'] },
  lines: { file: 'subway_lines.geojson', fields: ['name', 'color'] },
  regions: { file: 'seoul_regions.geojson', fields: ['name'] },
  bmGreen: { file: 'basemap_green.geojson', fields: [] },
  bmWater: { file: 'basemap_water.geojson', fields: ['kind'] },
  bmRoads: { file: 'basemap_roads.geojson', fields: ['rank'] },
  bmDong: { file: 'basemap_dong.geojson', fields: ['name'] },
  buffers: { file: 'subway_buffers.geojson', fields: ['radius', 'kind'] },
  centers: { file: 'seoul_centers.geojson', fields: ['name', 'level'] },
  centerNames: { file: 'seoul_2040_centers.csv', fields: [] },
  commerce: { file: 'commerce.geojson', fields: ['area_id', 'indicator', 'value', 'year'] },
}
export type FileKey = keyof typeof FILES

// QGIS 등에서 내보낸 파일의 열 이름이 다르면 여기서만 대응시킨다: { 파일키: { 앱필드: 원본필드 } }
export const FIELD_MAP: Partial<Record<FileKey, Record<string, string>>> = {}

export const SOURCES = {
  venues: '행정안전부 LOCALDATA 영화상영관 인허가(1차 기준, EPSG:5174→4326) + 영화진흥위원회 전국 극장 현황 2010~2025(스크린·좌석·운영주체 보완)',
  boundary: '통계청 행정동 경계 2023.7(vuski/admdongkor) → 자치구 병합 · 한강: Natural Earth 1:10m(개략)',
  culture: '서울시 문화공간 정보 + 행정안전부 공연장 인허가(2025년 말 영업, 같은 건물 홀 1곳). 영화관 제외',
  kofic: '영화진흥위원회 전국 극장 현황 2010~2025(연말 기준)',
  basemap: '배경지도: Overture Maps Foundation 2026-10-21.0(© OpenStreetMap contributors 등, ODbL) — 녹지·물·도로·행정동 이름',
  subway: '역: 서울열린데이터광장 지하철역 정보(공공누리 1유형, kyckang/SeoulTransitMap_data 재배포본 2026-10-28) · 노선: © OpenStreetMap contributors(ODbL), kimmdr2/metroscope 추출본 2026-10-12',
  centers: '2040 서울도시기본계획 중심지 체계(명칭) + 대표 역 기준 개략 영역(반경 도심 1.2km·광역 0.9km·지역 0.6km는 표현값, 공식 범위 아님)',
}
