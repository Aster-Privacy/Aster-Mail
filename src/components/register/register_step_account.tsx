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

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { Logo } from "@/components/auth/auth_styles";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import { sanitize_username } from "@/services/sanitize";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import { Alert } from "@/components/register/register_shared";

interface RegisterStepAccountProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepAccount = ({ reg }: RegisterStepAccountProps) => {
  return (
    <motion.div
      key="email"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {reg.t("auth.choose_email_address")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.t("auth.pick_unique_username")}
      </p>

      <AnimatePresence>
        {reg.error && !reg.is_abuse_blocked && (
          <Alert is_dark={reg.is_dark} message={reg.error} />
        )}
        {reg.is_abuse_blocked && (
          <motion.div
            animate={{ opacity: 1 }}
            className="w-full mt-6"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <p
              className="text-sm text-center"
              style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
            >
              {reg.t("auth.abuse_flagged_message")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`w-full ${reg.error ? "mt-4" : "mt-6"} space-y-4`}>
        <div>
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            autoComplete="username"
            className="notranslate"
            maxLength={55}
            placeholder={reg.t("auth.new_email_address")}
            status={reg.error ? "error" : "default"}
            translate="no"
            type="text"
            value={reg.username}
            onChange={(e) => {
              const raw = e.target.value;
              const at_index = raw.indexOf("@");

              if (at_index !== -1) {
                const local = sanitize_username(raw.substring(0, at_index));
                const domain_part = raw.substring(at_index + 1).toLowerCase();

                reg.set_username(local + "@" + domain_part);
                if (
                  domain_part === "astermail.org" ||
                  domain_part.startsWith("astermail.org")
                )
                  reg.set_email_domain("astermail.org");
                else if (
                  domain_part === "aster.cx" ||
                  domain_part.startsWith("aster.cx")
                )
                  reg.set_email_domain("aster.cx");
              } else {
                reg.set_username(sanitize_username(raw));
              }
            }}
            onKeyDown={(e) => e["key"] === "Enter" && reg.handle_email_next()}
          />
          <div className="relative flex mt-2 aster_input !p-1 !h-auto">
            <div
              className="absolute top-1 bottom-1 rounded-[8px] transition-all duration-200 ease-out bg-surf-tertiary"
              style={{
                width: "calc(50% - 4px)",
                left:
                  reg.email_domain === "astermail.org" ? "4px" : "calc(50%)",
              }}
            />
            <button
              className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${reg.email_domain === "astermail.org" ? "text-txt-primary" : "text-txt-muted"}`}
              type="button"
              onClick={() => reg.set_email_domain("astermail.org")}
            >
              @astermail.org
            </button>
            <button
              className={`relative flex-1 h-8 rounded-[8px] text-sm font-medium transition-colors duration-150 ${reg.email_domain === "aster.cx" ? "text-txt-primary" : "text-txt-muted"}`}
              type="button"
              onClick={() => reg.set_email_domain("aster.cx")}
            >
              @aster.cx
            </button>
          </div>
        </div>

        <div>
          <Input
            autoComplete="off"
            maxLength={64}
            placeholder={reg.t("auth.display_name_optional")}
            type="text"
            value={reg.display_name}
            onChange={(e) => reg.set_display_name(e.target.value)}
            onKeyDown={(e) => e["key"] === "Enter" && reg.handle_email_next()}
          />
        </div>
      </div>

      <div className="w-full mt-6">
        <p className="text-sm font-medium mb-3 text-txt-primary">
          {reg.t("auth.profile_color")}
        </p>
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{
              background: get_gradient_background(reg.profile_color),
              transition: "background 0.3s ease",
            }}
          >
            <img
              alt=""
              draggable={false}
              src="/aster.webp"
              style={{
                width: 20,
                height: 20,
                filter: "brightness(0) invert(1)",
                objectFit: "contain" as const,
                userSelect: "none" as const,
                pointerEvents: "none" as const,
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            {PROFILE_COLORS.map((color) => (
              <button
                key={color}
                className="w-9 h-9 rounded-full"
                style={{
                  backgroundColor: color,
                  boxShadow:
                    reg.profile_color === color
                      ? `0 0 0 2.5px var(--bg-primary), 0 0 0 4.5px ${color}`
                      : "none",
                  transition: "box-shadow 0.15s ease",
                }}
                type="button"
                onClick={() => reg.set_profile_color(color)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full mt-6">
        <Button
          className="flex-1"
          size="xl"
          variant="secondary"
          onClick={() => {
            reg.set_error("");
            reg.set_step("welcome");
          }}
        >
          {reg.t("common.back")}
        </Button>
        <Button
          className="flex-1"
          size="xl"
          variant="depth"
          onClick={reg.handle_email_next}
        >
          {reg.t("common.next")}
        </Button>
      </div>
    </motion.div>
  );
};
