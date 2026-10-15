import { api } from '../api'
import { Status } from '../components'
import { useAsync } from '../hooks'
import { LeaderCard, LeagueTabs } from './Standings'

const DETAIL_NOTE = 'ⓘ 데이터 제공처가 일부 경기만 기록한 항목이라 실제보다 적게 나옵니다.'

export function LeadersPage({ season, league }: { season: number; league: number }) {
  const { data, loading, error } = useAsync(() => api.leaders(season, league), [season, league])
  return (
    <>
      <div className="page-head">
        <h1>{season} 선수 기록</h1>
        <LeagueTabs base="leaders" league={league} />
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <>
          <h2 className="group-title">전 경기 기준</h2>
          <div className="leader-grid">
            <LeaderCard title="득점" rows={data.goals} stat={(p) => p.goals} unit="골" limit={10} />
            <LeaderCard title="도움" rows={data.assists} stat={(p) => p.assists} unit="도움" limit={10} />
            <LeaderCard
              title="출전 시간"
              rows={data.minutes}
              stat={(p) => p.minutes.toLocaleString()}
              unit="분"
              limit={10}
            />
          </div>
          <h2 className="group-title">세부 기록 (일부 경기)</h2>
          <div className="leader-grid">
            <LeaderCard title="슈팅" rows={data.shots} stat={(p) => p.shots} unit="회" limit={10} note={DETAIL_NOTE} />
            <LeaderCard
              title="키패스"
              rows={data.key_passes}
              stat={(p) => p.key_passes}
              unit="회"
              limit={10}
              note={DETAIL_NOTE}
            />
            <LeaderCard title="태클" rows={data.tackles} stat={(p) => p.tackles} unit="회" limit={10} note={DETAIL_NOTE} />
          </div>
        </>
      )}
    </>
  )
}
