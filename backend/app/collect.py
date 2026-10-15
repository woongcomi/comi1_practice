"""API-Football에서 K리그 구단들의 이적 기록을 받아 data/transfers.json에 저장한다.

실행: (backend/에서) .venv/Scripts/python -m app.collect
API 키는 환경 변수 API_FOOTBALL_KEY 또는 backend/.env 에서 읽는다.

저장하는 것은 API 원본을 선수 단위로 합친 것뿐이고, 유형 분류·중복 제거 같은 가공은
app/transfers.py 가 읽을 때 한다. 가공 규칙을 바꿔도 다시 수집할 필요가 없다.
"""

import json
from datetime import UTC, datetime

from app.apifootball import BACKEND_DIR, ApiFootball
from app.kleague import KLEAGUE_TEAMS

DATA_FILE = BACKEND_DIR / "data" / "transfers.json"


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
    responses = []
    with ApiFootball() as api:
        for i, (team_id, name) in enumerate(KLEAGUE_TEAMS.items(), 1):
            response = api.get("transfers", team=team_id)
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
