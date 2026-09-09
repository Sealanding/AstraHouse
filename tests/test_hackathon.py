import copy

import pytest

from app.hackathon.engine import SEEDS, Engine, Store


@pytest.fixture
def engine(tmp_path):
    return Engine(Store(str(tmp_path / "matches.db")))


def create(engine):
    return engine.create("Useful everyday AI tools", "demo", copy.deepcopy(SEEDS))


def test_initial_context_is_persisted_and_separate_from_game_memory(engine):
    match = create(engine)
    restored = engine.store.get(match["id"])
    person = restored["people"][0]
    assert person["memories"] == []
    entries = person["context_memory"]
    assert entries[0]["content"] == person["bio"]
    assert entries[0]["kind"] == "background"
    assert entries[1]["kind"] == "inference"
    prompt = engine.context(restored, person, "research", "")
    assert prompt["background_context"] == entries
    assert prompt["memories"] == []
    assert engine.view(restored)["people"][0]["context_memory"] == entries


@pytest.mark.asyncio
async def test_complete_match_and_replay(engine):
    m = create(engine)
    sequence = [
        "research",
        "build",
        "test",
        "pitch",
        "submit",
    ]
    for r, action in enumerate(sequence):
        view = await engine.round(m["id"], r, action, "Language learning", f"receipt-{r}")
        assert view["round"] == r + 1
        assert "artifacts" in view["people"][1]
        assert "memories" in view["people"][1]
    result = await engine.judge(m["id"])
    assert result["status"] == "finished"
    assert len(result["cards"]) == 5
    assert len(result["leaderboard"]) == 4
    assert all(len(c["scores"]) == 4 for c in result["cards"])
    assert len(result["events"]) == 20
    assert result["people"][0]["submission"]["round"] == 5
    restored = engine.store.get(m["id"])
    assert len(engine.view(restored, 3)["events"]) == 12
    assert engine.view(restored, 0)["people"][0]["artifacts"] == []
    # Judging is idempotent and replay does not invoke models.
    assert await engine.judge(m["id"]) == result
    assert not restored["calls"]


@pytest.mark.asyncio
async def test_action_prerequisites_and_duplicate_requests(engine):
    m = create(engine)
    with pytest.raises(ValueError):
        await engine.round(m["id"], 0, "submit", "", "invalid-request")
    one = await engine.round(m["id"], 0, "research", "", "same-receipt")
    two = await engine.round(m["id"], 0, "research", "", "same-receipt")
    assert one == two
    with pytest.raises(ValueError):
        await engine.round(m["id"], 0, "research", "", "another-receipt")
    assert engine.store.get(m["id"])["round"] == 1


@pytest.mark.asyncio
async def test_submission_frozen_and_deadline(engine):
    m = create(engine)
    for r, action in enumerate(["research", "build", "submit", "build"]):
        await engine.round(m["id"], r, action, "", f"r-{r}")
    p = engine.store.get(m["id"])["people"][0]
    assert len(p["submission"]["artifacts"]) == 2
    assert len(p["artifacts"]) == 3
    assert p["submission"]["round"] == 3
    for r in range(4, 5):
        await engine.round(m["id"], r, "research", "", f"r-{r}")
    with pytest.raises(ValueError):
        await engine.round(m["id"], 5, "build", "", "eleventh")


@pytest.mark.asyncio
async def test_no_submission_means_no_rank(engine):
    m = create(engine)
    for r in range(5):
        await engine.round(m["id"], r, "research", "", f"r-{r}")
    result = await engine.judge(m["id"])
    assert "p0" not in [p["id"] for p in result["leaderboard"]]


@pytest.mark.asyncio
async def test_no_one_submits(engine):
    m = create(engine)
    m["round"], m["status"] = 10, "judging"
    engine.store.save(m)
    result = await engine.judge(m["id"])
    assert result["status"] == "finished"
    assert result["leaderboard"] == []


def test_private_context_is_not_shared(engine):
    m = create(engine)
    m["people"][1]["memories"].append({"content": "SECRET_RIVAL_RESEARCH"})
    ctx = engine.context(m, m["people"][0], "research", "test")
    assert "SECRET_RIVAL_RESEARCH" not in str(ctx)
    with pytest.raises(ValueError):
        engine.view(m, 0)


def test_tie_handling(engine):
    m = create(engine)
    m["cards"] = [
        {
            "scores": [
                dict(project_id=p["id"], technical=8, originality=7, ai_centrality=9, taste=8)
                for p in m["people"]
            ]
        }
        for _ in range(5)
    ]
    assert all(row["rank"] == 1 for row in engine.leaderboard(m))


def test_api_session_ownership(engine, monkeypatch):
    from fastapi.testclient import TestClient

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    owner = TestClient(server.app)
    outsider = TestClient(server.app)
    response = owner.post(
        "/api/matches",
        json={
            "theme": "Useful everyday AI tools",
            "mode": "demo",
            "personas": SEEDS,
        },
    )
    assert response.status_code == 200
    mid = response.json()["id"]
    assert owner.get(f"/api/matches/{mid}").status_code == 200
    assert outsider.get(f"/api/matches/{mid}").status_code == 403
    assert outsider.post(f"/api/matches/{mid}/judge").status_code == 403
    assert owner.get(f"/api/matches/{mid}?replay_round=0").status_code == 409
    assert (
        owner.post(
            f"/api/matches/{mid}/round",
            json={
                "expected_round": 0,
                "action": "research",
                "receipt": "api-receipt",
            },
        ).status_code
        == 200
    )


@pytest.mark.asyncio
async def test_failed_live_batch_preserves_round_and_caches_successes(engine):
    m = create(engine)
    m["mode"] = "astra"
    engine.store.save(m)
    called = []
    failing = True

    async def request(schema, instructions, context, logs):
        name = context["identity"]["name"]
        called.append(name)
        if name == "Simon Willison" and failing:
            raise RuntimeError("temporary provider failure")
        p = next(p for p in m["people"] if p["name"] == name)
        return engine.demo_decision(m, p, context["required_action"], "")

    engine.gateway.request = request
    with pytest.raises(RuntimeError):
        await engine.round(m["id"], 0, "research", "", "retry-request")
    saved = engine.store.get(m["id"])
    assert saved["round"] == 0
    assert not saved["events"]
    failing = False
    result = await engine.round(m["id"], 0, "research", "", "retry-request")
    assert result["round"] == 1
    assert called.count("You") == 1
    assert called.count("Simon Willison") == 2


def test_profile_research_requires_sources_and_valid_link(engine, monkeypatch):
    from fastapi.testclient import TestClient

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    monkeypatch.setattr(engine.gateway, "available", lambda: True)

    async def request(schema, instructions, payload, logs, web_search=False):
        assert web_search
        logs.append({"response": {"sources": [{"url": "https://example.org/profile"}]}})
        return schema(
            name="Example Builder",
            role="Engineer",
            bio="Builds public software tools.",
            uncertainty="Review the identity.",
            sources=["https://example.org/profile", "https://invented.example/fake"],
            trait="Experimental builder",
            taste="Evidence-backed technical ideas",
            inference_basis="Inferred from public project descriptions.",
        )

    monkeypatch.setattr(engine.gateway, "request", request)
    client = TestClient(server.app)
    assert (
        client.post("/api/profiles/research", json={"url": "http://127.0.0.1"}).status_code == 422
    )
    result = client.post(
        "/api/profiles/research",
        json={
            "url": "https://www.linkedin.com/in/example-builder",
        },
    )
    assert result.status_code == 200
    assert result.json()["sources"] == ["https://example.org/profile"]
    assert not result.json()["review_required"]
    person = result.json()
    assert person["trait"] == "Experimental builder"
    judges = [{"id": j["id"]} for j in server.JUDGES]
    judges[0]["profile_id"] = person["profile_id"]
    created = client.post(
        "/api/matches",
        json={
            "theme": "A useful AI tool",
            "mode": "demo",
            "personas": [*SEEDS, {**person, "trait": "UNTRUSTED USER TASTE"}],
            "judges": judges,
        },
    )
    assert created.status_code == 200
    state = created.json()
    assert state["people"][-1]["trait"] == "Experimental builder"
    assert state["judges"][0]["taste"] == "Evidence-backed technical ideas"


def test_provider_error_categories():
    import httpx
    from openai import AuthenticationError, RateLimitError

    from app.hackathon.engine import provider_failure

    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429, request=request, headers={"retry-after": "12"})
    rate = RateLimitError("rate limited", response=response, body={"code": "rate_limit_exceeded"})
    failure = provider_failure(rate)
    assert failure.code == "rate_limit"
    assert failure.retryable and failure.retry_after == 12
    quota = RateLimitError("no quota", response=response, body={"code": "insufficient_quota"})
    assert not provider_failure(quota).retryable
    assert provider_failure(quota).code == "quota"
    auth = AuthenticationError(
        "invalid key", response=httpx.Response(401, request=request), body={}
    )
    assert provider_failure(auth).code == "authentication"


@pytest.mark.asyncio
async def test_rate_limit_waits_and_quota_does_not_retry(monkeypatch):
    from types import SimpleNamespace

    import httpx
    from openai import RateLimitError

    from app.hackathon.engine import ConnectivityReply, Gateway, ProviderFailure

    gateway = Gateway()
    calls, waits = [], []
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")

    async def parse(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise RateLimitError(
                "slow down",
                response=httpx.Response(429, request=request, headers={"retry-after": "2"}),
                body={"code": "rate_limit_exceeded"},
            )
        return SimpleNamespace(output_parsed=ConnectivityReply(ready=True), id="test", usage=None)

    async def sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr("app.hackathon.engine.asyncio.sleep", sleep)
    gateway.client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    result = await gateway.request(ConnectivityReply, "ready", {}, [])
    assert result.ready
    assert len(calls) == 2 and waits[0] > 1

    async def quota(**kwargs):
        calls.append(kwargs)
        raise RateLimitError(
            "no quota",
            response=httpx.Response(429, request=request),
            body={"code": "insufficient_quota"},
        )

    gateway.client.responses.parse = quota
    calls.clear()
    with pytest.raises(ProviderFailure, match="quota"):
        await gateway.request(ConnectivityReply, "ready", {}, [])
    assert len(calls) == 1


def test_preflight_prevents_live_match_when_disconnected(engine, monkeypatch):
    from fastapi.testclient import TestClient

    from app.hackathon import server

    async def disconnected(force=False):
        return dict(connected=False, code="quota", message="No available quota.")

    monkeypatch.setattr(server, "engine", engine)
    monkeypatch.setattr(engine.gateway, "connection", disconnected)
    client = TestClient(server.app)
    response = client.post(
        "/api/matches",
        json={
            "theme": "AI tool",
            "mode": "astra",
            "personas": SEEDS,
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "quota"


@pytest.mark.asyncio
async def test_custom_panel_taste_is_used_by_judging(engine):
    from app.hackathon.engine import JUDGES, Score, Scorecard

    judges = copy.deepcopy(JUDGES)
    judges[0].update(name="Imported judge", taste="Specific generated preference")
    m = engine.create("Useful AI", "demo", SEEDS, judges)
    m.update(status="judging", round=10, mode="astra")
    m["people"][0]["submission"] = dict(
        round=10,
        summary="Project",
        artifacts=[
            dict(id="build-evidence", type="build", content="A project specification"),
        ],
    )
    engine.store.save(m)
    observed = []

    async def request(schema, instructions, payload, logs):
        observed.append(payload["taste"])
        return Scorecard(
            scores=[
                Score(
                    project_id="p0",
                    technical=6,
                    originality=6,
                    ai_centrality=7,
                    taste=8,
                    verdict="Evidence supports this result.",
                    evidence_ids=["build-evidence"],
                )
            ]
        )

    engine.gateway.request = request
    result = await engine.judge(m["id"])
    assert result["judges"][0]["name"] == "Imported judge"
    assert observed[0] == "Specific generated preference"
    assert len(result["cards"]) == 5


def test_invalid_linkedin_ports_are_validation_errors(engine, monkeypatch):
    from fastapi.testclient import TestClient

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    client = TestClient(server.app)
    for url in [
        "https://linkedin.com:abc/in/person",
        "https://linkedin.com/in/",
        "https://attacker@linkedin.com/in/person",
        "https://linkedin.com:88/in/person",
    ]:
        assert client.post("/api/people", json={"url": url}).status_code == 422


def test_variable_judger_roster_and_score_average(engine, monkeypatch):
    from fastapi.testclient import TestClient

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    client = TestClient(server.app)
    response = client.post(
        "/api/matches",
        json={
            "theme": "Useful AI",
            "mode": "demo",
            "personas": SEEDS[:2],
            "judges": [{"id": "j2"}, {"id": "j4"}],
        },
    )
    assert response.status_code == 200
    m = engine.store.get(response.json()["id"])
    assert len(m["judges"]) == 2
    m["cards"] = [
        {"scores": [dict(project_id="p0", technical=8, originality=8, ai_centrality=8, taste=8)]}
        for _ in range(2)
    ]
    assert engine.leaderboard(m)[0]["score"] == 80
    assert (
        client.post(
            "/api/matches",
            json={
                "theme": "Useful AI",
                "mode": "demo",
                "personas": SEEDS,
                "judges": [],
            },
        ).status_code
        == 422
    )


@pytest.mark.asyncio
async def test_stop_cancels_inflight_round_and_prevents_late_commit(engine, monkeypatch):
    import asyncio

    import httpx

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def pending_request(*args, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    engine.gateway.request = pending_request
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/matches",
            json={
                "theme": "Useful AI",
                "mode": "demo",
                "personas": SEEDS,
            },
        )
        mid = response.json()["id"]
        m = engine.store.get(mid)
        m["mode"] = "astra"
        engine.store.save(m)
        task = asyncio.create_task(
            client.post(
                f"/api/matches/{mid}/round",
                json={
                    "expected_round": 0,
                    "action": "research",
                    "receipt": "cancel-request",
                },
            )
        )
        await asyncio.wait_for(started.wait(), 2)
        stopped = await client.post(f"/api/matches/{mid}/stop")
        assert stopped.status_code == 200
        assert (await task).status_code == 409
        assert cancelled.is_set()
        saved = engine.store.get(mid)
        assert saved["status"] == "stopped"
        assert saved["round"] == 0 and not saved["events"]
        assert (
            await client.post(
                f"/api/matches/{mid}/round",
                json={
                    "expected_round": 0,
                    "action": "research",
                    "receipt": "after-stop",
                },
            )
        ).status_code == 409
        assert (await client.post(f"/api/matches/{mid}/stop")).status_code == 200


@pytest.mark.asyncio
async def test_profile_job_returns_immediately_reports_progress_and_cancels(engine, monkeypatch):
    import asyncio

    import httpx

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    async def slow_profile(body, progress=None):
        progress("researching", "Searching public sources.")
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(server, "build_profile", slow_profile)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        response = await asyncio.wait_for(
            client.post(
                "/api/people",
                json={
                    "url": "https://www.linkedin.com/in/example",
                    "kind": "builder",
                },
            ),
            1,
        )
        assert response.status_code == 202
        jid = response.json()["job_id"]
        await asyncio.wait_for(entered.wait(), 1)
        status = (await client.get(f"/api/people/jobs/{jid}")).json()
        assert status["status"] == "researching"
        assert status["message"] == "Searching public sources."
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=server.app), base_url="http://test"
        ) as outsider:
            assert (await outsider.get(f"/api/people/jobs/{jid}")).status_code == 403
        result = await client.post(f"/api/people/jobs/{jid}/cancel")
        assert result.json()["status"] == "cancelled"
        assert cancelled.is_set()
        assert (await client.post(f"/api/people/jobs/{jid}/cancel")).json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_profile_job_timeout_and_completion(engine, monkeypatch):
    import asyncio

    import httpx

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    monkeypatch.setattr(server, "PROFILE_JOB_TIMEOUT", 0.02)

    async def slow(body, progress=None):
        await asyncio.Event().wait()

    monkeypatch.setattr(server, "build_profile", slow)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        job = (
            await client.post("/api/people", json={"url": "https://linkedin.com/in/example"})
        ).json()
        task = server.profile_tasks[job["id"]]
        await asyncio.wait_for(task, 1)
        result = (await client.get(f"/api/people/jobs/{job['id']}")).json()
        assert result["status"] == "failed" and result["code"] == "timeout"

        async def complete(body, progress=None):
            return {"name": "Example person", "profile_id": "generated"}

        monkeypatch.setattr(server, "build_profile", complete)
        job = (
            await client.post("/api/people", json={"url": "https://linkedin.com/in/example"})
        ).json()
        await asyncio.wait_for(server.profile_tasks[job["id"]], 1)
        result = (await client.get(f"/api/people/jobs/{job['id']}")).json()
        assert result["status"] == "completed"
        assert result["person"]["profile_id"] == "generated"


@pytest.mark.asyncio
async def test_recent_profile_is_reused_without_another_model_call(engine, monkeypatch):
    import json
    from datetime import UTC, datetime

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    person = dict(
        source="https://www.linkedin.com/in/example",
        profile_id="cached",
        generated_at=datetime.now(UTC).isoformat(),
        name="Example",
        kind="builder",
    )
    engine.store.db.execute("CREATE TABLE profiles (id TEXT PRIMARY KEY, data TEXT)")
    engine.store.db.execute("INSERT INTO profiles VALUES (?,?)", ("cached", json.dumps(person)))

    async def must_not_call(*args, **kwargs):
        raise AssertionError("A recent profile should not need another request")

    monkeypatch.setattr(engine.gateway, "request", must_not_call)
    result = await server.build_profile(server.ProfileRequest(url=person["source"], kind="judge"))
    assert result["cache_hit"]
    assert result["profile_id"] == "cached"
    assert result["kind"] == "judge"


@pytest.mark.asyncio
async def test_gateway_deadline_cancels_slow_call(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    from app.hackathon import engine as module

    monkeypatch.setenv("OPENAI_MODEL", "gpt-6-astra")
    monkeypatch.delenv("HACKATHON_MODEL", raising=False)
    gateway = module.Gateway()
    assert gateway.model == "gpt-5.4-mini"
    assert module.MODEL_REQUEST_TIMEOUT == 30
    monkeypatch.setattr(module, "MODEL_REQUEST_TIMEOUT", 0.02)
    cancelled = []

    async def slow(**kwargs):
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.append(True)

    gateway.client = SimpleNamespace(responses=SimpleNamespace(parse=slow))
    with pytest.raises(module.ProviderFailure) as error:
        await gateway.request(module.ConnectivityReply, "Ready?", {}, [])
    assert error.value.code == "timeout"
    assert cancelled == [True]
    assert not gateway.semaphore.locked()


def test_participant_schema_rejects_invented_evidence_and_illegal_actions(engine):
    from pydantic import ValidationError

    match = create(engine)
    person = match["people"][0]
    decision = engine.demo_decision(match, person, "research", "")
    schema = engine.decision_schema(person, "research")
    assert schema.model_validate(decision.model_dump()).evidence_ids == []
    with pytest.raises(ValidationError):
        schema.model_validate(
            {**decision.model_dump(), "evidence_ids": ["urn:artifact:research-1"]}
        )
    with pytest.raises(ValidationError):
        schema.model_validate({**decision.model_dump(), "action": "submit"})
    person["artifacts"] = [{"id": "p0-r1", "type": "research"}]
    schema = engine.decision_schema(person)
    assert schema.model_validate({**decision.model_dump(), "evidence_ids": ["p0-r1"]})
    with pytest.raises(ValidationError):
        schema.model_validate({**decision.model_dump(), "evidence_ids": ["p1-r1"]})


@pytest.mark.asyncio
async def test_observer_turn_state_does_not_leak_into_agent_context(engine):
    match = create(engine)
    view = await engine.round(match["id"], 0, "research", "", "transparent")
    assert all(e["decision_summary"] for e in view["events"])
    assert all(e["state"]["memory_count"] == 1 for e in view["events"])
    assert all(p["memories"] for p in view["people"])
    saved = engine.store.get(match["id"])
    saved["events"][1]["decision_summary"] = "OBSERVER_ONLY_REASON"
    saved["events"][1]["state"]["goal"] = "OBSERVER_ONLY_GOAL"
    context = engine.context(saved, saved["people"][0], "build", "")
    assert "OBSERVER_ONLY" not in str(context)
    assert "state" not in context["public_updates"][1]


@pytest.mark.asyncio
async def test_five_round_deck_is_frozen_and_owner_protected(engine, monkeypatch):
    from fastapi.testclient import TestClient

    from app.hackathon import server

    monkeypatch.setattr(server, "engine", engine)
    match = create(engine)
    assert match["round_limit"] == 5
    match["owner"] = "deck-owner"
    engine.store.save(match)
    for r, action in enumerate(["research", "build", "test", "pitch", "submit"]):
        result = await engine.round(match["id"], r, action, "", f"deck-{r}")
    assert result["status"] == "judging"
    submission = result["people"][0]["submission"]
    assert len(submission["deck"]) == 7
    assert submission["project"]["architecture"]
    with TestClient(server.app) as client:
        url = submission["deck_url"]
        assert client.get(url).status_code == 403
        client.cookies.set("hackathon_session", "deck-owner")
        assert client.get(url).status_code == 200
        data = client.get(f"/api/matches/{match['id']}/decks/p0")
        assert data.json()["deck"] == submission["deck"]
    with pytest.raises(ValueError):
        await engine.round(match["id"], 5, "research", "", "sixth")


@pytest.mark.parametrize(
    "architecture",
    [
        "A browser sends questions to an AI tutor backed by a lesson database.",
        "An AI assistant explains smart-contract proposals before a wallet signs an on-chain vote.",
    ],
)
def test_project_schema_accepts_ai_and_optional_crypto(engine, architecture):
    match = create(engine)
    person = match["people"][0]
    person["artifacts"] = [
        {"id": "p0-r1", "type": "research", "title": "Test idea"},
        {"id": "p0-r2", "type": "build", "title": "Test build"},
    ]
    decision = engine.demo_decision(match, person, "submit", "")
    payload = decision.model_dump()
    payload["project"]["architecture"] = architecture
    schema = engine.decision_schema(person, "submit")
    assert schema.model_validate(payload).project.architecture == architecture
    properties = schema.model_json_schema()["properties"]
    assert "project" in properties and "dapp" not in properties
    assert "blockchain" not in schema.model_json_schema()["$defs"]["ProjectSpec"]["properties"]


def test_old_dapp_decisions_remain_readable(engine):
    from app.hackathon.engine import Decision

    match = create(engine)
    decision = engine.demo_decision(match, match["people"][0], "submit", "")
    payload = decision.model_dump()
    payload["dapp"] = payload.pop("project")
    payload["dapp"]["blockchain"] = payload["dapp"].pop("architecture")
    parsed = Decision.model_validate(payload)
    assert parsed.project.architecture == decision.project.architecture


@pytest.mark.asyncio
async def test_decks_are_independent_and_have_distinct_content_and_design(engine):
    people = copy.deepcopy(SEEDS + SEEDS)
    for i, person in enumerate(people):
        person["name"] = f"Builder {i}"
    match = engine.create("Useful AI tools", "demo", people)
    for r, action in enumerate(["research", "build", "test", "pitch", "submit"]):
        view = await engine.round(match["id"], r, action, "", f"independent-{r}")
    submissions = [p["submission"] for p in view["people"]]
    assert len({s["project"]["name"] for s in submissions}) == 8
    assert len({s["project"]["architecture"] for s in submissions}) == 8
    assert len({s["deck_design"]["accent"] for s in submissions}) == 8
    for person, submission in zip(view["people"], submissions, strict=True):
        assert submission["deck_design"]["owner_id"] == person["id"]
        assert all(a["id"].startswith(person["id"] + "-") for a in submission["artifacts"])
    submissions[0]["deck"][0]["body"] = "Edited local copy"
    assert all(s["deck"][0]["body"] != "Edited local copy" for s in submissions[1:])
    saved = engine.store.get(match["id"])
    assert saved["people"][0]["submission"]["deck"][0]["body"] != "Edited local copy"
