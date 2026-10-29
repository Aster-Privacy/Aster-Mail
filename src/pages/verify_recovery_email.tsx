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
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@aster/ui";

import {
  ActionRow,
  StepHeader,
  page_transition,
  page_variants,
} from "@/pages/forgot_password/shared";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { Spinner } from "@/components/ui/spinner";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  get_recovery_email_link_status,
  type RecoveryEmailLinkStatus,
} from "@/services/api/recovery_email";

type ViewState = "checking" | RecoveryEmailLinkStatus;

const SmallLogo = () => (
  <img
    alt="Aster"
    className="h-7"
    decoding="async"
    draggable={false}
    src="/text_logo.png"
  />
);

function read_link_token(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
}

function VerifyRecoveryEmailPage() {
  const { t } = use_i18n();
  const { is_authenticated, is_loading } = use_auth();
  const navigate = useNavigate();
  const reduce_motion = use_should_reduce_motion();

  const [token] = useState(read_link_token);
  const [view, set_view] = useState<ViewState>(
    token ? "checking" : "not_verified",
  );
  const [attempt, set_attempt] = useState(0);
  const can_close_tab = window.opener !== null;

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;

    void get_recovery_email_link_status(token).then((status) => {
      if (active) set_view(status);
    });

    return () => {
      active = false;
    };
  }, [token, attempt]);

  useEffect(() => {
    if (view !== "verified" && view !== "not_verified") return;
    sessionStorage.setItem(
      "recovery_email_verification_result",
      view === "verified" ? "success" : "error",
    );
    if (!is_loading && is_authenticated) {
      navigate("/", { replace: true });
    }
  }, [view, is_loading, is_authenticated, navigate]);

  const handle_dismiss = () => {
    window.close();

    window.setTimeout(() => {
      if (!window.closed) {
        navigate("/sign-in", { replace: true });
      }
    }, 200);
  };

  const render_content = () => {
    if (view === "checking" || is_loading || is_authenticated) {
      return (
        <div className="flex w-full justify-center py-16">
          <Spinner />
        </div>
      );
    }

    if (view === "unreachable") {
      return (
        <div className="flex w-full flex-col items-start">
          <SmallLogo />
          <div className="mt-5 w-full">
            <LoadFailedNotice
              on_retry={() => {
                set_view("checking");
                set_attempt((value) => value + 1);
              }}
            />
          </div>
        </div>
      );
    }

    const verified = view === "verified";

    return (
      <div className="flex w-full flex-col items-start">
        <StepHeader
          description={
            verified
              ? t("auth.verification_success_desc")
              : t("auth.verification_failed_desc")
          }
          logo={<SmallLogo />}
          title={
            verified
              ? t("auth.verification_success_title")
              : t("auth.verification_failed")
          }
        />
        <ActionRow>
          <Button
            className="w-full"
            size="xl"
            variant="depth"
            onClick={handle_dismiss}
          >
            {can_close_tab
              ? t("auth.close_this_tab")
              : t("auth.back_to_sign_in")}
          </Button>
        </ActionRow>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
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
            {render_content()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default VerifyRecoveryEmailPage;
