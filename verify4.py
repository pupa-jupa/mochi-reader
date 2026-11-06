from playwright.sync_api import sync_playwright, expect
import time

def verify(page):
    # Mock Tauri internals as per memory
    page.add_init_script("""
        window.__TAURI_INTERNALS__ = {
            invoke: async (cmd, args) => {
                if (cmd === "get_settings") return {};
                if (cmd === "list_collections") return [];
                if (cmd === "get_collection") return { id: "1", title: "Test Collection", description: "Test", items: [], itemCount: 0 };
                return new Promise((resolve) => setTimeout(() => resolve(null), 10000));
            }
        };
        localStorage.setItem('mochi:settings', JSON.stringify({ state: { settingsReady: true, onboardingComplete: true, theme: "sakura" }, version: 0 }));
    """)
    page.goto("http://localhost:1420/#/settings")
    time.sleep(2)

    # Scroll to the bottom to see diagnostics
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1)

    # take screenshot before loading
    page.screenshot(path="settings-scroll.png")

    # trigger diagnostics which will hang for 10 seconds to show spinner
    page.get_by_role("button", name="Открыть папку логов").click()
    page.get_by_role("button", name="Скопировать диагностическую информацию").click()
    time.sleep(1)

    # take screenshot while loading
    page.screenshot(path="settings-loading.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify(page)
        finally:
            browser.close()
