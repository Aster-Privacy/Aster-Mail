//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  capture_source,
  clear_source,
  normalize_click_id,
  normalize_label,
  read_source,
} from "./acquisition_source";

function set_privacy_signal(value: boolean | undefined): void {
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value,
    configurable: true,
  });
}

describe("acquisition_source", () => {
  beforeEach(() => {
    set_privacy_signal(undefined);
    clear_source();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("captures the campaign labels from the url", () => {
    const captured = capture_source(
      "?utm_source=reddit&utm_medium=cpc&utm_campaign=privacy-launch",
    );
    expect(captured).toEqual({
      acquisition_source: "reddit",
      acquisition_medium: "cpc",
      acquisition_campaign: "privacy-launch",
    });
  });

  it("lowercases labels so counts do not fragment", () => {
    expect(normalize_label("Reddit")).toBe("reddit");
    expect(capture_source("?utm_source=REDDIT").acquisition_source).toBe(
      "reddit",
    );
  });

  it("rejects hostile or oversized labels", () => {
    for (const bad of [
      "<script>",
      "<script> alert(1)",
      "user@example.com",
      "a".repeat(65),
      "",
    ]) {
      expect(normalize_label(bad)).toBeNull();
    }
    expect(capture_source("?utm_source=<script>")).toEqual({});
  });

  it("captures nothing for an organic visitor", () => {
    expect(capture_source("")).toEqual({});
    expect(capture_source("?ref=friend")).toEqual({});
  });

  it("writes nothing to device storage", () => {
    capture_source("?utm_source=reddit&utm_campaign=launch");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("does not survive a full page load", async () => {
    capture_source("?utm_source=reddit");
    expect(read_source().acquisition_source).toBe("reddit");
    vi.resetModules();
    const fresh = await import("./acquisition_source");
    expect(fresh.read_source()).toEqual({});
  });

  it("keeps labels across in-app navigation that drops the query", () => {
    capture_source("?utm_source=reddit&utm_campaign=launch");
    expect(capture_source("")).toEqual({
      acquisition_source: "reddit",
      acquisition_campaign: "launch",
    });
  });

  it("keeps the click id across in-app navigation that drops the query", () => {
    capture_source("?utm_source=reddit&rdt_cid=3184742045291813272");
    expect(capture_source("").reddit_click_id).toBe("3184742045291813272");
  });

  it("does not let the click id survive a full page load", async () => {
    capture_source("?rdt_cid=3184742045291813272");
    expect(read_source().reddit_click_id).toBe("3184742045291813272");
    vi.resetModules();
    const fresh = await import("./acquisition_source");
    expect(fresh.read_source().reddit_click_id).toBeUndefined();
  });

  it("honors global privacy control", () => {
    set_privacy_signal(true);
    expect(capture_source("?utm_source=reddit")).toEqual({});
    expect(read_source()).toEqual({});
  });

  it("drops already captured labels when the signal appears", () => {
    capture_source("?utm_source=reddit");
    set_privacy_signal(true);
    expect(read_source()).toEqual({});
  });

  it("carries the reddit click id and nothing else that identifies a person", () => {
    const captured = capture_source(
      "?utm_source=reddit&utm_campaign=launch&rdt_cid=3184742045291813272&email=a@b.c&fbclid=xyz",
    );
    expect(captured.reddit_click_id).toBe("3184742045291813272");
    expect(JSON.stringify(captured)).not.toContain("a@b.c");
    expect(JSON.stringify(captured)).not.toContain("xyz");
    expect(Object.keys(captured).sort()).toEqual([
      "acquisition_campaign",
      "acquisition_source",
      "reddit_click_id",
    ]);
  });

  it("keeps the click id verbatim instead of normalizing it", () => {
    const captured = capture_source("?rdt_cid=Abc-123_XY~z");
    expect(captured.reddit_click_id).toBe("Abc-123_XY~z");
  });

  it("drops click ids that are absent, hostile, or over length", () => {
    expect(normalize_click_id(null)).toBeNull();
    expect(normalize_click_id("")).toBeNull();
    expect(normalize_click_id("   ")).toBeNull();
    expect(normalize_click_id("<script>")).toBeNull();
    expect(normalize_click_id("a b")).toBeNull();
    expect(normalize_click_id("a/b")).toBeNull();
    expect(normalize_click_id("a?b=1")).toBeNull();
    expect(normalize_click_id("user@example.com")).toBeNull();
    expect(normalize_click_id("https://evil.example/x")).toBeNull();
    expect(normalize_click_id("a".repeat(513))).toBeNull();
    expect(normalize_click_id("a".repeat(512))).toBe("a".repeat(512));
  });

  it("drops the click id when a privacy signal is set", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true, doNotTrack: null });
    expect(capture_source("?rdt_cid=3184742045291813272")).toEqual({});
  });

  it("normalizes reddit dynamic macro output the same way the backend does", () => {
    expect(normalize_label("Privacy Launch")).toBe("privacy_launch");
    expect(normalize_label("Privacy  Launch  v2")).toBe("privacy_launch_v2");
    expect(normalize_label("  Switch Guide  ")).toBe("switch_guide");
    expect(normalize_label("US - Broad")).toBe("us_-_broad");
    expect(normalize_label("US_Broad")).toBe("us_broad");
    expect(normalize_label("drop table")).toBe("drop_table");
    expect(normalize_label("   ")).toBeNull();
    expect(normalize_label("<script> alert(1)")).toBeNull();
    expect(normalize_label("campaign?x=1")).toBeNull();
    expect(normalize_label("a b".repeat(40))).toBeNull();
  });

  it("captures a campaign whose reddit name contains spaces", () => {
    const captured = capture_source(
      "?utm_source=Reddit&utm_medium=CPC&utm_campaign=Privacy%20Launch",
    );
    expect(captured).toEqual({
      acquisition_source: "reddit",
      acquisition_medium: "cpc",
      acquisition_campaign: "privacy_launch",
    });
  });
  it("captures the ad and keyword labels so creatives can be compared", () => {
    const captured = capture_source(
      "?utm_source=reddit&utm_campaign=privacy_launch&utm_content=Hero%20V3&utm_term=private%20email",
    );
    expect(captured).toEqual({
      acquisition_source: "reddit",
      acquisition_campaign: "privacy_launch",
      acquisition_content: "hero_v3",
      acquisition_term: "private_email",
    });
  });

  it("drops a hostile creative label without dropping the campaign", () => {
    const captured = capture_source(
      "?utm_source=reddit&utm_content=%3Cscript%3E&utm_term=ok",
    );
    expect(captured).toEqual({
      acquisition_source: "reddit",
      acquisition_term: "ok",
    });
  });
});
