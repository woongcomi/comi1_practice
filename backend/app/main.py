from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from app.season import SeasonStore, get_season_store
from app.transfers import TransferStore, get_store

app = FastAPI(title="K리그 데이터 API")

# 모든 API 엔드포인트는 /api 아래에 둔다 (프론트엔드 라우트와 겹치지 않도록)
api = APIRouter(prefix="/api")

Store = Annotated[TransferStore, Depends(get_store)]
Seasons = Annotated[SeasonStore, Depends(get_season_store)]
Season = Annotated[int | None, Query(ge=1900, le=2100)]


def found(value, message: str = "찾을 수 없습니다"):
    if value is None:
        raise HTTPException(404, message)
    return value


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.get("/meta")
def meta(store: Store, seasons: Seasons) -> dict:
    return {
        "updated_at": store.updated_at,
        "seasons": store.seasons(),  # 이적 기록이 있는 해
        "player_count": len(store.players),
        "match_seasons": seasons.seasons(),  # 경기 기록이 있는 시즌과 수집 진행 상황
    }


# ---------- 선수 ----------


@api.get("/players")
def search_players(
    store: Store, seasons: Seasons, q: Annotated[str, Query(min_length=1)]
) -> list[dict]:
    results = {p["id"]: p for p in seasons.search_players(q)}
    results.update({p["id"]: p for p in store.search_players(q, limit=50)})  # 이적 정보 우선
    ranked = sorted(results.values(), key=lambda p: p["latest_date"], reverse=True)
    return ranked[:20]


@api.get("/players/{player_id}")
def player(store: Store, seasons: Seasons, player_id: int) -> dict:
    transfers = store.player(player_id)
    stats = seasons.player(player_id)
    found(transfers or stats, "선수를 찾을 수 없습니다")
    return {
        "id": player_id,
        "name": (transfers or stats)["name"],
        "latest_team": transfers["latest_team"] if transfers else None,
        "transfers": transfers["transfers"] if transfers else [],
        "seasons": stats["seasons"] if stats else [],
    }


# ---------- 이적 ----------


@api.get("/teams")
def teams(store: Store, season: Season = None) -> list[dict]:
    return store.teams(season)


@api.get("/teams/{team_id}/transfers")
def team_transfers(store: Store, team_id: int, season: Season = None) -> dict:
    return found(store.team(team_id, season), "K리그 구단이 아닙니다")


@api.get("/flows")
def flows(store: Store, season: Season = None, kleague_only: bool = False) -> list[dict]:
    return store.flows(season, kleague_only)


# ---------- 시즌 (순위, 경기, 팀 기록) ----------


@api.get("/seasons/{season}/leagues/{league_id}/standings")
def standings(seasons: Seasons, season: int, league_id: int) -> dict:
    return found(seasons.standings(season, league_id))


@api.get("/seasons/{season}/leagues/{league_id}/fixtures")
def fixtures(seasons: Seasons, season: int, league_id: int) -> dict:
    return found(seasons.fixtures(season, league_id))


@api.get("/seasons/{season}/leagues/{league_id}/leaders")
def leaders(seasons: Seasons, season: int, league_id: int) -> dict:
    found(seasons.league(season, league_id))
    return seasons.leaders(season, league_id)


@api.get("/seasons/{season}/teams/{team_id}")
def team_season(seasons: Seasons, season: int, team_id: int) -> dict:
    return found(seasons.team(season, team_id))


@api.get("/matches/{match_id}")
def match(seasons: Seasons, match_id: int) -> dict:
    return found(seasons.match(match_id), "경기 기록이 아직 없습니다")


app.include_router(api)

# 배포 시 빌드된 프론트엔드(frontend/dist)를 같은 서버에서 제공한다.
# 개발 중에는 이 폴더가 없으므로 마운트하지 않고 Vite 개발 서버를 사용한다.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
