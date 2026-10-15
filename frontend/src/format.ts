import type { Result } from './api'

export const LEAGUES = [
  { id: 292, name: 'K리그1' },
  { id: 293, name: 'K리그2' },
]

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const KST_DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

export const fmtKickoff = (iso: string) => KST.format(new Date(iso))
export const fmtDate = (iso: string) => KST_DATE.format(new Date(iso))

/** "Regular Season - 12" -> "12라운드", "Championship Round - 2" -> "파이널A 2R" */
export function roundLabel(round: string) {
  const [name, n] = round.split(' - ')
  if (name === 'Regular Season') return `${n}라운드`
  if (name === 'Championship Round') return `파이널A ${n}R`
  if (name === 'Relegation Round') return n ? `파이널B ${n}R` : '파이널B·승강PO'
  if (name.startsWith('Promotion')) return '승격 PO'
  return round
}

/** API의 form 문자열("WDWWL", 왼쪽이 최근)을 결과 배열로 */
export function parseForm(form: string | null): Result[] {
  return (form ?? '').split('').filter((c): c is 'W' | 'D' | 'L' => 'WDL'.includes(c))
}
