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
import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_translation } from "@/lib/i18n";

function VerifyRecoveryEmailPage() {
  const [search_params] = useSearchParams();
  const { t } = use_translation();
  const { is_authenticated, is_loading } = use_auth();
  const navigate = useNavigate();

  const verified = search_params.get("verified") === "true";

  useEffect(() => {
    sessionStorage.setItem(
      "recovery_email_verification_result",
      verified ? "success" : "error",
    );
  }, [verified]);

  useEffect(() => {
    if (!is_loading && is_authenticated) {
      navigate("/", { replace: true });
    }
  }, [is_loading, is_authenticated, navigate]);

  if (is_loading || is_authenticated) {
    return null;
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: "var(--bg-primary, #0a0a0a)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-8 text-center"
        style={{
          backgroundColor: "var(--bg-secondary, #141414)",
          borderColor: "var(--border-primary, #262626)",
        }}
      >
        {verified ? (
          <svg
            className="mx-auto mb-4 h-12 w-12"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            style={{ color: "var(--accent-color, #3b82f6)" }}
            viewBox="0 0 24 24"
          >
            <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ) : (
          <svg
            className="mx-auto mb-4 h-12 w-12"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            style={{ color: "#ef4444" }}
            viewBox="0 0 24 24"
          >
            <path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        )}

        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--text-primary, #fafafa)" }}
        >
          {verified
            ? t("auth.verification_success_title")
            : t("auth.verification_failed")}
        </h1>

        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--text-tertiary, #a3a3a3)" }}
        >
          {verified
            ? t("auth.verification_success_desc")
            : t("auth.verification_failed_desc")}
        </p>

        <button
          className="mt-6 w-full rounded-[14px] py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-hover, #262626)",
            color: "var(--text-primary, #fafafa)",
          }}
          onClick={() => window.close()}
        >
          {t("auth.close_this_tab")}
        </button>
      </div>
    </div>
  );
}

export default VerifyRecoveryEmailPage;
