from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from app.transfers import TransferStore, get_store

app = FastAPI(title="K리그 이적 추적 API")

# 모든 API 엔드포인트는 /api 아래에 둔다 (프론트엔드 라우트와 겹치지 않도록)
api = APIRouter(prefix="/api")

Store = Annotated[TransferStore, Depends(get_store)]
Season = Annotated[int | None, Query(ge=1900, le=2100)]


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.get("/meta")
def meta(store: Store) -> dict:
    return {
        "updated_at": store.updated_at,
        "seasons": store.seasons(),
        "player_count": len(store.players),
    }


@api.get("/players")
def search_players(store: Store, q: Annotated[str, Query(min_length=1)]) -> list[dict]:
    return store.search_players(q)


@api.get("/players/{player_id}")
def player(store: Store, player_id: int) -> dict:
    result = store.player(player_id)
    if result is None:
        raise HTTPException(404, "선수를 찾을 수 없습니다")
    return result


@api.get("/teams")
def teams(store: Store, season: Season = None) -> list[dict]:
    return store.teams(season)


@api.get("/teams/{team_id}")
def team(store: Store, team_id: int, season: Season = None) -> dict:
    result = store.team(team_id, season)
    if result is None:
        raise HTTPException(404, "K리그 구단이 아닙니다")
    return result


@api.get("/flows")
def flows(store: Store, season: Season = None, kleague_only: bool = False) -> list[dict]:
    return store.flows(season, kleague_only)


app.include_router(api)

# 배포 시 빌드된 프론트엔드(frontend/dist)를 같은 서버에서 제공한다.
# 개발 중에는 이 폴더가 없으므로 마운트하지 않고 Vite 개발 서버를 사용한다.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
