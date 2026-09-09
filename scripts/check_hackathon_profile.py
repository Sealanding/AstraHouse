"""Exercise the real asynchronous Add Person endpoint and report its progress."""

import argparse
import asyncio
import json

import httpx

from app.hackathon.server import app, engine


async def main(url):
    diagnostic_logs = []
    original_request = engine.gateway.request

    async def tracked(*args, **kwargs):
        try:
            return await original_request(*args, **kwargs)
        finally:
            diagnostic_logs.extend(args[3])

    engine.gateway.request = tracked
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/people",
            json={
                "url": url,
                "kind": "builder",
            },
        )
        response.raise_for_status()
        job_id = response.json()["job_id"]
        while True:
            job = (await client.get(f"/api/people/jobs/{job_id}")).json()
            print(
                json.dumps({k: job[k] for k in ("status", "elapsed_seconds", "message")}),
                flush=True,
            )
            if job["status"] == "completed":
                person = job["person"]
                print(
                    json.dumps(
                        {
                            "name": person["name"],
                            "sources": len(person["sources"]),
                            "has_personality": bool(person["trait"]),
                            "has_taste": bool(person["taste"]),
                        }
                    ),
                    flush=True,
                )
                return
            if job["status"] in ("failed", "cancelled"):
                print(
                    json.dumps(
                        {
                            "diagnostics": [
                                {
                                    k: v
                                    for k, v in item.items()
                                    if k
                                    in (
                                        "error",
                                        "failure",
                                        "validation_errors",
                                        "response_status",
                                        "incomplete_reason",
                                        "seconds",
                                    )
                                }
                                for item in diagnostic_logs
                            ]
                        }
                    ),
                    flush=True,
                )
                raise SystemExit(1)
            await asyncio.sleep(5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url", nargs="?", default="https://www.linkedin.com/in/shawnswyxwang")
    asyncio.run(main(parser.parse_args().url))
