import { api, type ClubSeason } from '../api'
import { FormChips, GoalsByPeriod, StyleStrip } from '../charts'
import { CoverageNote, StatTile, Status, Tabs, TeamBadge } from '../components'
import { fmtDate, roundLabel } from '../format'
import { useAsync } from '../hooks'
import { ClubTransfers, type SeasonProps } from './Transfers'

type Props = {
  id: number
  tab: string
  matchSeason: number
  transferSeason: SeasonProps
}

export function ClubPage({ id, tab, matchSeason, transferSeason }: Props) {
  const club = useAsync(() => api.club(matchSeason, id).catch(() => null), [id, matchSeason])
  const fallback = useAsync(() => api.teamTransfers(id, null), [id])
  const team = club.data?.team ?? fallback.data?.team
  const hasSeason = !!club.data
  const active = hasSeason ? tab : 'transfers'

  if (club.loading || (!team && fallback.loading)) return <Status loading error={false} />
  if (!team) return <Status loading={false} error />

  return (
    <>
      <section className="club-head">
        {team.logo && <img className="logo xl" src={team.logo} alt="" />}
        <div>
          <h1>{team.name}</h1>
          {club.data?.standing && (
            <p className="muted">
              {club.data.season} {club.data.league_name} <b className="text">{club.data.standing.rank}위</b> ·
              승점 {club.data.standing.points}
            </p>
          )}
        </div>
      </section>

      <Tabs
        active={active}
        items={[
          ...(hasSeason
            ? [
                { key: 'season', label: `${matchSeason} 시즌`, href: `#/club/${id}` },
                { key: 'squad', label: '선수단', href: `#/club/${id}/squad` },
              ]
            : []),
          { key: 'transfers', label: '이적', href: `#/club/${id}/transfers` },
        ]}
      />

      {!hasSeason && (
        <p className="coverage-note">ⓘ {matchSeason} 시즌 K리그 경기 기록이 없는 구단이라 이적 기록만 보여줍니다.</p>
      )}
      {active === 'season' && club.data && <SeasonTab c={club.data} />}
      {active === 'squad' && club.data && <SquadTab c={club.data} />}
      {active === 'transfers' && <ClubTransfers id={id} {...transferSeason} />}
    </>
  )
}

function SeasonTab({ c }: { c: ClubSeason }) {
  const s = c.standing
  const played = c.results.filter((r) => r.result)
  const main = c.formations[0]
  const totalLineups = c.formations.reduce((n, f) => n + f.count, 0)
  return (
    <>
      {s && (
        <div className="tile-row">
          <StatTile label="순위" value={`${s.rank}위`} sub={s.zone?.label} />
          <StatTile label="승점" value={s.points} />
          <StatTile label="전적" value={`${s.all.win}-${s.all.draw}-${s.all.lose}`} sub="승-무-패" />
          <StatTile label="득점 / 실점" value={`${s.all.gf} / ${s.all.ga}`} sub={`득실 ${s.goal_diff > 0 ? '+' : ''}${s.goal_diff}`} />
        </div>
      )}

      <div className="club-grid">
        <section className="card">
          <h2>경기 결과</h2>
          <p className="muted small">
            최근 흐름 <FormChips results={played.slice(-5).reverse().map((r) => r.result)} />
          </p>
          <ul className="result-list">
            {[...c.results].reverse().map((r) => {
              const home = r.home.id === c.team.id
              const opp = home ? r.away : r.home
              const content = (
                <>
                  <span className="muted small rl-date">{fmtDate(r.date)}</span>
                  <span className="muted small rl-round">{roundLabel(r.round)}</span>
                  <span className="rl-ha muted small">{home ? '홈' : '원정'}</span>
                  <span className="rl-opp">
                    <TeamBadge team={{ ...opp, kleague: false }} size="sm" />
                  </span>
                  <span className="rl-score">
                    {r.goals.home !== null ? `${r.goals.home}-${r.goals.away}` : '–'}
                  </span>
                  {r.result ? <FormChips results={[r.result]} /> : <span />}
                </>
              )
              return (
                <li key={r.id}>
                  {r.has_detail ? (
                    <a href={`#/match/${r.id}`} className="rl-row linked">
                      {content}
                    </a>
                  ) : (
                    <div className="rl-row">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <div className="stack">
          <section className="card">
            <h2>전술</h2>
            {main ? (
              <>
                <p className="formation-main">
                  {main.formation}
                  <span className="muted small"> 주 포메이션 · {totalLineups}경기 중 {main.count}경기</span>
                </p>
                <ul className="bar-list">
                  {c.formations.map((f) => (
                    <li key={f.formation} title={`${f.formation}: ${f.count}경기`}>
                      <span className="bl-label">{f.formation}</span>
                      <span className="bl-track">
                        <i className="bl-fill" style={{ width: `${(100 * f.count) / main.count}%` }} />
                      </span>
                      <span className="bl-value">{f.count}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted small">
                  감독: {c.coaches.map((co) => `${co.name} (${co.count}경기)`).join(', ')}
                </p>
              </>
            ) : (
              <p className="muted">라인업 기록을 수집하는 중입니다.</p>
            )}
            {c.matches_collected < c.matches_played && (
              <CoverageNote what="전술·시간대별 득점" matches={c.matches_collected} total={c.matches_played} />
            )}
          </section>

          <section className="card">
            <h2>시간대별 득점·실점</h2>
            <GoalsByPeriod scored={c.goals_by_period.for} conceded={c.goals_by_period.against} />
          </section>
        </div>
      </div>

      <section className="card">
        <h2>경기 스타일</h2>
        <p className="muted small">리그 다른 팀들과 비교한 경기당 평균입니다.</p>
        {c.style.matches > 0 ? (
          <>
            <StyleStrip metrics={c.style.metrics} />
            <CoverageNote what="팀 경기 기록" matches={c.style.matches} total={c.matches_played} />
          </>
        ) : (
          <p className="muted">ⓘ 아직 팀 경기 기록(점유율·슈팅·패스)이 있는 경기가 없습니다.</p>
        )}
      </section>
    </>
  )
}

function SquadTab({ c }: { c: ClubSeason }) {
  return (
    <section className="card">
      <h2>
        {c.season} 선수단 <span className="muted small">출전 시간 순</span>
      </h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>선수</th>
              <th className="num">출전</th>
              <th className="num">선발</th>
              <th className="num">시간</th>
              <th className="num">골</th>
              <th className="num">도움</th>
              <th className="num hide-sm">경고</th>
              <th className="num hide-sm">퇴장</th>
              <th className="num">평점*</th>
            </tr>
          </thead>
          <tbody>
            {c.squad.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`#/player/${p.id}`}>{p.name}</a>
                </td>
                <td className="num">{p.apps}</td>
                <td className="num">{p.starts}</td>
                <td className="num">{p.minutes.toLocaleString()}</td>
                <td className="num strong">{p.goals || ''}</td>
                <td className="num">{p.assists || ''}</td>
                <td className="num hide-sm">{p.yellow || ''}</td>
                <td className="num hide-sm">{p.red || ''}</td>
                <td className="num">{p.rating?.toFixed(2) ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">* 평점은 세부 기록이 있는 경기만의 평균입니다.</p>
      {c.matches_collected < c.matches_played && (
        <CoverageNote what="선수단 기록" matches={c.matches_collected} total={c.matches_played} />
      )}
    </section>
  )
}
