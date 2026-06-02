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
import { TotpVerifyResponse } from "@/services/api/totp";
import {
  passkey_login_initiate,
  perform_passkey_login,
} from "@/services/api/passkeys";

export async function passkey_flow(
  remember_me: boolean,
  on_success: (data: TotpVerifyResponse) => void,
  on_error: (msg: string) => void,
): Promise<void> {
  const initiate_response = await passkey_login_initiate();

  if (initiate_response.error || !initiate_response.data) {
    on_error(initiate_response.error ?? "Failed to initiate passkey sign-in.");
    return;
  }

  const verify_response = await perform_passkey_login(
    initiate_response.data,
    remember_me,
  );

  if (verify_response.error || !verify_response.data) {
    on_error(verify_response.error ?? "Passkey sign-in failed.");
    return;
  }

  on_success(verify_response.data);
}
