import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        await page.add_init_script("""
            window.__TAURI_INTERNALS__ = {
                invoke: async (cmd, args) => {
                    console.log('Mocking Tauri invoke:', cmd, args);
                    if (cmd === 'get_settings') {
                        return { theme: 'system', language: 'ru' };
                    }
                    if (cmd === 'open_logs_dir') {
                        // simulate delay to show spinner
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return null;
                    }
                    return null;
                }
            };
        """)

        await page.goto("http://localhost:1420/")

        # Complete onboarding
        print("Completing onboarding...")
        try:
            # Click 'Дальше' a few times
            for _ in range(5):
                if await page.get_by_role("button", name="Дальше").is_visible():
                    await page.get_by_role("button", name="Дальше").click()
                    await page.wait_for_timeout(500)

            # Click 'Начать читать'
            start_btn = page.locator("button:has-text('Начать читать')")
            if await start_btn.is_visible():
                await start_btn.click()
            else:
                start_btn2 = page.locator("button:has-text('Начать чтение')")
                if await start_btn2.is_visible():
                    await start_btn2.click()

            await page.wait_for_timeout(1000)
        except Exception as e:
            print("Error in onboarding:", e)

        print("Navigating to settings...")
        await page.goto("http://localhost:1420/#/settings")
        await page.wait_for_selector(".settings-page", timeout=5000)

        # Scroll to bottom to ensure buttons are visible
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(500)

        print("Clicking Open Logs button...")
        button = page.locator("button:has-text('Открыть папку логов')")
        await button.click()

        # Wait a tiny bit for the state to update to busy
        await page.wait_for_timeout(100)

        print("Taking screenshot...")
        await page.screenshot(path="settings-spinner.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
