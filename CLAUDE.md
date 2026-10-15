# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 구조

React(Vite + TypeScript) 프론트엔드와 FastAPI 백엔드로 이루어진 모노레포. 배포 시에는 **하나의 컨테이너**로 합쳐진다.

- `frontend/`: Vite + React 19 + TypeScript
- `backend/`: FastAPI 앱. 진입점은 `app/main.py`의 `app`
- `Dockerfile`: 멀티 스테이지 빌드. 프론트엔드를 빌드해 `backend/static`으로 복사하고, uvicorn이 API와 정적 파일을 함께 제공한다. 포트는 `PORT` 환경 변수를 따른다 (기본 8000).

### 프론트엔드와 백엔드 연결 방식

- 모든 API 라우트는 `/api` 접두사가 붙은 `APIRouter`에 등록한다. `/`는 프로덕션에서 정적 프론트엔드가 쓰므로 API를 `/api` 밖에 두면 안 된다.
- 프론트엔드는 항상 상대 경로(`fetch('/api/...')`)로 호출한다. 개발 중에는 `vite.config.ts`의 프록시가 `/api`를 `localhost:8000`으로 넘기고, 프로덕션에서는 출처가 같으므로 CORS 설정이 필요 없다.
- `app/main.py`는 `backend/static`이 있을 때만 이를 마운트한다. 이 폴더는 Docker 빌드 중에만 생기며 gitignore 대상이다.

## 명령어

백엔드 (`backend/`에서 실행, Windows 가상환경 기준):

```sh
py -3.12 -m venv .venv                      # 최초 1회
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m uvicorn app.main:app --reload   # 개발 서버 :8000
.venv/Scripts/python -m pytest                          # 전체 테스트
.venv/Scripts/python -m pytest tests/test_health.py::test_health   # 단일 테스트
.venv/Scripts/ruff check .                  # 린트 (--fix로 자동 수정)
.venv/Scripts/ruff format .
```

프론트엔드 (`frontend/`에서 실행):

```sh
npm install
npm run dev      # :5173, /api는 백엔드로 프록시됨
npm run lint
npm run build    # tsc -b 타입 체크 + vite build -> dist/
```

개발할 때는 백엔드와 프론트엔드 개발 서버를 함께 띄운다.

배포 이미지: `docker build -t app . && docker run -p 8000:8000 app`

## 의존성

- 백엔드 런타임 의존성은 `requirements.txt`에, 개발 도구는 `requirements-dev.txt`에 둔다. Docker 이미지는 `requirements.txt`만 설치한다.
- ruff와 pytest 설정은 `backend/pyproject.toml`에 있다. 테스트는 `pythonpath = ["."]` 설정으로 `from app.main import app` 형태로 임포트한다.
