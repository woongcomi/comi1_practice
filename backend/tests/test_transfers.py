import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.transfers import TransferStore, classify, get_store

SEOUL, ULSAN, SANGMU = 2766, 2767, 2768
ABROAD = 999

RAW = {
    "updated_at": "2026-10-15T00:00:00+00:00",
    "players": {
        "1": {
            "name": "Song Min-Kyu",
            "transfers": [
                ["2026-08-29", "Transfer", SEOUL, "FC Seoul", ABROAD, "Nacional"],
                # 하루 차이로 중복 기록된 같은 이적
                ["2026-08-28", "N/A", SEOUL, "FC Seoul", ABROAD, "Nacional"],
                ["2024-01-10", "€ 2M", ULSAN, "Ulsan Hyundai FC", SEOUL, "FC Seoul"],
            ],
        },
        "3": {
            "name": "J. Lingard",
            "transfers": [
                ["2025-12-30", "Free agent", SEOUL, "FC Seoul", None, "Lingard Jesse"],
            ],
        },
        "2": {
            "name": "Kim Nam-Chun",
            "transfers": [
                ["2026-01-01", "Loan", SEOUL, "FC Seoul", SANGMU, "Gimcheon Sangmu FC"],
                ["2026-03-01", "Loan", ULSAN, "Ulsan Hyundai FC", SANGMU, "Gimcheon Sangmu"],
            ],
        },
    },
}


@pytest.fixture
def client():
    app.dependency_overrides[get_store] = lambda: TransferStore(RAW)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Loan", ("임대", None)),
        ("Back from Loan", ("임대 복귀", None)),
        ("Free agent", ("자유 이적", None)),
        ("€ 2.5M", ("이적", "€ 2.5M")),
        ("N/A", ("이동", None)),
        (None, ("이동", None)),
    ],
)
def test_classify(raw, expected) -> None:
    assert classify(raw) == expected


def test_player_timeline_is_sorted_and_deduplicated(client) -> None:
    res = client.get("/api/players/1")
    assert res.status_code == 200
    body = res.json()
    assert [t["date"] for t in body["transfers"]] == ["2024-01-10", "2026-08-28"]
    # 중복 중 날짜는 먼저 것, 유형은 더 구체적인 것을 쓴다
    assert body["transfers"][1]["kind"] == "이적"
    assert body["transfers"][0]["fee"] == "€ 2M"
    assert body["transfers"][0]["from"]["name"] == "울산 HD"
    assert body["latest_team"]["name"] == "Nacional"
    assert body["latest_team"]["kleague"] is False


def test_self_named_team_is_free_agent(client) -> None:
    t = client.get("/api/players/3").json()["transfers"][0]
    assert t["to"]["name"] == "무소속"
    assert t["kind"] == "계약 만료"


def test_search_ignores_case_hyphen_and_word_order(client) -> None:
    for q in ["song min-kyu", "minkyu SONG", "min kyu"]:
        assert [p["id"] for p in client.get("/api/players", params={"q": q}).json()] == [1]


def test_unknown_player_is_404(client) -> None:
    assert client.get("/api/players/12345").status_code == 404


def test_team_incoming_and_outgoing_by_season(client) -> None:
    body = client.get(f"/api/teams/{SEOUL}", params={"season": 2026}).json()
    assert [e["player"]["id"] for e in body["outgoing"]] == [1, 2]
    assert body["incoming"] == []


def test_flows_group_routes(client) -> None:
    flows = client.get("/api/flows", params={"season": 2026, "kleague_only": True}).json()
    assert [(f["from"]["id"], f["to"]["id"], f["count"]) for f in flows] == [
        (SEOUL, SANGMU, 1),
        (ULSAN, SANGMU, 1),
    ]
