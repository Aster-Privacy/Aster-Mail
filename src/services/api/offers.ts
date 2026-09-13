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
import { api_client } from "./client";

export interface SpecialOfferStatus {
  available: boolean;
  auto_show: boolean;
  shown: boolean;
  dismissed: boolean;
  plan_code: string;
  percent_off: number;
  duration_months: number;
}

interface ClaimResponse {
  granted: boolean;
}

interface AckResponse {
  ok: boolean;
}

export async function fetch_special_offer_status(): Promise<SpecialOfferStatus | null> {
  const response = await api_client.get<SpecialOfferStatus>(
    "/core/v1/offers/special",
    { skip_cache: true },
  );

  return response.data ?? null;
}

export async function claim_special_offer(): Promise<boolean> {
  const response = await api_client.post<ClaimResponse>(
    "/core/v1/offers/special/claim",
    {},
  );

  return response.data?.granted === true;
}

export async function dismiss_special_offer_on_server(): Promise<boolean> {
  const response = await api_client.post<AckResponse>(
    "/core/v1/offers/special/dismiss",
    {},
  );

  return response.data?.ok === true;
}

export async function accept_special_offer_on_server(): Promise<boolean> {
  const response = await api_client.post<AckResponse>(
    "/core/v1/offers/special/accept",
    {},
  );

  return response.data?.ok === true;
}
