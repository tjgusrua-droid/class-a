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
| `theaters.geojson` | 있음 | 영진위 2010~2025 정리본 + 행안부 인허가 좌표(EPSG:5174 변환) |
| `subway_lines.geojson`, `subway_stations.geojson` | 없음 | 필드: `line` / `name`, `transfer` |
| `seoul_centers.geojson` | 없음 | 중심지 **범위 폴리곤**, 필드 `name`, `level`(도심·광역중심·지역중심) |
| `commerce.geojson` | 없음 | 상권 지표 확정 후. `area_id`, `indicator`, `value` |
| `cultural_facilities.geojson` | 없음 | `name`, `category`(공연시설·전시시설 …) |
| `building_type.csv` | 없음 | `id`(theaters의 id), `building_type`, `mixed_type` |

- 지도·영화관 자료는 저장소 루트에서 `python3 scripts/build_story_data.py <경계자료 폴더>`로 다시 만든다(스크립트 머리말 참고).
- QGIS에서 내보낸 파일의 열 이름이 다르면 원본을 고치지 말고 `src/config.ts`의 `FIELD_MAP`에서 대응시킨다.
- 파일이 없으면 해당 장면에 필요한 파일·필드·상태를 표시하고 나머지는 정상 동작한다.

## 설정·구조

- `src/config.ts`: 역세권 500m, 문화시설 반경 500m, 인접 기준 500m, 기준 연도, 유형 색·모양, 파일 목록, 출처
- `src/data.ts`: 로딩·좌표 검증·필드 매핑과 계산(개업·폐업·최근접·운영기간)
- `src/analysis.ts`: 3장 입지 지표 어댑터(지하철·중심지·건축물·문화시설·상권)
- `src/components/`: `SeoulMap`, `TheaterTooltip`, `TypeComparison`, `Distribution`, `LocationTabs`, `TimelineSection`(+`charts.tsx`의 `TimelineChart`), `SurvivalDurationPlot`, `ui.tsx`(`StorySection`, `MapLegend`, `DataStatus` …)

## 분석 기준(화면에도 표시)

- 유형은 **임시 분류**: 대기업 직영·위탁 = 멀티플렉스, 독립예술영화 전용관 보유 = 독립극장, 나머지 = 기타. 2019년 이전 폐관 극장은 판단 필드가 없어 `data/manual/theater_type.csv`에서 정해 준다(`type` 칸).
- 연말 영업 중 = 그해 영진위 목록 또는 휴관. 폐업 = 폐관 기록. 이름·브랜드 전환은 개·폐업으로 세지 않는다.
- 운영기간은 폐업 영화관만(개관일 → 폐관일). 영업 중 영화관의 현재까지 기간과 섞지 않는다.
