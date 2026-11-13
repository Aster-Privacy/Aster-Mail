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
export interface SignInAttemptResult {
  error?: string;
  server_code?: string;
}

export interface PasswordFormOutcome<R> {
  response: R;
  password: string;
}

export function password_forms(typed: string): string[] {
  return [
    ...new Set([typed, typed.normalize("NFC"), typed.normalize("NFD")]),
  ];
}

function is_wrong_credentials(response: SignInAttemptResult): boolean {
  return !!response.error && response.server_code === "INVALID_CREDENTIALS";
}

export async function try_password_forms<R extends SignInAttemptResult>(
  typed: string,
  attempt: (form: string) => Promise<R>,
  before_retry: () => Promise<boolean>,
): Promise<PasswordFormOutcome<R>> {
  const [first, ...others] = password_forms(typed);
  const first_response = await attempt(first);

  if (!is_wrong_credentials(first_response)) {
    return { response: first_response, password: first };
  }

  for (const form of others) {
    if (!(await before_retry())) break;
    const response = await attempt(form);

    if (!is_wrong_credentials(response)) {
      return { response, password: form };
    }
  }

  return { response: first_response, password: typed };
}
