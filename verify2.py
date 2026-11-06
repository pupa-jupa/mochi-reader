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
                return null;
            }
        };
        localStorage.setItem('mochi:settings', JSON.stringify({ state: { settingsReady: true, onboardingComplete: true, theme: "sakura" }, version: 0 }));
    """)
    page.goto("http://localhost:1420/#/")
    time.sleep(1)

    try:
      page.get_by_role("button", name="Дальше").click(timeout=1000)
      time.sleep(1)
      page.get_by_role("button", name="Дальше").click(timeout=1000)
      time.sleep(1)
      page.get_by_role("button", name="Начать читать").click(timeout=1000)
      time.sleep(1)
    except:
      pass

    page.goto("http://localhost:1420/#/settings")
    time.sleep(2)
    page.screenshot(path="settings.png", full_page=True)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify(page)
        finally:
            browser.close()
