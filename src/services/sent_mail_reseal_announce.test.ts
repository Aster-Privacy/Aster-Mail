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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ refreshes: 0 }));

vi.mock("@/hooks/mail_events", () => ({
  emit_refresh_requested: () => {
    h.refreshes += 1;
  },
}));

import { announce_sent_mail_resealed } from "./sent_mail_reseal";

const summary = (rewritten: number) => ({
  checked: 4,
  rewritten,
  unreadable: 0,
  failed: 0,
});

describe("announcing a finished sent mail reseal", () => {
  beforeEach(() => {
    h.refreshes = 0;
  });

  it("reloads the mail list when items were resealed with the new password", () => {
    announce_sent_mail_resealed(summary(3));

    expect(h.refreshes).toBe(1);
  });

  it("leaves the mail list alone when nothing was rewritten", () => {
    announce_sent_mail_resealed(summary(0));
    announce_sent_mail_resealed(null);

    expect(h.refreshes).toBe(0);
  });
});
