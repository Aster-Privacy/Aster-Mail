//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { test, expect, type Page } from "@playwright/test";

async function row_centers(page: Page, n: number) {
  return page.evaluate((count) => {
    return [...document.querySelectorAll("[data-row-email-id] > div")]
      .slice(0, count)
      .map((row) => {
        const box = row.getBoundingClientRect();

        return { x: box.left + box.width * 0.55, y: box.top + box.height / 2 };
      });
  }, n);
}

async function observe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __budget: { long: number[]; events: number[] };
    };

    w.__budget = { long: [], events: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        w.__budget.long.push(entry.duration);
    }).observe({ type: "longtask", buffered: false });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__budget.events.push(entry.duration);
      }
    }).observe({
      type: "event",
      durationThreshold: 16,
      buffered: false,
    } as never);
  });
}

async function take(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __budget: { long: number[]; events: number[] };
      __perf: { commits: number; reset: () => void };
    };
    const out = { ...w.__budget, commits: w.__perf.commits };

    w.__budget = { long: [], events: [] };
    w.__perf.reset();

    return out;
  });
}

test("row hover and click stay inside the frame budget", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);

  await page.goto("/perf_budget/hover_harness.html");
  await page.waitForSelector("[data-row-email-id]");
  await page.waitForTimeout(1000);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await observe(page);
  await take(page);

  const centers = await row_centers(page, 12);

  await page.mouse.move(centers[0].x, centers[0].y - 40);
  for (const c of centers) await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(300);
  const sweep = await take(page);

  expect(sweep.commits).toBe(0);
  expect(sweep.long.filter((d) => d > 50)).toEqual([]);

  for (const c of centers.slice(0, 8)) {
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
  const clicks = await take(page);

  const sorted = [...clicks.events].sort((a, b) => a - b);

  expect(clicks.commits).toBeLessThanOrEqual(8);
  expect(clicks.long.filter((d) => d > 100)).toEqual([]);
  expect(sorted[Math.floor(sorted.length / 2)] ?? 0).toBeLessThan(100);
});
