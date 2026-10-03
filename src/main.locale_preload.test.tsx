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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const events: string[] = [];

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: () => ({
      render: () => {
        events.push("render");
      },
    }),
  },
}));

vi.mock("@/lib/i18n/translations", async (import_original) => {
  const actual =
    await import_original<typeof import("@/lib/i18n/translations")>();

  return {
    ...actual,
    get_translations_async: (
      code: Parameters<typeof actual.get_translations_async>[0],
    ) => {
      events.push(`load:${code}`);

      return actual.get_translations_async(code);
    },
  };
});

vi.mock("@/App", () => ({ default: () => null }));
vi.mock("@/mobile_app", () => {
  events.push("chunk:mobile_app");

  return { default: () => null };
});
vi.mock("@/pages/sign_in", () => {
  events.push("chunk:sign_in");

  return { default: () => null };
});
vi.mock("@/pages/register", () => {
  events.push("chunk:register");

  return { default: () => null };
});
vi.mock("@/provider", () => ({
  Provider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/favicon_cache_db", () => ({
  evict_stale_favicons: () => Promise.resolve(),
}));
vi.mock("@/native/capacitor_bridge", () => ({
  initialize_capacitor: () => Promise.resolve(),
  hide_splash: () => Promise.resolve(),
  is_native_platform: () => false,
}));
vi.mock("@/services/send_queue", () => ({
  recover_fallback_sends: () => Promise.resolve(),
}));
vi.mock("@/native/offline_queue", () => ({
  initialize_offline_queue: () => Promise.resolve(),
}));
vi.mock("@/lib/version_check", () => ({
  start_version_check: () => {},
  version_check_blocking: () => Promise.resolve(),
}));
vi.mock("@/lib/security/console_warning", () => ({
  show_self_xss_warning: () => {},
}));
vi.mock("@/services/error_reporter", () => ({
  install_global_error_reporting: () => {},
}));

async function boot_with(
  language: string | null,
  browser_language = "en-US",
  path = "/",
) {
  if (language) {
    localStorage.setItem("astermail_language", language);
  }
  vi.spyOn(navigator, "language", "get").mockReturnValue(browser_language);
  window.history.replaceState(null, "", path);
  await import("@/main");
}

async function flush_imports() {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

beforeEach(() => {
  vi.resetModules();
  events.length = 0;
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startup locale preload", { timeout: 120_000 }, () => {
  it("starts loading a stored non-English locale before the first render", async () => {
    await boot_with("fr");

    expect(events).toEqual(["load:fr", "render"]);
  });

  it("starts loading a detected browser locale before the first render", async () => {
    await boot_with(null, "de-DE");

    expect(events).toEqual(["load:de", "render"]);
  });

  it("requests nothing extra for English", async () => {
    await boot_with("en", "en-US", "/sign-in");
    await flush_imports();

    expect(events).toEqual(["render"]);
  });

  it("fetches the sign-in page alongside the locale instead of after it", async () => {
    await boot_with("es", "en-US", "/sign-in");
    await vi.waitFor(() => expect(events).toContain("chunk:sign_in"), {
      timeout: 20_000,
    });

    expect(events.filter((event) => event === "render")).toHaveLength(1);
    expect(events.slice(0, 2)).toEqual(["load:es", "render"]);
  });

  it("fetches the mobile shell alongside the locale on phones", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
    );
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    await boot_with("it", "en-US", "/");
    await vi.waitFor(() => expect(events).toContain("chunk:mobile_app"), {
      timeout: 20_000,
    });

    expect(events.filter((event) => event === "render")).toHaveLength(1);
    expect(events.filter((event) => event.startsWith("chunk:"))).toEqual([
      "chunk:mobile_app",
    ]);
  });

  it("does not fetch a page chunk for a route it cannot predict", async () => {
    await boot_with("nl", "en-US", "/");
    await flush_imports();

    expect(events).toEqual(["load:nl", "render"]);
  });
});
