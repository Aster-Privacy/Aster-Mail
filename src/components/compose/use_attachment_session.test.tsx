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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  use_attachment_session,
  type AttachmentSession,
} from "./use_attachment_session";

let session: AttachmentSession;
let root: Root;
const on_pending_change = vi.fn();

function Probe() {
  session = use_attachment_session(on_pending_change);

  return null;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  on_pending_change.mockClear();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
});

it("tracks reads in the current session", () => {
  const first = session.begin_read();
  const second = session.begin_read();

  expect(session.is_current(first)).toBe(true);
  expect(session.has_pending_reads()).toBe(true);
  session.end_read(first);
  expect(session.has_pending_reads()).toBe(true);
  session.end_read(second);
  expect(session.has_pending_reads()).toBe(false);
  expect(on_pending_change).toHaveBeenLastCalledWith(false);
});

it("reset makes earlier tokens stale and clears pending reads", () => {
  const stale = session.begin_read();

  session.reset();
  expect(session.is_current(stale)).toBe(false);
  expect(session.has_pending_reads()).toBe(false);
  expect(on_pending_change).toHaveBeenLastCalledWith(false);
});

it("a stale end_read does not change the new session count", () => {
  const stale = session.begin_read();

  session.reset();
  const fresh = session.begin_read();

  on_pending_change.mockClear();
  session.end_read(stale);
  expect(session.has_pending_reads()).toBe(true);
  expect(on_pending_change).not.toHaveBeenCalled();
  expect(session.is_current(fresh)).toBe(true);
  session.end_read(fresh);
  expect(session.has_pending_reads()).toBe(false);
});

it("reset with no pending reads does not report a change", () => {
  session.reset();
  expect(on_pending_change).not.toHaveBeenCalled();
});

it("keeps the same object across renders", async () => {
  const first = session;

  await act(async () => root.render(<Probe />));
  expect(session).toBe(first);
});

it("unmount makes every token stale", async () => {
  const token = session.begin_read();
  const before = session;

  await act(async () => root.unmount());
  expect(before.is_current(token)).toBe(false);
  expect(before.has_pending_reads()).toBe(false);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});
