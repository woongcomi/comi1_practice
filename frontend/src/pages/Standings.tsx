import { Fragment } from 'react'
import { api, type PlayerSeason } from '../api'
import { FormChips } from '../charts'
import { Status, Tabs, TeamBadge } from '../components'
import { LEAGUES, parseForm } from '../format'
import { useAsync } from '../hooks'

export function LeagueTabs({ base, league }: { base: string; league: number }) {
  return (
    <Tabs
      active={String(league)}
      items={LEAGUES.map((l) => ({ key: String(l.id), label: l.name, href: `#/${base}/${l.id}` }))}
    />
  )
}

const ZONE_LEGEND: { [kind: string]: string } = {
  acl: 'AFC 챔피언스리그',
  promotion: '승격',
  playoff: '승강 플레이오프',
  next: '승격 플레이오프 진출',
  relegation: '강등',
}

export function StandingsPage({ season, league }: { season: number; league: number }) {
  const table = useAsync(() => api.standings(season, league), [season, league])
  const leaders = useAsync(() => api.leaders(season, league), [season, league])
  const zones = [...new Set(table.data?.rows.map((r) => r.zone?.kind).filter(Boolean))] as string[]

  return (
    <>
      <div className="page-head">
        <h1>{season} 순위</h1>
        <LeagueTabs base="standings" league={league} />
      </div>

      <div className="standings-layout">
        <section className="card table-card">
          <Status loading={table.loading && !table.data} error={table.error} />
          {table.data && (
            <div className="table-scroll">
              <table className="standings">
                <thead>
                  <tr>
                    <th className="num">순위</th>
                    <th className="team-col">팀</th>
                    <th className="num">경기</th>
                    <th className="num">승</th>
                    <th className="num">무</th>
                    <th className="num">패</th>
                    <th className="num hide-sm">득점</th>
                    <th className="num hide-sm">실점</th>
                    <th className="num">득실</th>
                    <th className="num strong">승점</th>
                    <th className="hide-sm">최근 5경기</th>
                  </tr>
                </thead>
                <tbody>
                  {table.data.rows.map((r, i) => {
                    const prev = table.data!.rows[i - 1]
                    const splitStart = r.split && r.split !== prev?.split
                    return (
                      <Fragment key={r.team.id ?? r.rank}>
                        {splitStart && (
                          <tr className="split-row" key={`split-${r.split}`}>
                            <td colSpan={11}>파이널 {r.split}</td>
                          </tr>
                        )}
                        <tr>
                          <td className={`num rank zone-${r.zone?.kind ?? 'none'}`} title={r.zone?.label}>
                            {r.rank}
                          </td>
                          <td className="team-col">
                            <TeamBadge team={r.team} size="sm" />
                          </td>
                          <td className="num">{r.all.played}</td>
                          <td className="num">{r.all.win}</td>
                          <td className="num">{r.all.draw}</td>
                          <td className="num">{r.all.lose}</td>
                          <td className="num hide-sm">{r.all.gf}</td>
                          <td className="num hide-sm">{r.all.ga}</td>
                          <td className="num">{r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff}</td>
                          <td className="num strong">{r.points}</td>
                          <td className="hide-sm">
                            <FormChips results={parseForm(r.form)} />
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {zones.length > 0 && (
            <ul className="zone-legend">
              {zones.map((z) => (
                <li key={z}>
                  <i className={`zone-swatch zone-${z}`} />
                  {ZONE_LEGEND[z] ?? z}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="leader-cards">
          <LeaderCard title="득점" rows={leaders.data?.goals} stat={(p) => p.goals} unit="골" league={league} />
          <LeaderCard title="도움" rows={leaders.data?.assists} stat={(p) => p.assists} unit="도움" league={league} />
        </aside>
      </div>
    </>
  )
}

export function LeaderCard({
  title,
  rows,
  stat,
  unit,
  league,
  limit = 5,
  note,
}: {
  title: string
  rows: PlayerSeason[] | undefined
  stat: (p: PlayerSeason) => number | string
  unit: string
  league?: number
  limit?: number
  note?: string
}) {
  return (
    <section className="card leader-card">
      <div className="section-head">
        <h2>{title}</h2>
        {league && (
          <a className="more" href={`#/leaders/${league}`}>
            전체 기록 →
          </a>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
      {!rows && <p className="muted small">불러오는 중...</p>}
      {rows?.length === 0 && <p className="muted small">기록이 아직 없습니다.</p>}
      <ol className="leader-list">
        {rows?.slice(0, limit).map((p, i) => (
          <li key={p.id}>
            <span className="leader-rank">{i + 1}</span>
            <img className="logo" src={p.team.logo ?? ''} alt="" loading="lazy" />
            <a href={`#/player/${p.id}`} className="leader-name">
              {p.name}
              <span className="muted small">{p.team.name}</span>
            </a>
            <span className="leader-value">
              {stat(p)}
              <span className="muted small"> {unit}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
