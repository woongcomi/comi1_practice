import type { Lineup, LineupPlayer, Result, StyleMetric } from './api'

/* 그래프 색은 index.css 의 --series-home / --series-away 토큰만 쓴다 (dataviz 검증 통과 색).
   글자는 항상 본문 색이고, 색은 막대·점·견본에만 쓴다. */

const RESULT_LABEL = { W: '승', D: '무', L: '패' } as const

export function FormChips({ results }: { results: Result[] }) {
  return (
    <span className="form-chips" aria-label="최근 경기 결과">
      {results.map((r, i) =>
        r ? (
          <span key={i} className={`form-chip form-${r}`} title={RESULT_LABEL[r]}>
            {RESULT_LABEL[r]}
          </span>
        ) : null,
      )}
    </span>
  )
}

const STAT_LABELS: { [k: string]: string } = {
  'Ball Possession': '점유율',
  'Total Shots': '슈팅',
  'Shots on Goal': '유효 슈팅',
  'Shots insidebox': '박스 안 슈팅',
  'Total passes': '패스',
  'Passes %': '패스 성공률',
  'Corner Kicks': '코너킥',
  Fouls: '파울',
  Offsides: '오프사이드',
  'Goalkeeper Saves': '선방',
  'Yellow Cards': '경고',
}
const PERCENT_STATS = new Set(['Ball Possession', 'Passes %'])

/** 두 팀 경기 기록 비교. 각 줄은 홈/원정 값의 비율로 나눈 막대 하나. */
export function StatCompare({
  rows,
  home,
  away,
}: {
  rows: { label: string; home: number | null; away: number | null }[]
  home: string
  away: string
}) {
  const fmt = (label: string, v: number | null) =>
    v === null ? '–' : PERCENT_STATS.has(label) ? `${v}%` : String(v)
  return (
    <div className="stat-compare">
      <div className="legend">
        <span>
          <i className="swatch home" /> {home}
        </span>
        <span>
          <i className="swatch away" /> {away}
        </span>
      </div>
      {rows.map((r) => {
        const h = r.home ?? 0
        const a = r.away ?? 0
        // 패스 성공률처럼 두 값이 따로 의미 있는 %는 비율이 아니라 각자 길이로 그린다
        const separate = r.label === 'Passes %'
        const total = h + a
        const hw = separate ? h / 2 : total ? (100 * h) / total : 50
        const aw = separate ? a / 2 : total ? (100 * a) / total : 50
        const label = STAT_LABELS[r.label] ?? r.label
        return (
          <div
            className="stat-row"
            key={r.label}
            title={`${label}: ${home} ${fmt(r.label, r.home)} · ${away} ${fmt(r.label, r.away)}`}
          >
            <span className={`stat-value ${h > a ? 'lead' : ''}`}>{fmt(r.label, r.home)}</span>
            <span className="stat-label">{label}</span>
            <span className={`stat-value right ${a > h ? 'lead' : ''}`}>{fmt(r.label, r.away)}</span>
            <div className="stat-bar">
              <span className="half left">
                <i className="fill home" style={{ width: `${hw}%` }} />
              </span>
              <span className="half right">
                <i className="fill away" style={{ width: `${aw}%` }} />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PERIODS = ['1–15', '16–30', '31–45', '46–60', '61–75', '76–90']

/** 15분 구간별 득점(위)과 실점(아래). 한 기준선에서 위아래로 뻗는 막대. */
export function GoalsByPeriod({ scored, conceded }: { scored: number[]; conceded: number[] }) {
  const max = Math.max(1, ...scored, ...conceded)
  const H = 72 // 한쪽 최대 높이(px)
  return (
    <figure className="goals-period">
      <div className="legend">
        <span>
          <i className="swatch home" /> 득점
        </span>
        <span>
          <i className="swatch away" /> 실점
        </span>
      </div>
      <div className="gp-plot" role="img" aria-label="시간대별 득점과 실점">
        {PERIODS.map((p, i) => (
          <div className="gp-col" key={p} title={`${p}분 · 득점 ${scored[i]} · 실점 ${conceded[i]}`}>
            <div className="gp-up" style={{ height: H + 18 }}>
              {scored[i] > 0 && <span className="gp-num">{scored[i]}</span>}
              <i className="gp-bar home" style={{ height: (H * scored[i]) / max }} />
            </div>
            <div className="gp-down" style={{ height: H + 18 }}>
              <i className="gp-bar away" style={{ height: (H * conceded[i]) / max }} />
              {conceded[i] > 0 && <span className="gp-num">{conceded[i]}</span>}
            </div>
            <span className="gp-label">{p}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>시간대별 득점·실점</caption>
        <thead>
          <tr>
            <th>시간(분)</th>
            <th>득점</th>
            <th>실점</th>
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p, i) => (
            <tr key={p}>
              <td>{p}</td>
              <td>{scored[i]}</td>
              <td>{conceded[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const STYLE_LABELS: { [k: string]: [string, string] } = {
  possession: ['점유율', '%'],
  pass_accuracy: ['패스 성공률', '%'],
  passes: ['패스', '회'],
  shots: ['슈팅', '회'],
  shots_on: ['유효 슈팅', '회'],
  shots_inside: ['박스 안 슈팅', '회'],
  corners: ['코너킥', '회'],
  fouls: ['파울', '회'],
}

/** 팀 평균(점)을 리그 팀들의 최소~최대 범위(막대)와 리그 평균(눈금) 위에 놓는다. */
export function StyleStrip({ metrics }: { metrics: StyleMetric[] }) {
  return (
    <div className="style-strip">
      <p className="muted small key">
        <i className="key-dot" /> 이 팀 평균 <i className="key-tick" /> 리그 평균{' '}
        <i className="key-range" /> 리그 팀 최저~최고
      </p>
      {metrics.map((m) => {
        const [label, unit] = STYLE_LABELS[m.key] ?? [m.key, '']
        if (m.value === null || m.league_min === null || m.league_max === null) return null
        const span = m.league_max - m.league_min || 1
        const pos = (v: number) => `${(100 * (v - m.league_min!)) / span}%`
        const diff = m.league_avg !== null ? m.value - m.league_avg : 0
        return (
          <div
            className="style-row"
            key={m.key}
            title={`${label}: ${m.value}${unit} (리그 평균 ${m.league_avg}${unit}, 범위 ${m.league_min}~${m.league_max})`}
          >
            <span className="style-label">{label}</span>
            <div className="style-track">
              <i className="style-range" />
              {m.league_avg !== null && <i className="style-avg" style={{ left: pos(m.league_avg) }} />}
              <i className="style-dot" style={{ left: pos(m.value) }} />
            </div>
            <span className="style-value">
              {m.value}
              {unit}
              <span className="muted small">
                {' '}
                {diff >= 0 ? '+' : ''}
                {diff.toFixed(1)}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 라인업의 grid("줄:칸", 1줄=골키퍼)를 가로 피치 위 좌표로 바꿔 두 팀을 그린다. */
export function Pitch({ home, away }: { home: Lineup; away: Lineup }) {
  const place = (lineup: Lineup, side: 'home' | 'away') => {
    const rows = new Map<number, LineupPlayer[]>()
    for (const p of lineup.start) {
      const [r] = (p.grid ?? '1:1').split(':').map(Number)
      rows.set(r, [...(rows.get(r) ?? []), p])
    }
    const lines = Math.max(...rows.keys())
    return [...rows.entries()].flatMap(([r, players]) =>
      players
        .sort((a, b) => Number(a.grid?.split(':')[1]) - Number(b.grid?.split(':')[1]))
        .map((p, i) => {
          // 한 팀은 자기 진영(반 코트) 안에: 골키퍼 4%, 최전방 46%
          const depth = lines > 1 ? 4 + (42 * (r - 1)) / (lines - 1) : 4
          const x = side === 'home' ? depth : 100 - depth
          const y = ((i + 1) * 100) / (players.length + 1)
          return { p, x, y: side === 'home' ? y : 100 - y }
        }),
    )
  }
  const shortName = (name: string) => name.split(' ').slice(-1)[0]

  return (
    <div className="pitch" role="img" aria-label="두 팀 선발 포메이션">
      <i className="pitch-half" />
      <i className="pitch-circle" />
      <i className="pitch-box left" />
      <i className="pitch-box right" />
      {(['home', 'away'] as const).flatMap((side) =>
        place(side === 'home' ? home : away, side).map(({ p, x, y }) => (
          <a
            key={`${side}-${p.id}`}
            href={`#/player/${p.id}`}
            className={`pitch-player ${side}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={`${p.number}. ${p.name}${p.rating ? ` · 평점 ${p.rating}` : ''}`}
          >
            <span className="pitch-dot">{p.number}</span>
            <span className="pitch-name">{shortName(p.name)}</span>
          </a>
        )),
      )}
    </div>
  )
}
