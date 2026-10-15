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
}

export type TransferEvent = Transfer & { player: PlayerRef }

export type TeamSummary = TeamRef & { incoming: number; outgoing: number }

export type TeamTransfers = {
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

export type LeagueProgress = {
  id: number
  name: string
  matches_total: number
  matches_collected: number
}

export type Meta = {
  updated_at: string | null
  seasons: number[]
  player_count: number
  match_seasons: { season: number; leagues: LeagueProgress[] }[]
}

// ---------- 시즌 ----------

export type TeamRecord = { played: number; win: number; draw: number; lose: number; gf: number; ga: number }

export type StandingRow = {
  rank: number
  team: TeamRef
  points: number
  goal_diff: number
  form: string | null
  zone: { kind: string; label: string } | null
  split?: 'A' | 'B'
  all: TeamRecord
  home: TeamRecord
  away: TeamRecord
}

export type Standings = { name: string; rows: StandingRow[]; has_split: boolean }

export type Fixture = {
  id: number
  date: string
  round: string
  status: string
  venue: string
  home: TeamRef
  away: TeamRef
  goals: { home: number | null; away: number | null }
  has_detail: boolean
}

export type Result = 'W' | 'D' | 'L' | null

export type LineupPlayer = {
  id: number
  name: string
  number: number
  pos: string
  grid?: string | null
  minutes: number
  on: number | null
  off: number | null
  rating: number | null
}

export type Lineup = {
  formation: string | null
  coach: string | null
  start: LineupPlayer[]
  subs: LineupPlayer[]
}

export type MatchEvent = {
  minute: number
  extra: number | null
  side: 'home' | 'away' | null
  player_id: number | null
  player: string | null
  player_in: string | null
  assist: string | null
  type: string
  detail: string
}

export type PlayerMatchStats = {
  id: number
  name: string
  minutes?: number
  rating?: number
  position?: string
  shots?: number
  shots_on?: number
  goals?: number
  assists?: number
  passes?: number
  passes_accurate?: number
  key_passes?: number
  tackles?: number
  interceptions?: number
  duels?: number
  duels_won?: number
  dribbles?: number
  dribbles_won?: number
  saves?: number
}

export type Match = Fixture & {
  season: number
  league_id: number
  league_name: string
  referee: string | null
  halftime: { home: number | null; away: number | null }
  events: MatchEvent[]
  home_lineup: Lineup | null
  away_lineup: Lineup | null
  stats: { label: string; home: number | null; away: number | null }[] | null
  players: { home?: PlayerMatchStats[]; away?: PlayerMatchStats[] }
}

export type PlayerSeason = {
  id: number
  name: string
  team: TeamRef
  apps: number
  starts: number
  minutes: number
  goals: number
  assists: number
  yellow: number
  red: number
  detail_matches: number
  detail_minutes: number
  shots: number
  shots_on: number
  passes: number
  passes_accurate: number
  pass_accuracy: number | null
  key_passes: number
  tackles: number
  interceptions: number
  duels: number
  duels_won: number
  dribbles: number
  dribbles_won: number
  saves: number
  rating: number | null
}

export type Leaders = { [key in 'goals' | 'assists' | 'minutes' | 'shots' | 'key_passes' | 'tackles']: PlayerSeason[] }

export type StyleMetric = {
  key: string
  value: number | null
  league_avg: number | null
  league_min: number | null
  league_max: number | null
}

export type ClubSeason = {
  season: number
  league_id: number
  league_name: string
  team: TeamRef
  standing: StandingRow | null
  results: (Fixture & { result: Result })[]
  matches_collected: number
  matches_played: number
  formations: { formation: string; count: number }[]
  coaches: { name: string; count: number }[]
  goals_by_period: { for: number[]; against: number[] }
  style: { matches: number; metrics: StyleMetric[] }
  squad: PlayerSeason[]
}

export type PlayerMatchLog = {
  match_id: number
  date: string
  round: string
  home: boolean
  opponent: TeamRef
  score: string
  result: Result
  start: boolean
  minutes: number
  goals: number
  assists: number
  detail: PlayerMatchStats | null
}

export type PlayerDetail = {
  id: number
  name: string
  latest_team: TeamRef | null
  transfers: Transfer[]
  seasons: { season: number; summary: PlayerSeason; matches: PlayerMatchLog[] }[]
}

async function get<T>(path: string, params: { [k: string]: string | number | boolean | null } = {}) {
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
  teamTransfers: (id: number, season: number | null) =>
    get<TeamTransfers>(`/teams/${id}/transfers`, { season }),
  flows: (season: number | null, kleagueOnly: boolean) =>
    get<Flow[]>('/flows', { season, kleague_only: kleagueOnly }),
  standings: (season: number, league: number) =>
    get<Standings>(`/seasons/${season}/leagues/${league}/standings`),
  fixtures: (season: number, league: number) =>
    get<{ name: string; fixtures: Fixture[] }>(`/seasons/${season}/leagues/${league}/fixtures`),
  leaders: (season: number, league: number) =>
    get<Leaders>(`/seasons/${season}/leagues/${league}/leaders`),
  club: (season: number, id: number) => get<ClubSeason>(`/seasons/${season}/teams/${id}`),
  match: (id: number) => get<Match>(`/matches/${id}`),
}
