"""Probe Astra, then verify a complete four-builder round against the real provider."""

import asyncio
import json

from dotenv import load_dotenv

from app.hackathon.engine import SEEDS, Engine, Gateway, ProviderFailure, Store


async def main():
    load_dotenv()
    gateway = Gateway()
    health = await gateway.connection(force=True)
    print(json.dumps({"connection": health}), flush=True)
    if not health["connected"]:
        return
    engine = Engine(Store("/tmp/astra-house-connectivity-check.db"), gateway)
    match = engine.create("Build a small, useful AI learning tool.", "astra", SEEDS)
    try:
        result = await engine.round(
            match["id"], 0, "research", "A beginner Python tutor.", "check-round"
        )
        print(
            json.dumps(
                {
                    "round": result["round"],
                    "builders": len(result["people"]),
                    "events": len(result["events"]),
                    "usage": result["usage"],
                }
            ),
            flush=True,
        )
    except ProviderFailure as exc:
        print(json.dumps({"failure": exc.detail()}), flush=True)
    saved = engine.store.get(match["id"])
    print(
        json.dumps(
            {
                "requests": [
                    {
                        k: v
                        for k, v in c.items()
                        if k in ("attempt", "error", "seconds", "tokens", "failure")
                    }
                    for c in saved["calls"]
                ]
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
