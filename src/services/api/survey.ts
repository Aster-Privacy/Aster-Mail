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

export interface SurveyStatusResponse {
  eligible: boolean;
  branch: "paid" | "free";
  plan_code: string | null;
}

export interface SurveyActionResponse {
  ok: boolean;
}

export function get_survey_status(): Promise<ApiResponse<SurveyStatusResponse>> {
  return api_client.get<SurveyStatusResponse>("/core/v1/survey");
}

export function dismiss_survey(
  permanent: boolean,
): Promise<ApiResponse<SurveyActionResponse>> {
  return api_client.post<SurveyActionResponse>("/core/v1/survey/dismiss", {
    permanent,
  });
}

export function submit_survey(
  answers: Record<string, string>,
): Promise<ApiResponse<SurveyActionResponse>> {
  return api_client.post<SurveyActionResponse>("/core/v1/survey/submit", {
    answers,
  });
}
