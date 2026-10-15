"""data/transfers.json(API 원본)을 읽어 화면에서 쓰기 좋은 형태로 가공하고 조회한다."""

import json
import re
from collections import Counter, defaultdict
from datetime import date
from functools import cache
from pathlib import Path

from app.kleague import KLEAGUE_TEAMS, team_logo

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "transfers.json"

# API에 같은 이적이 날짜만 조금 다르게 두 번 들어있는 경우가 있어,
# 이 기간 안의 같은 경로는 하나로 본다
DUPLICATE_WINDOW_DAYS = 60

UNKNOWN_KIND = "이동"


def classify(type_raw: str | None) -> tuple[str, str | None]:
    """API의 자유 형식 type 값을 (유형, 이적료) 로 바꾼다."""
    t = (type_raw or "").strip()
    low = t.lower()
    if low == "loan":
        return "임대", None
    if low in {"return from loan", "back from loan", "end of loan", "loan end"}:
        return "임대 복귀", None
    if low in {"free", "free agent", "free transfer"}:
        return "자유 이적", None
    if low == "swap":
        return "트레이드", None
    if low == "transfer":
        return "이적", None
    if re.match(r"^[€$£]\s?[\d.,]+\s?[KkMm]?$", t):
        return "이적", t
    return UNKNOWN_KIND, None


FREE_AGENT = {"id": None, "name": "무소속", "logo": None, "kleague": False}


def _name_tokens(name: str) -> list[str]:
    return sorted(re.sub(r"[^a-z ]", " ", name.lower().replace("-", "")).split())


def is_free_agent_slot(team_id: int | None, team_name: str | None, type_raw, player: str) -> bool:
    """API는 무소속을 'ID 없는 팀 + 선수 본인 이름'으로 표시한다.
    (예: J. Lingard -> 'Lingard Jesse')"""
    if team_id is not None:
        return False
    if (type_raw or "").strip().lower() == "free agent":
        return True
    return bool(team_name) and _name_tokens(team_name) == _name_tokens(player)


def team_ref(team_id: int | None, api_name: str | None) -> dict:
    is_kleague = team_id in KLEAGUE_TEAMS
    return {
        "id": team_id,
        "name": KLEAGUE_TEAMS[team_id] if is_kleague else (api_name or "알 수 없음"),
        "logo": team_logo(team_id) if team_id else None,
        "kleague": is_kleague,
    }


def normalize_player_transfers(rows: list[list], player_name: str) -> list[dict]:
    """한 선수의 이적 기록을 날짜순으로 정리하고 중복을 없앤다."""
    kept: list[dict] = []
    for d, type_raw, out_id, out_name, in_id, in_name in sorted(rows, key=lambda r: r[0] or ""):
        if not d or (out_id is not None and out_id == in_id):
            continue
        kind, fee = classify(type_raw)
        from_ref = (
            FREE_AGENT
            if is_free_agent_slot(out_id, out_name, None, player_name)
            else team_ref(out_id, out_name)
        )
        if is_free_agent_slot(in_id, in_name, type_raw, player_name):
            to_ref, kind, fee = FREE_AGENT, "계약 만료", None
        else:
            to_ref = team_ref(in_id, in_name)
        prev = next(
            (k for k in reversed(kept) if k["from"]["id"] == out_id and k["to"]["id"] == in_id),
            None,
        )
        if prev and abs((date.fromisoformat(d) - date.fromisoformat(prev["date"])).days) <= (
            DUPLICATE_WINDOW_DAYS
        ):
            # 중복이면 더 구체적인 유형 정보만 살린다
            if prev["kind"] == UNKNOWN_KIND and kind != UNKNOWN_KIND:
                prev["kind"], prev["fee"] = kind, fee
            continue
        kept.append(
            {
                "date": d,
                "kind": kind,
                "fee": fee,
                "from": from_ref,
                "to": to_ref,
            }
        )
    return kept


def search_key(text: str) -> str:
    return re.sub(r"[\s\-.'’]", "", text).lower()


def search_tokens(q: str) -> list[str]:
    return [k for k in (search_key(t) for t in q.split()) if k]


class TransferStore:
    def __init__(self, raw: dict) -> None:
        self.updated_at: str | None = raw.get("updated_at")
        self.players: dict[int, dict] = {}
        self.events: list[dict] = []  # 모든 선수의 이적을 펼친 목록 (player 포함)
        for pid, p in raw.get("players", {}).items():
            transfers = normalize_player_transfers(p["transfers"], p["name"])
            if not transfers:
                continue
            player = {"id": int(pid), "name": p["name"]}
            self.players[int(pid)] = {
                **player,
                "search_key": search_key(p["name"]),
                "transfers": transfers,
            }
            self.events.extend({**t, "player": player} for t in transfers)

    @classmethod
    def from_file(cls, path: Path = DATA_FILE) -> "TransferStore":
        if not path.exists():
            return cls({})
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def seasons(self) -> list[int]:
        years = {int(e["date"][:4]) for e in self.events}
        return sorted((y for y in years if y >= 2010), reverse=True)

    def _summary(self, p: dict) -> dict:
        last = p["transfers"][-1]
        return {
            "id": p["id"],
            "name": p["name"],
            "latest_team": last["to"],
            "latest_date": last["date"],
            "transfer_count": len(p["transfers"]),
        }

    def search_players(self, q: str, limit: int = 20) -> list[dict]:
        tokens = search_tokens(q)
        if not tokens:
            return []
        hits = [p for p in self.players.values() if all(t in p["search_key"] for t in tokens)]
        hits.sort(key=lambda p: p["transfers"][-1]["date"], reverse=True)
        return [self._summary(p) for p in hits[:limit]]

    def player(self, player_id: int) -> dict | None:
        p = self.players.get(player_id)
        if not p:
            return None
        return {**self._summary(p), "transfers": p["transfers"]}

    def teams(self, season: int | None) -> list[dict]:
        incoming: Counter[int] = Counter()
        outgoing: Counter[int] = Counter()
        for e in self._in_season(season):
            incoming[e["to"]["id"]] += 1
            outgoing[e["from"]["id"]] += 1
        return [
            {**team_ref(tid, None), "incoming": incoming[tid], "outgoing": outgoing[tid]}
            for tid in KLEAGUE_TEAMS
        ]

    def team(self, team_id: int, season: int | None) -> dict | None:
        if team_id not in KLEAGUE_TEAMS:
            return None
        events = sorted(self._in_season(season), key=lambda e: e["date"], reverse=True)
        return {
            "team": team_ref(team_id, None),
            "incoming": [e for e in events if e["to"]["id"] == team_id],
            "outgoing": [e for e in events if e["from"]["id"] == team_id],
        }

    def flows(self, season: int | None, kleague_only: bool, limit: int = 20) -> list[dict]:
        """구단 A -> 구단 B 이동을 경로별로 묶어 많은 순으로 돌려준다."""
        groups: dict[tuple, list[dict]] = defaultdict(list)
        for e in self._in_season(season):
            both = e["from"]["kleague"] and e["to"]["kleague"]
            either = e["from"]["kleague"] or e["to"]["kleague"]
            if (kleague_only and not both) or not either:
                continue
            groups[(e["from"]["id"], e["from"]["name"], e["to"]["id"], e["to"]["name"])].append(e)
        ranked = sorted(groups.values(), key=len, reverse=True)[:limit]
        return [
            {
                "from": g[0]["from"],
                "to": g[0]["to"],
                "count": len(g),
                "players": [{**e["player"], "date": e["date"], "kind": e["kind"]} for e in g],
            }
            for g in ranked
        ]

    def _in_season(self, season: int | None) -> list[dict]:
        if season is None:
            return self.events
        prefix = str(season)
        return [e for e in self.events if e["date"].startswith(prefix)]


@cache
def get_store() -> TransferStore:
    return TransferStore.from_file()
