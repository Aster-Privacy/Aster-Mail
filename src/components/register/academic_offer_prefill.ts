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
export type OfferRole = "student" | "journalist";

export interface OfferPrefill {
  has_offer: boolean;
  role: OfferRole;
  email: string;
}

export function read_offer_prefill(): OfferPrefill {
  if (typeof window === "undefined") {
    return { has_offer: false, role: "student", email: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const raw_role = params.get("role");
  const raw_email = params.get("academic_email");
  const has_offer = !!(raw_role || raw_email);
  const role: OfferRole = raw_role === "journalist" ? "journalist" : "student";
  const email = (raw_email || "").trim().slice(0, 254);

  return { has_offer, role, email };
}
