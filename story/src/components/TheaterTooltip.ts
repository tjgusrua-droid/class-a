import type { Theater } from '../data'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const v = (x: unknown) => (x === null || x === undefined || x === '' ? '정보 없음' : esc(x))

// 지도 팝업 내용. 같은 좌표에 여러 운영 이력이 있으면 여러 개를 이어서 보여준다
export function tooltipHtml(t: Theater) {
  return `<div class="tip"><b>${esc(t.name)}</b>
  <dl>
    <dt>유형</dt><dd>${esc(t.type)}</dd>
    <dt>운영상태</dt><dd>${esc(t.status)}${t.closeKind === '전환' ? ' (이름·브랜드 전환)' : ''}</dd>
    <dt>개업일</dt><dd>${v(t.openDate)}</dd>
    <dt>폐업일</dt><dd>${t.status === '폐관' || t.status === '전환' ? v(t.closeDate || t.closeYear) : '—'}</dd>
    <dt>스크린</dt><dd>${v(t.screens)}${t.screens ? '개' : ''}</dd>
    <dt>좌석</dt><dd>${v(t.seats?.toLocaleString())}${t.seats ? '석' : ''}</dd>
  </dl><small>${esc(t.address)} · 목록 ${t.years[0]}–${t.years[t.years.length - 1]}</small></div>`
}
