# Astro House

An AI hackathon you can step into. Direct one builder in a visual sandbox room while independent AI participants develop their own ideas, build project artifacts, and present their work to a panel of simulated judges.

**Five rounds. Independent builders. Visual pitch decks.**

## What you can do

- Explore the room, inspect builders, and follow each participant’s actions and decision summaries.
- View professional context, game memories, project goals, artifacts, and state after each turn.
- Add builders and judges using a LinkedIn profile. Public-source research generates their simulated profiles, with a visible 30-second countdown.
- Inspect preset profile backups explaining the sources and fictional behavior behind each character.
- Submit independent, project-specific decks with diagrams, interface wireframes, and evidence charts.
- Read the final transcript with scores, judging rationales, and clickable deck links. Download slides as SVG or print decks to PDF.
- Replay a completed match, or stop and restart while retaining your roster.

The challenge is **AI-first and open-ended**. Build a useful AI product in any domain. Blockchain and crypto are optional technology choices, never submission requirements or automatic scoring advantages.

## Run locally

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync --dev
uv run uvicorn app.hackathon.server:app --host 127.0.0.1 --port 8002
```

Open [http://127.0.0.1:8002](http://127.0.0.1:8002) and choose **Demo sandbox** to play without API credentials. Demo actions and judging are scripted.

### Enable live AI

Copy the environment template:

```bash
cp .env.example .env
```

Set these values in `.env`, then restart the server:

```dotenv
OPENAI_API_KEY=your_api_key_here
HACKATHON_MODEL=gpt-5.4-mini
```

Choose **Check model connection**, then **Fast model live**. Adding a person through public-profile research also requires live model access. API credentials remain on the server; `.env` is ignored by Git.

Each builder receives a separate request with its own context and the room’s public updates. Requests run with up to four concurrent calls by default. Each request has a **30-second total deadline**, including queueing and retries. A four-builder, five-judge game normally uses 25 model calls, plus connectivity checks, profile research, and retries.

## How to play

1. Customize the lobby: two to eight builders and one to eight judges. You control the first builder.
2. Choose one action per round: **Research**, **Build**, **Test**, **Pitch**, or **Submit**. Rivals choose independently.
3. Develop an idea and submit by the end of **round five**. Only the latest submitted version is judged.
4. Explore scores, evidence, visual decks, and the complete transcript after judging.

The rubric is **technical difficulty 30%**, **originality 25%**, **AI centrality 30%**, and **judger taste 15%**.

Drag the room to pan and use the camera controls to zoom. Press **F** for focus mode, **Escape** to exit, or **1–5** to select a legal action. Shortcuts never confirm an action. A reduced-motion option is available.

## About the simulation

Participants are fictional simulations inspired by public professional information, not representations of anyone’s private memories or actual opinions. Profiles distinguish sourced background from inferred game behavior.

Project artifacts and assessments are simulated; the game does not execute generated code or deploy applications. The deck’s interactive workspace is a local UI prototype. Project-specific AI functions remain specifications.

Matches are stored in SQLite at `.data/hackathon.db`. Deck links require the running server and the browser session that owns the match. Run one server worker; this is a local prototype, not a hosted multi-user account system. Failed rounds retain completed decisions for an unchanged retry instead of silently switching to demo mode.

## Development

```bash
uv run pytest -q
uv run ruff check app/hackathon tests/test_hackathon.py
```

The browser smoke test requires Playwright and Google Chrome on macOS, with the game running on port 8002:

```bash
uv run --with playwright python scripts/smoke_hackathon.py
```

### Project map

| Path | Purpose |
| --- | --- |
| `app/hackathon/` | FastAPI server, model gateway, rounds, submissions, and judging |
| `web/hackathon/` | Sandbox room, player inspectors, visual decks, and demo workspace |
| `tests/test_hackathon.py` | Engine and API regression tests |
| `docs/hackathon_simulator/` | Design planner, operating notes, and preset profile backups |

See the [design planner](docs/hackathon_simulator/README.md), [operating notes](docs/hackathon_simulator/RUNNING.md), and [preset profile backups](docs/hackathon_simulator/preset_profiles.json) for more detail.
