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
import type { ImportJob, ImportStatus } from "@/services/api/email_import";

export const STALE_IMPORT_JOB_MS = 30 * 60 * 1000;
export const INTERRUPTED_ERROR_MESSAGE = "interrupted";
export const IMPORT_JOB_INTERRUPTED_CODE = "IMPORT_JOB_INTERRUPTED";

export type ImportDisplayStatus = ImportStatus | "interrupted";

type JobTimes = Pick<ImportJob, "status" | "updated_at" | "error_message">;

export class ImportJobInterruptedError extends Error {
  constructor() {
    super(INTERRUPTED_ERROR_MESSAGE);
    this.name = "ImportJobInterruptedError";
  }
}

function is_active_status(status: ImportStatus): boolean {
  return status === "pending" || status === "processing";
}

export function is_job_stale(job: JobTimes, now: number = Date.now()): boolean {
  if (!is_active_status(job.status)) return false;

  const updated_at = Date.parse(job.updated_at);

  if (Number.isNaN(updated_at)) return false;

  return now - updated_at > STALE_IMPORT_JOB_MS;
}

export function is_job_interrupted(
  job: JobTimes,
  now: number = Date.now(),
): boolean {
  if (job.status === "failed") {
    return job.error_message === INTERRUPTED_ERROR_MESSAGE;
  }

  return is_job_stale(job, now);
}

export function is_job_running(
  job: JobTimes,
  now: number = Date.now(),
): boolean {
  return is_active_status(job.status) && !is_job_stale(job, now);
}

export function can_delete_job(
  job: JobTimes,
  now: number = Date.now(),
): boolean {
  return !is_job_running(job, now);
}

export function get_display_status(
  job: JobTimes,
  now: number = Date.now(),
): ImportDisplayStatus {
  return is_job_interrupted(job, now) ? "interrupted" : job.status;
}

export function is_job_lost_response(response: {
  status?: number;
  server_code?: string;
}): boolean {
  return (
    response.server_code === IMPORT_JOB_INTERRUPTED_CODE ||
    response.status === 404
  );
}
