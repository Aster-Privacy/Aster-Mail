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
import { WebauthnVerification } from "@/components/auth/webauthn_verification";
import { TotpVerifyResponse } from "@/services/api/totp";

interface WebauthnFlowProps {
  pending_login_token: string;
  available_2fa_methods: string[];
  on_success: (totp_response: TotpVerifyResponse) => Promise<void>;
  on_cancel: () => void;
  set_active_2fa_method: (
    method: "totp" | "webauthn" | "backup" | "choose",
  ) => void;
}

export function webauthn_flow({
  pending_login_token,
  available_2fa_methods,
  on_success,
  on_cancel,
  set_active_2fa_method,
}: WebauthnFlowProps) {
  return (
    <WebauthnVerification
      on_cancel={on_cancel}
      on_success={on_success}
      on_use_other_method={() =>
        set_active_2fa_method(
          available_2fa_methods.includes("totp") ? "totp" : "backup",
        )
      }
      pending_login_token={pending_login_token}
    />
  );
}
