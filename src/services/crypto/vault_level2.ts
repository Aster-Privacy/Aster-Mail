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
export const VAULT_KDF_ITERATIONS_LEGACY = 310000;
export const VAULT_KDF_ITERATIONS_LEVEL2 = 600000;
export const VAULT_LEVEL2_NOT_ADMITTED = "VAULT_LEVEL2_NOT_ADMITTED";
export const ENVELOPE_V2_ADMISSION_PATH =
  "/core/v1/auth/me/storage-rekey/envelope-v2";

export type VaultKdfIterations =
  | typeof VAULT_KDF_ITERATIONS_LEGACY
  | typeof VAULT_KDF_ITERATIONS_LEVEL2;

export type Level2Admission = "unknown" | "admitted" | "refused";

const MAX_TRACKED_VAULTS = 64;

const iterations_by_vault = new Map<string, VaultKdfIterations>();
let admission: Level2Admission = "unknown";
let admission_request: Promise<Level2Admission> | null = null;
let admission_generation = 0;
let current_vault_iterations: VaultKdfIterations | null = null;

export function parse_vault_kdf_iterations(raw: unknown): VaultKdfIterations {
  return raw === VAULT_KDF_ITERATIONS_LEVEL2 ||
    raw === String(VAULT_KDF_ITERATIONS_LEVEL2)
    ? VAULT_KDF_ITERATIONS_LEVEL2
    : VAULT_KDF_ITERATIONS_LEGACY;
}

export function record_vault_kdf_iterations(
  encrypted_vault: string,
  iterations: VaultKdfIterations,
): void {
  if (!encrypted_vault) return;
  iterations_by_vault.delete(encrypted_vault);
  iterations_by_vault.set(encrypted_vault, iterations);

  while (iterations_by_vault.size > MAX_TRACKED_VAULTS) {
    const oldest = iterations_by_vault.keys().next().value;

    if (oldest === undefined) break;
    iterations_by_vault.delete(oldest);
  }
}

export function note_current_vault_iterations(
  iterations: VaultKdfIterations,
): void {
  current_vault_iterations = iterations;
}

export function note_opened_vault_iterations(
  iterations: VaultKdfIterations,
): void {
  if (
    iterations === VAULT_KDF_ITERATIONS_LEVEL2 ||
    current_vault_iterations === null
  ) {
    current_vault_iterations = iterations;
  }
}

export function get_current_vault_iterations(): VaultKdfIterations | null {
  return current_vault_iterations;
}

export function known_vault_kdf_iterations(
  encrypted_vault: string,
): VaultKdfIterations | undefined {
  return iterations_by_vault.get(encrypted_vault);
}

export function vault_kdf_attempt_order(
  encrypted_vault: string,
  hint?: VaultKdfIterations,
): VaultKdfIterations[] {
  const first =
    hint ??
    known_vault_kdf_iterations(encrypted_vault) ??
    VAULT_KDF_ITERATIONS_LEGACY;

  return first === VAULT_KDF_ITERATIONS_LEVEL2
    ? [VAULT_KDF_ITERATIONS_LEVEL2, VAULT_KDF_ITERATIONS_LEGACY]
    : [VAULT_KDF_ITERATIONS_LEGACY, VAULT_KDF_ITERATIONS_LEVEL2];
}

const MAX_RECORD_DEPTH = 4;

export function record_vault_iterations_from_response(
  data: unknown,
  depth = 0,
): void {
  if (!data || typeof data !== "object" || depth > MAX_RECORD_DEPTH) return;

  if (Array.isArray(data)) {
    for (const entry of data) {
      record_vault_iterations_from_response(entry, depth + 1);
    }

    return;
  }

  const record = data as Record<string, unknown>;

  if (
    typeof record.encrypted_vault === "string" &&
    "vault_kdf_iterations" in record
  ) {
    record_vault_kdf_iterations(
      record.encrypted_vault,
      parse_vault_kdf_iterations(record.vault_kdf_iterations),
    );
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      record_vault_iterations_from_response(value, depth + 1);
    }
  }
}

export function get_level2_admission(): Level2Admission {
  return admission;
}

export function is_level2_admitted(): boolean {
  return admission === "admitted";
}

export function mark_level2_refused(): void {
  admission = "refused";
}

export function mark_level2_admitted(): void {
  admission = "admitted";
}

export function is_level2_refusal(response: {
  status?: number;
  server_code?: string;
}): boolean {
  return (
    response.status === 409 &&
    response.server_code === VAULT_LEVEL2_NOT_ADMITTED
  );
}

export interface AdmissionApi {
  post<T>(
    path: string,
    body?: unknown,
  ): Promise<{ data?: T; error?: string; status?: number; server_code?: string }>;
}

export function get_level2_admission_generation(): number {
  return admission_generation;
}

export async function request_level2_admission(
  api: AdmissionApi,
): Promise<Level2Admission> {
  if (admission !== "unknown") return admission;
  if (admission_request) return admission_request;

  const generation = admission_generation;
  const run = async (): Promise<Level2Admission> => {
    try {
      const response = await api.post<{ level2_admitted?: boolean }>(
        ENVELOPE_V2_ADMISSION_PATH,
      );

      if (generation !== admission_generation) return "unknown";

      if (!response.error && response.data?.level2_admitted === true) {
        admission = "admitted";
      } else if (is_level2_refusal(response)) {
        admission = "refused";
      }

      return admission;
    } catch {
      return generation === admission_generation ? admission : "unknown";
    }
  };

  const holder: { request: Promise<Level2Admission> | null } = {
    request: null,
  };
  const request = run().finally(() => {
    if (admission_request === holder.request) admission_request = null;
  });

  holder.request = request;
  admission_request = request;

  return request;
}

function admission_iterations(): VaultKdfIterations {
  return admission === "admitted"
    ? VAULT_KDF_ITERATIONS_LEVEL2
    : VAULT_KDF_ITERATIONS_LEGACY;
}

export function vault_write_iterations(
  current_encrypted_vault?: string | null,
): VaultKdfIterations {
  const known = current_encrypted_vault
    ? known_vault_kdf_iterations(current_encrypted_vault)
    : undefined;

  if (
    current_vault_iterations === VAULT_KDF_ITERATIONS_LEVEL2 ||
    known === VAULT_KDF_ITERATIONS_LEVEL2
  ) {
    return VAULT_KDF_ITERATIONS_LEVEL2;
  }

  return admission_iterations();
}

export function vault_kdf_field(
  iterations: VaultKdfIterations,
): { vault_kdf_iterations?: VaultKdfIterations } {
  return iterations === VAULT_KDF_ITERATIONS_LEVEL2
    ? { vault_kdf_iterations: VAULT_KDF_ITERATIONS_LEVEL2 }
    : {};
}

export interface SealedVault {
  encrypted_vault: string;
  vault_nonce: string;
}

export async function write_vault_at_level<R extends object>(
  first: VaultKdfIterations,
  seal: (iterations: VaultKdfIterations) => Promise<SealedVault>,
  send: (
    sealed: SealedVault,
    field: { vault_kdf_iterations?: VaultKdfIterations },
  ) => Promise<R>,
): Promise<{ response: R; sealed: SealedVault; iterations: VaultKdfIterations }> {
  const sealed = await seal(first);
  const response = await send(sealed, vault_kdf_field(first));

  if (
    first === VAULT_KDF_ITERATIONS_LEVEL2 &&
    current_vault_iterations !== VAULT_KDF_ITERATIONS_LEVEL2 &&
    is_level2_refusal(response as { status?: number; server_code?: string })
  ) {
    mark_level2_refused();
    const fallback = await seal(VAULT_KDF_ITERATIONS_LEGACY);
    const retried = await send(fallback, {});

    return {
      response: retried,
      sealed: fallback,
      iterations: VAULT_KDF_ITERATIONS_LEGACY,
    };
  }

  return { response, sealed, iterations: first };
}

export function note_vault_written(
  sealed: SealedVault,
  iterations: VaultKdfIterations,
): void {
  record_vault_kdf_iterations(sealed.encrypted_vault, iterations);
  note_current_vault_iterations(iterations);
}

export function reset_level2_admission(): void {
  admission = "unknown";
  admission_request = null;
  admission_generation += 1;
}

export function reset_level2_state(): void {
  reset_level2_admission();
  current_vault_iterations = null;
  iterations_by_vault.clear();
}
