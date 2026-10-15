import { api, type PlayerDetail } from '../api'
import { FormChips } from '../charts'
import { CoverageNote, KindTag, PlayerSearch, StatTile, Status, TeamBadge } from '../components'
import { fmtDate } from '../format'
import { useAsync } from '../hooks'

export function PlayerPage({ id }: { id: number }) {
  const { data, loading, error } = useAsync(() => api.player(id), [id])
  if (!data) return <Status loading={loading} error={error} />
  const season = data.seasons[0]
  const team = data.latest_team ?? season?.summary.team

  return (
    <>
      <PlayerSearch />
      <section className="player-head">
        <h1>{data.name}</h1>
        {team && (
          <p className="muted">
            {data.latest_team ? '최근 소속' : `${season.season} 소속`}: <TeamBadge team={team} size="sm" />
          </p>
        )}
      </section>

      {season && <SeasonStats season={season} />}
      {data.transfers.length > 0 && <TransferHistory transfers={data.transfers} />}
      {!season && <p className="coverage-note">ⓘ 수집된 시즌 경기 기록이 없는 선수입니다. 이적 기록만 보여줍니다.</p>}
    </>
  )
}

function SeasonStats({ season }: { season: PlayerDetail['seasons'][number] }) {
  const s = season.summary
  const per90 = (v: number) => (s.detail_minutes ? ((90 * v) / s.detail_minutes).toFixed(1) : '–')
  return (
    <>
      <section>
        <h2>{season.season} 시즌</h2>
        <div className="tile-row">
          <StatTile label="출전" value={`${s.apps}경기`} sub={`선발 ${s.starts}`} />
          <StatTile label="출전 시간" value={`${s.minutes.toLocaleString()}분`} />
          <StatTile label="골" value={s.goals} />
          <StatTile label="도움" value={s.assists} />
          <StatTile label="경고 / 퇴장" value={`${s.yellow} / ${s.red}`} />
        </div>
      </section>

      {s.detail_matches > 0 && (
        <section>
          <h2>
            세부 기록{' '}
            <span className="muted small">
              {s.detail_matches}경기 · {s.detail_minutes.toLocaleString()}분 기준
            </span>
          </h2>
          <div className="tile-row">
            <StatTile label="평균 평점" value={s.rating?.toFixed(2) ?? '–'} />
            <StatTile label="슈팅" value={s.shots} sub={`유효 ${s.shots_on} · 90분당 ${per90(s.shots)}`} />
            <StatTile
              label="패스 성공률"
              value={s.pass_accuracy !== null ? `${s.pass_accuracy}%` : '–'}
              sub={`${s.passes_accurate}/${s.passes}`}
            />
            <StatTile label="키패스" value={s.key_passes} sub={`90분당 ${per90(s.key_passes)}`} />
            <StatTile label="태클 / 인터셉트" value={`${s.tackles} / ${s.interceptions}`} />
            <StatTile
              label="경합 승률"
              value={s.duels ? `${Math.round((100 * s.duels_won) / s.duels)}%` : '–'}
              sub={`${s.duels_won}/${s.duels}`}
            />
            {s.saves > 0 && <StatTile label="선방" value={s.saves} />}
          </div>
          <CoverageNote matches={s.detail_matches} total={s.apps} />
        </section>
      )}

      <section className="card">
        <h2>경기별 기록</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>상대</th>
                <th className="num">결과</th>
                <th className="num">시간</th>
                <th className="num">골</th>
                <th className="num">도움</th>
                <th className="num hide-sm">슈팅</th>
                <th className="num hide-sm">패스</th>
                <th className="num">평점</th>
              </tr>
            </thead>
            <tbody>
              {[...season.matches].reverse().map((m) => (
                <tr key={m.match_id}>
                  <td className="nowrap">
                    <a href={`#/match/${m.match_id}`}>{fmtDate(m.date)}</a>
                  </td>
                  <td>
                    <span className="muted small">{m.home ? '홈' : '원정'} </span>
                    <TeamBadge team={m.opponent} size="sm" />
                  </td>
                  <td className="num nowrap">
                    {m.result && <FormChips results={[m.result]} />} {m.score}
                  </td>
                  <td className="num">
                    {m.minutes}'{!m.start && <span className="muted small"> 교체</span>}
                  </td>
                  <td className="num strong">{m.goals || ''}</td>
                  <td className="num">{m.assists || ''}</td>
                  <td className="num hide-sm">{m.detail?.shots ?? (m.detail ? 0 : '–')}</td>
                  <td className="num hide-sm">
                    {m.detail ? `${m.detail.passes_accurate ?? 0}/${m.detail.passes ?? 0}` : '–'}
                  </td>
                  <td className="num">{m.detail?.rating?.toFixed(1) ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function TransferHistory({ transfers }: { transfers: PlayerDetail['transfers'] }) {
  const path = [transfers[0].from, ...transfers.map((t) => t.to)]
  return (
    <>
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
          {[...transfers].reverse().map((t) => (
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
