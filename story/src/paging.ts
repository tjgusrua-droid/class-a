// 넓은 화면의 장면 넘김: 휠 한 번(또는 ↓·PageDown·Space) = 다음 멈춤 지점으로 부드럽게 이동.
// 멈춤 지점 = 장면 시작, 3장 단계 표시(.loc .snap), 화면보다 긴 장면의 끝. 지도 위 휠과 안쪽 스크롤 패널은 건드리지 않는다.
const LOCK_MS = 850

// 문서 위에서의 위치(등장 효과의 transform에 흔들리지 않도록 offsetTop을 더한다)
function absTop(el: HTMLElement) {
  let y = 0
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop
  return Math.round(y)
}

function points() {
  const vh = innerHeight, ys = new Set<number>()
  document.querySelectorAll<HTMLElement>('.scene').forEach((s) => {
    const top = absTop(s)
    ys.add(top)
    if (s.id !== 'location' && s.offsetHeight > vh * 1.05) ys.add(top + s.offsetHeight - vh)
  })
  document.querySelectorAll<HTMLElement>('.loc .snap').forEach((m) => ys.add(absTop(m)))
  const max = document.documentElement.scrollHeight - vh
  return [...ys].map((y) => Math.min(y, max)).sort((a, b) => a - b)
}

// 이벤트가 난 곳에서 위로 올라가며, 그 방향으로 더 스크롤할 수 있는 안쪽 영역이 있으면 true
function innerScrollable(el: Element | null, dir: number) {
  for (; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el)
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1)
      if (dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true
  }
  return false
}

export function startPaging() {
  const wide = matchMedia('(min-width: 1001px)')
  let lockUntil = 0
  const go = (dir: number) => {
    const y = scrollY, ps = points()
    const target = dir > 0 ? ps.find((p) => p > y + 2) : [...ps].reverse().find((p) => p < y - 2)
    if (target == null) return false
    lockUntil = Date.now() + LOCK_MS
    scrollTo({ top: target, behavior: 'smooth' })
    return true
  }
  const onWheel = (e: WheelEvent) => {
    if (!wide.matches || e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaY) < 4 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    const dir = Math.sign(e.deltaY)
    if (innerScrollable(e.target as Element, dir)) return
    e.preventDefault()
    if (Date.now() < lockUntil) return
    go(dir)
  }
  const onKey = (e: KeyboardEvent) => {
    if (!wide.matches || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const t = e.target as HTMLElement
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName) && e.key === ' ') return
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return
    const dir = ['ArrowDown', 'PageDown', ' '].includes(e.key) ? (e.shiftKey && e.key === ' ' ? -1 : 1) : ['ArrowUp', 'PageUp'].includes(e.key) ? -1 : 0
    if (!dir) return
    e.preventDefault()
    if (Date.now() >= lockUntil) go(dir)
  }
  addEventListener('wheel', onWheel, { passive: false })
  addEventListener('keydown', onKey)
  return () => { removeEventListener('wheel', onWheel); removeEventListener('keydown', onKey) }
}
