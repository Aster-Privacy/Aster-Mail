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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import { motion } from "framer-motion";
import { Button } from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { Logo, EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { SparkleOverlay } from "@/components/ui/sparkle_overlay";
import { show_toast } from "@/components/toast/simple_toast";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import { CopyIcon } from "@/components/register/register_shared";

interface RegisterStepRecoveryPhraseProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepRecoveryPhrase = ({
  reg,
}: RegisterStepRecoveryPhraseProps) => {
  const words = reg.recovery_phrase.split(" ");

  return (
    <motion.div
      key="recovery_phrase"
      animate="animate"
      className="flex flex-col items-center w-full max-w-md px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {reg.t("auth.recovery_phrase_title")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.t("auth.recovery_phrase_desc")}
      </p>

      <div className="w-full mt-6">
        <div className="flex items-center justify-end mb-3">
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
              onClick={() => reg.set_is_phrase_visible(!reg.is_phrase_visible)}
            >
              {reg.is_phrase_visible ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
            <button
              className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
              onClick={() => {
                if (reg.is_phrase_visible) {
                  reg.handle_copy_phrase();
                } else {
                  show_toast(reg.t("auth.recovery_phrase_reveal"), "info");
                }
              }}
            >
              <CopyIcon />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {words.map((word, index) => (
            <div
              key={index}
              className="relative overflow-hidden rounded-lg px-3 py-2.5 border flex items-center gap-2 transition-colors hover:opacity-80 bg-surf-tertiary border-edge-secondary"
            >
              <span className="text-xs text-txt-muted w-5 text-end shrink-0">
                {index + 1}.
              </span>
              <span
                className="text-xs font-mono text-txt-primary break-all"
                style={{
                  filter: reg.is_phrase_visible ? "none" : "blur(4px)",
                  transition: "filter 0.2s ease",
                  userSelect: reg.is_phrase_visible ? "text" : "none",
                }}
              >
                {word}
              </span>
              <SparkleOverlay is_active={!reg.is_phrase_visible} />
            </div>
          ))}
        </div>
      </div>

      <Button
        className="w-full mt-6"
        size="xl"
        variant="depth"
        onClick={reg.handle_download_phrase_pdf}
      >
        {reg.t("auth.download_key")}
      </Button>

      <Button
        className="w-full mt-3"
        size="xl"
        variant="secondary"
        onClick={reg.handle_download_phrase_text}
      >
        {reg.t("auth.download_as_text")}
      </Button>

      <label className="w-full mt-6 flex items-start gap-2 cursor-pointer text-txt-tertiary">
        <input
          checked={reg.phrase_saved_checkbox}
          className="mt-0.5 accent-current"
          type="checkbox"
          onChange={(e) => reg.set_phrase_saved_checkbox(e.target.checked)}
        />
        <span className="text-sm leading-relaxed">
          {reg.t("auth.recovery_phrase_saved_checkbox")}
        </span>
      </label>

      <Button
        className="w-full mt-4"
        disabled={!reg.phrase_saved_checkbox}
        size="xl"
        variant="depth"
        onClick={reg.handle_phrase_continue}
      >
        {reg.t("common.continue")}
      </Button>

      <button
        className="w-full mt-4 text-sm transition-colors hover:opacity-80 text-txt-tertiary text-center"
        onClick={reg.handle_skip_phrase}
      >
        {reg.t("auth.continue_without_download")}
      </button>

      <ConfirmationModal
        cancel_text={reg.t("common.go_back")}
        confirm_text={reg.t("common.continue_anyway")}
        is_open={reg.show_skip_confirmation}
        message={reg.t("auth.recovery_phrase_skip_warning")}
        on_cancel={() => reg.set_show_skip_confirmation(false)}
        on_confirm={reg.handle_skip_confirm_check}
        title={reg.t("common.are_you_sure")}
        variant="warning"
      />
    </motion.div>
  );
};
