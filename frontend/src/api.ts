export type TeamRef = {
  id: number | null
  name: string
  logo: string | null
  kleague: boolean
}

export type Transfer = {
  date: string
  kind: string
  fee: string | null
  from: TeamRef
  to: TeamRef
}

export type PlayerRef = { id: number; name: string }

export type PlayerSummary = PlayerRef & {
  latest_team: TeamRef
  latest_date: string
  transfer_count: number
}

export type PlayerDetail = PlayerSummary & { transfers: Transfer[] }

export type TransferEvent = Transfer & { player: PlayerRef }

export type TeamSummary = TeamRef & { incoming: number; outgoing: number }

export type TeamDetail = {
  team: TeamRef
  incoming: TransferEvent[]
  outgoing: TransferEvent[]
}

export type Flow = {
  from: TeamRef
  to: TeamRef
  count: number
  players: (PlayerRef & { date: string; kind: string })[]
}

export type Meta = {
  updated_at: string | null
  seasons: number[]
  player_count: number
}

async function get<T>(path: string, params: Record<string, string | number | boolean | null> = {}) {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null) query.set(k, String(v))
  const qs = query.toString()
  const res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()) as T
}

export const api = {
  meta: () => get<Meta>('/meta'),
  searchPlayers: (q: string) => get<PlayerSummary[]>('/players', { q }),
  player: (id: number) => get<PlayerDetail>(`/players/${id}`),
  teams: (season: number | null) => get<TeamSummary[]>('/teams', { season }),
  team: (id: number, season: number | null) => get<TeamDetail>(`/teams/${id}`, { season }),
  flows: (season: number | null, kleagueOnly: boolean) =>
    get<Flow[]>('/flows', { season, kleague_only: kleagueOnly }),
}
