import { api, type Fixture } from '../api'
import { Status, TeamBadge } from '../components'
import { fmtKickoff, roundLabel } from '../format'
import { useAsync } from '../hooks'
import { LeagueTabs } from './Standings'

export function MatchesPage({
  season,
  league,
  round,
}: {
  season: number
  league: number
  round: string | null
}) {
  const { data, loading, error } = useAsync(() => api.fixtures(season, league), [season, league])
  if (!data) return <Status loading={loading} error={error} />

  const rounds = [...new Set(data.fixtures.map((f) => f.round))]
  const lastPlayed = [...data.fixtures].reverse().find((f) => f.goals.home !== null)?.round
  const current = round && rounds.includes(round) ? round : (lastPlayed ?? rounds[0])
  const idx = rounds.indexOf(current)
  const fixtures = data.fixtures.filter((f) => f.round === current)
  const href = (r: string) => `#/matches/${league}/${encodeURIComponent(r)}`

  return (
    <>
      <div className="page-head">
        <h1>{season} 경기 결과</h1>
        <LeagueTabs base="matches" league={league} />
      </div>

      <div className="round-nav">
        <a className={`round-step ${idx <= 0 ? 'disabled' : ''}`} href={idx > 0 ? href(rounds[idx - 1]) : undefined} aria-label="이전 라운드">
          ‹
        </a>
        <select
          value={current}
          onChange={(e) => (window.location.hash = href(e.target.value))}
          aria-label="라운드 선택"
        >
          {rounds.map((r) => (
            <option key={r} value={r}>
              {roundLabel(r)}
            </option>
          ))}
        </select>
        <a
          className={`round-step ${idx >= rounds.length - 1 ? 'disabled' : ''}`}
          href={idx < rounds.length - 1 ? href(rounds[idx + 1]) : undefined}
          aria-label="다음 라운드"
        >
          ›
        </a>
      </div>

      <ul className="match-list">
        {fixtures.map((f) => (
          <li key={f.id}>
            <MatchCard f={f} />
          </li>
        ))}
      </ul>
    </>
  )
}

export function MatchCard({ f }: { f: Fixture }) {
  const played = f.goals.home !== null
  const body = (
    <>
      <span className="match-meta muted small">
        {fmtKickoff(f.date)} · {f.venue}
      </span>
      <span className="match-line">
        <span className="match-team home">
          <TeamBadge team={{ ...f.home, kleague: false }} />
        </span>
        <span className="match-score">
          {played ? (
            <>
              <b className={f.goals.home! > f.goals.away! ? 'win' : ''}>{f.goals.home}</b>
              <span className="muted">:</span>
              <b className={f.goals.away! > f.goals.home! ? 'win' : ''}>{f.goals.away}</b>
            </>
          ) : (
            <span className="muted small">경기 전</span>
          )}
        </span>
        <span className="match-team away">
          <TeamBadge team={{ ...f.away, kleague: false }} />
        </span>
      </span>
      {played && !f.has_detail && <span className="match-pending muted small">상세 기록 수집 대기 중</span>}
    </>
  )
  return f.has_detail ? (
    <a className="match-card linked" href={`#/match/${f.id}`}>
      {body}
    </a>
  ) : (
    <div className="match-card">{body}</div>
  )
}
