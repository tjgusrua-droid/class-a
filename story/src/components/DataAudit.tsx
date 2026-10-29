import { More } from './ui'
import { DATA_LABEL, TYPES } from '../config'
import type { DataSet } from '../data'

// 2026 재검증 결과(audit_venues.py → audit.json)
export default function DataAudit({ data }: { data: DataSet }) {
  if (data.audit.status !== 'ok') return <More>감사 자료(audit.json) 없음</More>
  const a = data.audit.data
  const items: [string, string | number][] = [
    ['LOCALDATA 인허가 기록', `${a.localdata_records}건 → 장소 ${a.venues}곳 · 운영구간 ${a.episodes}개`],
    ['영업 중 운영구간', `${a.active}개 (${TYPES.map((t) => `${t} ${a.active_by_type[t]}`).join(' · ')})`],
    ['상태별', Object.entries(a.status).map(([k, v]) => `${k} ${v}`).join(' · ')],
    ['폐업·취소 유형별', TYPES.map((t) => `${t} ${a.closed_by_type[t]}`).join(' · ')],
    ['KOFIC 2025와 연결되는 영업 구간', a.active_matched_kofic2025],
    ['LOCALDATA에만 있는 영업 구간', a.active_localdata_only],
    ['KOFIC 2025 극장 중 LOCALDATA 영업이 아닌 곳', `${a.kofic2025_not_active_in_localdata} / ${a.kofic2025_total}`],
    ['KOFIC에만 있는 극장(별도 인허가 기록 없음)', a.kofic_only],
    ['같은 장소 동시 영업 구간 / 같은 이름 영업 구간', `${a.dup_place} / ${a.dup_name}`],
    ['좌표 누락 운영구간(영업 중)', `${a.no_coords} (${a.no_coords_active})`],
    ['유형 근거 없음(기타) / 참고 홈페이지 분류에만 근거', `${a.type_no_evidence} / ${a.type_reference_only}`],
    ['영업 중이지만 자료 충돌', `${a.conflicts_active}개 — 영업으로 집계하고 충돌 내용 기록`],
    ['영업 구간 세부유형', Object.entries(a.subtype_active).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'],
  ]
  return (
    <div className="audit">
      <p className="lead">영화관의 존재·상태·개업일·폐업일은 <b>LOCALDATA</b>를 1차 기준으로 다시 계산했습니다. KOFIC는 스크린·좌석·운영주체·유형을 보완합니다. <span className="dateline">{DATA_LABEL}</span></p>
      <div className="split even">
        <dl className="auditlist">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div>
          <table className="mini-table cmp"><caption>기존·참고 홈페이지와 비교 (최종 적용값 = 현재 재계산)</caption>
            <thead><tr><th>항목</th><th>기존</th><th>참고</th><th>현재</th></tr></thead>
            <tbody>{a.compare.map((r: any) => <tr key={r.item} title={r.reason}><td>{r.item}<small>{r.reason}</small></td><td>{r.previous}</td><td>{r.reference}</td><td><b>{r.current}</b></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <More>세부 목록: <code>data/verify/data_audit_2026.md</code>, 엑셀 <code>data/seoul_cinema_master.xlsx</code>의 ‘운영구간_LOCALDATA’·‘데이터감사’ 시트. 참고 홈페이지 수치에 맞추지 않았습니다.</More>
    </div>
  )
}
