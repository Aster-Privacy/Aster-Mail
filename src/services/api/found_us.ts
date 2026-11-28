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

export const FOUND_US_SOURCES = [
  "reddit",
  "youtube",
  "friend",
  "invite_link",
  "search_engine",
  "comparison_site",
  "privacy_directory",
  "article",
  "app_store",
  "github",
  "social_media",
  "short_video",
  "forum",
  "ai_assistant",
  "other",
] as const;

export type FoundUsSource = (typeof FOUND_US_SOURCES)[number];

export const FOUND_US_OTHER: FoundUsSource = "other";

export const FOUND_US_MAX_DETAIL_CHARS = 200;

export interface FoundUsStatusResponse {
  eligible: boolean;
}

export interface FoundUsActionResponse {
  ok: boolean;
}

export interface FoundUsAnswer {
  source: FoundUsSource;
  detail?: string;
}

const HIDDEN_CHARS =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/gu;

export function count_chars(text: string): number {
  return Array.from(text).length;
}

export function limit_chars(text: string, max: number): string {
  const chars = Array.from(text);

  return chars.length > max ? chars.slice(0, max).join("") : text;
}

export function clean_found_us_detail(text: string): string {
  return text
    .replace(/\p{White_Space}+/gu, " ")
    .replace(HIDDEN_CHARS, "")
    .replace(/\p{White_Space}+/gu, " ")
    .trim();
}

export function get_found_us_status(): Promise<
  ApiResponse<FoundUsStatusResponse>
> {
  return api_client.get<FoundUsStatusResponse>("/core/v1/found-us");
}

export function finish_found_us(
  answer: FoundUsAnswer | null,
): Promise<ApiResponse<FoundUsActionResponse>> {
  if (!answer) {
    return api_client.post<FoundUsActionResponse>(
      "/core/v1/found-us/finish",
      {},
    );
  }

  const body: FoundUsAnswer = { source: answer.source };

  if (answer.source === FOUND_US_OTHER && answer.detail !== undefined) {
    body.detail = answer.detail;
  }

  return api_client.post<FoundUsActionResponse>(
    "/core/v1/found-us/finish",
    body,
  );
}

export function snooze_found_us(): Promise<
  ApiResponse<FoundUsActionResponse>
> {
  return api_client.post<FoundUsActionResponse>("/core/v1/found-us/later", {});
}
