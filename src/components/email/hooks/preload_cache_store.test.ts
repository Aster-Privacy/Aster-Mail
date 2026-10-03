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
import type { PreloadedEmail } from "./preload_cache";

import { describe, it, expect, beforeEach } from "vitest";

import { get_preload_cache, get_preloaded_email } from "./preload_cache";
import {
  clear_preload_cache,
  get_preload_email_font_stack,
  get_preload_email_zoom,
  mark_preload_stale,
  set_preload_email_font_px,
  set_preload_email_font_stack,
} from "./preload_cache_store";

import { LOCKDOWN_CHANGED_EVENT } from "@/services/lockdown_store";
import {
  get_cached_iframe_height,
  set_cached_iframe_height,
} from "@/components/email/sandboxed_email_renderer";

function seed_entry(): void {
  get_preload_cache().set("email_1", {
    mail_item: { id: "email_1", thread_token: "thread_1" },
    thread_cid_resolved: new Map(),
    time: Date.now(),
    is_stale: false,
    conversation_grouping: true,
  } as unknown as PreloadedEmail);
}

describe("preload cache store", () => {
  beforeEach(() => {
    clear_preload_cache();
  });

  it("clears entries the preloader cached", () => {
    seed_entry();

    clear_preload_cache();

    expect(get_preloaded_email("email_1")).toBeNull();
  });

  it("marks entries the preloader cached as stale", () => {
    seed_entry();

    mark_preload_stale("email_1");

    expect(get_preloaded_email("email_1")?.is_stale).toBe(true);
  });

  it("clears the cache when lockdown changes", () => {
    seed_entry();

    window.dispatchEvent(new CustomEvent(LOCKDOWN_CHANGED_EVENT));

    expect(get_preload_cache().size).toBe(0);
  });

  it("drops measured heights only when the email font changes", () => {
    set_preload_email_font_px(14);
    set_cached_iframe_height("email_1", 120);

    set_preload_email_font_px(14);
    expect(get_cached_iframe_height("email_1")).toBe(120);

    set_preload_email_font_px(16);
    expect(get_preload_email_zoom()).toBe("1.143");
    expect(get_cached_iframe_height("email_1")).toBeUndefined();

    set_cached_iframe_height("email_1", 120);
    set_preload_email_font_stack("serif");
    expect(get_preload_email_font_stack()).toBe("serif");
    expect(get_cached_iframe_height("email_1")).toBeUndefined();
  });
});
