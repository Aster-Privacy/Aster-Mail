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
import { motion, AnimatePresence } from "framer-motion";

import { EmailStep } from "./forgot_password/email_step";
import { OtherWaysStep } from "./forgot_password/other_ways_step";
import { ResetEmailConfirmStep } from "./forgot_password/reset_email_confirm_step";
import { SupportStep } from "./forgot_password/support_step";
import { CodeStep } from "./forgot_password/code_step";
import { PasswordStep } from "./forgot_password/password_step";
import { ProcessingStep } from "./forgot_password/processing_step";
import { NewCodesStep } from "./forgot_password/new_codes_step";
import { ReviewSecurityStep } from "./forgot_password/review_security_step";
import { EmailSentStep } from "./forgot_password/email_sent_step";

import { use_platform } from "@/hooks/use_platform";
import { use_recovery_flow } from "@/pages/forgot_password/use_recovery_flow";
import { open_external } from "@/utils/open_link";

const SUPPORT_MAIL_URL = "mailto:support@astermail.org";
const HELP_CENTER_URL = "https://astermail.org/help";

export default function MobileForgotPasswordPage() {
  const { safe_area_insets } = use_platform();
  const {
    reduce_motion,
    navigate,
    is_dark,
    step,
    set_step,
    username,
    set_username,
    email_domain,
    set_email_domain,
    recovery_code,
    set_recovery_code,
    password,
    set_password,
    confirm_password,
    set_confirm_password,
    is_password_visible,
    set_is_password_visible,
    is_confirm_visible,
    set_is_confirm_visible,
    error,
    set_error,
    processing_status,
    new_recovery_codes,
    is_key_visible,
    set_is_key_visible,
    copy_success,
    codes_saved,
    set_codes_saved,
    review,
    email,
    is_email_locked,
    handle_email_next,
    handle_email_reset_link,
    handle_code_submit,
    handle_password_submit,
    handle_copy_codes,
    handle_download_pdf,
    handle_download_txt,
    handle_print_codes,
    handle_codes_continue,
  } = use_recovery_flow();

  const navigate_sign_in = () => navigate("/sign-in");

  const handle_change_account = () => {
    set_error("");
    if (is_email_locked) {
      navigate_sign_in();

      return;
    }
    set_step("email");
  };

  const render_step = () => {
    switch (step) {
      case "email":
        return (
          <EmailStep
            email_domain={email_domain}
            error={error}
            is_dark={is_dark}
            on_navigate_sign_in={navigate_sign_in}
            on_next={handle_email_next}
            reduce_motion={reduce_motion}
            set_email_domain={set_email_domain}
            set_error={set_error}
            set_step={set_step}
            set_username={set_username}
            username={username}
          />
        );

      case "other_ways":
        return (
          <OtherWaysStep
            error={error}
            is_dark={is_dark}
            on_no_options={() => {
              set_error("");
              set_step("support");
            }}
            on_select_code={() => {
              set_error("");
              set_step("code");
            }}
            on_select_email={() => {
              set_error("");
              set_step("reset_email_confirm");
            }}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_step={set_step}
          />
        );

      case "reset_email_confirm":
        return (
          <ResetEmailConfirmStep
            error={error}
            is_dark={is_dark}
            on_send_reset_link={handle_email_reset_link}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_step={set_step}
          />
        );

      case "support":
        return (
          <SupportStep
            error={error}
            is_dark={is_dark}
            on_email_support={() => open_external(SUPPORT_MAIL_URL)}
            on_help_center={() => open_external(HELP_CENTER_URL)}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_step={set_step}
          />
        );

      case "code":
        return (
          <CodeStep
            email={email}
            error={error}
            is_dark={is_dark}
            is_email_locked={is_email_locked}
            on_change_account={handle_change_account}
            on_submit={handle_code_submit}
            recovery_code={recovery_code}
            reduce_motion={reduce_motion}
            set_error={set_error}
            set_recovery_code={set_recovery_code}
            set_step={set_step}
          />
        );

      case "password":
        return (
          <PasswordStep
            confirm_password={confirm_password}
            error={error}
            is_confirm_visible={is_confirm_visible}
            is_dark={is_dark}
            is_password_visible={is_password_visible}
            on_submit={handle_password_submit}
            password={password}
            reduce_motion={reduce_motion}
            set_confirm_password={set_confirm_password}
            set_error={set_error}
            set_is_confirm_visible={set_is_confirm_visible}
            set_is_password_visible={set_is_password_visible}
            set_password={set_password}
            set_step={set_step}
          />
        );

      case "processing":
        return (
          <ProcessingStep
            processing_status={processing_status}
            reduce_motion={reduce_motion}
          />
        );

      case "new_codes":
        return (
          <NewCodesStep
            codes_saved={codes_saved}
            copy_success={copy_success}
            error={error}
            is_dark={is_dark}
            is_key_visible={is_key_visible}
            new_recovery_codes={new_recovery_codes}
            on_continue={handle_codes_continue}
            on_copy_codes={handle_copy_codes}
            on_download_pdf={handle_download_pdf}
            on_download_txt={handle_download_txt}
            on_print_codes={handle_print_codes}
            reduce_motion={reduce_motion}
            set_codes_saved={set_codes_saved}
            set_error={set_error}
            set_is_key_visible={set_is_key_visible}
            set_step={set_step}
          />
        );

      case "review_security":
        return (
          <ReviewSecurityStep
            on_navigate_sign_in={navigate_sign_in}
            reduce_motion={reduce_motion}
            review={review}
          />
        );

      case "email_sent":
        return (
          <EmailSentStep
            on_navigate_sign_in={navigate_sign_in}
            reduce_motion={reduce_motion}
          />
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-[100dvh] flex-col bg-[var(--bg-primary)]"
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        paddingTop: safe_area_insets.top,
        paddingBottom: safe_area_insets.bottom,
      }}
      transition={{ duration: reduce_motion ? 0 : 0.3 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          animate={{ opacity: 1 }}
          className="flex flex-1 flex-col"
          exit={reduce_motion ? undefined : { opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {render_step()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
