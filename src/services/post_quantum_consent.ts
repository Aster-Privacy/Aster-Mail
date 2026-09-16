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
import { check_post_quantum_status } from "./send_queue_encryption";

export type PostQuantumPromptHandler = (
  recipients: string[],
  downgraded: string[],
) => Promise<boolean>;

export interface PostQuantumConsent {
  proceed: boolean;
  allow_non_post_quantum: boolean;
}

let prompt_handler: PostQuantumPromptHandler | null = null;

export function set_post_quantum_prompt_handler(
  handler: PostQuantumPromptHandler | null,
): void {
  prompt_handler = handler;
}

export async function request_post_quantum_send_confirmation(
  recipients: string[],
  downgraded: string[] = [],
): Promise<boolean> {
  if (!prompt_handler) return false;

  return prompt_handler(recipients, downgraded);
}

export async function ensure_post_quantum_consent(
  recipients: string[],
  sender_email?: string,
): Promise<PostQuantumConsent> {
  let missing: string[] = [];
  let downgraded: string[] = [];

  try {
    const coverage = await check_post_quantum_status(recipients, sender_email);

    missing = coverage.missing;
    downgraded = coverage.downgraded;
  } catch {
    missing = [];
    downgraded = [];
  }

  if (missing.length === 0) {
    return { proceed: true, allow_non_post_quantum: false };
  }

  const allowed = await request_post_quantum_send_confirmation(
    missing,
    downgraded,
  );

  return { proceed: allowed, allow_non_post_quantum: allowed };
}
