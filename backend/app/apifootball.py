"""API-Football 호출 공통 코드. 수집 스크립트들(collect, collect_season)이 함께 쓴다."""

import os
import sys
import time
from pathlib import Path

import httpx

BASE_URL = "https://v3.football.api-sports.io"
BACKEND_DIR = Path(__file__).resolve().parent.parent

# 무료 플랜은 분당 10회 제한이 있으므로 요청 사이에 여유를 둔다
REQUEST_INTERVAL_SEC = 7


class BudgetExhausted(Exception):
    """이번 실행에 허용한 요청 수를 다 썼다."""


def load_api_key() -> str:
    key = os.environ.get("API_FOOTBALL_KEY")
    env_file = BACKEND_DIR / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("API_FOOTBALL_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    if not key:
        sys.exit("API_FOOTBALL_KEY가 없습니다 (환경 변수 또는 backend/.env)")
    return key


class ApiFootball:
    def __init__(self, budget: int | None = None) -> None:
        self.budget = budget
        self.used = 0
        self._last_call = 0.0
        self._client = httpx.Client(
            base_url=BASE_URL, headers={"x-apisports-key": load_api_key()}, timeout=30
        )

    def __enter__(self) -> "ApiFootball":
        return self

    def __exit__(self, *exc) -> None:
        self._client.close()

    def get(self, endpoint: str, **params) -> list[dict]:
        for _ in range(3):
            if self.budget is not None and self.used >= self.budget:
                raise BudgetExhausted
            wait = REQUEST_INTERVAL_SEC - (time.monotonic() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
            self.used += 1
            res = self._client.get(f"/{endpoint}", params=params)
            res.raise_for_status()
            body = res.json()
            errors = body.get("errors")
            if not errors:
                return body["response"]
            if "rateLimit" in errors:
                time.sleep(61)
                continue
            if "requests" in errors:  # 하루 한도 초과
                raise BudgetExhausted
            raise RuntimeError(f"{endpoint} {params}: {errors}")
        raise RuntimeError(f"{endpoint} {params}: rate limit 재시도 초과")
