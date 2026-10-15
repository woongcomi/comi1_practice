import type React from 'react'
import { useEffect, useState } from 'react'
import { api, type PlayerSummary, type TeamRef } from './api'

export function TeamBadge({ team, size = 'md' }: { team: TeamRef; size?: 'sm' | 'md' }) {
  const body = (
    <>
      {team.logo ? (
        <img className="logo" src={team.logo} alt="" loading="lazy" />
      ) : (
        <span className="logo logo-empty" />
      )}
      <span className="team-name">{team.name}</span>
    </>
  )
  const cls = `team-badge ${size} ${team.kleague ? 'is-kleague' : ''}`
  return team.kleague && team.id ? (
    <a className={cls} href={`#/club/${team.id}`}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  )
}

const KIND_CLASS: Record<string, string> = {
  이적: 'kind-transfer',
  임대: 'kind-loan',
  '임대 복귀': 'kind-return',
  '자유 이적': 'kind-free',
  트레이드: 'kind-transfer',
}

export function KindTag({ kind, fee }: { kind: string; fee?: string | null }) {
  return (
    <span className={`kind ${KIND_CLASS[kind] ?? 'kind-unknown'}`}>
      {kind}
      {fee ? ` · ${fee}` : ''}
    </span>
  )
}

export function SeasonSelect({
  seasons,
  value,
  onChange,
}: {
  seasons: number[]
  value: number | null
  onChange: (season: number | null) => void
}) {
  return (
    <select
      className="season-select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      aria-label="시즌"
    >
      <option value="">전체 기간</option>
      {seasons.map((s) => (
        <option key={s} value={s}>
          {s}년
        </option>
      ))}
    </select>
  )
}

export function PlayerSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlayerSummary[] | null>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults(null)
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      api
        .searchPlayers(query)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q])

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="선수 영문 이름 검색 (예: Song Min-Kyu)"
        autoFocus={autoFocus}
        aria-label="선수 검색"
      />
      {results && (
        <ul className="search-results">
          {results.length === 0 && <li className="muted">검색 결과가 없습니다</li>}
          {results.map((p) => (
            <li key={p.id}>
              <a href={`#/player/${p.id}`} onClick={() => setQ('')}>
                <span className="player-name">{p.name}</span>
                <span className="muted small">
                  최근: {p.latest_team.name} ({p.latest_date.slice(0, 4)})
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Status({ loading, error }: { loading: boolean; error: boolean }) {
  if (error) return <p className="muted">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
  if (loading) return <p className="muted">불러오는 중...</p>
  return null
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="tabs">
      {items.map((t) => (
        <a key={t.key} href={t.href} className={t.key === active ? 'active' : ''} aria-current={t.key === active ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
      {sub && <span className="stat-tile-sub">{sub}</span>}
    </div>
  )
}

/** 데이터가 일부 경기에만 있을 때 붙이는 안내 */
export function CoverageNote({ matches, total, what = '세부 기록' }: { matches: number; total?: number; what?: string }) {
  return (
    <p className="coverage-note">
      ⓘ {what}은 데이터 제공처가 일부 경기만 기록해 <strong>{matches}경기</strong>
      {total ? ` (전체 ${total}경기 중)` : ''} 기준입니다.
    </p>
  )
}
