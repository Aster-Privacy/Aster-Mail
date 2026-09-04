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
export const ENFORCE_AUTHENTICATED_RATCHET: boolean = true;

export const ENFORCE_STRICT_RECIPIENT_BUNDLE: boolean = true;

export const ENABLE_PQXDH_TRANSCRIPT_BINDING: boolean = false;

export function is_authenticated_ratchet_enforced(): boolean {
  return ENFORCE_AUTHENTICATED_RATCHET;
}

function opted_in(raw: unknown, compiled_default: boolean): boolean {
  return compiled_default || raw === "1" || raw === "true";
}

export function is_strict_recipient_bundle_enforced(): boolean {
  return opted_in(
    import.meta.env.VITE_ENFORCE_STRICT_RECIPIENT_BUNDLE,
    ENFORCE_STRICT_RECIPIENT_BUNDLE,
  );
}

export function is_pqxdh_transcript_binding_enabled(): boolean {
  return opted_in(
    import.meta.env.VITE_ENABLE_PQXDH_TRANSCRIPT_BINDING,
    ENABLE_PQXDH_TRANSCRIPT_BINDING,
  );
}
