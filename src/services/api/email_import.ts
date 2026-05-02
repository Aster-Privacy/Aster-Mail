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

export type ImportSource =
  | "gmail"
  | "outlook"
  | "yahoo"
  | "icloud"
  | "protonmail"
  | "mbox"
  | "eml";

export type ImportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ImportJob {
  id: string;
  source: ImportSource;
  status: ImportStatus;
  total_emails: number;
  processed_emails: number;
  skipped_emails: number;
  failed_emails: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobRequest {
  source: string;
  total_emails?: number;
}

export interface CreateJobResponse {
  id: string;
  success: boolean;
}

export interface UpdateJobRequest {
  status?: string;
  total_emails?: number;
  processed_emails?: number;
  skipped_emails?: number;
  failed_emails?: number;
  error_message?: string;
}

export interface UpdateJobResponse {
  success: boolean;
}

export interface ListJobsResponse {
  jobs: ImportJob[];
}

export interface ImportedEmailData {
  message_id_hash: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  folder_token?: string;
  item_type?: string;
  received_at?: string;
  thread_token?: string;
}

export interface StoreEmailsRequest {
  emails: ImportedEmailData[];
}

export interface StoreEmailsResponse {
  stored_count: number;
  duplicate_count: number;
  skipped_quota_count: number;
  quota_exceeded: boolean;
  success: boolean;
}

export interface CheckDuplicatesRequest {
  message_id_hashes: string[];
}

export interface CheckDuplicatesResponse {
  duplicates: string[];
}

export interface DeleteJobResponse {
  success: boolean;
}

export async function create_import_job(
  request: CreateJobRequest,
): Promise<ApiResponse<CreateJobResponse>> {
  return api_client.post("/mail/v1/import/jobs", request);
}

export async function list_import_jobs(): Promise<
  ApiResponse<ListJobsResponse>
> {
  return api_client.get("/mail/v1/import/jobs");
}

export async function get_import_job(
  job_id: string,
): Promise<ApiResponse<ImportJob>> {
  return api_client.get(`/mail/v1/import/jobs/${job_id}`);
}

export async function update_import_job(
  job_id: string,
  request: UpdateJobRequest,
): Promise<ApiResponse<UpdateJobResponse>> {
  return api_client.put(`/mail/v1/import/jobs/${job_id}`, request);
}

export async function delete_import_job(
  job_id: string,
): Promise<ApiResponse<DeleteJobResponse>> {
  return api_client.delete(`/mail/v1/import/jobs/${job_id}`);
}

export async function check_duplicates(
  job_id: string,
  message_id_hashes: string[],
): Promise<ApiResponse<CheckDuplicatesResponse>> {
  return api_client.post(`/mail/v1/import/jobs/${job_id}/check-duplicates`, {
    message_id_hashes,
  });
}

export async function store_imported_emails(
  job_id: string,
  emails: ImportedEmailData[],
): Promise<ApiResponse<StoreEmailsResponse>> {
  return api_client.post(`/mail/v1/import/jobs/${job_id}/emails`, { emails });
}
