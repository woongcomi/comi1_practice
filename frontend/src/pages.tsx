import { useState } from 'react'
import { api, type TransferEvent } from './api'
import { KindTag, PlayerSearch, SeasonSelect, Status, TeamBadge } from './components'
import { useAsync } from './hooks'

type SeasonProps = {
  seasons: number[]
  season: number | null
  setSeason: (s: number | null) => void
}

export function HomePage({ seasons, season, setSeason }: SeasonProps) {
  const [kleagueOnly, setKleagueOnly] = useState(true)
  const teams = useAsync(() => api.teams(season), [season])
  const flows = useAsync(() => api.flows(season, kleagueOnly), [season, kleagueOnly])

  return (
    <>
      <section className="hero">
        <h1>K리그 선수 이적 추적</h1>
        <p className="muted">선수가 어느 팀에서 어느 팀으로 옮겼는지, 커리어 경로를 따라가 보세요.</p>
        <PlayerSearch autoFocus />
      </section>

      <div className="toolbar">
        <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />
      </div>

      <section>
        <h2>구단별 영입·방출</h2>
        <Status loading={teams.loading && !teams.data} error={teams.error} />
        <ul className="team-grid">
          {teams.data?.map((t) => (
            <li key={t.id}>
              <a className="team-card" href={`#/team/${t.id}`}>
                <img className="logo lg" src={t.logo ?? ''} alt="" loading="lazy" />
                <span className="team-name">{t.name}</span>
                <span className="counts">
                  <span className="in">영입 {t.incoming}</span>
                  <span className="out">방출 {t.outgoing}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="section-head">
          <h2>많이 오간 이동 경로</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={kleagueOnly}
              onChange={(e) => setKleagueOnly(e.target.checked)}
            />
            K리그 구단끼리만
          </label>
        </div>
        <Status loading={flows.loading && !flows.data} error={flows.error} />
        {flows.data?.length === 0 && <p className="muted">이 기간에는 기록이 없습니다.</p>}
        <ol className="flows">
          {flows.data?.map((f) => (
            <li key={`${f.from.id}-${f.from.name}-${f.to.id}-${f.to.name}`}>
              <details>
                <summary>
                  <TeamBadge team={f.from} size="sm" />
                  <span className="arrow" aria-label="에서">→</span>
                  <TeamBadge team={f.to} size="sm" />
                  <span className="flow-count">{f.count}명</span>
                </summary>
                <ul className="flow-players">
                  {f.players.map((p) => (
                    <li key={`${p.id}-${p.date}`}>
                      <a href={`#/player/${p.id}`}>{p.name}</a>
                      <span className="muted small">{p.date}</span>
                      <KindTag kind={p.kind} />
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

export function PlayerPage({ id }: { id: number }) {
  const { data, loading, error } = useAsync(() => api.player(id), [id])
  if (!data) return <Status loading={loading} error={error} />

  // 커리어 경로 요약: 첫 출발 팀 + 각 이적의 도착 팀
  const path = [data.transfers[0].from, ...data.transfers.map((t) => t.to)]

  return (
    <>
      <PlayerSearch />
      <section className="player-head">
        <h1>{data.name}</h1>
        <p className="muted">
          최근 소속: <TeamBadge team={data.latest_team} size="sm" /> · 기록된 이동{' '}
          {data.transfer_count}회
        </p>
      </section>

      <section>
        <h2>커리어 경로</h2>
        <div className="career-path">
          {path.map((team, i) => (
            <span key={i} className="path-step">
              {i > 0 && <span className="arrow">→</span>}
              <TeamBadge team={team} size="sm" />
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>이적 타임라인</h2>
        <ol className="timeline">
          {[...data.transfers].reverse().map((t) => (
            <li key={`${t.date}-${t.from.id}-${t.to.id}`}>
              <time dateTime={t.date}>{t.date}</time>
              <div className="timeline-body">
                <KindTag kind={t.kind} fee={t.fee} />
                <div className="move">
                  <TeamBadge team={t.from} />
                  <span className="arrow">→</span>
                  <TeamBadge team={t.to} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function TransferList({ title, events, dir }: { title: string; events: TransferEvent[]; dir: 'in' | 'out' }) {
  return (
    <section className="transfer-list">
      <h2>
        {title} <span className="muted">{events.length}</span>
      </h2>
      {events.length === 0 && <p className="muted">기록이 없습니다.</p>}
      <ul>
        {events.map((e) => (
          <li key={`${e.player.id}-${e.date}`}>
            <div className="row-main">
              <a className="player-name" href={`#/player/${e.player.id}`}>
                {e.player.name}
              </a>
              <KindTag kind={e.kind} fee={e.fee} />
            </div>
            <div className="row-sub">
              <span className="muted small">{e.date}</span>
              <span className="muted small">{dir === 'in' ? '←' : '→'}</span>
              <TeamBadge team={dir === 'in' ? e.from : e.to} size="sm" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TeamPage({ id, seasons, season, setSeason }: SeasonProps & { id: number }) {
  const { data, loading, error } = useAsync(() => api.team(id, season), [id, season])

  return (
    <>
      <div className="toolbar">
        <a href="#/" className="back">
          ← 전체 구단
        </a>
        <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />
      </div>
      {!data ? (
        <Status loading={loading} error={error} />
      ) : (
        <>
          <section className="team-head">
            {data.team.logo && <img className="logo xl" src={data.team.logo} alt="" />}
            <h1>{data.team.name}</h1>
          </section>
          <div className="two-col">
            <TransferList title="영입" events={data.incoming} dir="in" />
            <TransferList title="방출" events={data.outgoing} dir="out" />
          </div>
        </>
      )}
    </>
  )
}
