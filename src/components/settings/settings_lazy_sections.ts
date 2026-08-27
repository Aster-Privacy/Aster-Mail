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
import { lazy_with_retry } from "@/utils/lazy_with_retry";

export const BillingSection = lazy_with_retry(() =>
  import("@/components/settings/billing_section").then((m) => ({
    default: m.BillingSection,
  })),
);
export const load_family_section = () =>
  import("@/components/settings/billing/family_section");
export const FamilySection = lazy_with_retry(() =>
  load_family_section().then((m) => ({
    default: m.FamilySection,
  })),
);
export const StorageSection = lazy_with_retry(() =>
  import("@/components/settings/storage_section").then((m) => ({
    default: m.StorageSection,
  })),
);
