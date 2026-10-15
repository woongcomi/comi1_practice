"""한 시즌의 K리그 순위표, 경기 목록, 경기별 상세(이벤트·라인업·기록)를 받아 저장한다.

실행: (backend/에서) .venv/Scripts/python -m app.collect_season --season 2024 --budget 60

무료 플랜은 하루 100회라 한 번에 다 받을 수 없다. 이미 받은 경기는 건너뛰므로
매일 실행하면 이어서 쌓인다 (GitHub Actions가 매일 실행). --budget 으로 이번 실행의
최대 요청 수를 정한다.

저장 위치: data/seasons/{season}/league_{id}.json  (순위표 + 경기 목록)
           data/seasons/{season}/matches/{fixture_id}.json  (경기 상세, 경기당 요청 1회)
"""

import argparse
import json
from pathlib import Path

from app.apifootball import BACKEND_DIR, ApiFootball, BudgetExhausted

SEASONS_DIR = BACKEND_DIR / "data" / "seasons"
LEAGUES = {292: "K리그1", 293: "K리그2"}
FINISHED = {"FT", "AET", "PEN"}


def _team(t: dict) -> dict:
    return {"id": t["id"], "name": t["name"]}


def trim_fixture(f: dict) -> dict:
    return {
        "id": f["fixture"]["id"],
        "date": f["fixture"]["date"],
        "round": f["league"]["round"],
        "status": f["fixture"]["status"]["short"],
        "venue": f["fixture"]["venue"]["name"],
        "referee": f["fixture"]["referee"],
        "home": _team(f["teams"]["home"]),
        "away": _team(f["teams"]["away"]),
        "goals": f["goals"],
    }


def trim_standings(response: list[dict]) -> list[dict]:
    if not response:
        return []

    def record(r: dict) -> dict:
        return {
            "played": r["played"],
            "win": r["win"],
            "draw": r["draw"],
            "lose": r["lose"],
            "gf": r["goals"]["for"],
            "ga": r["goals"]["against"],
        }

    return [
        {
            "group": group[0]["group"],
            "rows": [
                {
                    "rank": r["rank"],
                    "team": _team(r["team"]),
                    "points": r["points"],
                    "goal_diff": r["goalsDiff"],
                    "form": r["form"],
                    "description": r["description"],
                    "all": record(r["all"]),
                    "home": record(r["home"]),
                    "away": record(r["away"]),
                }
                for r in group
            ],
        }
        for group in response[0]["league"]["standings"]
    ]


# 선수 경기 기록: API의 중첩 구조 -> 평평한 키. 값이 없는(null) 항목은 저장하지 않는다.
PLAYER_STAT_KEYS = {
    "minutes": ("games", "minutes"),
    "rating": ("games", "rating"),
    "position": ("games", "position"),
    "substitute": ("games", "substitute"),
    "shots": ("shots", "total"),
    "shots_on": ("shots", "on"),
    "goals": ("goals", "total"),
    "assists": ("goals", "assists"),
    "conceded": ("goals", "conceded"),
    "saves": ("goals", "saves"),
    "passes": ("passes", "total"),
    "key_passes": ("passes", "key"),
    "passes_accurate": ("passes", "accuracy"),  # API 이름은 accuracy지만 실제로는 성공 횟수
    "tackles": ("tackles", "total"),
    "blocks": ("tackles", "blocks"),
    "interceptions": ("tackles", "interceptions"),
    "duels": ("duels", "total"),
    "duels_won": ("duels", "won"),
    "dribbles": ("dribbles", "attempts"),
    "dribbles_won": ("dribbles", "success"),
    "fouls_drawn": ("fouls", "drawn"),
    "fouls": ("fouls", "committed"),
    "yellow": ("cards", "yellow"),
    "red": ("cards", "red"),
}
NUMERIC_TEXT = {"rating", "passes_accurate"}


def flatten_player_stats(stats: dict) -> dict:
    out = {}
    for key, (group, field) in PLAYER_STAT_KEYS.items():
        value = (stats.get(group) or {}).get(field)
        if value is None:
            continue
        if key in NUMERIC_TEXT:
            value = float(value) if key == "rating" else int(value)
        out[key] = value
    return out


def trim_match(m: dict) -> dict:
    return {
        **trim_fixture(m),
        "halftime": m["score"]["halftime"],
        "events": [
            {
                "minute": e["time"]["elapsed"],
                "extra": e["time"]["extra"],
                "team_id": e["team"]["id"],
                "player_id": e["player"]["id"],
                "player": e["player"]["name"],
                "assist_id": e["assist"]["id"],
                "assist": e["assist"]["name"],
                "type": e["type"],
                "detail": e["detail"],
            }
            for e in m["events"]
        ],
        "lineups": [
            {
                "team_id": lu["team"]["id"],
                "formation": lu["formation"],
                "coach": (lu.get("coach") or {}).get("name"),
                "start": [
                    {k: p["player"][k] for k in ("id", "name", "number", "pos", "grid")}
                    for p in lu["startXI"]
                ],
                "subs": [
                    {k: p["player"][k] for k in ("id", "name", "number", "pos")}
                    for p in lu["substitutes"]
                ],
            }
            for lu in m["lineups"]
        ],
        "statistics": {
            str(s["team"]["id"]): {x["type"]: x["value"] for x in s["statistics"]}
            for s in m["statistics"]
        },
        "players": {
            str(t["team"]["id"]): [
                {
                    "id": p["player"]["id"],
                    "name": p["player"]["name"],
                    **flatten_player_stats(p["statistics"][0]),
                }
                for p in t["players"]
            ]
            for t in m["players"]
        },
    }


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")


def collect(api: ApiFootball, season: int) -> None:
    season_dir = SEASONS_DIR / str(season)
    leagues: dict[int, dict] = {}

    # 1) 리그별 순위표 + 경기 목록 (리그당 2회, 처음 한 번만)
    for league_id, name in LEAGUES.items():
        path = season_dir / f"league_{league_id}.json"
        if path.exists():
            leagues[league_id] = json.loads(path.read_text(encoding="utf-8"))
            continue
        standings = trim_standings(api.get("standings", league=league_id, season=season))
        fixtures = [trim_fixture(f) for f in api.get("fixtures", league=league_id, season=season)]
        fixtures.sort(key=lambda f: f["date"])
        leagues[league_id] = {
            "league_id": league_id,
            "name": name,
            "season": season,
            "standings": standings,
            "fixtures": fixtures,
        }
        write_json(path, leagues[league_id])
        print(f"{name} {season}: 순위표 {len(standings)}개 그룹, 경기 {len(fixtures)}개")

    # 2) 끝난 경기 중 아직 안 받은 것의 상세 (경기당 1회). K리그1부터.
    todo = [
        f["id"]
        for league_id in LEAGUES
        for f in leagues[league_id]["fixtures"]
        if f["status"] in FINISHED and not (season_dir / "matches" / f"{f['id']}.json").exists()
    ]
    print(f"받을 경기 {len(todo)}개")
    done = 0
    for fixture_id in todo:
        response = api.get("fixtures", id=fixture_id)
        if response:
            write_json(season_dir / "matches" / f"{fixture_id}.json", trim_match(response[0]))
            done += 1
    print(f"경기 {done}개 저장, 남은 경기 0개")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--budget", type=int, default=60, help="이번 실행의 최대 요청 수")
    args = parser.parse_args()
    with ApiFootball(budget=args.budget) as api:
        try:
            collect(api, args.season)
        except BudgetExhausted:
            print(f"요청 {api.used}회를 써서 이번 실행을 마칩니다. 다음 실행에서 이어 받습니다.")


if __name__ == "__main__":
    main()
