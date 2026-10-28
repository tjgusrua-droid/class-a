// 분석 기준·파일·색상 설정. 값을 바꿀 때는 이 파일만 고친다.

export const CONFIG = {
  stationRadiusM: 500, // 역세권 기준 거리
  cultureRadiusM: 500, // 문화시설 인접 반경 (1000으로 바꿀 수 있음)
  nearRadiusM: 500, // 5장 '영화관 간 인접성' 집단 구분 거리
  yearMin: 2010,
  yearMax: 2025,
  snapshotYear: 2025, // 1·2·3장의 기준 연도(연말 영업 중)
}

export type TheaterType = '멀티플렉스' | '독립극장' | '기타'
export const TYPES: TheaterType[] = ['멀티플렉스', '독립극장', '기타']

// 색은 명도 차이를 두고, 모양을 함께 써서 색각 이상이어도 구별되게 한다
export const TYPE_STYLE: Record<TheaterType, { color: string; shape: 'circle' | 'square' | 'diamond'; mark: string }> = {
  멀티플렉스: { color: '#1f4e9c', shape: 'circle', mark: '●' },
  독립극장: { color: '#d1495b', shape: 'diamond', mark: '◆' },
  기타: { color: '#e0a526', shape: 'square', mark: '■' },
}

// 시대 구분. 2000년대는 폐업 기록이 없어 비활성
export const ERAS = [
  { id: '2000s', label: '2000년대', from: 2000, to: 2009, ready: false },
  { id: '2010s', label: '2010년대', from: 2010, to: 2019, ready: true },
  { id: '2020s', label: '2020년대', from: 2020, to: 2025, ready: true },
]

// 그래프에 배경으로 표시할 사건(인과관계를 뜻하지 않음)
export const EVENTS = [{ label: '코로나19', from: 2020, to: 2022 }]

// 각 장면이 필요로 하는 파일과 필수 필드. 없으면 DataStatus가 이 정보를 보여준다
export const FILES = {
  boundary: { file: 'seoul_boundary.geojson', fields: [] as string[] },
  gu: { file: 'seoul_gu.geojson', fields: ['name'] },
  river: { file: 'han_river.geojson', fields: [] },
  roads: { file: 'roads.geojson', fields: [] },
  theaters: { file: 'theaters.geojson', fields: ['id', 'name', 'type', 'status', 'years'] },
  subwayLines: { file: 'subway_lines.geojson', fields: ['line'] },
  subwayStations: { file: 'subway_stations.geojson', fields: ['name', 'transfer'] },
  centers: { file: 'seoul_centers.geojson', fields: ['name', 'level'] },
  commerce: { file: 'commerce.geojson', fields: ['area_id', 'indicator', 'value'] },
  culture: { file: 'cultural_facilities.geojson', fields: ['name', 'category'] },
  building: { file: 'building_type.csv', fields: ['id', 'building_type', 'mixed_type'] },
}
export type FileKey = keyof typeof FILES

// QGIS 등에서 내보낸 파일의 열 이름이 다를 때 여기서만 대응시킨다: { 파일키: { 앱필드: 원본필드 } }
export const FIELD_MAP: Partial<Record<FileKey, Record<string, string>>> = {
  // 예) subwayStations: { name: '역명', transfer: '환승여부' },
}

export const SOURCES = [
  '영화관: 영화진흥위원회 「전국 극장 현황」 2010~2025 (연말 기준) 정리본',
  '좌표: 행정안전부 영화상영관 인허가 데이터 (EPSG:5174 → EPSG:4326 변환, 주소·상호로 연결)',
  '자치구·서울 경계: 통계청 행정동 경계 2023.7 (vuski/admdongkor) 자치구 단위 병합',
  '한강·주요 도로: Natural Earth 1:10m (개략 축척)',
]
