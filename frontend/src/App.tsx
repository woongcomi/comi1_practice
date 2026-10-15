import { useState } from 'react'
import './App.css'
import './pages.css'
import { api } from './api'
import { useAsync, useHashRoute } from './hooks'
import { ClubPage } from './pages/Club'
import { LeadersPage } from './pages/Leaders'
import { MatchPage } from './pages/Match'
import { MatchesPage } from './pages/Matches'
import { PlayerPage } from './pages/Player'
import { StandingsPage } from './pages/Standings'
import { TransfersPage } from './pages/Transfers'

const NAV = [
  { key: 'standings', label: '순위', href: '#/standings/292' },
  { key: 'matches', label: '경기', href: '#/matches/292' },
  { key: 'leaders', label: '기록', href: '#/leaders/292' },
  { key: 'transfers', label: '이적', href: '#/transfers' },
]

function App() {
  const route = useHashRoute()
  const meta = useAsync(() => api.meta(), [])

  // 이적 기록의 시즌 선택. undefined = 아직 고르지 않음 -> 올해(없으면 가장 최근 해)
  const seasons = meta.data?.seasons ?? []
  const [chosenSeason, setSeason] = useState<number | null | undefined>(undefined)
  const thisYear = new Date().getFullYear()
  const defaultSeason = seasons.includes(thisYear) ? thisYear : (seasons[0] ?? null)
  const transferSeason = {
    seasons,
    season: chosenSeason === undefined ? defaultSeason : chosenSeason,
    setSeason,
  }

  // 경기 기록이 있는 가장 최근 시즌
  const matchSeason = meta.data?.match_seasons[0]
  const progress = matchSeason?.leagues.reduce(
    (acc, l) => ({ done: acc.done + l.matches_collected, total: acc.total + l.matches_total }),
    { done: 0, total: 0 },
  )

  const [section = 'standings', a, b] = route
  const league = Number(a) || 292
  let page = null
  if (!meta.data) page = null
  else if (section === 'transfers') page = <TransfersPage {...transferSeason} />
  else if (section === 'player' && a) page = <PlayerPage id={Number(a)} />
  else if (!matchSeason) page = <TransfersPage {...transferSeason} />
  else if (section === 'club' && a)
    page = (
      <ClubPage
        id={Number(a)}
        tab={b ?? 'season'}
        matchSeason={matchSeason.season}
        transferSeason={transferSeason}
      />
    )
  else if (section === 'match' && a) page = <MatchPage id={Number(a)} />
  else if (section === 'matches')
    page = (
      <MatchesPage season={matchSeason.season} league={league} round={b ? decodeURIComponent(b) : null} />
    )
  else if (section === 'leaders') page = <LeadersPage season={matchSeason.season} league={league} />
  else page = <StandingsPage season={matchSeason.season} league={league} />

  const activeNav = section === 'match' ? 'matches' : section

  return (
    <div className="app">
      <header className="site-header">
        <a href="#/" className="brand">
          K리그 데이터
        </a>
        <nav className="main-nav">
          {NAV.map((n) => (
            <a key={n.key} href={n.href} className={activeNav === n.key ? 'active' : ''}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      {matchSeason && progress && section !== 'transfers' && (
        <p className="data-banner">
          <b>{matchSeason.season} 시즌</b> 기록입니다. 무료 데이터로 볼 수 있는 가장 최근 시즌이에요.
          {progress.done < progress.total && (
            <span className="muted">
              {' '}
              · 경기 상세 {progress.done}/{progress.total} 수집됨 (매일 자동 추가)
            </span>
          )}
        </p>
      )}

      <main>{meta.error ? <p className="muted">데이터를 불러오지 못했습니다.</p> : page}</main>

      <footer className="site-footer muted small">
        데이터: API-Football
        {meta.data?.updated_at && ` · 이적 업데이트 ${meta.data.updated_at.slice(0, 10)}`}
        {' · '}일부 기록은 누락되거나 실제와 다를 수 있습니다.
      </footer>
    </div>
  )
}

export default App
