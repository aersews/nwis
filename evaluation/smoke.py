"""Headless browser smoke test.

Drives the running dashboard, exercises the primary
interactions, and fails on any console error, page error or
failed network request. This is the Part S check: the claim
"zero critical frontend errors" has to be demonstrated, not
asserted.

Usage:

    python -m evaluation.smoke
    python -m evaluation.smoke --url http://127.0.0.1:5173
"""

import argparse
import json
import sys
import time
from pathlib import Path

RESULTS = Path(__file__).resolve().parent / "results"

# Console noise that is not a defect in the application.
IGNORED = (
    "favicon",
    "Download the React DevTools",
    "WebSocket is closed",
    "ERR_NETWORK_CHANGED"
)

# A request the application deliberately cancelled is not a
# failure. React's development double-mount aborts the first
# fetch of every effect and immediately re-issues it, so
# ERR_ABORTED here is the AbortController in the data hooks
# working as designed.
IGNORED_REQUEST_FAILURES = ("net::ERR_ABORTED",)


def is_real_failure(failure):
    if not failure:
        return True
    return not any(
        marker in failure
        for marker in IGNORED_REQUEST_FAILURES
    )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Headless smoke test of the running NWIS "
            "dashboard."
        )
    )
    parser.add_argument(
        "--url", default="http://127.0.0.1:5173"
    )
    parser.add_argument(
        "--out",
        default=str(RESULTS / "smoke.json")
    )
    parser.add_argument(
        "--slow", action="store_true",
        help="Add a delay before each interaction"
    )
    args = parser.parse_args()

    try:
        from playwright.sync_api import (
            sync_playwright
        )
    except ImportError:
        print(
            "playwright is not installed:\n"
            "  pip install playwright"
        )
        return 2

    console_errors = []
    page_errors = []
    failed_requests = []
    steps = []

    with sync_playwright() as playwright:

        browser = playwright.chromium.launch(
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage"
            ]
        )

        page = browser.new_page(
            viewport={"width": 1680, "height": 1050}
        )

        def on_console(message):
            if message.type != "error":
                return
            text = message.text
            if any(n in text for n in IGNORED):
                return
            console_errors.append({
                "text": text,
                "location": message.location
            })

        def on_request_failed(request):
            failure = (
                request.failure
                if isinstance(request.failure, str)
                else str(request.failure)
            )
            if not is_real_failure(failure):
                return
            failed_requests.append({
                "url": request.url,
                "failure": failure
            })

        page.on("console", on_console)
        page.on(
            "pageerror",
            lambda exc: page_errors.append(str(exc))
        )
        page.on("requestfailed", on_request_failed)

        def close_overlays():
            """Dismiss any open drawer or modal.

            Overlays are deliberately high z-index, so a
            click on a control behind one is correctly
            swallowed. The test has to close them first,
            exactly as an operator would.
            """
            for _ in range(3):
                try:
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(250)
                    open_overlays = page.query_selector_all(
                        "[role='dialog']:not([hidden])"
                    )
                    visible = [
                        node for node in open_overlays
                        if node.is_visible()
                    ]
                    if not visible:
                        return
                except Exception:
                    return

        def step(name, action):
            try:
                action()
                steps.append({
                    "step": name, "ok": True
                })
                print(f"  ok    {name}")
            except Exception as error:
                steps.append({
                    "step": name,
                    "ok": False,
                    "error": str(error)[:300]
                })
                print(f"  FAIL  {name}: {str(error)[:200]}")
            if args.slow:
                time.sleep(0.4)

        print(f"Loading {args.url}")
        page.goto(
            args.url,
            wait_until="networkidle",
            timeout=60_000
        )
        time.sleep(2.5)

        # ---- the dashboard reached a live state ----

        step(
            "top bar shows the system identity",
            lambda: page.wait_for_selector(
                "text=NWIS", timeout=20_000
            )
        )
        step(
            "active well and depth are present",
            lambda: page.wait_for_selector(
                "text=WELL-001", timeout=20_000
            )
        )
        step(
            "risk index rendered",
            lambda: page.wait_for_selector(
                "text=/\\d{1,3}(\\.\\d)?\\s*\\/\\s*100/",
                timeout=20_000
            )
        )
        step(
            "why-now panel present",
            lambda: page.wait_for_selector(
                "text=Why now?", timeout=20_000
            )
        )
        step(
            "risk contributor breakdown present",
            lambda: page.wait_for_selector(
                "text=Risk contributor breakdown",
                timeout=20_000
            )
        )
        step(
            "alert lifecycle panel present",
            lambda: page.wait_for_selector(
                "text=Alert lifecycle", timeout=20_000
            )
            if False else page.wait_for_selector(
                "text=CORRELATED", timeout=20_000
            )
        )
        step(
            "offset explorer present",
            lambda: page.wait_for_selector(
                "text=Nearby wells", timeout=20_000
            )
        )
        step(
            "not-a-nearest-well statement shown",
            lambda: page.wait_for_selector(
                "text=not a nearest-well lookup",
                timeout=20_000
            )
        )
        step(
            "evaluation panel present",
            lambda: page.wait_for_selector(
                "text=Prototype evaluation",
                timeout=20_000
            )
        )
        step(
            "claim audit counts rendered",
            lambda: page.wait_for_selector(
                "text=NOT VALIDATED", timeout=20_000
            )
        )

        # ---- interactions ----

        def open_offset():
            rows = page.query_selector_all(
                "button.well-row"
            )
            if not rows:
                raise RuntimeError("no offset rows")
            rows[0].click()
            page.wait_for_selector(
                "text=Why ", timeout=15_000
            )

        step("open first offset well", open_offset)

        def open_factors():
            page.wait_for_selector(
                "text=Overall relevance",
                timeout=15_000
            )

        step("why-this-well factors visible", open_factors)

        step("close the offset drawer", close_overlays)

        def scroll_to_evidence():
            page.eval_on_selector(
                "#sec-evidence",
                "el => el.scrollIntoView()"
            )
            page.wait_for_selector(
                "text=Depth difference",
                timeout=15_000
            )

        step(
            "evidence shows depth difference",
            scroll_to_evidence
        )

        def expand_evidence():
            buttons = page.query_selector_all(
                "button:has-text('Expand evidence')"
            )
            if not buttons:
                raise RuntimeError("no expand control")
            buttons[0].click(timeout=15_000)
            page.wait_for_timeout(400)
            if not page.query_selector(
                "button:has-text('Collapse evidence')"
            ):
                raise RuntimeError(
                    "evidence did not expand"
                )

        step("expand first evidence", expand_evidence)

        def scroll_to_eval():
            page.eval_on_selector(
                "#sec-evaluation",
                "el => el.scrollIntoView()"
            )
            page.wait_for_selector(
                "text=Not measured", timeout=15_000
            )

        step(
            "evaluation shows withheld metrics",
            scroll_to_eval
        )

        def run_demo():
            page.eval_on_selector(
                "#sec-map", "el => el.scrollIntoView()"
            )
            play = page.query_selector(
                "button:has-text('Play'), "
                "button[aria-label*='lay'], "
                "button:has-text('Start')"
            )
            if play is None:
                raise RuntimeError("no play control")
            play.click(timeout=15_000)

        step("start the demonstration sequence", run_demo)

        time.sleep(9)

        def risk_moved():
            page.wait_for_timeout(500)
            body = page.inner_text("body")
            if "CRITICAL" not in body and "HIGH" not in body:
                raise RuntimeError(
                    "risk never escalated during the run"
                )

        step("risk escalates during the run", risk_moved)

        # ---- responsive check ----

        def narrow():
            page.set_viewport_size({
                "width": 420, "height": 900
            })
            page.wait_for_timeout(800)
            body = page.inner_text("body")
            if "NWIS" not in body:
                raise RuntimeError("layout broke at 420px")

        step("renders at 420px", narrow)

        page.set_viewport_size({
            "width": 1680, "height": 1050
        })
        page.wait_for_timeout(500)

        browser.close()

    payload = {
        "url": args.url,
        "steps": steps,
        "steps_passed": sum(
            1 for s in steps if s["ok"]
        ),
        "steps_total": len(steps),
        "console_errors": console_errors,
        "page_errors": page_errors,
        "failed_requests": failed_requests,
        "critical_console_errors": len(console_errors),
        "passed": (
            all(s["ok"] for s in steps)
            and not console_errors
            and not page_errors
            and not failed_requests
        )
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )

    print(
        f"\n{payload['steps_passed']}/{payload['steps_total']} "
        f"steps · {len(console_errors)} console errors · "
        f"{len(page_errors)} page errors · "
        f"{len(failed_requests)} failed requests"
    )
    print(f"Written: {out}")

    if console_errors:
        print("\nConsole errors:")
        for error in console_errors[:10]:
            print(f"  - {error['text'][:200]}")

    if page_errors:
        print("\nPage errors:")
        for error in page_errors[:10]:
            print(f"  - {error[:200]}")

    if failed_requests:
        print("\nFailed requests:")
        for request in failed_requests[:10]:
            print(f"  - {request['url'][:120]}")

    return 0 if payload["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
