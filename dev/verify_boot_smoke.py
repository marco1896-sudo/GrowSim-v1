#!/usr/bin/env python3
"""Minimal browser boot smoke gate.

Usage:
  python dev/verify_boot_smoke.py --url http://127.0.0.1:5173
"""

import argparse
import asyncio
import sys

from playwright.async_api import async_playwright


async def run(url: str) -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        console_errors = []
        page_errors = []

        def on_console(msg):
            if msg.type == 'error':
                console_errors.append(msg.text)

        page.on('console', on_console)
        page.on('pageerror', lambda exc: page_errors.append(str(exc)))

        await page.goto(url, wait_until='load')
        await page.wait_for_timeout(1200)

        status = await page.evaluate(
            """() => ({
                bootOk: window.__gsBootOk === true,
                ownership: window.__gsDomainOwnership || null
            })"""
        )

        await browser.close()

    ownership_ok = isinstance(status.get('ownership'), dict)
    if page_errors:
        print('FAIL: page errors detected')
        for entry in page_errors:
            print(f'  pageerror: {entry}')
        return 1

    if console_errors:
        print('FAIL: console error messages detected')
        for entry in console_errors:
            print(f'  console.error: {entry}')
        return 1

    if not status.get('bootOk'):
        print(f"FAIL: boot flag not ready: {status}")
        return 1

    if not ownership_ok:
        print(f"FAIL: ownership map missing: {status}")
        return 1

    print(f"Boot smoke passed: {status}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5173')
    args = parser.parse_args()

    try:
        return asyncio.run(run(args.url))
    except Exception as exc:  # noqa: BLE001
        print(f'FAIL: boot smoke execution error: {exc}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
