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

const audit_user = process.env.PRESS_AUDIT_USER;
const audit_pass = process.env.PRESS_AUDIT_PASS;
const row_selector = '[data-row-email-id] > [role="button"]';

interface ViewReport {
  view: string;
  checked: number;
  missing: string[];
  stuck: string[];
  excluded: Record<string, number>;
}

const reports: ViewReport[] = [];

async function audit_view(page: Page, view: string) {
  const report = await page.evaluate((name) => {
    const interactive = [
      "button",
      '[role="button"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="option"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="treeitem"]',
      '[role="link"]',
      "summary",
      "a[href]",
      "[data-pressable]",
    ].join(",");
    const editable =
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
    const w = window as unknown as { __press_audit_guard?: boolean };

    if (!w.__press_audit_guard) {
      w.__press_audit_guard = true;
      const stop = (e: Event) => {
        if (e.isTrusted) return;
        e.stopImmediatePropagation();
      };

      for (const type of [
        "pointerdown",
        "pointerup",
        "pointercancel",
        "mousedown",
      ]) {
        document.addEventListener(type, stop, true);
      }
    }

    const excluded: Record<string, number> = {};
    const exclude = (reason: string) => {
      excluded[reason] = (excluded[reason] ?? 0) + 1;
    };
    const describe = (el: Element) => {
      const label =
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("data-testid") ||
        (el.textContent ?? "").trim().slice(0, 40);
      const role = el.getAttribute("role");

      return `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ""} "${label}"`;
    };
    const hidden = (el: Element) => {
      let node: Element | null = el;

      while (node) {
        const style = getComputedStyle(node);

        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          parseFloat(style.opacity) === 0
        ) {
          return true;
        }
        node = node.parentElement;
      }

      return false;
    };

    const candidates = new Set<HTMLElement>();

    for (const el of document.querySelectorAll<HTMLElement>(interactive)) {
      candidates.add(el);
    }
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (getComputedStyle(el).cursor !== "pointer") continue;
      const parent = el.parentElement;

      if (parent && getComputedStyle(parent).cursor === "pointer") continue;
      if (el.closest(interactive)) continue;
      candidates.add(el);
    }

    const missing: string[] = [];
    const stuck: string[] = [];
    let checked = 0;

    for (const el of candidates) {
      if (el.closest(".aster_press_overlay")) continue;
      const rect = el.getBoundingClientRect();

      if (
        rect.width < 2 ||
        rect.height < 2 ||
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= innerHeight ||
        rect.left >= innerWidth
      ) {
        exclude("offscreen or zero size");
        continue;
      }
      if (hidden(el)) {
        exclude("visually hidden until hover or focus");
        continue;
      }
      if (el.closest(editable)) {
        exclude("editable field");
        continue;
      }
      if (el.closest("[data-no-press]")) {
        exclude("opted out with data-no-press");
        continue;
      }
      if (el.closest(':disabled, [aria-disabled="true"], [data-disabled]')) {
        exclude("disabled");
        continue;
      }
      if (el.matches("[data-press-skip]")) {
        exclude("row action strip container (data-press-skip)");
        continue;
      }
      if (
        el.matches('a[href], [role="link"]') &&
        getComputedStyle(el).display === "inline"
      ) {
        exclude("inline text link");
        continue;
      }

      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 91,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };

      el.dispatchEvent(new PointerEvent("pointerdown", init));
      const marked = document.querySelector("[data-aster-press]");
      const ok =
        !!marked &&
        (marked === el ||
          marked.contains(el) ||
          marked.classList.contains("aster_press_overlay"));

      el.dispatchEvent(new PointerEvent("pointercancel", init));
      checked += 1;
      if (!ok) missing.push(describe(el));
      if (
        document.querySelector("[data-aster-press]:not(.aster_press_overlay)")
      ) {
        stuck.push(describe(el));
      }
    }

    return { view: name, checked, missing, stuck, excluded };
  }, view);

  reports.push(report);

  return report;
}

async function sign_in(page: Page) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="password"]', { timeout: 240_000 });
  await page
    .locator("input")
    .nth(0)
    .fill(audit_user ?? "");
  await page.locator('input[type="password"]').fill(audit_pass ?? "");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/u\//, { timeout: 180_000 });
  await page.waitForSelector(row_selector, { timeout: 180_000 });
  await page.waitForTimeout(2000);
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

async function back_to_inbox(page: Page, inbox_url: string) {
  await page.goto(inbox_url);
  await page.waitForSelector(row_selector, { timeout: 120_000 });
  await page.waitForTimeout(1000);
}

test.skip(
  !audit_user || !audit_pass,
  "set PRESS_AUDIT_USER and PRESS_AUDIT_PASS to run the press audit",
);

test("every interactive element shows press feedback", async ({ page }) => {
  await sign_in(page);
  const inbox_url = page.url();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((mode) => {
      document.documentElement.classList.toggle("dark", mode === "dark");
    }, theme);
    await audit_view(page, `inbox ${theme}`);
  }

  await page.locator(row_selector).nth(1).click({ button: "right" });
  await page.waitForSelector('[role="menu"]');
  await audit_view(page, "row menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const menu_triggers = page.locator('[aria-haspopup="menu"]');
  const trigger_count = Math.min(await menu_triggers.count(), 8);

  for (let i = 0; i < trigger_count; i += 1) {
    const trigger = menu_triggers.nth(i);

    if (!(await trigger.isVisible())) continue;
    await trigger.click();
    await page.waitForTimeout(400);
    if (await page.locator('[role="menu"]').count()) {
      await audit_view(page, `menu ${i + 1}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  await page.getByRole("button", { name: "Compose" }).first().click();
  await page.waitForTimeout(1500);
  await audit_view(page, "compose");
  await back_to_inbox(page, inbox_url);

  await page.locator(row_selector).first().click();
  await page.waitForTimeout(2000);
  await audit_view(page, "thread");
  await back_to_inbox(page, inbox_url);

  await page.goto("/settings/behavior");
  await page.waitForTimeout(3000);
  await audit_view(page, "settings");
  const sections = page.locator(
    process.env.PRESS_AUDIT_SECTIONS ?? "aside nav button",
  );
  const section_count = Math.min(await sections.count(), 40);

  for (let i = 0; i < section_count; i += 1) {
    const section = sections.nth(i);

    if (!(await section.isVisible())) continue;
    const label = ((await section.textContent()) ?? "").trim();

    await section.click();
    await page.waitForTimeout(1200);
    await audit_view(page, `settings ${label || i + 1}`);
  }

  if (process.env.PRESS_AUDIT_REPORT) {
    const { writeFileSync } = await import("node:fs");

    writeFileSync(
      process.env.PRESS_AUDIT_REPORT,
      JSON.stringify(reports, null, 2),
    );
  }

  const missing = reports.flatMap((r) =>
    r.missing.map((m) => `${r.view}: ${m}`),
  );
  const stuck = reports.flatMap((r) => r.stuck.map((m) => `${r.view}: ${m}`));

  expect(reports.reduce((n, r) => n + r.checked, 0)).toBeGreaterThan(50);
  expect(stuck, "press state stayed after cancel").toEqual([]);
  expect(missing, "interactive elements without press feedback").toEqual([]);
});
