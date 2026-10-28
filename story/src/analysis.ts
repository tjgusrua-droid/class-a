// CSV 읽기(쉼표 구분, 첫 줄 = 열 이름). 입지 지표 계산은 각 장면 컴포넌트에서 실제 파일이 있을 때만 한다.
export function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.replace(/^﻿/, '').trim().split(/\r?\n/)
  const keys = head.split(',').map((s) => s.trim())
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v.trim()])))
}
