# Running Astra House

The hackathon game is a separate FastAPI application. The existing society simulator remains at `app.main:app`.

## Start the game

From the repository root with Python 3.12 or newer:

```bash
python3.12 -m venv .venv
.venv/bin/pip install fastapi openai pydantic python-dotenv 'uvicorn[standard]'
.venv/bin/uvicorn app.hackathon.server:app --host 127.0.0.1 --port 8002
```

Open **http://127.0.0.1:8002**. Choose **Demo sandbox** for a complete game without API credentials. Demo actions are scripted and scorecards use an explicitly labeled sample rubric. They are not model-generated evaluations.

For live play, configure `OPENAI_API_KEY` and `HACKATHON_MODEL=gpt-5.4-mini` in the repository's ignored `.env` file, or use the existing `OPENAI_SECRET_ID` / `AWS_REGION` secret configuration. Restart the server and select **Fast model live**. Model access must be available to the configured account. Keys never go to the browser. The implementation uses the [Responses API structured output interface](https://developers.openai.com/api/docs/guides/structured-outputs).

## Playing

- Start with four participants or invite additional participants before entering; maximum eight. The first participant is controlled by the player.
- On first entry, read the short introduction and enter the room; “How to play” reopens it.
- Public starter contexts link to their sources. To add a builder or judge, provide a valid LinkedIn `/in/` URL and click **Add Person**. Astra searches professional sources and generates the biography, personality, and judge taste automatically. Judgers are added to the roster; delete buttons remove any builder or judger before starting. A match requires two to eight builders and one to eight judgers. Users never fill in personality or taste.
- Source links, inference basis, and uncertainty are shown after creation. If the identity cannot be established, no person is added. A live research connection is needed even when you intend to play the resulting roster in demo mode.
- Choose **Check Astra connection** before live play. The server also checks before creating a live match. Provider errors explain whether to wait, reconnect the server, or fix credentials/account quota.
- Select Research to establish a brief, then Build. Test and Submit unlock after a build. Each confirmed action advances everyone one round.
- Inspect avatars or builder cards, pan and zoom the room, or open your project's artifact and memory panel.
- Submit before the ten-round deadline. Building after a submission changes the working project; only another Submit updates the submitted version.
- The selected judgers score submitted projects; their scores are averaged using the actual roster size. Click each judge for their rubric scores, verdicts, and artifact references.
- Replay completed rounds using the results panel's slider. The same browser session can refresh and resume its current match.

Projects are written simulation artifacts. No code is executed or deployed by the game. Research in live mode generates hypotheses from supplied context; it does not browse the web. Tests are labeled simulated assessments.

## State and failure handling

SQLite stores matches, snapshots, private memories, model call records, frozen submissions, and scorecards at `.data/hackathon.db`. Override with `HACKATHON_DB_PATH`. Browser ownership uses an HTTP-only session cookie; this is a local prototype, not a multi-user hosted account system. Run one server worker: per-match locks are process-local. Browser local storage remembers the current match ID; cookie loss prevents that browser from reopening its old private match.

Retryable Astra requests use up to three attempts with exponential backoff and `Retry-After`. Authentication, quota, and unsupported requests do not retry automatically. If a participant still fails, the entire round remains uncommitted, and successful participant responses are cached for retrying the same action and direction. A failed judge leaves judging resumable with completed scorecards saved. This deliberately pauses instead of consuming a turn with a silent fallback. Demo mode is never substituted for a failed live request.

A standard four-participant live game normally uses 45 model requests, plus connectivity checks and retries. Requests use bounded outputs, low reasoning effort, and default concurrency of four. Configure `HACKATHON_LLM_CONCURRENCY` only after confirming account limits. The gateway shares cooldowns between calls. The panel currently evaluates sequentially, so live judging may take longer than a participant round. Model-call and token totals are available in the match API. A configurable monetary spending cap is not yet implemented.

## Verification

```bash
.venv/bin/pip install pytest pytest-asyncio httpx ruff playwright
.venv/bin/pytest tests/test_hackathon.py -q
.venv/bin/ruff check app/hackathon tests/test_hackathon.py scripts/smoke_hackathon.py
.venv/bin/python scripts/smoke_hackathon.py
```

The browser test expects the server at port 8002 and uses installed Google Chrome on macOS. It checks onboarding, mocks the profile-search response to exercise Add Person without a paid call, plays ten rounds in demo mode, and checks scorecards, replay, refresh, and mobile overflow. Screenshots are written to `/tmp/astra-house-{lobby,finale,mobile}.png`. It makes no live model calls. A separate optional live check is `.venv/bin/python -m scripts.smoke_hackathon_astra`; it makes one participant request (plus retry if needed).

## Implementation map

- `app/hackathon/engine.py`: round coordinator, structured model gateway, immutable submissions, scoring, SQLite persistence.
- `app/hackathon/server.py`: browser session ownership, validation, game API, static assets.
- `web/hackathon/room.js`: room drawing, avatars, camera, and event-driven animations.
- `web/hackathon/game.js`: lobby, roster creation, action controls, project inspection, scorecards, replay.
- `web/hackathon/style.css`: responsive visual design.

The client uses browser-native canvas and JavaScript, fitting the existing repository without a frontend build step. This replaces the planner's proposed React layer for this version. It uses HTTP snapshots rather than WebSockets; submitted actions and reloads retrieve authoritative state.

For a real connectivity acceptance check, run `.venv/bin/python -m scripts.check_hackathon_connectivity`. It makes a small live preflight and four participant calls for one full round, plus bounded retries if needed.

A live Add Person check is available at `.venv/bin/python -m scripts.check_hackathon_profile`. It researches a public LinkedIn profile and stores its generated personality and taste. This uses a live model request and web search.

Validation of this revision: the four-builder live round completed with four successful first-attempt responses; the live LinkedIn import returned five public sources plus personality and taste. Tests cover rate-limit backoff, quota handling, custom-panel persistence, and generated-trait protection. A successful check is point-in-time evidence; account limits can still change.

**Stop & restart** works during a round or judging. It stops server work and returns to an editable lobby with the same people; starting again creates a fresh game at round one. Late responses from the old game are ignored. **Reset lobby** restores the defaults while in the lobby.

## Profile import progress and recovery

Add Person immediately creates a tracked job (`POST /api/people`, HTTP 202), then the browser polls its status. The dialog shows queued/researching/retrying/verifying status and a countdown from 30 seconds. Cancel remains available throughout. Import work has a 30-second total deadline, including time waiting for a model slot and retries. Search is limited to three tool calls per attempt. An error or timeout restores the retry button instead of leaving the dialog locked.

The pending job is remembered across refreshes, and successful roster additions are saved locally. Jobs and their status messages are stored in SQLite. On server restart, interrupted jobs become explicit failures. Job access and cancellation require the originating browser session. `GET /api/people/jobs/{id}` checks status; `POST /api/people/jobs/{id}/cancel` cancels work.

Run `.venv/bin/python scripts/smoke_hackathon_import.py` against the local server to test progress, refresh recovery, roster persistence, failed imports, and cancellation with mocked provider jobs. The live diagnostic accepts a profile URL: `.venv/bin/python -m scripts.check_hackathon_profile https://www.linkedin.com/in/example/`.

Successful profile research is reused for one hour when the same canonical LinkedIn URL is added again. The UI identifies reuse, and the profile retains its original generation timestamp and sources. This avoids repeated long model requests for the same person.

Profile research has a strict 30-second deadline, including queueing and retries. At zero, the UI restores the form and cancels pending work; late results do not add a person. Imported profiles expose a **Context memory** section containing sourced professional background and separately labeled personality/taste inferences. These entries are included in participant and judger model context. **Game memories** start empty and accumulate from completed rounds; rival game memories are visible to the player throughout play.


### Round recaps and final transcript

Display a Round actions panel beneath the sandbox room, with one card per builder showing their name, chosen action, and public outcome. Let players select any completed round. While a round is processing, keep the last completed recap visible and label the pending round; do not invent actions before the model returns. The human player can inspect every builder’s project details during play.

After judging finishes, display a readable, downloadable text transcript. Include every participant's submitted idea, final rank and score, criterion averages, the weighted scoring formula, and each judger's criterion scores, rationale, and cited artifact evidence. Mark people without submissions as unranked. Include all ten rounds with public updates and available project artifacts. Always build the transcript from the complete final match, so selecting an earlier replay round cannot truncate the export. Transcripts identify demo/live mode and simulated opinions.


### Fast model and request deadline

The live game now uses `gpt-5.4-mini`, selected through `HACKATHON_MODEL`, independently of the other simulator's `OPENAI_MODEL`. Builders, judgers, connectivity checks, and profile research all use this gateway. Every logical model request has a hard 30-second deadline including queueing, credential initialization, cooldowns and retries. The SDK also has a 30-second network timeout with automatic retries disabled. A timeout returns a retryable error without committing a partial round. A round or judging phase contains multiple calls; this is a per-request limit, not a promise that the entire phase finishes within 30 seconds. Profile import retains its overall 30-second deadline and countdown.

Model capabilities: [OpenAI GPT-5.4 mini documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini).


Participant calls run with at most four concurrent requests, each with the existing 30-second total deadline. Each response schema restricts actions to legal choices and evidence references to existing artifact IDs (an empty list before the first artifact). Failed rounds display each affected participant’s actual error; successful decisions remain cached for an unchanged retry.


### Transparent builder inspector

Every completed turn shows the builder’s action, work produced, a concise player-facing decision summary, cited evidence, and a state snapshot (goal, artifact and memory counts, submission round, and next legal actions). Current builder inspectors reveal all project artifacts and game memories to the human player. Agents still receive only their own private context and the room’s public announcements; observer-only summaries and state snapshots must not enter other agents’ prompts. Decision summaries explain objectives, evidence, and uncertainty, not private internal reasoning. Older turns without these fields say that no explanation or snapshot was recorded. Final transcripts include summaries and snapshots. No extra model call is required.


## Five-round AI project edition

This update supersedes the earlier ten-round deliverable. New matches run five rounds: research, build, test, pitch, submit is the suggested path. Existing saved matches retain their recorded limit (legacy matches default to ten). The fast model and 30-second request deadline remain unchanged.

Each preset builder has a versioned profile backup, visible in its inspector and saved in `preset_profiles.json`. It separates source-backed professional background from fictional behavior and explains the mapping between them. The player avatar is explicitly fictional. Profiles are copied into match state for reproducibility.

Submit now requires a structured AI-enabled project specification: problem, product architecture, AI contribution, separate interface and visualizations, basic functions, and limitations. The server freezes this specification into a seven-section deck with build evidence. Judgers evaluate that deck; the AI contribution section explains how AI unlocks the idea. This does not switch the game back to Astra.

Each submitted deck has a session-protected URL (`/decks/{match}/{builder}`), linked from the transcript and included as an absolute URL in downloaded text. It provides deck slides and a separate interactive workspace with item creation, usefulness feedback, visualization and completion tracking. Data persists locally per submission. No wallet or transaction is required. This is a UI prototype; project-specific AI functions remain a specification. No generated model code is executed. The transcript includes the full deck text, so it remains useful offline, while URLs require the game server and owning browser session.


### Visual deck and command-room presentation

The deck viewer now renders seven SVG image slides: idea/network visual, product architecture, AI workflow, interface wireframe, core interactions, roadmap, and an artifact-count chart. Visible text is brief; full frozen deck content stays in expandable speaker notes and the transcript. Charts only use recorded artifact counts. Wireframes and architecture are labeled conceptual; they do not imply deployed software or measured traction. Slide thumbnails, previous/next controls, arrow keys, individual SVG downloads, and print-to-PDF support presentation and export. Judging still receives the original frozen deck, unchanged.

The game uses a dark command-room theme inspired by the public Pax Historia landing page, without copying its assets. Focus mode expands the room; F toggles focus and Escape exits. Keys 1–5 select legal actions and never confirm them. Input fields and dialogs suppress shortcuts. Reduced-motion support remains available. No changes to rounds, costs, model calls, scoring, or simulation rules.


### AI-first, technology-neutral submissions

The default challenge is to build a useful AI-enabled product that solves a real problem. Applications may span learning, productivity, research, accessibility, creative tools, or other domains. Crypto and blockchain are allowed when a builder independently chooses them, but are neither required nor prohibited. Judgers assess technical difficulty, originality, AI centrality, and taste with the existing weights; no bonus or penalty is applied just for choosing or omitting a technology. Architecture should fit the user problem and be supported by evidence.

`ProjectSpec.architecture` replaces the required blockchain field, and new submissions store `project` rather than `dapp`. Compatibility readers preserve older dapp submissions and cached decisions; frozen historical decks remain accessible. Active matches using the exact old built-in crypto challenge are updated to the neutral challenge; custom challenges are retained. Visual architecture slides use neutral application components. The demo workspace has no wallet gate.

Research context: OpenAI’s [hackathon report](https://openai.com/index/hackathon-follow-up/) describes AI projects in healthcare, robotics, reinforcement learning and creative tools. This supports the breadth of the game’s AI-first scope; the optional-crypto policy is this game’s design decision, not a claimed OpenAI event rule.


### Independent, project-specific decks

Each builder generates its submission in its own existing model call, using only its own private goal, artifacts and memory. Deck content is frozen from that submission, never assembled from another builder’s submission. Public room announcements remain part of the game, but builders are instructed to ground final claims in their own work. Project-specific architecture nodes, AI workflow steps, functions and interface descriptions drive the diagrams; roster-specific palettes and layout variants distinguish the visuals. Each deck’s notes, artifacts, URL and local demo state remain isolated by match and builder IDs.

The demo roster now has eight distinct seeded product directions with different audiences, architecture, workflows and functions. Live creative outputs can converge on similar ideas; independence means separate generation and evidence, not a guarantee of semantic novelty. No extra model calls or round changes are introduced.
