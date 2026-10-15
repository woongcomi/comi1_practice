"""data/seasons/ 의 시즌 데이터(순위표, 경기 목록, 경기 상세)를 읽어 집계한다.

선수 출전·출전 시간·골·도움·카드는 라인업과 이벤트에서 직접 계산한다. 이 둘은 모든 경기에
들어 있어 시즌 전체가 정확하다. 반면 슈팅·패스 같은 세부 기록(API의 players 항목)은 일부
경기에만 있으므로 항상 "몇 경기 기준인지"를 함께 돌려준다.
"""

import json
from collections import Counter, defaultdict
from functools import cache
from pathlib import Path

from app.kleague import KLEAGUE_TEAMS, team_logo
from app.transfers import search_key, search_tokens

SEASONS_DIR = Path(__file__).resolve().parent.parent / "data" / "seasons"
FINISHED = {"FT", "AET", "PEN"}
FULL_TIME = 90

# 세부 기록 중 합산하는 항목 (collect_season.PLAYER_STAT_KEYS 의 이름)
DETAIL_SUM_KEYS = [
    "shots",
    "shots_on",
    "passes",
    "passes_accurate",
    "key_passes",
    "tackles",
    "interceptions",
    "duels",
    "duels_won",
    "dribbles",
    "dribbles_won",
    "fouls",
    "fouls_drawn",
    "saves",
]

# 팀 경기 기록 중 스타일 비교에 쓰는 항목: (API 이름, 우리 키)
TEAM_STYLE_KEYS = [
    ("Ball Possession", "possession"),
    ("Total Shots", "shots"),
    ("Shots on Goal", "shots_on"),
    ("Shots insidebox", "shots_inside"),
    ("Total passes", "passes"),
    ("Passes %", "pass_accuracy"),
    ("Corner Kicks", "corners"),
    ("Fouls", "fouls"),
]

ZONES = {
    "AFC Champions League Elite": ("acl", "ACL 엘리트"),
    "AFC Champions League Elite Qualifiers": ("acl", "ACL 엘리트 PO"),
    "AFC Champions League 2": ("acl", "ACL2"),
    "Relegation Play-off": ("playoff", "승강 PO"),
    "Relegation": ("relegation", "강등"),
    "Promotion": ("promotion", "승격"),
    "Promotion Play-off": ("playoff", "승강 PO"),
    "Next Round": ("next", "PO 진출"),
}


def team_ref(team: dict) -> dict:
    tid = team["id"]
    return {
        "id": tid,
        "name": KLEAGUE_TEAMS.get(tid, team["name"]),
        "logo": team_logo(tid),
        "kleague": tid in KLEAGUE_TEAMS,
    }


def _num(value) -> float | None:
    """'57%' 같은 문자열도 숫자로 바꾼다."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.rstrip("%")
        try:
            return float(value)
        except ValueError:
            return None
    return float(value)


def is_goal(e: dict) -> bool:
    return e["type"] == "Goal" and e["detail"] != "Missed Penalty"


def player_minutes(match: dict) -> dict[int, dict]:
    """라인업 + 교체/퇴장 이벤트로 선수별 출전 정보를 만든다.

    API의 교체 이벤트는 player = 나간 선수, assist = 들어간 선수다.
    """
    info: dict[int, dict] = {}
    for lu in match["lineups"]:
        for p in lu["start"]:
            if p["id"]:
                info[p["id"]] = {"team_id": lu["team_id"], "start": True, "on": 0, "off": FULL_TIME}
    for e in sorted(match["events"], key=lambda e: e["minute"] or 0):
        minute = min(e["minute"] or 0, FULL_TIME)
        if e["type"] == "subst":
            if e["player_id"] in info:
                info[e["player_id"]]["off"] = minute
            if e["assist_id"]:
                info[e["assist_id"]] = {
                    "team_id": e["team_id"],
                    "start": False,
                    "on": minute,
                    "off": FULL_TIME,
                }
        elif e["type"] == "Card" and e["detail"] in {"Red Card", "Second Yellow card"}:
            if e["player_id"] in info:
                info[e["player_id"]]["off"] = minute
    for p in info.values():
        p["minutes"] = max(p["off"] - p["on"], 0)
    return info


def _zone(description: str | None) -> dict | None:
    if not description or description not in ZONES:
        return None
    kind, label = ZONES[description]
    return {"kind": kind, "label": label}


def _row(r: dict, rank: int) -> dict:
    return {**r, "rank": rank, "team": team_ref(r["team"]), "zone": _zone(r["description"])}


class SeasonStore:
    def __init__(self, seasons_dir: Path = SEASONS_DIR) -> None:
        # (season, league_id) -> league 파일 내용
        self.leagues: dict[tuple[int, int], dict] = {}
        self.matches: dict[int, dict] = {}
        self.match_league: dict[int, tuple[int, int]] = {}
        self._player_cache: dict[tuple[int, int], dict] = {}
        if not seasons_dir.exists():
            return
        for season_dir in sorted(seasons_dir.iterdir()):
            season = int(season_dir.name)
            for path in season_dir.glob("league_*.json"):
                league = json.loads(path.read_text(encoding="utf-8"))
                self.leagues[(season, league["league_id"])] = league
                for f in league["fixtures"]:
                    self.match_league[f["id"]] = (season, league["league_id"])
            for path in (season_dir / "matches").glob("*.json"):
                m = json.loads(path.read_text(encoding="utf-8"))
                self.matches[m["id"]] = m

    # ---------- 목록 / 순위 ----------

    def seasons(self) -> list[dict]:
        out: dict[int, list] = defaultdict(list)
        for (season, league_id), league in sorted(self.leagues.items()):
            finished = [f for f in league["fixtures"] if f["status"] in FINISHED]
            out[season].append(
                {
                    "id": league_id,
                    "name": league["name"],
                    "matches_total": len(finished),
                    "matches_collected": sum(f["id"] in self.matches for f in finished),
                }
            )
        return [{"season": s, "leagues": ls} for s, ls in sorted(out.items(), reverse=True)]

    def league(self, season: int, league_id: int) -> dict | None:
        return self.leagues.get((season, league_id))

    def standings(self, season: int, league_id: int) -> dict | None:
        league = self.league(season, league_id)
        if not league:
            return None
        groups = {g["group"]: g["rows"] for g in league["standings"]}
        champ = next((rows for name, rows in groups.items() if "Championship" in name), None)
        releg = next((rows for name, rows in groups.items() if "Relegation" in name), None)
        if champ and releg:
            # 파이널 라운드가 있는 리그: 파이널A 1~6위, 파이널B는 7위부터 이어서 매긴다
            final = [{**_row(r, r["rank"]), "split": "A"} for r in champ] + [
                {**_row(r, r["rank"] + len(champ)), "split": "B"} for r in releg
            ]
        else:
            final = [_row(r, r["rank"]) for r in next(iter(groups.values()), [])]
        return {"name": league["name"], "rows": final, "has_split": bool(champ and releg)}

    def fixtures(self, season: int, league_id: int) -> dict | None:
        league = self.league(season, league_id)
        if not league:
            return None
        return {
            "name": league["name"],
            "fixtures": [self._fixture_summary(f) for f in league["fixtures"]],
        }

    def _fixture_summary(self, f: dict) -> dict:
        return {
            "id": f["id"],
            "date": f["date"],
            "round": f["round"],
            "status": f["status"],
            "venue": f["venue"],
            "home": team_ref(f["home"]),
            "away": team_ref(f["away"]),
            "goals": f["goals"],
            "has_detail": f["id"] in self.matches,
        }

    # ---------- 경기 상세 ----------

    def match(self, match_id: int) -> dict | None:
        m = self.matches.get(match_id)
        if not m:
            return None
        season, league_id = self.match_league.get(match_id, (None, None))
        minutes = player_minutes(m)
        detail_by_player = {p["id"]: p for ps in m["players"].values() for p in ps}
        teams = {m["home"]["id"]: "home", m["away"]["id"]: "away"}

        def lineup(side: str) -> dict | None:
            team_id = m[side]["id"]
            lu = next((x for x in m["lineups"] if x["team_id"] == team_id), None)
            if not lu:
                return None

            def player(p: dict) -> dict:
                mins = minutes.get(p["id"])
                return {
                    **p,
                    "minutes": mins["minutes"] if mins else 0,
                    "on": mins["on"] if mins and not mins["start"] else None,
                    "off": mins["off"] if mins and mins["off"] < FULL_TIME else None,
                    "rating": detail_by_player.get(p["id"], {}).get("rating"),
                }

            return {
                "formation": lu["formation"],
                "coach": lu["coach"],
                "start": [player(p) for p in lu["start"]],
                "subs": [player(p) for p in lu["subs"]],
            }

        stats = None
        if m["statistics"]:
            stats = [
                {
                    "label": label,
                    "home": _num(m["statistics"].get(str(m["home"]["id"]), {}).get(label)),
                    "away": _num(m["statistics"].get(str(m["away"]["id"]), {}).get(label)),
                }
                for label in [
                    "Ball Possession",
                    "Total Shots",
                    "Shots on Goal",
                    "Shots insidebox",
                    "Total passes",
                    "Passes %",
                    "Corner Kicks",
                    "Fouls",
                    "Offsides",
                    "Goalkeeper Saves",
                    "Yellow Cards",
                ]
            ]

        return {
            **self._fixture_summary(m),
            "season": season,
            "league_id": league_id,
            "league_name": self.leagues[(season, league_id)]["name"] if season else None,
            "referee": m["referee"],
            "halftime": m["halftime"],
            "events": [
                {
                    **e,
                    "side": teams.get(e["team_id"]),
                    # 교체는 assist가 들어간 선수라 이름을 알기 쉽게 바꿔 준다
                    "player_in": e["assist"] if e["type"] == "subst" else None,
                    "assist": None if e["type"] == "subst" else e["assist"],
                }
                for e in m["events"]
            ],
            "home_lineup": lineup("home"),
            "away_lineup": lineup("away"),
            "stats": stats,
            "players": {
                teams[int(tid)]: ps for tid, ps in m["players"].items() if int(tid) in teams
            },
        }

    # ---------- 선수 집계 ----------

    def _season_matches(self, season: int, league_id: int | None = None) -> list[dict]:
        return [
            m
            for mid, m in self.matches.items()
            if self.match_league.get(mid, (None,))[0] == season
            and (league_id is None or self.match_league[mid][1] == league_id)
        ]

    def player_season_table(self, season: int, league_id: int | None = None) -> dict[int, dict]:
        """선수별 시즌 누적. 기본 기록(출전/시간/골/도움/카드)은 전 경기, 세부 기록은 일부 경기."""
        key = (season, league_id or 0)
        if key in self._player_cache:
            return self._player_cache[key]

        table: dict[int, dict] = {}

        def row(pid: int, name: str, team_id: int) -> dict:
            r = table.setdefault(
                pid,
                {
                    "id": pid,
                    "name": name,
                    "team_id": team_id,
                    "apps": 0,
                    "starts": 0,
                    "minutes": 0,
                    "goals": 0,
                    "assists": 0,
                    "yellow": 0,
                    "red": 0,
                    "detail_matches": 0,
                    "detail_minutes": 0,
                    "rating_sum": 0.0,
                    "rating_count": 0,
                    **{k: 0 for k in DETAIL_SUM_KEYS},
                    "aliases": [],
                },
            )
            r["team_id"] = team_id  # 시즌 중 이적하면 마지막 팀
            # 같은 선수가 라인업/이벤트에서 다르게 표기된다 (Park Jin-Seop / Jin-seob Park)
            if name not in r["aliases"]:
                r["aliases"].append(name)
            return r

        for m in sorted(self._season_matches(season, league_id), key=lambda m: m["date"]):
            names = {p["id"]: p["name"] for lu in m["lineups"] for p in lu["start"] + lu["subs"]}
            for pid, info in player_minutes(m).items():
                r = row(pid, names.get(pid, "?"), info["team_id"])
                r["apps"] += 1
                r["starts"] += info["start"]
                r["minutes"] += info["minutes"]
            for e in m["events"]:
                if is_goal(e) and e["detail"] != "Own Goal" and e["player_id"]:
                    row(e["player_id"], e["player"], e["team_id"])["goals"] += 1
                    if e["assist_id"]:
                        row(e["assist_id"], e["assist"], e["team_id"])["assists"] += 1
                elif e["type"] == "Card" and e["player_id"]:
                    r = row(e["player_id"], e["player"], e["team_id"])
                    if e["detail"] == "Yellow Card":
                        r["yellow"] += 1
                    else:
                        r["red"] += 1
            for tid, ps in m["players"].items():
                for p in ps:
                    if not p.get("minutes"):
                        continue
                    r = row(p["id"], p["name"], int(tid))
                    r["detail_matches"] += 1
                    r["detail_minutes"] += p["minutes"]
                    if p.get("rating"):
                        r["rating_sum"] += p["rating"]
                        r["rating_count"] += 1
                    for k in DETAIL_SUM_KEYS:
                        r[k] += p.get(k, 0)

        for r in table.values():
            r["rating"] = (
                round(r["rating_sum"] / r["rating_count"], 2) if r["rating_count"] else None
            )
            r["pass_accuracy"] = (
                round(100 * r["passes_accurate"] / r["passes"]) if r["passes"] else None
            )
            del r["rating_sum"], r["rating_count"]
        self._player_cache[key] = table
        return table

    def leaders(self, season: int, league_id: int, limit: int = 10) -> dict:
        table = list(self.player_season_table(season, league_id).values())

        def top(key: str, min_detail: int = 0) -> list[dict]:
            rows = [r for r in table if r[key] and r["detail_matches"] >= min_detail]
            rows.sort(key=lambda r: (r[key], -r["minutes"]), reverse=True)
            return [self._player_row(r) for r in rows[:limit]]

        return {
            "goals": top("goals"),
            "assists": top("assists"),
            "minutes": top("minutes"),
            "shots": top("shots"),
            "key_passes": top("key_passes"),
            "tackles": top("tackles"),
        }

    def _player_row(self, r: dict) -> dict:
        return {**r, "team": team_ref({"id": r["team_id"], "name": ""})}

    def player(self, player_id: int) -> dict | None:
        """선수의 시즌별 기록과 경기별 기록."""
        seasons = []
        for season in sorted({s for s, _ in self.leagues}, reverse=True):
            r = self.player_season_table(season).get(player_id)
            if not r:
                continue
            log = []
            for m in sorted(self._season_matches(season), key=lambda m: m["date"]):
                info = player_minutes(m).get(player_id)
                if not info:
                    continue
                detail = next(
                    (p for ps in m["players"].values() for p in ps if p["id"] == player_id), {}
                )
                is_home = info["team_id"] == m["home"]["id"]
                opponent = m["away"] if is_home else m["home"]
                log.append(
                    {
                        "match_id": m["id"],
                        "date": m["date"],
                        "round": m["round"],
                        "home": is_home,
                        "opponent": team_ref(opponent),
                        "score": f"{m['goals']['home']}-{m['goals']['away']}",
                        "result": _result(m, info["team_id"]),
                        "start": info["start"],
                        "minutes": info["minutes"],
                        "goals": sum(
                            1
                            for e in m["events"]
                            if is_goal(e)
                            and e["detail"] != "Own Goal"
                            and e["player_id"] == player_id
                        ),
                        "assists": sum(
                            1 for e in m["events"] if is_goal(e) and e["assist_id"] == player_id
                        ),
                        "detail": detail or None,
                    }
                )
            seasons.append({"season": season, "summary": self._player_row(r), "matches": log})
        if not seasons:
            return None
        return {"id": player_id, "name": seasons[0]["summary"]["name"], "seasons": seasons}

    def search_players(self, q: str) -> list[dict]:
        """이적 데이터에 없는 선수도 찾을 수 있도록 경기 기록의 선수도 검색한다."""
        tokens = search_tokens(q)
        out: dict[int, dict] = {}
        for season in sorted({s for s, _ in self.leagues}, reverse=True):
            for r in self.player_season_table(season).values():
                keys = [search_key(n) for n in r["aliases"]]
                if r["id"] not in out and tokens and any(all(t in k for t in tokens) for k in keys):
                    out[r["id"]] = {
                        "id": r["id"],
                        "name": r["name"],
                        "latest_team": self._player_row(r)["team"],
                        "latest_date": str(season),
                    }
        return list(out.values())

    # ---------- 팀 ----------

    def team(self, season: int, team_id: int) -> dict | None:
        league_id = next(
            (
                lid
                for (s, lid), lg in self.leagues.items()
                if s == season
                and any(team_id in (f["home"]["id"], f["away"]["id"]) for f in lg["fixtures"])
            ),
            None,
        )
        if league_id is None:
            return None
        league = self.leagues[(season, league_id)]
        standing = next(
            (r for r in self.standings(season, league_id)["rows"] if r["team"]["id"] == team_id),
            None,
        )
        fixtures = [f for f in league["fixtures"] if team_id in (f["home"]["id"], f["away"]["id"])]
        played = [f for f in fixtures if f["status"] in FINISHED]

        # 포메이션: 라인업은 모든 경기에 있다
        formations: Counter[str] = Counter()
        coaches: Counter[str] = Counter()
        goals_for_by_period = [0] * 6
        goals_against_by_period = [0] * 6
        for f in played:
            m = self.matches.get(f["id"])
            if not m:
                continue
            for lu in m["lineups"]:
                if lu["team_id"] == team_id:
                    if lu["formation"]:
                        formations[lu["formation"]] += 1
                    if lu["coach"]:
                        coaches[lu["coach"]] += 1
            for e in m["events"]:
                if not is_goal(e):
                    continue
                period = min((e["minute"] or 1) - 1, 89) // 15
                if e["team_id"] == team_id:
                    goals_for_by_period[period] += 1
                else:
                    goals_against_by_period[period] += 1

        squad = sorted(
            (
                self._player_row(r)
                for r in self.player_season_table(season, league_id).values()
                if r["team_id"] == team_id
            ),
            key=lambda r: r["minutes"],
            reverse=True,
        )

        return {
            "season": season,
            "league_id": league_id,
            "league_name": league["name"],
            "team": team_ref({"id": team_id, "name": ""}),
            "standing": standing,
            "results": [
                {**self._fixture_summary(f), "result": _result(f, team_id)} for f in fixtures
            ],
            "matches_collected": sum(f["id"] in self.matches for f in played),
            "matches_played": len(played),
            "formations": [{"formation": k, "count": v} for k, v in formations.most_common()],
            "coaches": [{"name": k, "count": v} for k, v in coaches.most_common()],
            "goals_by_period": {
                "for": goals_for_by_period,
                "against": goals_against_by_period,
            },
            "style": self.team_style(season, league_id, team_id),
            "squad": squad,
        }

    def team_style(self, season: int, league_id: int, team_id: int) -> dict:
        """팀 경기 기록 평균을 리그 평균, 리그 최소/최대와 함께 돌려준다 (기록 있는 경기만)."""
        per_team: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        for m in self._season_matches(season, league_id):
            for tid, stats in m["statistics"].items():
                for api_key, key in TEAM_STYLE_KEYS:
                    v = _num(stats.get(api_key))
                    if v is not None:
                        per_team[int(tid)][key].append(v)

        def avg(values: list[float]) -> float | None:
            return round(sum(values) / len(values), 1) if values else None

        metrics = []
        for _, key in TEAM_STYLE_KEYS:
            team_avgs = [avg(v[key]) for v in per_team.values() if v[key]]
            metrics.append(
                {
                    "key": key,
                    "value": avg(per_team[team_id][key]) if team_id in per_team else None,
                    "league_avg": avg(team_avgs),
                    "league_min": min(team_avgs) if team_avgs else None,
                    "league_max": max(team_avgs) if team_avgs else None,
                }
            )
        sample = len(per_team[team_id]["possession"]) if team_id in per_team else 0
        return {"matches": sample, "metrics": metrics}


def _result(f: dict, team_id: int) -> str | None:
    if f["status"] not in FINISHED or f["goals"]["home"] is None:
        return None
    mine, theirs = (
        (f["goals"]["home"], f["goals"]["away"])
        if f["home"]["id"] == team_id
        else (f["goals"]["away"], f["goals"]["home"])
    )
    return "W" if mine > theirs else "D" if mine == theirs else "L"


@cache
def get_season_store() -> SeasonStore:
    return SeasonStore()
