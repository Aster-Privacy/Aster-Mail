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

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AcademicCapIcon, NewspaperIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Logo } from "@/components/auth/auth_styles";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import { read_offer_prefill } from "@/components/register/academic_offer_prefill";

interface RegisterStepWelcomeProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepWelcome = ({ reg }: RegisterStepWelcomeProps) => {
  const offer = read_offer_prefill();
  const is_journalist = offer.role === "journalist";
  const OfferIcon = is_journalist ? NewspaperIcon : AcademicCapIcon;

  return (
    <motion.div
      key="welcome"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4 text-center"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      {reg.is_adding_account && reg.is_authenticated && (
        <button
          className="self-start flex items-center gap-1 text-sm mb-6 transition-colors hover:opacity-80 text-txt-tertiary"
          onClick={reg.handle_cancel_add_account}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M15 19l-7-7 7-7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {reg.t("auth.back_to_inbox")}
        </button>
      )}

      <Logo />

      {offer.has_offer ? (
        <>
          <span
            className="inline-flex items-center gap-1.5 mt-6"
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              lineHeight: 1,
              color: "var(--accent-fg, #ffffff)",
              backgroundColor: "var(--accent-color-hover)",
            }}
          >
            <OfferIcon className="w-3.5 h-3.5" />
            {reg.t(
              is_journalist
                ? "auth.offer_welcome_badge_journalist"
                : "auth.offer_welcome_badge_student",
            )}
          </span>
          <h1 className="text-2xl font-bold mt-4 text-txt-primary">
            {reg.t("auth.offer_welcome_headline")}
          </h1>
          <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
            {reg.t(
              is_journalist
                ? "auth.offer_welcome_subline_journalist"
                : "auth.offer_welcome_subline_student",
            )}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold mt-6 text-txt-primary">
            {reg.t("auth.create_aster_account")}
          </h1>
          <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
            {reg.t("auth.one_account_all_services")}
          </p>
        </>
      )}

      <div className="w-full mt-8 space-y-3">
        <Button
          className="w-full"
          size="xl"
          variant="depth"
          onClick={() => reg.set_step("email")}
        >
          {reg.t("auth.create_free_account")}
        </Button>

        <Button as_child className="w-full" size="xl" variant="secondary">
          <Link to="/sign-in">{reg.t("auth.sign_in_existing")}</Link>
        </Button>
      </div>

      <p className="text-xs mt-6 leading-relaxed text-txt-muted">
        {reg.t("auth.by_continuing")}{" "}
        <a
          className="underline transition-colors hover:opacity-80"
          href="https://astermail.org/terms"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-blue)" }}
          target="_blank"
        >
          {reg.t("auth.terms_of_service")}
        </a>{" "}
        {reg.t("common.and")}{" "}
        <a
          className="underline transition-colors hover:opacity-80"
          href="https://astermail.org/privacy"
          rel="noopener noreferrer"
          style={{ color: "var(--accent-blue)" }}
          target="_blank"
        >
          {reg.t("auth.privacy_policy")}
        </a>
        .
      </p>
    </motion.div>
  );
};
