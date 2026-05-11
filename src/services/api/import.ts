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
import { api_client, type ApiResponse } from "./client";

export type ImportJobState =
  | "queued"
  | "running"
  | "paused_quota"
  | "needs_reauth"
  | "done"
  | "failed"
  | "cancelled";

export type ImportJobKind = "external_sync" | "mbox" | "eml" | "oauth_initial";

export interface ImportJobStats {
  fetched?: number;
  landed?: number;
  dedup?: number;
  failed?: number;
  quota?: number;
}

export interface ImportJobSummary {
  id: string;
  kind: ImportJobKind;
  state: ImportJobState;
  account_id: string | null;
  stats: ImportJobStats;
  last_error: string | null;
  trigger_source: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface ImportTaskCounts {
  pending: number;
  claimed: number;
  done: number;
  failed: number;
  dead_letter: number;
}

export interface ImportFailureBucket {
  reason_code: string;
  count: number;
}

export interface ImportFailureDetail {
  id: string;
  external_uid: number | null;
  message_id: string | null;
  folder: string | null;
  reason_code: string;
  reason_detail: string | null;
  retryable: boolean;
  created_at: string;
}

export interface ImportJobDetails {
  job: ImportJobSummary;
  task_counts: ImportTaskCounts;
  failures_by_reason: ImportFailureBucket[];
  recent_failures: ImportFailureDetail[];
}

export interface CreateJobRequest {
  kind: ImportJobKind;
  account_id?: string;
  upload_token?: string;
}

export interface CreateJobResponse {
  job_id: string;
}

export interface UploadInitRequest {
  kind: "mbox" | "eml";
  total_chunks: number;
  chunk_size: number;
  total_size?: number;
  expected_sha256_b64?: string;
}

export interface UploadInitResponse {
  upload_token: string;
}

export interface UploadChunkRequest {
  chunk_index: number;
  chunk_sha256_b64: string;
  data_b64: string;
}

export interface UploadStatusResponse {
  upload_token: string;
  state: string;
  received_indices: number[];
  total_chunks: number;
}

const BASE = "/mail/v1/import";

export function create_import_job(
  req: CreateJobRequest,
): Promise<ApiResponse<CreateJobResponse>> {
  return api_client.post(`${BASE}/jobs`, req);
}

export function list_import_jobs_v2(): Promise<ApiResponse<ImportJobSummary[]>> {
  return api_client.get(`${BASE}/jobs`);
}

export function get_import_job(
  job_id: string,
): Promise<ApiResponse<ImportJobDetails>> {
  return api_client.get(`${BASE}/jobs/${job_id}`);
}

export function pause_import_job(
  job_id: string,
): Promise<ApiResponse<{ ok: boolean }>> {
  return api_client.post(`${BASE}/jobs/${job_id}/pause`, {});
}

export function retry_failed_import(
  job_id: string,
): Promise<ApiResponse<{ ok: boolean }>> {
  return api_client.post(`${BASE}/jobs/${job_id}/retry-failed`, {});
}

export function trigger_account_import(
  account_id: string,
): Promise<ApiResponse<CreateJobResponse>> {
  return api_client.post(`${BASE}/accounts/${account_id}/sync`, {});
}

export function upload_init(
  req: UploadInitRequest,
): Promise<ApiResponse<UploadInitResponse>> {
  return api_client.post(`${BASE}/upload/init`, req);
}

export function upload_chunk(
  token: string,
  req: UploadChunkRequest,
): Promise<ApiResponse<{ ok: boolean }>> {
  return api_client.post(`${BASE}/upload/${token}/chunk`, req);
}

export function upload_status(
  token: string,
): Promise<ApiResponse<UploadStatusResponse>> {
  return api_client.get(`${BASE}/upload/${token}`);
}

export function upload_finalize(
  token: string,
): Promise<ApiResponse<{ ok: boolean }>> {
  return api_client.post(`${BASE}/upload/${token}/finalize`, {});
}

async function sha256_b64(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64_encode(new Uint8Array(digest));
}

function base64_encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface UploadProgress {
  uploaded_chunks: number;
  total_chunks: number;
  bytes_sent: number;
  total_bytes: number;
}

export async function upload_file_chunked(
  file: File,
  kind: "mbox" | "eml",
  on_progress?: (p: UploadProgress) => void,
): Promise<{ upload_token: string } | { error: string }> {
  const CHUNK_SIZE = 4 * 1024 * 1024;
  const total_chunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  const init = await upload_init({
    kind,
    total_chunks,
    chunk_size: CHUNK_SIZE,
    total_size: file.size,
    expected_sha256_b64: undefined,
  });
  if (init.error || !init.data) {
    return { error: init.error || "upload_init_failed" };
  }
  const token = init.data.upload_token;

  const existing = await upload_status(token);
  const already_have = new Set<number>(existing.data?.received_indices ?? []);

  let bytes_sent = already_have.size * CHUNK_SIZE;

  for (let i = 0; i < total_chunks; i++) {
    if (already_have.has(i)) continue;
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const slice = new Uint8Array(await file.slice(start, end).arrayBuffer());
    const chunk_sha256_b64 = await sha256_b64(slice);
    const data_b64 = base64_encode(slice);

    let attempts = 0;
    while (true) {
      const res = await upload_chunk(token, {
        chunk_index: i,
        chunk_sha256_b64,
        data_b64,
      });
      if (!res.error) break;
      attempts += 1;
      if (attempts >= 3) return { error: res.error };
      await new Promise((r) => setTimeout(r, 500 * attempts));
    }

    bytes_sent += end - start;
    on_progress?.({
      uploaded_chunks: i + 1,
      total_chunks,
      bytes_sent,
      total_bytes: file.size,
    });
  }

  const fin = await upload_finalize(token);
  if (fin.error) return { error: fin.error };

  return { upload_token: token };
}
