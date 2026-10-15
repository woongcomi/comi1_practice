import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.season import SeasonStore, get_season_store
from app.transfers import TransferStore, get_store

ULSAN, SEOUL = 2767, 2766


def standing_row(rank, team_id, name, points, description=None):
    rec = {"played": 38, "win": 0, "draw": 0, "lose": 0, "gf": 0, "ga": 0}
    return {
        "rank": rank,
        "team": {"id": team_id, "name": name},
        "points": points,
        "goal_diff": 0,
        "form": "WWDLW",
        "description": description,
        "all": rec,
        "home": rec,
        "away": rec,
    }


FIXTURE = {
    "id": 1,
    "date": "2024-03-01T05:00:00+00:00",
    "round": "Regular Season - 1",
    "status": "FT",
    "venue": "Munsu",
    "referee": "Kim",
    "home": {"id": ULSAN, "name": "Ulsan Hyundai FC"},
    "away": {"id": SEOUL, "name": "FC Seoul"},
    "goals": {"home": 2, "away": 0},
}

LEAGUE = {
    "league_id": 292,
    "name": "K리그1",
    "season": 2024,
    "standings": [
        {
            "group": "K League 1: Championship Round",
            "rows": [standing_row(1, ULSAN, "Ulsan", 72, "AFC Champions League Elite")],
        },
        {
            "group": "K League 1: Relegation Round",
            "rows": [standing_row(1, SEOUL, "Seoul", 40, "Relegation")],
        },
        {"group": "K League 1: Regular Season", "rows": []},
    ],
    "fixtures": [
        FIXTURE,
        {**FIXTURE, "id": 2, "status": "NS", "goals": {"home": None, "away": None}},
    ],
}


def ev(minute, team, pid, name, type_, detail, assist_id=None, assist=None):
    return {
        "minute": minute,
        "extra": None,
        "team_id": team,
        "player_id": pid,
        "player": name,
        "assist_id": assist_id,
        "assist": assist,
        "type": type_,
        "detail": detail,
    }


def lineup(team, formation, start, subs=()):
    return {
        "team_id": team,
        "formation": formation,
        "coach": "Coach",
        "start": [
            {"id": i, "name": n, "number": i, "pos": "F", "grid": f"{k + 1}:1"}
            for k, (i, n) in enumerate(start)
        ],
        "subs": [{"id": i, "name": n, "number": i, "pos": "M"} for i, n in subs],
    }


MATCH = {
    **FIXTURE,
    "halftime": {"home": 1, "away": 0},
    "events": [
        ev(10, ULSAN, 11, "Joo Min-Kyu", "Goal", "Normal Goal", 12, "Lee Dong-Gyeong"),
        # 교체: player = 나간 선수, assist = 들어간 선수
        ev(60, ULSAN, 11, "Joo Min-Kyu", "subst", "Substitution 1", 13, "Yago"),
        ev(70, ULSAN, 13, "Yago", "Goal", "Penalty"),
        ev(75, SEOUL, 21, "Jesse Lingard", "Card", "Red Card"),
        ev(80, SEOUL, 22, "Ki Sung-Yueng", "Goal", "Missed Penalty"),
    ],
    "lineups": [
        lineup(ULSAN, "4-4-2", [(11, "Joo Min-Kyu"), (12, "Lee Dong-Gyeong")], [(13, "Yago")]),
        lineup(SEOUL, "4-3-3", [(21, "J. Lingard"), (22, "Ki Sung-Yueng")]),
    ],
    "statistics": {
        str(ULSAN): {"Ball Possession": "60%", "Total Shots": 12},
        str(SEOUL): {"Ball Possession": "40%", "Total Shots": 5},
    },
    "players": {
        str(ULSAN): [
            {"id": 12, "name": "Lee Dong-Gyeong", "minutes": 90, "shots": 3, "rating": 8.0}
        ]
    },
}


@pytest.fixture
def client(tmp_path):
    season_dir = tmp_path / "2024"
    (season_dir / "matches").mkdir(parents=True)
    (season_dir / "league_292.json").write_text(json.dumps(LEAGUE), encoding="utf-8")
    (season_dir / "matches" / "1.json").write_text(json.dumps(MATCH), encoding="utf-8")
    app.dependency_overrides[get_season_store] = lambda: SeasonStore(tmp_path)
    app.dependency_overrides[get_store] = lambda: TransferStore({})
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_meta_reports_collection_progress(client) -> None:
    league = client.get("/api/meta").json()["match_seasons"][0]["leagues"][0]
    assert (league["matches_total"], league["matches_collected"]) == (1, 1)


def test_final_split_ranks_continue_into_group_b(client) -> None:
    rows = client.get("/api/seasons/2024/leagues/292/standings").json()["rows"]
    assert [(r["rank"], r["team"]["name"], r["split"]) for r in rows] == [
        (1, "울산 HD", "A"),
        (2, "FC서울", "B"),
    ]
    assert rows[0]["zone"] == {"kind": "acl", "label": "ACL 엘리트"}


def test_minutes_from_substitution_and_red_card(client) -> None:
    m = client.get("/api/matches/1").json()
    home = {p["id"]: p for p in m["home_lineup"]["start"] + m["home_lineup"]["subs"]}
    assert (home[11]["minutes"], home[11]["off"]) == (60, 60)
    assert (home[13]["minutes"], home[13]["on"]) == (30, 60)
    away = {p["id"]: p for p in m["away_lineup"]["start"]}
    assert away[21]["minutes"] == 75
    sub = next(e for e in m["events"] if e["type"] == "subst")
    assert (sub["player"], sub["player_in"]) == ("Joo Min-Kyu", "Yago")


def test_season_totals_count_goals_assists_but_not_missed_penalty(client) -> None:
    leaders = client.get("/api/seasons/2024/leagues/292/leaders").json()
    assert {(p["name"], p["goals"]) for p in leaders["goals"]} == {
        ("Joo Min-Kyu", 1),
        ("Yago", 1),
    }
    assert [(p["id"], p["assists"]) for p in leaders["assists"]] == [(12, 1)]
    assert [(p["id"], p["shots"], p["detail_matches"]) for p in leaders["shots"]] == [(12, 3, 1)]


def test_team_season_summary(client) -> None:
    t = client.get(f"/api/seasons/2024/teams/{ULSAN}").json()
    assert t["standing"]["rank"] == 1
    assert t["formations"] == [{"formation": "4-4-2", "count": 1}]
    assert t["goals_by_period"]["for"] == [1, 0, 0, 0, 1, 0]
    possession = next(x for x in t["style"]["metrics"] if x["key"] == "possession")
    assert (possession["value"], possession["league_avg"]) == (60.0, 50.0)
    assert [r["result"] for r in t["results"]] == ["W", None]


def test_player_page_combines_seasons_and_finds_alias(client) -> None:
    p = client.get("/api/players/21").json()
    assert p["transfers"] == []
    log = p["seasons"][0]["matches"][0]
    assert (log["minutes"], log["result"], log["opponent"]["name"]) == (75, "L", "울산 HD")
    # 라인업 표기(J. Lingard)와 이벤트 표기(Jesse Lingard) 모두로 검색된다
    assert [x["id"] for x in client.get("/api/players", params={"q": "jesse"}).json()] == [21]


def test_match_without_detail_is_404(client) -> None:
    assert client.get("/api/matches/2").status_code == 404
