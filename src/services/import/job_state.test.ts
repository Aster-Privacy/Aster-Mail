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
import { describe, it, expect } from "vitest";

import {
  STALE_IMPORT_JOB_MS,
  INTERRUPTED_ERROR_MESSAGE,
  IMPORT_JOB_INTERRUPTED_CODE,
  can_delete_job,
  get_display_status,
  is_job_interrupted,
  is_job_lost_response,
  is_job_running,
  is_job_stale,
} from "./job_state";

import { type ImportStatus } from "@/services/api/email_import";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");

function job(
  status: ImportStatus,
  idle_ms: number,
  error_message: string | null = null,
) {
  return {
    status,
    updated_at: new Date(NOW - idle_ms).toISOString(),
    error_message,
  };
}

describe("import job state", () => {
  it("keeps a recently active import running and undeletable", () => {
    for (const status of ["pending", "processing"] as const) {
      const live = job(status, STALE_IMPORT_JOB_MS - 60_000);

      expect(is_job_stale(live, NOW)).toBe(false);
      expect(is_job_running(live, NOW)).toBe(true);
      expect(can_delete_job(live, NOW)).toBe(false);
      expect(get_display_status(live, NOW)).toBe(status);
    }
  });

  it("treats an active import with no progress past the window as interrupted", () => {
    for (const status of ["pending", "processing"] as const) {
      const stale = job(status, STALE_IMPORT_JOB_MS + 1);

      expect(is_job_stale(stale, NOW)).toBe(true);
      expect(is_job_running(stale, NOW)).toBe(false);
      expect(is_job_interrupted(stale, NOW)).toBe(true);
      expect(can_delete_job(stale, NOW)).toBe(true);
      expect(get_display_status(stale, NOW)).toBe("interrupted");
    }
  });

  it("shows a server swept job as interrupted", () => {
    const swept = job("failed", 0, INTERRUPTED_ERROR_MESSAGE);

    expect(is_job_interrupted(swept, NOW)).toBe(true);
    expect(get_display_status(swept, NOW)).toBe("interrupted");
    expect(can_delete_job(swept, NOW)).toBe(true);
  });

  it("leaves finished jobs alone however old they are", () => {
    const old = STALE_IMPORT_JOB_MS * 10;

    expect(get_display_status(job("completed", old), NOW)).toBe("completed");
    expect(get_display_status(job("cancelled", old), NOW)).toBe("cancelled");
    expect(get_display_status(job("failed", old, "quota"), NOW)).toBe("failed");
    expect(can_delete_job(job("completed", old), NOW)).toBe(true);
  });

  it("does not call a job stale when its timestamp cannot be read", () => {
    const unreadable = { ...job("processing", 0), updated_at: "not a date" };

    expect(is_job_stale(unreadable, NOW)).toBe(false);
    expect(is_job_running(unreadable, NOW)).toBe(true);
  });

  it("recognizes responses that mean the job is gone", () => {
    expect(
      is_job_lost_response({
        status: 409,
        server_code: IMPORT_JOB_INTERRUPTED_CODE,
      }),
    ).toBe(true);
    expect(is_job_lost_response({ status: 404 })).toBe(true);
    expect(is_job_lost_response({ status: 409, server_code: "CONFLICT" })).toBe(
      false,
    );
    expect(is_job_lost_response({ status: 500 })).toBe(false);
    expect(is_job_lost_response({})).toBe(false);
  });
});
