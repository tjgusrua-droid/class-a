import { TYPE_STYLE } from '../config'
import type { Venue } from '../data'
import { Sym } from './ui'

const v_ = (x: unknown, unit = '') => (x === null || x === undefined || x === '' ? '자료 없음' : `${typeof x === 'number' ? x.toLocaleString() : x}${unit}`)

// 영화관 정보. 같은 좌표에 여러 운영구간이 있으면 여러 개가 이어진다
export function TooltipBody({ v }: { v: Venue }) {
  return (
    <div className="tipitem">
      <b><Sym type={v.type} /> {v.name}</b>
      <dl>
        <dt>유형</dt><dd style={{ color: TYPE_STYLE[v.type].color }}>{v.type}{v.subtype && ` · ${v.subtype}`}</dd>
        <dt>상태</dt><dd>{v.status}</dd>
        <dt>개업일</dt><dd>{v_(v.open)}{v.bulkOpen && ' (일괄 등록일 의심)'}</dd>
        <dt>폐업일</dt><dd>{v.status === '영업' ? '—' : v_(v.close)}</dd>
        <dt>스크린</dt><dd>{v_(v.screens, '개')}</dd>
        <dt>좌석</dt><dd>{v_(v.seats, '석')}</dd>
        <dt>입점 형태</dt><dd>{v.occupancy}</dd>
      </dl>
      <small>{v.address} · LOCALDATA 기록 {v.licenses}건{v.koficNames ? ` · KOFIC: ${v.koficNames}` : ' · KOFIC 미수록'}</small>
      {v.conflict && <small className="conflict">자료 충돌: {v.conflict}</small>}
    </div>
  )
}
