"""Exercise import progress, refresh recovery, failure and cancellation with mocked jobs."""

import asyncio
import json

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            headless=True,
        )
        page = await browser.new_page(viewport={"width": 1200, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        stage = "researching"
        cancelled = []
        person = dict(
            name="Test Builder",
            role="Engineer",
            bio="A public professional biography.",
            trait="Careful builder",
            taste="Evidence",
            inference_basis="Public projects",
            source="https://example.org",
            sources=["https://example.org"],
            uncertainty="",
        )

        async def create(route):
            await route.fulfill(status=202, json={"job_id": "test-import"})

        async def job(route):
            if route.request.method == "POST":
                cancelled.append(True)
                await route.fulfill(json={"status": "cancelled"})
                return
            await route.fulfill(
                json={
                    "status": stage,
                    "message": "Test: " + stage,
                    "person": person,
                    "elapsed_seconds": 1,
                }
            )

        await page.route("**/api/people", create)
        await page.route("**/api/people/jobs/**", job)
        await page.goto("http://127.0.0.1:8002")
        await page.locator("#enter-room").click()
        await page.locator("#add-agent").click()
        await page.locator("[name=url]").fill("https://www.linkedin.com/in/test-builder")
        await page.locator("#add-person-submit").click()
        await page.get_by_text("Test: researching", exact=True).wait_for()
        assert await page.locator("#import-activity").is_visible()
        assert "remaining" in await page.locator("#import-elapsed").inner_text()
        assert await page.locator("#close-persona").is_enabled()
        await page.reload()
        await page.get_by_text("Test: researching", exact=True).wait_for()
        stage = "completed"
        await page.locator("#person-result > h3").wait_for()
        assert await page.locator("#person-result .context-memory").is_visible()
        assert await page.locator("#person-result .context-memory details").count() == 3
        assert await page.locator(".builder").count() == 5
        await page.locator("#close-persona").click()
        stage = "researching"
        await page.locator("#add-agent").click()
        await page.locator("[name=url]").fill("https://linkedin.com/in/test-timeout")
        await page.locator("#add-person-submit").click()
        await page.get_by_text("Test: researching", exact=True).wait_for()
        await page.evaluate("window.originalNow=Date.now; Date.now=()=>window.originalNow()+31000")
        await page.get_by_text(
            "The 30-second research limit was reached. No person was added. Please retry.",
            exact=True,
        ).wait_for()
        await page.evaluate("Date.now=window.originalNow")
        stage = "completed"
        await page.wait_for_timeout(1700)
        assert await page.locator("#add-person-submit").is_enabled()
        assert await page.locator(".builder").count() == 5
        await page.locator("#close-persona").click()
        await page.reload()
        await page.locator("#add-agent").wait_for()
        assert await page.locator(".builder").count() == 5
        stage = "failed"
        await page.locator("#add-agent").click()
        await page.locator("[name=url]").fill("https://linkedin.com/in/test-failure")
        await page.locator("#add-person-submit").click()
        await page.get_by_text("Test: failed", exact=True).wait_for()
        assert await page.locator("#add-person-submit").is_enabled()
        stage = "researching"
        await page.locator("#add-person-submit").click()
        await page.get_by_text("Test: researching", exact=True).wait_for()
        await page.locator("#close-persona").click()
        await page.wait_for_timeout(300)
        assert cancelled
        assert not await page.locator("#persona-dialog").is_visible()
        assert await page.evaluate("localStorage.getItem('astra-house-import')") is None
        assert await page.locator(".builder").count() == 5
        assert not errors, errors
        print(
            json.dumps(
                {
                    "status": "passed",
                    "checks": [
                        "progress",
                        "refresh recovery",
                        "roster persistence",
                        "failure message",
                        "cancel",
                        "no duplicate person",
                        "30-second countdown and deadline",
                        "late result ignored",
                        "context memory visible",
                    ],
                }
            )
        )
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
