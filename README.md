# React + FastAPI

React(Vite) 프론트엔드와 FastAPI 백엔드로 구성된 웹 앱.

## 로컬 개발

```sh
# 터미널 1: 백엔드
cd backend
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m uvicorn app.main:app --reload

# 터미널 2: 프론트엔드
cd frontend
npm install
npm run dev
```

http://localhost:5173 에 접속한다.

## 배포

루트의 `Dockerfile`이 프론트엔드를 빌드하고, FastAPI가 API(`/api/*`)와 프론트엔드를 하나의 서버에서 함께 제공한다. Render, Railway, Fly.io, Google Cloud Run처럼 Dockerfile을 지원하는 플랫폼에 그대로 배포할 수 있으며, 포트는 `PORT` 환경 변수를 따른다.
