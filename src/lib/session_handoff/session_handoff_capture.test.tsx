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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";

const runtime = vi.hoisted(() => ({ tauri: false }));

vi.mock("@/lib/tauri_runtime", () => ({
  has_tauri_runtime: () => runtime.tauri,
}));

import {
  HANDOFF_GRANT_HASH_PREFIX,
  PENDING_GRANT_KEY,
  capture_handoff_grant,
  strip_handoff_hash,
} from "./session_handoff_capture";

import { email_id_from_hash } from "@/lib/stale_open_email";

const GRANT = "g".repeat(43);

let container: HTMLDivElement;
let root: Root;
let seen_hash = "";

function HashProbe() {
  seen_hash = useLocation().hash;

  return null;
}

async function mount_router() {
  await act(async () => {
    root.render(
      <BrowserRouter basename="/u/0">
        <HashProbe />
      </BrowserRouter>,
    );
  });
}

beforeEach(() => {
  runtime.tauri = false;
  seen_hash = "";
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `/u/0/${HANDOFF_GRANT_HASH_PREFIX}${GRANT}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

describe("capture_handoff_grant", () => {
  it("keeps a grant from a sibling app launch out of the mail router", async () => {
    capture_handoff_grant();
    await mount_router();

    expect(window.location.hash).toBe("");
    expect(seen_hash).toBe("");
    expect(email_id_from_hash(seen_hash)).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBe(GRANT);
  });

  it("leaves a stale hash in the router when the grant is taken after mount", async () => {
    await mount_router();
    expect(strip_handoff_hash()).toBe(GRANT);

    expect(window.location.hash).toBe("");
    expect(seen_hash).toBe(`${HANDOFF_GRANT_HASH_PREFIX}${GRANT}`);
    expect(email_id_from_hash(seen_hash)).toBeNull();
  });

  it("strips a malformed grant without storing it", () => {
    window.history.replaceState(null, "", `/u/0/${HANDOFF_GRANT_HASH_PREFIX}short`);

    capture_handoff_grant();

    expect(window.location.hash).toBe("");
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBeNull();
  });

  it("leaves an open email hash alone", () => {
    window.history.replaceState(null, "", "/u/0/#3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b");

    capture_handoff_grant();

    expect(window.location.hash).toBe("#3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b");
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBeNull();
  });

  it("does nothing in the desktop shell", () => {
    runtime.tauri = true;

    capture_handoff_grant();

    expect(window.location.hash).toBe(`${HANDOFF_GRANT_HASH_PREFIX}${GRANT}`);
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBeNull();
  });
});
