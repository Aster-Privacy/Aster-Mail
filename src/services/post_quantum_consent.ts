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
import { check_post_quantum_coverage } from "./send_queue_encryption";

export type PostQuantumPromptHandler = (
  recipients: string[],
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
): Promise<boolean> {
  if (!prompt_handler) return false;

  return prompt_handler(recipients);
}

export async function ensure_post_quantum_consent(
  recipients: string[],
  sender_email?: string,
): Promise<PostQuantumConsent> {
  let missing: string[] = [];

  try {
    missing = await check_post_quantum_coverage(recipients, sender_email);
  } catch {
    missing = [];
  }

  if (missing.length === 0) {
    return { proceed: true, allow_non_post_quantum: false };
  }

  const allowed = await request_post_quantum_send_confirmation(missing);

  return { proceed: allowed, allow_non_post_quantum: allowed };
}
