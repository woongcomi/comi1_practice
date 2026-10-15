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

## K리그 이적 추적 (현재 기능)

데이터는 DB 없이 **저장소에 커밋된 JSON 파일**(`backend/data/transfers.json`)에 있다. Render 무료 플랜 디스크는 재배포 때 초기화되므로 이 방식을 쓴다.

- `app/collect.py`: API-Football `/transfers?team=`를 `app/kleague.py`의 구단마다 호출해 선수 ID 기준으로 합쳐 저장한다. **원본에 가까운 형태로만 저장**하고 가공하지 않는다. 선수 데이터가 같으면 파일을 건드리지 않는다.
- `app/transfers.py`: 앱 시작 후 첫 요청 때 JSON을 읽어(`get_store`, 캐시됨) 유형 분류(`classify`), 날짜순 정렬, 중복 제거(같은 경로가 60일 안에 두 번이면 하나로)를 한다. 가공 규칙을 바꿀 때는 다시 수집할 필요가 없다.
- `app/kleague.py`: K리그 구단 ID → 한글 이름. 이 목록에 있는 팀만 `kleague: true`가 되고 한글 이름과 구단 페이지를 갖는다. 새 구단이 생기면 여기에 추가한다.
- 갱신: `.github/workflows/collect-transfers.yml`이 매주 수집해서 변경이 있으면 커밋하고, Render가 재배포한다. GitHub secret `API_FOOTBALL_KEY`가 필요하다.
- 프론트엔드 라우팅은 해시 기반(`#/player/:id`, `#/team/:id`)이다(`hooks.ts`의 `useHashRoute`). 서버 쪽 라우팅 설정 없이 링크를 공유할 수 있게 하려는 것이다.
- 테스트는 `app.dependency_overrides[get_store]`로 가짜 데이터를 주입한다(`tests/test_transfers.py`).

## 시즌 기록 (순위, 경기, 팀·선수 기록)

- `app/collect_season.py`: 시즌마다 `data/seasons/{season}/league_{id}.json`(순위표 + 경기 목록)과 `matches/{fixture_id}.json`(경기 상세)을 저장한다. 경기 상세는 `fixtures?id=` **한 번의 요청**으로 이벤트·라인업·팀 기록·선수 기록을 모두 받는다. 이미 받은 경기는 건너뛰므로 `--budget`만큼씩 매일 이어 받으면 된다(`.github/workflows/collect-season.yml`, 하루 60회).
- `app/season.py`의 `SeasonStore`가 집계한다. **출전·출전 시간·골·도움·카드는 라인업과 이벤트에서 직접 계산**한다. 이 둘은 모든 경기에 있다. 슈팅·패스 같은 세부 기록(경기 파일의 `players`)과 팀 기록(`statistics`)은 일부 경기에만 있으므로, 응답에 항상 몇 경기 기준인지(`detail_matches`, `style.matches`)를 함께 담고 화면에 안내를 붙인다.
- API 데이터의 특이점:
  - 교체 이벤트는 `player` = 나간 선수, `assist` = 들어간 선수다.
  - K리그1 순위표는 Championship/Relegation/Regular 세 그룹으로 오고, 파이널B 순위는 1부터 매겨져 있어서 +6 한다.
  - 같은 선수 이름이 라인업과 이벤트에서 다르게 표기된다(Park Jin-Seop / Jin-seob Park). 그래서 선수는 항상 ID로 묶고, 검색은 `aliases` 전체를 대상으로 한다.
  - 선수 경기 기록의 `passes.accuracy`는 성공률이 아니라 성공 횟수다(`passes_accurate`로 저장).
  - 자책골 이벤트의 `team`이 어느 팀을 가리키는지는 아직 확인하지 않았다. `team()`의 시간대별 득·실점에 영향을 준다.
- 그래프 색은 `index.css`의 `--series-home`/`--series-away`(dataviz 검증 통과)만 쓰고, 글자는 본문 색을 쓴다.

### API-Football 무료 플랜 제약 (직접 확인함)

- 하루 100회, 분당 10회. 수집기는 요청 사이에 7초씩 쉬고, rate limit에 걸리면 61초 뒤 재시도한다.
- 시즌 단위 엔드포인트(fixtures, teams, players)는 **2022~2024 시즌만** 조회된다. `/transfers`는 시즌 제한이 없어 최신 이적까지 나온다.
- `fixtures?ids=` 일괄 조회는 막혀 있다.
- K리그1 경기별 선수 기록(`fixtures/players`)은 2024 시즌의 일부 경기(대략 8월 이후)에만 있다. 선수 기록 기능을 만들려면 유료 플랜으로 범위를 다시 확인해야 한다.
- 선수 이름은 영문뿐이다. 이적 `type`은 "N/A", "Loan", "€ 2M" 같은 자유 형식이라 `classify`로 정리한다.

## 명령어

백엔드 (`backend/`에서 실행, Windows 가상환경 기준):

```sh
py -3.12 -m venv .venv                      # 최초 1회
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m uvicorn app.main:app --reload   # 개발 서버 :8000
.venv/Scripts/python -m pytest                          # 전체 테스트
.venv/Scripts/python -m pytest tests/test_health.py::test_health   # 단일 테스트
.venv/Scripts/python -m app.collect         # 이적 데이터 수집 (약 4분, API 약 30회 사용; 키는 backend/.env)
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
