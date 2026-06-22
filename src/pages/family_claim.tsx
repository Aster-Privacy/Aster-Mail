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
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LinkIcon } from "@heroicons/react/24/outline";

import { ErrorBoundary } from "@/components/ui/error_boundary";
import { Spinner } from "@/components/ui/spinner";
import { use_registration } from "@/components/register/hooks/use_registration";
import { RegisterStepPassword } from "@/components/register/register_step_password";
import { RegisterStepKeys } from "@/components/register/register_step_keys";
import {
  RegisterStepRecoveryCodes,
  RegisterStepRecoveryEmail,
  RegisterStepRecoveryEmailVerification,
  RegisterStepRecoveryEmailGate,
} from "@/components/register/register_step_recovery";
import { preview_claim } from "@/services/api/family";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth_safe } from "@/contexts/auth_context";
import { show_toast } from "@/components/toast/simple_toast";

type Preview =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; username: string; domain: "astermail.org" | "aster.cx" };

function ClaimFlow({ token, username, domain }: { token: string; username: string; domain: "astermail.org" | "aster.cx" }) {
  const reg = use_registration({ claim_token: token, claim_username: username, claim_domain: domain });

  const render_step_content = () => {
    switch (reg.step) {
      case "password":
        return <RegisterStepPassword reg={reg} />;
      case "generating":
        return <RegisterStepKeys reg={reg} />;
      case "recovery_key":
        return <RegisterStepRecoveryCodes reg={reg} />;
      case "recovery_email":
        return <RegisterStepRecoveryEmail reg={reg} />;
      case "recovery_email_verification":
        return <RegisterStepRecoveryEmailVerification reg={reg} />;
      case "recovery_email_gate":
        return <RegisterStepRecoveryEmailGate reg={reg} />;
      default:
        return <RegisterStepPassword reg={reg} />;
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {reg.claim_address && (
        <div className="w-full max-w-md mb-4 rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-txt-primary">
            {reg.t("settings.fam_kids_claim_setup_for", { address: reg.claim_address })}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">{reg.t("settings.fam_kids_claim_intro")}</p>
        </div>
      )}
      <ErrorBoundary>
        <AnimatePresence mode="wait">{render_step_content()}</AnimatePresence>
      </ErrorBoundary>
    </div>
  );
}

function SignedInPanel({ username, domain }: { username: string; domain: string }) {
  const { t } = use_i18n();

  const handle_copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      show_toast(t("settings.fam_kids_link_copied"), "success");
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="max-w-sm w-full space-y-5 text-center">
      <div className="rounded-xl border border-edge-secondary px-5 py-4">
        <p className="text-sm font-semibold text-txt-primary">{username}@{domain}</p>
        <p className="text-xs text-txt-muted mt-1">{t("settings.fam_kids_claim_intro")}</p>
      </div>
      <div>
        <h2 className="text-base font-semibold text-txt-primary">{t("settings.fam_kids_claim_signed_in_title")}</h2>
        <p className="text-sm text-txt-secondary mt-2 leading-relaxed">{t("settings.fam_kids_claim_signed_in_body")}</p>
      </div>
      <button onClick={handle_copy} className="aster_btn aster_btn_primary aster_btn_sm inline-flex items-center gap-2">
        <LinkIcon className="w-4 h-4" /> {t("settings.fam_kids_copy_link")}
      </button>
    </div>
  );
}

export default function FamilyClaimPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const is_signed_in = auth?.is_authenticated ?? false;
  const [preview, set_preview] = useState<Preview>({ state: "loading" });

  useEffect(() => {
    let active = true;
    if (!token) {
      set_preview({ state: "error" });
      return;
    }
    void (async () => {
      const r = await preview_claim(token);
      if (!active) return;
      if (r.data) {
        set_preview({
          state: "ready",
          username: r.data.username,
          domain: r.data.email_domain === "aster.cx" ? "aster.cx" : "astermail.org",
        });
      } else {
        set_preview({ state: "error" });
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const render_content = () => {
    if (preview.state === "loading") {
      return (
        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <Spinner />
        </motion.div>
      );
    }
    if (preview.state === "error") {
      return (
        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-txt-primary">{t("settings.fam_kids_claim_invalid_title")}</h1>
          <p className="text-sm text-txt-muted mt-2">{t("settings.fam_kids_claim_invalid_body")}</p>
        </motion.div>
      );
    }
    if (is_signed_in) {
      return (
        <motion.div key="signed-in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <SignedInPanel username={preview.username} domain={preview.domain} />
        </motion.div>
      );
    }
    return (
      <motion.div key="claim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full flex justify-center">
        {token && <ClaimFlow token={token} username={preview.username} domain={preview.domain} />}
      </motion.div>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">
          {render_content()}
        </AnimatePresence>
      </div>
    </div>
  );
}
