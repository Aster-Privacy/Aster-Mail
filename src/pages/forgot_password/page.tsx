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
import { Button, Checkbox } from "@aster/ui";
import { ReactNode } from "react";

import {
  ActionRow,
  Alert,
  CopyIcon,
  KeyIcon,
  MailIcon,
  OptionGroup,
  OptionRow,
  PasswordStrengthIndicator,
  ReviewRow,
  StepHeader,
  TextLink,
  page_transition,
  page_variants,
} from "./shared";
import { use_recovery_flow } from "./use_recovery_flow";

import { sanitize_username, clamp_password } from "@/services/sanitize";
import {
  EyeIcon,
  EyeSlashIcon,
  InputWithEndContent,
} from "@/components/auth/auth_styles";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { open_external } from "@/utils/open_link";
import { Spinner } from "@/components/ui/spinner";
import { apply_input_transform } from "@/utils/input_transform";

const SUPPORT_MAIL_URL = "mailto:support@astermail.org";
const HELP_CENTER_URL = "https://astermail.org/help";

const SmallLogo = () => (
  <img
    alt="Aster"
    className="h-7"
    decoding="async"
    draggable={false}
    src="/text_logo.png"
  />
);

interface StepLayoutProps {
  header: ReactNode;
  children: ReactNode;
  centered?: boolean;
}

const StepLayout = ({ header, children, centered }: StepLayoutProps) => {
  if (centered) {
    return (
      <div className="flex w-full flex-col items-center text-center">
        {children}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start">
      {header}
      <div className="mt-5 flex w-full flex-col items-start [&>:first-child]:mt-0">
        {children}
      </div>
    </div>
  );
};

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
    email,
    resend_cooldown,
    is_resending,
    handle_email_next,
    handle_email_reset_link,
    handle_resend_reset_link,
    handle_code_submit,
    handle_password_submit,
    handle_copy_codes,
    handle_download_pdf,
    handle_download_txt,
    handle_print_codes,
    handle_codes_continue,
  } = use_recovery_flow();

  const go_to = (next: typeof step) => {
    set_error("");
    set_step(next);
  };

  const change_account = () => go_to("email");

  const header = (
    title: string,
    description: string,
    with_account = true,
    allow_change = true,
  ) => (
    <StepHeader
      change_account_label={t("auth.change_account")}
      description={description}
      email={with_account ? email : undefined}
      logo={<SmallLogo />}
      on_change_account={allow_change ? change_account : undefined}
      title={title}
    />
  );

  const render_step_content = () => {
    switch (step) {
      case "email":
        return (
          <StepLayout
            header={header(
              t("auth.recover_your_account"),
              t("auth.enter_email_associated"),
              false,
            )}
          >
            <div className="w-full text-start">
              <label
                className="mb-2 block text-sm font-medium text-txt-primary"
                htmlFor="recovery_address"
              >
                {t("auth.recovery_email_label")}
              </label>
              <div className="relative">
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect="off"
                  className="notranslate pe-32"
                  id="recovery_address"
                  maxLength={55}
                  name="username"
                  placeholder={t("common.yourname_placeholder")}
                  spellCheck={false}
                  status={error ? "error" : "default"}
                  translate="no"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const at_index = raw.indexOf("@");

                    if (at_index !== -1) {
                      const local = sanitize_username(
                        raw.substring(0, at_index),
                      );
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={t("auth.switch_domain")}
                      className="notranslate absolute end-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-[var(--aster-radius-item,8px)] px-1.5 py-1 text-sm text-txt-secondary transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary"
                      tabIndex={-1}
                      translate="no"
                      type="button"
                    >
                      @{email_domain}
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {(["astermail.org", "aster.cx"] as const).map((domain) => (
                      <DropdownMenuItem
                        key={domain}
                        className="notranslate"
                        translate="no"
                        onClick={() => set_email_domain(domain)}
                      >
                        @{domain}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="mt-2 text-xs text-txt-tertiary">
                {t("auth.recovery_domain_hint")}
              </p>
            </div>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <ActionRow
              secondary={
                <TextLink
                  label={t("auth.back_to_sign_in")}
                  on_click={() => navigate("/sign-in")}
                />
              }
            >
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={handle_email_next}
              >
                {t("common.continue")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "other_ways":
        return (
          <StepLayout
            header={header(
              t("auth.other_ways_title"),
              t("auth.other_ways_desc"),
            )}
          >
            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <OptionGroup>
              <OptionRow
                description={t("auth.other_way_code_desc")}
                icon={<KeyIcon />}
                on_click={() => go_to("code")}
                title={t("auth.other_way_code_title")}
              />
              <OptionRow
                description={t("auth.other_way_email_desc")}
                icon={<MailIcon />}
                on_click={() => go_to("reset_email_confirm")}
                title={t("auth.other_way_email_title")}
              />
            </OptionGroup>

            <TextLink
              className="mt-4"
              label={t("auth.other_way_none_title")}
              on_click={() => go_to("support")}
            />
          </StepLayout>
        );

      case "reset_email_confirm":
        return (
          <StepLayout
            header={header(
              t("auth.reset_account_title"),
              t("auth.reset_account_desc"),
            )}
          >
            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <ActionRow
              secondary={
                <TextLink
                  label={t("common.back")}
                  on_click={() => go_to("other_ways")}
                />
              }
            >
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={handle_email_reset_link}
              >
                {t("auth.send_reset_link")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "support":
        return (
          <StepLayout
            header={header(
              t("auth.support_step_title"),
              t("auth.support_step_desc"),
            )}
          >
            <ActionRow
              secondary={
                <TextLink
                  label={t("auth.support_help_center")}
                  on_click={() => open_external(HELP_CENTER_URL)}
                />
              }
            >
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={() => open_external(SUPPORT_MAIL_URL)}
              >
                {t("auth.support_email_action")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "code":
        return (
          <StepLayout
            header={header(
              t("auth.enter_recovery_code"),
              t("auth.enter_recovery_code_desc"),
            )}
          >
            <div className="w-full text-start">
              <label
                className="mb-2 block text-sm font-medium text-txt-primary"
                htmlFor="recovery_code"
              >
                {t("auth.recovery_code_label")}
              </label>
              <Input
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
                id="recovery_code"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <p className="mt-2 text-xs text-txt-tertiary">
                {t("auth.recovery_code_hint")}
              </p>
            </div>

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <ActionRow
              secondary={
                <TextLink
                  label={t("auth.try_another_way")}
                  on_click={() => go_to("other_ways")}
                />
              }
            >
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={handle_code_submit}
              >
                {t("common.continue")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "password":
        return (
          <StepLayout
            header={header(
              t("auth.create_new_password"),
              t("auth.choose_strong_password"),
              true,
              false,
            )}
          >
            <div className="w-full space-y-4 text-start">
              <div>
                <InputWithEndContent
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoComplete="new-password"
                  end_content={
                    <button
                      aria-label={
                        is_password_visible
                          ? t("settings.hide_password_toggle")
                          : t("settings.show_password_toggle")
                      }
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
                    aria-label={
                      is_confirm_visible
                        ? t("settings.hide_password_toggle")
                        : t("settings.show_password_toggle")
                    }
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

            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <ActionRow>
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={handle_password_submit}
              >
                {t("auth.reset_password")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "processing":
        return (
          <StepLayout centered header={null}>
            <Spinner className="h-10 w-10 text-brand" size="lg" />

            <h2 className="text-xl font-semibold mt-8 text-txt-primary">
              {t("auth.recovering_your_account")}
            </h2>

            <p className="mt-3 text-sm text-txt-tertiary">
              {processing_status}
            </p>

            <p className="mt-8 text-xs max-w-xs leading-relaxed text-txt-muted">
              {t("auth.please_dont_close")}
            </p>
          </StepLayout>
        );

      case "new_codes":
        return (
          <StepLayout
            header={header(
              t("auth.save_new_recovery_codes"),
              t("auth.old_codes_invalidated"),
              true,
              false,
            )}
          >
            <div className="w-full">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-txt-muted">
                  {t("auth.n_recovery_codes", {
                    count: new_recovery_codes.length.toString(),
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    aria-label={
                      is_key_visible
                        ? t("settings.hide_password_toggle")
                        : t("settings.show_password_toggle")
                    }
                    className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
                    type="button"
                    onClick={() => set_is_key_visible(!is_key_visible)}
                  >
                    {is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                  <button
                    aria-label={t("auth.copy_codes")}
                    className="p-1.5 rounded transition-colors hover:opacity-80"
                    style={{
                      color: copy_success
                        ? "var(--color-success)"
                        : "var(--text-muted)",
                    }}
                    type="button"
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

            <div className="w-full mt-5 grid grid-cols-3 gap-2">
              <Button
                size="lg"
                variant="secondary"
                onClick={handle_download_pdf}
              >
                {t("common.download")}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={handle_print_codes}
              >
                {t("auth.print_codes")}
              </Button>
              <Button size="lg" variant="secondary" onClick={handle_copy_codes}>
                {copy_success ? t("common.copied") : t("auth.copy_codes")}
              </Button>
            </div>

            <label className="w-full mt-5 flex items-start gap-3 text-start cursor-pointer">
              <Checkbox
                checked={codes_saved}
                className="mt-0.5 shrink-0"
                onChange={(e) => set_codes_saved(e.target.checked)}
              />
              <span className="text-sm text-txt-secondary">
                {t("auth.i_saved_these_codes")}
              </span>
            </label>

            <ActionRow
              secondary={
                <TextLink
                  label={t("auth.download_as_text")}
                  on_click={handle_download_txt}
                />
              }
            >
              <Button
                className="w-full"
                disabled={!codes_saved}
                size="xl"
                variant="depth"
                onClick={handle_codes_continue}
              >
                {t("common.continue")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "email_sent":
        return (
          <StepLayout
            header={header(
              t("auth.reset_link_sent_title"),
              t("auth.reset_link_sent_desc"),
            )}
          >
            <AnimatePresence>
              {error && <Alert is_dark={is_dark} message={error} />}
            </AnimatePresence>

            <ActionRow
              secondary={
                <>
                  <TextLink
                    disabled={resend_cooldown > 0 || is_resending}
                    label={
                      resend_cooldown > 0
                        ? t("auth.resend_in_seconds", {
                            seconds: resend_cooldown.toString(),
                          })
                        : is_resending
                          ? t("common.sending")
                          : t("auth.resend_reset_link")
                    }
                    on_click={handle_resend_reset_link}
                  />
                  <TextLink
                    label={t("auth.reset_use_recovery_code")}
                    on_click={() => go_to("code")}
                  />
                </>
              }
            >
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={() => navigate("/sign-in")}
              >
                {t("auth.back_to_sign_in")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      case "review_security":
        return (
          <StepLayout
            header={header(
              t("auth.review_security_title"),
              t("auth.review_security_desc"),
              false,
            )}
          >
            <div className="w-full divide-y divide-edge-secondary">
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

            <ActionRow>
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={() => navigate("/sign-in")}
              >
                {t("auth.sign_in")}
              </Button>
            </ActionRow>
          </StepLayout>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            animate="animate"
            className="flex w-full max-w-[400px] flex-col items-start px-4 text-start"
            exit="exit"
            initial={reduce_motion ? false : "initial"}
            transition={{
              ...page_transition,
              duration: reduce_motion ? 0 : page_transition.duration,
            }}
            variants={page_variants}
          >
            {render_step_content()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
