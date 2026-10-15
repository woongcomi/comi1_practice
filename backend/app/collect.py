"""API-Football에서 K리그 구단들의 이적 기록을 받아 data/transfers.json에 저장한다.

실행: (backend/에서) .venv/Scripts/python -m app.collect
API 키는 환경 변수 API_FOOTBALL_KEY 또는 backend/.env 에서 읽는다.

저장하는 것은 API 원본을 선수 단위로 합친 것뿐이고, 유형 분류·중복 제거 같은 가공은
app/transfers.py 가 읽을 때 한다. 가공 규칙을 바꿔도 다시 수집할 필요가 없다.
"""

import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.kleague import KLEAGUE_TEAMS

BASE_URL = "https://v3.football.api-sports.io"
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BACKEND_DIR / "data" / "transfers.json"

# 무료 플랜은 분당 10회 제한이 있으므로 요청 사이에 여유를 둔다
REQUEST_INTERVAL_SEC = 7


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


def fetch_team_transfers(client: httpx.Client, team_id: int) -> list[dict]:
    for _ in range(3):
        res = client.get("/transfers", params={"team": team_id})
        res.raise_for_status()
        body = res.json()
        errors = body.get("errors")
        if not errors:
            return body["response"]
        if "rateLimit" in errors:
            time.sleep(61)
            continue
        raise RuntimeError(f"team {team_id}: {errors}")
    raise RuntimeError(f"team {team_id}: rate limit 재시도 초과")


def merge_players(responses: list[list[dict]]) -> dict[str, dict]:
    """여러 구단 응답에 같은 선수가 중복으로 나오므로 선수 ID로 합친다."""
    players: dict[str, dict] = {}
    for response in responses:
        for item in response:
            pid = str(item["player"]["id"])
            entry = players.setdefault(pid, {"name": item["player"]["name"], "transfers": []})
            for t in item["transfers"]:
                row = [
                    t["date"],
                    t["type"],
                    t["teams"]["out"]["id"],
                    t["teams"]["out"]["name"],
                    t["teams"]["in"]["id"],
                    t["teams"]["in"]["name"],
                ]
                if row not in entry["transfers"]:
                    entry["transfers"].append(row)
    return players


def main() -> None:
    key = load_api_key()
    responses = []
    with httpx.Client(base_url=BASE_URL, headers={"x-apisports-key": key}, timeout=30) as client:
        for i, (team_id, name) in enumerate(KLEAGUE_TEAMS.items(), 1):
            if i > 1:
                time.sleep(REQUEST_INTERVAL_SEC)
            response = fetch_team_transfers(client, team_id)
            responses.append(response)
            print(f"[{i}/{len(KLEAGUE_TEAMS)}] {name}: 선수 {len(response)}명")

    players = merge_players(responses)
    if DATA_FILE.exists():
        # 내용이 같으면 파일을 그대로 둔다 (updated_at은 '데이터가 마지막으로 바뀐 시각')
        if json.loads(DATA_FILE.read_text(encoding="utf-8"))["players"] == players:
            print(f"변경 없음: 선수 {len(players)}명")
            return
    DATA_FILE.parent.mkdir(exist_ok=True)
    data = {
        "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "players": players,
    }
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"저장 완료: 선수 {len(players)}명 -> {DATA_FILE}")


if __name__ == "__main__":
    main()
