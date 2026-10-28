# 서울 영화관 데이터 스토리 (수업용)

서울 영화관의 유형·분포·입지·개폐업·운영기간을 스크롤로 설명하는 페이지. React + TypeScript + Vite, 지도는 MapLibre GL JS(외부 지도 타일 없음, 로컬 GeoJSON만 사용).

```bash
cd story
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 에 정적 파일 생성 (어느 경로에 올려도 동작)
```

## 데이터 (`public/data/`, 모두 EPSG:4326 · [경도, 위도])

| 파일 | 상태 | 출처·만드는 법 |
|---|---|---|
| `seoul_boundary.geojson`, `seoul_gu.geojson` | 있음 | 통계청 행정동 경계 2023.7(vuski/admdongkor)을 자치구로 병합 |
| `han_river.geojson`, `roads.geojson` | 있음 | Natural Earth 1:10m (개략 축척) |
| `venues.geojson`, `yearly.json`, `audit.json` | 있음 | LOCALDATA(1차 기준) 운영구간·2000년~ 시계열·재검증 결과 (`scripts/build_venues.py` 등) |
| `cultural_facilities.geojson` | 있음 | 서울시 문화공간 + 공연장 인허가 (`scripts/build_culture_data.py`) |
| `seoul_2040_centers.csv` | 명칭만 | 위치 자료 없음 |
| `subway_stations.geojson`, `subway_buffers.geojson` | 있음 | 서울열린데이터광장 역 정보 → `scripts/build_subway.py`. 노선 형상은 없어 그리지 않음 |
| `subway_lines.geojson` | 있음 | OpenStreetMap 노선 선형(ODbL, kimmdr2/metroscope 추출본) → `scripts/build_subway.py` |
| `seoul_grid_250.json` | 있음 | 3-6 밀도 지도용 250m 격자 → `scripts/build_grid.py` |
| `seoul_centers.geojson` | 개략 | 2040 중심지 대표 역 기준 개략 영역(공식 범위 아님) → `scripts/build_subway.py` |
| `commerce.geojson` | 없음 | 상권 지표 확정 후. `area_id`, `indicator`, `value`, `year` (제안: `data/verify/commerce_proposal.md`) |

- 영화관 자료는 `scripts/`의 파이프라인으로 다시 만든다(`data/verify/README.md`). 경계·한강·도로는 `scripts/build_story_data.py`.
- QGIS에서 내보낸 파일의 열 이름이 다르면 원본을 고치지 말고 `src/config.ts`의 `FIELD_MAP`에서 대응시킨다.
- 파일이 없으면 해당 장면에 필요한 파일·필드·상태를 표시하고 나머지는 정상 동작한다.

## 설정·구조

- `src/config.ts`: 역세권 500m, 문화시설 반경 500m, 인접 기준 500m, 기준 연도, 유형 색·모양, 파일 목록, 출처
- `src/data.ts`: 로딩·좌표 검증·필드 매핑과 계산(개업·폐업·최근접·운영기간)
- `src/components/Isometric.tsx`: 1장 유형 개념도(상영관 칸 수 = 스크린 중앙값)
- `src/components/`: `SeoulMap`, `TheaterTooltip`, `TypeComparison`, `Distribution`, `LocationTabs`, `TimelineSection`(+`charts.tsx`의 `TimelineChart`), `SurvivalDurationPlot`, `ui.tsx`(`StorySection`, `MapLegend`, `DataStatus` …)

## 분석 기준(화면에도 표시)

- 존재·상태·날짜는 **LOCALDATA(행안부 인허가)가 1차 기준**. 영진위(KOFIC)는 상영관·좌석·특별관·운영주체·유형 보완에만 쓴다. 두 출처가 다르면 두 값과 충돌 표시·채택 출처·사유를 함께 남긴다(`data/clean/venues_episodes.csv`).
- 유형: 영진위 직영·위탁 → 멀티플렉스, 예술관 상영관 보유·이름의 독립·예술 표현·참고 홈페이지 분류 → 독립·예술영화관, 멀티플렉스 브랜드명 → 멀티플렉스, 나머지 → 기타. 손으로 바꿀 때는 `data/manual/theater_type.csv`.
- 영업 중 = 기준일에 폐업·취소되지 않은 운영구간(휴관 포함). 같은 장소의 이름·브랜드 전환은 개·폐업으로 세지 않는다. 한 구에 같은 인허가일자가 4건 이상이면 일괄 등록일로 보고 개업 집계에서 뺀다.
- 운영기간은 폐업 영화관만(개업일 → 폐업일). 영업 중 영화관의 현재까지 기간과 섞지 않는다.
- 데이터 재생성 순서는 `data/verify/README.md`.
