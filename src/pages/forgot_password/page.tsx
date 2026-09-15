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
import { Button } from "@aster/ui";

import {
  Alert,
  CopyIcon,
  HelpIcon,
  KeyIcon,
  MailIcon,
  OptionRow,
  PasswordStrengthIndicator,
  ReviewRow,
  WarningIcon,
  WordsIcon,
  page_transition,
  page_variants,
} from "./shared";
import { use_recovery_flow } from "./use_recovery_flow";

import { sanitize_username, clamp_password } from "@/services/sanitize";
import {
  EyeIcon,
  EyeSlashIcon,
  InputWithEndContent,
  Logo,
} from "@/components/auth/auth_styles";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apply_input_transform } from "@/utils/input_transform";

export default function ForgotPasswordPage() {
  const {
    t,
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
    recovery_method,
    set_recovery_method,
    phrase_words,
    handle_email_next,
    update_phrase_word,
    handle_phrase_submit,
    handle_email_reset_link,
    handle_code_submit,
    handle_password_submit,
    handle_copy_codes,
    handle_download_pdf,
    handle_download_txt,
    handle_print_codes,
    handle_codes_continue,
  } = use_recovery_flow();

  const render_step_content = () => {
    switch (step) {
      case "email":
        return (
          <motion.div
            key="email"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.recover_your_account")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.enter_email_associated")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"}`}>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                maxLength={55}
                placeholder={t("common.yourname_placeholder")}
                spellCheck={false}
                status={error ? "error" : "default"}
                type="text"
                value={username}
                onChange={(e) => {
                  const raw = e.target.value;
                  const at_index = raw.indexOf("@");

                  if (at_index !== -1) {
                    const local = sanitize_username(raw.substring(0, at_index));
                    const domain_part = raw
                      .substring(at_index + 1)
                      .toLowerCase();

                    if (
                      domain_part === "astermail.org" ||
                      domain_part === "astermail.org."
                    ) {
                      set_username(local);
                      set_email_domain("astermail.org");
                    } else if (
                      domain_part === "aster.cx" ||
                      domain_part === "aster.cx."
                    ) {
                      set_username(local);
                      set_email_domain("aster.cx");
                    } else {
                      set_username(
                        `${local}@${domain_part.replace(/[^a-z0-9.-]/g, "")}`,
                      );
                    }
                  } else {
                    set_username(sanitize_username(raw));
                  }
                }}
                onKeyDown={(e) => e["key"] === "Enter" && handle_email_next()}
              />
              <div className="relative flex mt-2 aster_input !p-1 !h-auto">
                <div
                  className="absolute top-1 bottom-1 rounded-[8px] transition-all duration-200 ease-out bg-surf-tertiary"
                  style={{
                    width: "calc(50% - 4px)",
                    left:
                      email_domain === "astermail.org" ? "4px" : "calc(50%)",
                  }}
                />
                <button
                  className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "astermail.org" ? "text-txt-primary" : "text-txt-muted"}`}
                  type="button"
                  onClick={() => set_email_domain("astermail.org")}
                >
                  @astermail.org
                </button>
                <button
                  className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${email_domain === "aster.cx" ? "text-txt-primary" : "text-txt-muted"}`}
                  type="button"
                  onClick={() => set_email_domain("aster.cx")}
                >
                  @aster.cx
                </button>
              </div>
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_email_next}
            >
              {t("common.continue")}
            </Button>

            <button
              className="w-full mt-6 text-sm transition-colors hover:opacity-80 text-txt-tertiary"
              onClick={() => navigate("/sign-in")}
            >
              {t("auth.back_to_sign_in")}
            </button>
          </motion.div>
        );

      case "other_ways":
        return (
          <motion.div
            key="other_ways"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.other_ways_title")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.other_ways_desc")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"} space-y-3`}>
              <OptionRow
                description={t("auth.other_way_code_desc")}
                icon={<KeyIcon />}
                on_click={() => {
                  set_error("");
                  set_recovery_method("code");
                  set_step("code");
                }}
                title={t("auth.other_way_code_title")}
              />
              <OptionRow
                description={t("auth.other_way_phrase_desc")}
                icon={<WordsIcon />}
                on_click={() => {
                  set_error("");
                  set_recovery_method("phrase");
                  set_step("phrase_entry");
                }}
                title={t("auth.other_way_phrase_title")}
              />
              <OptionRow
                description={t("auth.other_way_email_desc")}
                icon={<MailIcon />}
                on_click={() => {
                  set_error("");
                  set_step("reset_email_confirm");
                }}
                title={t("auth.other_way_email_title")}
              />
              <OptionRow
                description={t("auth.other_way_none_desc")}
                icon={<HelpIcon />}
                on_click={() => navigate("/register")}
                title={t("auth.other_way_none_title")}
              />
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("code");
              }}
            >
              {t("common.back")}
            </Button>
          </motion.div>
        );

      case "reset_email_confirm":
        return (
          <motion.div
            key="reset_email_confirm"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}
            >
              <WarningIcon />
            </div>

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.reset_account_title")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.reset_account_desc")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <Button
              className={`w-full ${error ? "mt-4" : "mt-8"}`}
              size="xl"
              variant="depth"
              onClick={handle_email_reset_link}
            >
              {t("auth.send_reset_link")}
            </Button>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("other_ways");
              }}
            >
              {t("common.back")}
            </Button>
          </motion.div>
        );

      case "phrase_entry":
        return (
          <motion.div
            key="phrase_entry"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.phrase_entry_title")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.phrase_entry_desc")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div
              className={`w-full ${error ? "mt-4" : "mt-6"} grid grid-cols-3 gap-2`}
            >
              {phrase_words.map((word, index) => (
                <Input
                  key={index}
                  autoComplete="off"
                  className="font-mono !px-2 text-sm"
                  placeholder={`${index + 1}`}
                  status={error ? "error" : "default"}
                  type="text"
                  value={word}
                  onChange={(e) => update_phrase_word(index, e.target.value)}
                  onKeyDown={(e) =>
                    e["key"] === "Enter" && handle_phrase_submit()
                  }
                />
              ))}
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_phrase_submit}
            >
              {t("common.continue")}
            </Button>

            <button
              className="w-full mt-6 text-sm transition-colors hover:opacity-80 text-txt-tertiary"
              onClick={() => {
                set_error("");
                set_step("other_ways");
              }}
            >
              {t("auth.try_another_way")}
            </button>
          </motion.div>
        );

      case "code":
        return (
          <motion.div
            key="code"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.enter_recovery_code")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.enter_recovery_code_desc")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"}`}>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoComplete="off"
                className="font-mono tracking-wider"
                placeholder="ASTER-XXXX-XXXX-XXXX-XXXX"
                status={error ? "error" : "default"}
                type="text"
                value={recovery_code}
                onChange={(e) =>
                  set_recovery_code(
                    apply_input_transform(e.target, (v) => v.toUpperCase()),
                  )
                }
                onKeyDown={(e) => e["key"] === "Enter" && handle_code_submit()}
              />
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_code_submit}
            >
              {t("auth.verify_code")}
            </Button>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step("other_ways");
              }}
            >
              {t("common.back")}
            </Button>
          </motion.div>
        );

      case "password":
        return (
          <motion.div
            key="password"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.create_new_password")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.choose_strong_password")}
            </p>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <div className={`w-full ${error ? "mt-4" : "mt-6"} space-y-4`}>
              <div>
                <InputWithEndContent
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoComplete="new-password"
                  end_content={
                    <button
                      className="focus:outline-none flex items-center justify-center"
                      type="button"
                      onClick={() =>
                        set_is_password_visible(!is_password_visible)
                      }
                    >
                      {is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
                    </button>
                  }
                  maxLength={128}
                  placeholder={t("auth.new_password_placeholder")}
                  status={error ? "error" : "default"}
                  type={is_password_visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => set_password(clamp_password(e.target.value))}
                />
                <PasswordStrengthIndicator password={password} />
              </div>

              <InputWithEndContent
                autoComplete="new-password"
                end_content={
                  <button
                    className="focus:outline-none flex items-center justify-center"
                    type="button"
                    onClick={() => set_is_confirm_visible(!is_confirm_visible)}
                  >
                    {is_confirm_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                }
                maxLength={128}
                placeholder={t("auth.confirm_password_placeholder")}
                status={error ? "error" : "default"}
                type={is_confirm_visible ? "text" : "password"}
                value={confirm_password}
                onChange={(e) =>
                  set_confirm_password(clamp_password(e.target.value))
                }
                onKeyDown={(e) =>
                  e["key"] === "Enter" && handle_password_submit()
                }
              />
            </div>

            <Button
              className="w-full mt-6"
              size="xl"
              variant="depth"
              onClick={handle_password_submit}
            >
              {t("auth.reset_password")}
            </Button>

            <Button
              className="w-full mt-3"
              size="xl"
              variant="secondary"
              onClick={() => {
                set_error("");
                set_step(
                  recovery_method === "phrase" ? "phrase_entry" : "code",
                );
              }}
            >
              {t("common.back")}
            </Button>
          </motion.div>
        );

      case "processing":
        return (
          <motion.div
            key="processing"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Spinner className="h-10 w-10 text-blue-500" size="lg" />

            <h2 className="text-xl font-semibold mt-8 text-txt-primary">
              {t("auth.recovering_your_account")}
            </h2>

            <p className="mt-3 text-sm text-txt-tertiary">
              {processing_status}
            </p>

            <p className="mt-8 text-xs max-w-xs leading-relaxed text-txt-muted">
              {t("auth.please_dont_close")}
            </p>
          </motion.div>
        );

      case "new_codes":
        return (
          <motion.div
            key="new_codes"
            animate="animate"
            className="flex flex-col items-center w-full max-w-md px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <Logo />

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.save_new_recovery_codes")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.old_codes_invalidated")}
            </p>

            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-txt-muted">
                  {t("auth.n_recovery_codes", {
                    count: new_recovery_codes.length.toString(),
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                    onClick={() => set_is_key_visible(!is_key_visible)}
                  >
                    {is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                  <button
                    className="p-1.5 rounded transition-colors hover:opacity-80"
                    style={{
                      color: copy_success
                        ? "var(--color-success)"
                        : "var(--text-muted)",
                    }}
                    onClick={handle_copy_codes}
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {new_recovery_codes.map((code, index) => (
                  <div
                    key={index}
                    className="rounded-lg px-3 py-2.5 border text-center bg-surf-tertiary border-edge-secondary"
                  >
                    <span
                      className="text-xs font-mono text-txt-primary break-all"
                      style={{
                        filter: is_key_visible ? "none" : "blur(4px)",
                        userSelect: is_key_visible ? "text" : "none",
                      }}
                    >
                      {code}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full mt-6 grid grid-cols-3 gap-2">
              <Button
                size="lg"
                variant="secondary"
                onClick={handle_download_pdf}
              >
                {t("common.download")}
              </Button>
              <Button size="lg" variant="secondary" onClick={handle_print_codes}>
                {t("auth.print_codes")}
              </Button>
              <Button size="lg" variant="secondary" onClick={handle_copy_codes}>
                {copy_success ? t("common.copied") : t("auth.copy_codes")}
              </Button>
            </div>

            <label className="w-full mt-6 flex items-start gap-3 text-start cursor-pointer">
              <input
                checked={codes_saved}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-color)]"
                type="checkbox"
                onChange={(e) => set_codes_saved(e.target.checked)}
              />
              <span className="text-sm text-txt-secondary">
                {t("auth.i_saved_these_codes")}
              </span>
            </label>

            <Button
              className="w-full mt-6"
              disabled={!codes_saved}
              size="xl"
              variant="depth"
              onClick={handle_codes_continue}
            >
              {t("common.continue")}
            </Button>

            <button
              className="w-full mt-4 text-sm transition-colors hover:opacity-80 text-txt-tertiary"
              onClick={handle_download_txt}
            >
              {t("auth.download_as_text")}
            </button>
          </motion.div>
        );

      case "email_sent":
        return (
          <motion.div
            key="email_sent"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.reset_link_sent_title")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.reset_link_sent_desc")}
            </p>

            <Button
              className="w-full mt-8"
              size="xl"
              variant="depth"
              onClick={() => navigate("/sign-in")}
            >
              {t("auth.back_to_sign_in")}
            </Button>
          </motion.div>
        );

      case "review_security":
        return (
          <motion.div
            key="review_security"
            animate="animate"
            className="flex flex-col items-center w-full max-w-sm px-4 text-center"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="text-xl font-semibold mt-6 text-txt-primary">
              {t("auth.review_security_title")}
            </h1>
            <p className="text-sm mt-2 leading-relaxed text-txt-tertiary">
              {t("auth.review_security_desc")}
            </p>

            <div className="w-full mt-6 space-y-2">
              <ReviewRow label={t("auth.review_devices_signed_out")} />
              {review.second_factors_removed && (
                <ReviewRow label={t("auth.review_two_step_off")} />
              )}
              <ReviewRow
                label={
                  review.recovery_email_kept
                    ? t("auth.review_recovery_email_kept")
                    : t("auth.review_no_recovery_email")
                }
              />
              <ReviewRow
                label={t("auth.review_codes_left", {
                  count: review.codes_remaining.toString(),
                })}
              />
            </div>

            <Button
              className="w-full mt-8"
              size="xl"
              variant="depth"
              onClick={() => navigate("/sign-in")}
            >
              {t("auth.sign_in")}
            </Button>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">{render_step_content()}</AnimatePresence>
      </div>
    </div>
  );
}
