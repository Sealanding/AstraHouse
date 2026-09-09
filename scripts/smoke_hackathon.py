"""Browser acceptance test against the hackathon server. Uses demo mode only."""

import asyncio

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            headless=True,
        )
        page = await browser.new_page(viewport={"width": 1440, "height": 1100})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://127.0.0.1:8002")
        await page.locator("#enter-room").click()
        await page.locator("#start").wait_for()
        print("Lobby ready", flush=True)
        await page.locator("#focus-room").click()
        assert await page.locator("#focus-room").get_attribute("aria-pressed") == "true"
        await page.keyboard.press("Escape")
        assert await page.locator("#focus-room").get_attribute("aria-pressed") == "false"
        await page.screenshot(path="/tmp/astra-house-lobby.png", full_page=True)
        await page.locator("#add-agent").click()

        async def researched_person(route):
            await route.fulfill(
                json={
                    "name": "Andrej Karpathy",
                    "role": "AI researcher & educator",
                    "bio": "Public neural network education and research.",
                    "source": "https://karpathy.ai/",
                    "sources": ["https://karpathy.ai/"],
                    "trait": "Experimental builder",
                    "taste": "Technical depth",
                    "inference_basis": "Inferred from published work.",
                    "uncertainty": "",
                }
            )

        await page.route("**/api/people", researched_person)
        await page.locator("[name=url]").fill("https://www.linkedin.com/in/andrej-karpathy")
        assert await page.locator("[name=trait]").count() == 0
        assert await page.locator("[name=bio]").count() == 0
        await page.locator("#add-person-submit").click()
        await page.locator("#person-result > h3").wait_for()
        assert await page.locator(".builder").count() == 5
        await page.locator("#close-persona").click()
        await page.locator('[data-remove-judge="j1"]').click()
        assert await page.locator(".judge").count() == 4
        await page.locator("#add-judge").click()
        await page.locator("[name=url]").fill("https://www.linkedin.com/in/andrej-karpathy")
        await page.locator("#add-person-submit").click()
        await page.locator("#person-result > h3").wait_for()
        await page.locator("#close-persona").click()
        assert await page.locator(".judge").count() == 5
        await page.locator("[data-remove-judge]").last.click()
        assert await page.locator(".judge").count() == 4
        await page.locator("#start").click()
        await page.locator("#play").wait_for()
        for action in [
            "research",
            "build",
            "test",
            "pitch",
            "submit",
        ]:
            await page.locator(f"[data-action={action}]").click()
            await page.locator("#play").click()
            await page.wait_for_function("document.querySelector('#busy-banner').hidden")
        await page.locator("#replay").wait_for()
        print("Five rounds completed", flush=True)
        assert await page.locator(".round-action").count() == 5
        assert await page.get_by_text("Why this action", exact=True).count() == 5
        await page.locator('[data-inspect-state="p1"]').click()
        assert await page.locator(".player-state").is_visible()
        assert "Game memories" in await page.locator("#sidebar").inner_text()
        await page.locator("#back").click()
        await page.locator("#recap-round").select_option("1")
        assert "Round 1 —" in await page.locator("#recap-status").inner_text()
        await page.wait_for_function(
            "document.querySelector('#transcript-content').textContent.includes('ROUND 5')"
        )
        assert await page.locator("#deck-links a").count() == 5
        async with page.expect_popup() as popup_info:
            await page.locator("#deck-links a").first.click()
        deck = await popup_info.value
        await deck.locator("#slides article").first.wait_for()
        assert await deck.locator("#slides article").count() == 7
        assert await deck.locator(".visual-slide > img").count() == 7
        await deck.locator(".visual-slide > img").first.evaluate("img => img.decode()")
        await deck.screenshot(path="/tmp/astra-house-visual-deck.png", full_page=True)
        await deck.locator("#next-slide").click()
        assert await deck.locator("#slide-position").inner_text() == "2 / 7"
        await deck.locator('[data-slide-go="6"]').click()
        assert await deck.locator("#slide-position").inner_text() == "7 / 7"
        async with deck.expect_download() as slide_download:
            await deck.locator("#download-slide").click()
        assert (await slide_download.value).suggested_filename.endswith(".svg")
        await deck.emulate_media(media="print")
        assert await deck.locator(".visual-slide:visible").count() == 7
        await deck.emulate_media(media="screen")
        await deck.locator("#show-demo").click()
        assert await deck.locator("#wallet").count() == 0
        await deck.locator("#proposal").fill("Test shared learning proposal")
        await deck.locator("#create").click()
        await deck.locator("[data-vote]").first.click()
        assert "1 feedback" in await deck.locator("#proposals").inner_text()
        await deck.close()
        transcript_text = await page.locator("#transcript-content").text_content()
        assert "Rationale:" in transcript_text and "Mean scores:" in transcript_text
        assert transcript_text.count("  Judger:") == 20
        async with page.expect_download() as download_info:
            await page.locator("#download-transcript").click()
        download = await download_info.value
        downloaded = await download.path()
        from pathlib import Path

        assert Path(downloaded).read_text() == transcript_text
        assert await page.locator(".score-row").count() == 5
        await page.screenshot(path="/tmp/astra-house-finale.png", full_page=True)
        await page.locator("[data-judge=j2]").click()
        assert await page.locator(".score-breakdown").count() == 5
        await page.locator("#back").click()
        await page.locator("#replay").fill("3")
        await page.locator("#replay").dispatch_event("change")
        await page.wait_for_function(
            "document.querySelector('#round-label').textContent.includes('REPLAY')"
        )
        assert await page.locator("#transcript-content").text_content() == transcript_text
        await page.reload()
        await page.locator("#replay").wait_for()
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.screenshot(path="/tmp/astra-house-mobile.png", full_page=True)
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await page.locator("#new-game").click()
        await page.locator("#start").wait_for()
        assert await page.locator(".builder").count() == 5
        assert await page.locator(".judge").count() == 4
        # The controlled builder is deletable too; the next builder becomes the player.
        await page.locator('[data-remove="0"]').click()
        assert await page.locator(".builder").count() == 4
        await page.locator("#start").click()
        await page.locator("#play").wait_for()
        assert "ROUND 01" in await page.locator("#round-label").inner_text()
        release = asyncio.Event()

        async def delayed_round(route):
            await release.wait()
            await route.abort()

        await page.route("**/round", delayed_round)
        await page.locator("#play").click()
        await page.locator("#new-game").click()
        await page.locator("#start").wait_for()
        release.set()
        await page.wait_for_timeout(200)
        assert await page.locator("#start").is_visible()
        assert await page.evaluate("localStorage.getItem('astra-house-match')") is None
        assert not errors, errors
        print(
            "PASS: onboarding, mocked Add Person, five rounds, "
            "judging, replay, mobile, no JS errors."
        )
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
