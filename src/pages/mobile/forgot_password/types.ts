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

export type RecoveryStep =
  | "email"
  | "code"
  | "email_sent"
  | "password"
  | "processing"
  | "new_codes"
  | "success";

export interface StepProps {
  error: string;
  is_dark: boolean;
  reduce_motion: boolean;
  set_error: (error: string) => void;
  set_step: (step: RecoveryStep) => void;
}

export interface EmailStepProps extends StepProps {
  email: string;
  set_email: (email: string) => void;
  on_next: () => void;
  on_navigate_sign_in: () => void;
}

export interface EmailSentStepProps extends StepProps {
  reduce_motion: boolean;
}

export interface CodeStepProps extends StepProps {
  recovery_code: string;
  set_recovery_code: (code: string) => void;
  on_submit: () => void;
}

export interface PasswordStepProps extends StepProps {
  password: string;
  set_password: (password: string) => void;
  confirm_password: string;
  set_confirm_password: (password: string) => void;
  is_password_visible: boolean;
  set_is_password_visible: (visible: boolean) => void;
  is_confirm_visible: boolean;
  set_is_confirm_visible: (visible: boolean) => void;
  is_email_recovery: boolean;
  on_submit: () => void;
}

export interface ProcessingStepProps {
  reduce_motion: boolean;
  processing_status: string;
}

export interface NewCodesStepProps extends StepProps {
  new_recovery_codes: string[];
  is_key_visible: boolean;
  set_is_key_visible: (visible: boolean) => void;
  copy_success: boolean;
  on_copy_codes: () => void;
  on_download_pdf: () => void;
  on_download_txt: () => void;
}

export interface SuccessStepProps {
  reduce_motion: boolean;
  on_navigate_sign_in: () => void;
}
