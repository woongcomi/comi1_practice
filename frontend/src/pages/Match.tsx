import { api, type Lineup, type MatchEvent, type PlayerMatchStats } from '../api'
import { Pitch, StatCompare } from '../charts'
import { Status } from '../components'
import { fmtKickoff, roundLabel } from '../format'
import { useAsync } from '../hooks'

const EVENT_ICON: { [type: string]: string } = { Goal: '⚽', Card: '', subst: '⇄', Var: 'VAR' }

function eventText(e: MatchEvent) {
  if (e.type === 'Goal') {
    const tag =
      e.detail === 'Penalty' ? ' (PK)' : e.detail === 'Own Goal' ? ' (자책골)' : e.detail === 'Missed Penalty' ? ' (PK 실축)' : ''
    return (
      <>
        <b>{e.player}</b>
        {tag}
        {e.assist && <span className="muted small"> 도움 {e.assist}</span>}
      </>
    )
  }
  if (e.type === 'subst')
    return (
      <>
        <span className="sub-in">▲ {e.player_in}</span> <span className="muted small">▼ {e.player}</span>
      </>
    )
  if (e.type === 'Card') return <>{e.player}</>
  return (
    <>
      {e.player} <span className="muted small">{e.detail}</span>
    </>
  )
}

function Timeline({ events }: { events: MatchEvent[] }) {
  return (
    <ol className="event-timeline">
      {events.map((e, i) => (
        <li key={i} className={`ev ev-${e.side}`}>
          <span className="ev-min">
            {e.minute}
            {e.extra ? `+${e.extra}` : ''}'
          </span>
          <span className="ev-body">
            {e.type === 'Card' ? (
              <i
                className={`card-icon ${e.detail === 'Yellow Card' ? 'yellow' : 'red'}`}
                aria-label={e.detail === 'Yellow Card' ? '경고' : '퇴장'}
              />
            ) : (
              <span className="ev-icon" aria-hidden>
                {EVENT_ICON[e.type] ?? '•'}
              </span>
            )}
            <span>{eventText(e)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function LineupList({ title, lineup, side }: { title: string; lineup: Lineup; side: 'home' | 'away' }) {
  return (
    <section className="lineup-list">
      <h3>
        <i className={`swatch ${side}`} /> {title}{' '}
        <span className="muted small">
          {lineup.formation} · 감독 {lineup.coach ?? '–'}
        </span>
      </h3>
      <ul>
        {lineup.start.map((p) => (
          <li key={p.id}>
            <span className="num muted">{p.number}</span>
            <a href={`#/player/${p.id}`}>{p.name}</a>
            {p.off !== null && <span className="muted small">▼{p.off}'</span>}
            {p.rating && <span className="rating">{p.rating.toFixed(1)}</span>}
          </li>
        ))}
      </ul>
      <h4 className="muted small">교체 명단</h4>
      <ul className="subs">
        {lineup.subs.map((p) => (
          <li key={p.id} className={p.minutes ? '' : 'unused'}>
            <span className="num muted">{p.number}</span>
            <a href={`#/player/${p.id}`}>{p.name}</a>
            {p.on !== null && <span className="sub-in small">▲{p.on}'</span>}
            {p.rating && <span className="rating">{p.rating.toFixed(1)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function PlayerStatsTable({ title, rows }: { title: string; rows: PlayerMatchStats[] }) {
  const played = rows.filter((r) => r.minutes)
  return (
    <section>
      <h3>{title}</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>선수</th>
              <th className="num">시간</th>
              <th className="num">평점</th>
              <th className="num">슈팅(유효)</th>
              <th className="num">패스(성공)</th>
              <th className="num">키패스</th>
              <th className="num">태클</th>
              <th className="num">경합 승</th>
            </tr>
          </thead>
          <tbody>
            {played.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`#/player/${p.id}`}>{p.name}</a>
                </td>
                <td className="num">{p.minutes}'</td>
                <td className="num strong">{p.rating?.toFixed(1) ?? '–'}</td>
                <td className="num">
                  {p.shots ?? 0}({p.shots_on ?? 0})
                </td>
                <td className="num">
                  {p.passes ?? 0}({p.passes_accurate ?? 0})
                </td>
                <td className="num">{p.key_passes ?? 0}</td>
                <td className="num">{p.tackles ?? 0}</td>
                <td className="num">
                  {p.duels_won ?? 0}/{p.duels ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function MatchPage({ id }: { id: number }) {
  const { data: m, loading, error } = useAsync(() => api.match(id), [id])
  if (!m) return <Status loading={loading} error={error} />

  return (
    <>
      <a className="back" href={`#/matches/${m.league_id}/${encodeURIComponent(m.round)}`}>
        ← {m.league_name} {roundLabel(m.round)}
      </a>

      <section className="scoreboard card">
        <p className="muted small">
          {m.season} {m.league_name} · {roundLabel(m.round)} · {fmtKickoff(m.date)}
        </p>
        <div className="score-line">
          <div className="sb-team">
            <img className="logo xl" src={m.home.logo ?? ''} alt="" />
            <a className="sb-name" href={`#/club/${m.home.id}`}>{m.home.name}</a>
          </div>
          <div className="sb-score">
            <span>
              {m.goals.home} : {m.goals.away}
            </span>
            <span className="muted small">
              전반 {m.halftime.home} : {m.halftime.away}
            </span>
          </div>
          <div className="sb-team">
            <img className="logo xl" src={m.away.logo ?? ''} alt="" />
            <a className="sb-name" href={`#/club/${m.away.id}`}>{m.away.name}</a>
          </div>
        </div>
        <p className="muted small">
          {m.venue}
          {m.referee && ` · 주심 ${m.referee}`}
        </p>
      </section>

      <div className="match-grid">
        <section className="card">
          <h2>주요 장면</h2>
          {m.events.length ? <Timeline events={m.events} /> : <p className="muted">기록이 없습니다.</p>}
        </section>

        <section className="card">
          <h2>팀 기록</h2>
          {m.stats ? (
            <StatCompare rows={m.stats} home={m.home.name} away={m.away.name} />
          ) : (
            <p className="muted">ⓘ 이 경기는 데이터 제공처에 팀 기록(점유율·슈팅·패스)이 없습니다.</p>
          )}
        </section>
      </div>

      {m.home_lineup && m.away_lineup && (
        <section className="card">
          <h2>
            선발 라인업{' '}
            <span className="muted small">
              {m.home_lineup.formation} vs {m.away_lineup.formation}
            </span>
          </h2>
          <Pitch home={m.home_lineup} away={m.away_lineup} />
          <div className="two-col">
            <LineupList title={m.home.name} lineup={m.home_lineup} side="home" />
            <LineupList title={m.away.name} lineup={m.away_lineup} side="away" />
          </div>
        </section>
      )}

      {!!(m.players.home?.length || m.players.away?.length) && (
        <section className="card">
          <h2>선수 기록</h2>
          {m.players.home && <PlayerStatsTable title={m.home.name} rows={m.players.home} />}
          {m.players.away && <PlayerStatsTable title={m.away.name} rows={m.players.away} />}
        </section>
      )}
    </>
  )
}
