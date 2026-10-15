import { useState } from 'react'
import './App.css'
import { api } from './api'
import { useAsync, useHashRoute } from './hooks'
import { HomePage, PlayerPage, TeamPage } from './pages'

function App() {
  const route = useHashRoute()
  const meta = useAsync(() => api.meta(), [])
  const seasons = meta.data?.seasons ?? []
  // undefined = 사용자가 아직 고르지 않음. 그동안은 올해(없으면 가장 최근 해)를 보여준다
  const [chosenSeason, setSeason] = useState<number | null | undefined>(undefined)
  const thisYear = new Date().getFullYear()
  const defaultSeason = seasons.includes(thisYear) ? thisYear : (seasons[0] ?? null)
  const season = chosenSeason === undefined ? defaultSeason : chosenSeason

  const seasonProps = { seasons, season, setSeason }

  let page
  if (route[0] === 'player' && route[1]) page = <PlayerPage id={Number(route[1])} />
  else if (route[0] === 'team' && route[1]) page = <TeamPage id={Number(route[1])} {...seasonProps} />
  else page = <HomePage {...seasonProps} />

  return (
    <div className="app">
      <header className="site-header">
        <a href="#/" className="brand">
          K리그 이적 추적
        </a>
      </header>
      <main>{page}</main>
      <footer className="site-footer muted small">
        데이터: API-Football
        {meta.data?.updated_at && ` · 업데이트 ${meta.data.updated_at.slice(0, 10)}`}
        {' · '}일부 이적 기록은 누락되거나 날짜가 다를 수 있습니다.
      </footer>
    </div>
  )
}

export default App
