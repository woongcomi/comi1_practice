from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="App API")

# 모든 API 엔드포인트는 /api 아래에 둔다 (프론트엔드 라우트와 겹치지 않도록)
api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api)

# 배포 시 빌드된 프론트엔드(frontend/dist)를 같은 서버에서 제공한다.
# 개발 중에는 이 폴더가 없으므로 마운트하지 않고 Vite 개발 서버를 사용한다.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
