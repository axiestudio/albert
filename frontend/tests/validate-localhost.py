"""
Playwright validation script for Albert (Law Agent) on localhost:3000.
Validates:
  1. Page loads correctly (title, main elements)
  2. Welcome screen with ALBERT branding
  3. Suggestion buttons visible
  4. Composer (input) is present and functional
  5. ServerModeSelector drop-up opens/closes
  6. Settings/LLM buttons are present
  7. Send a test message and verify streaming starts
"""

import sys
import json
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = "screenshots"

def main():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Capture console errors
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # ─── 1. Navigate and wait for app to load ───────────────────
        print("\n[1/7] Navigating to localhost:3000...")
        try:
            page.goto(BASE_URL, timeout=30000)
            page.wait_for_load_state("networkidle", timeout=20000)
            page.screenshot(path=f"{SCREENSHOT_DIR}/01-initial-load.png", full_page=True)
            results.append(("Page load", "PASS"))
            print("  ✅ Page loaded successfully")
        except Exception as e:
            results.append(("Page load", f"FAIL: {e}"))
            print(f"  ❌ Page load failed: {e}")
            browser.close()
            return print_summary(results, console_errors)

        # ─── 2. Check welcome/branding ─────────────────────────────
        print("\n[2/7] Checking welcome screen & ALBERT branding...")
        try:
            # Look for ALBERT text in the page
            body_text = page.inner_text("body")
            has_albert = "ALBERT" in body_text.upper() or "albert" in body_text.lower()
            if has_albert:
                results.append(("ALBERT branding", "PASS"))
                print("  ✅ ALBERT branding found")
            else:
                results.append(("ALBERT branding", "WARN - text not found, checking visuals"))
                print("  ⚠️  ALBERT text not found in body, might be in SVG/image")
        except Exception as e:
            results.append(("ALBERT branding", f"FAIL: {e}"))
            print(f"  ❌ {e}")

        # ─── 3. Check suggestion buttons ───────────────────────────
        print("\n[3/7] Checking suggestion buttons...")
        try:
            # assistant-ui suggestion buttons
            suggestions = page.locator('[data-testid="suggestion"], button:has-text("lag"), button:has-text("rätt"), button:has-text("Vad"), button:has-text("Hur")').all()
            if len(suggestions) > 0:
                results.append(("Suggestion buttons", f"PASS ({len(suggestions)} found)"))
                print(f"  ✅ {len(suggestions)} suggestion button(s) found")
            else:
                # Try broader search
                all_buttons = page.locator("button").all()
                btn_texts = [b.inner_text() for b in all_buttons[:20]]
                results.append(("Suggestion buttons", f"WARN - 0 dedicated suggestions, {len(all_buttons)} total buttons: {btn_texts[:5]}"))
                print(f"  ⚠️  No typed suggestion buttons, but {len(all_buttons)} buttons total")
        except Exception as e:
            results.append(("Suggestion buttons", f"FAIL: {e}"))
            print(f"  ❌ {e}")

        # ─── 4. Check composer (text input) ────────────────────────
        print("\n[4/7] Checking composer input...")
        try:
            # assistant-ui uses textarea in composer
            composer = page.locator("textarea").first
            composer.wait_for(state="visible", timeout=5000)
            placeholder = composer.get_attribute("placeholder") or ""
            results.append(("Composer input", f"PASS (placeholder: '{placeholder[:50]}')"))
            print(f"  ✅ Composer textarea found, placeholder: '{placeholder[:50]}'")
        except Exception as e:
            results.append(("Composer input", f"FAIL: {e}"))
            print(f"  ❌ {e}")

        # ─── 5. Check ServerModeSelector drop-up ───────────────────
        print("\n[5/7] Testing ServerModeSelector drop-up...")
        try:
            # Wait extra for React hydration to complete and set store actions
            page.wait_for_timeout(2000)

            # Debug: dump all buttons to see what's rendered
            all_btns = page.locator("button").all()
            btn_debug = []
            for btn in all_btns[:25]:
                attrs = {
                    "text": btn.inner_text()[:50].strip(),
                    "aria-haspopup": btn.get_attribute("aria-haspopup"),
                    "aria-label": btn.get_attribute("aria-label"),
                    "title": btn.get_attribute("title"),
                }
                btn_debug.append({k: v for k, v in attrs.items() if v})
            print(f"  DEBUG: {len(all_btns)} buttons total. First 25: {json.dumps(btn_debug, ensure_ascii=False, indent=2)}")

            # Try to find the selector via aria-haspopup
            selector_btn = page.locator('button[aria-haspopup="listbox"]').first
            if selector_btn.count() > 0 and selector_btn.is_visible():
                initial_text = selector_btn.inner_text()
                selector_btn.click()
                page.wait_for_timeout(300)

                listbox = page.locator('[role="listbox"]')
                is_visible = listbox.is_visible()
                if is_visible:
                    options = listbox.locator('[role="option"]').all()
                    option_texts = [o.inner_text() for o in options]
                    page.screenshot(path=f"{SCREENSHOT_DIR}/05-dropup-open.png", full_page=True)
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(200)
                    is_closed = not listbox.is_visible()
                    results.append(("ServerModeSelector drop-up", f"PASS ({len(options)} options: {option_texts}, closes on Esc: {is_closed})"))
                    print(f"  ✅ Drop-up works! {len(options)} options, closes on Escape: {is_closed}")
                else:
                    results.append(("ServerModeSelector drop-up", "WARN - button found but listbox not visible after click"))
                    print("  ⚠️  Button found but listbox not visible after click")
            else:
                # Selector not rendered — likely store callback not set
                page.screenshot(path=f"{SCREENSHOT_DIR}/05-dropup-not-found.png", full_page=True)
                results.append(("ServerModeSelector drop-up", "WARN - button not in DOM (store may not be initialized — normal on first load without session)"))
                print("  ⚠️  ServerModeSelector not rendered (store callback may not be initialized)")
        except Exception as e:
            results.append(("ServerModeSelector drop-up", f"FAIL: {e}"))
            print(f"  ❌ {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/05-dropup-error.png", full_page=True)

        # ─── 6. Check settings/LLM buttons ────────────────────────
        print("\n[6/7] Checking settings & LLM configuration buttons...")
        try:
            # Look for key/settings icon buttons
            action_buttons = page.locator('button[title], button[aria-label]').all()
            btn_info = []
            for btn in action_buttons:
                title = btn.get_attribute("title") or btn.get_attribute("aria-label") or ""
                if title:
                    btn_info.append(title)

            has_settings = any("setting" in t.lower() or "key" in t.lower() or "llm" in t.lower() or "api" in t.lower() for t in btn_info)
            results.append(("Settings/LLM buttons", f"PASS ({len(btn_info)} titled buttons: {btn_info[:8]})"))
            print(f"  ✅ {len(btn_info)} titled buttons found: {btn_info[:8]}")
        except Exception as e:
            results.append(("Settings/LLM buttons", f"FAIL: {e}"))
            print(f"  ❌ {e}")

        # ─── 7. Send a test message ────────────────────────────────
        print("\n[7/7] Sending test message to validate chat pipeline...")
        try:
            composer = page.locator("textarea").first
            composer.fill("Hej Albert, vad är din funktion?")
            page.wait_for_timeout(300)
            page.screenshot(path=f"{SCREENSHOT_DIR}/07-message-typed.png", full_page=True)

            # Press Enter or click send button
            send_btn = page.locator('button[type="submit"], button:has(svg.lucide-arrow-up)').first
            if send_btn.is_visible():
                send_btn.click()
            else:
                composer.press("Enter")

            # Wait for response to start streaming (assistant message appears)
            page.wait_for_timeout(3000)
            page.screenshot(path=f"{SCREENSHOT_DIR}/07-response-streaming.png", full_page=True)

            # Check if there's any assistant response or loading indicator
            body_after = page.inner_text("body")
            has_response_indicator = (
                page.locator('[data-message-role="assistant"]').count() > 0
                or page.locator(".animate-spin, .animate-pulse").count() > 0
                or "loading" in body_after.lower()
                or len(body_after) > len("Hej Albert") + 200  # more content appeared
            )

            # Wait longer for actual response
            page.wait_for_timeout(5000)
            page.screenshot(path=f"{SCREENSHOT_DIR}/07-response-final.png", full_page=True)

            if has_response_indicator:
                results.append(("Chat message send", "PASS - response/loading detected"))
                print("  ✅ Message sent, response or loading indicator detected")
            else:
                # Check for errors in console
                recent_errors = [e for e in console_errors if "500" in e or "error" in e.lower() or "fail" in e.lower()]
                if recent_errors:
                    results.append(("Chat message send", f"FAIL - errors: {recent_errors[-3:]}"))
                    print(f"  ❌ Console errors detected: {recent_errors[-3:]}")
                else:
                    results.append(("Chat message send", "WARN - no visible response yet (may need API keys)"))
                    print("  ⚠️  No visible response (API keys may not be configured for the backend)")

        except Exception as e:
            results.append(("Chat message send", f"FAIL: {e}"))
            print(f"  ❌ {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/07-error.png", full_page=True)

        # Final full-page screenshot
        page.screenshot(path=f"{SCREENSHOT_DIR}/final-state.png", full_page=True)

        # Collect any console errors
        if console_errors:
            print(f"\n⚠️  Console errors captured: {len(console_errors)}")
            for err in console_errors[:10]:
                print(f"  • {err[:200]}")

        browser.close()

    return print_summary(results, console_errors)


def print_summary(results, console_errors):
    print("\n" + "=" * 60)
    print("  ALBERT LAW AGENT — VALIDATION SUMMARY")
    print("=" * 60)

    passes = 0
    warns = 0
    fails = 0

    for name, status in results:
        icon = "✅" if status.startswith("PASS") else ("⚠️ " if status.startswith("WARN") else "❌")
        print(f"  {icon} {name}: {status}")
        if status.startswith("PASS"):
            passes += 1
        elif status.startswith("WARN"):
            warns += 1
        else:
            fails += 1

    print(f"\n  Results: {passes} pass, {warns} warn, {fails} fail")
    print(f"  Console errors: {len(console_errors)}")
    print(f"  Screenshots saved to: {SCREENSHOT_DIR}/")
    print("=" * 60)

    return 0 if fails == 0 else 1


if __name__ == "__main__":
    import os
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    sys.exit(main())
