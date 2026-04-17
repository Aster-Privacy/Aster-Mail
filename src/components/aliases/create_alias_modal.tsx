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
import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSymbolIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import {
  create_alias,
  validate_local_part,
  check_alias_availability,
} from "@/services/api/aliases";
import { emit_aliases_changed } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

const ALIAS_DOMAIN = "astermail.org";

interface CreateAliasModalProps {
  is_open: boolean;
  on_close: () => void;
}

export function CreateAliasModal({ is_open, on_close }: CreateAliasModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [local_part, set_local_part] = useState("");
  const [is_creating, set_is_creating] = useState(false);
  const [error, set_error] = useState("");

  const handle_create = useCallback(async () => {
    const trimmed = local_part.trim().toLowerCase();
    const validation = validate_local_part(trimmed);

    if (!validation.valid) {
      set_error(validation.error || t("settings.alias_invalid"));

      return;
    }

    set_is_creating(true);
    set_error("");

    try {
      const availability = await check_alias_availability(
        trimmed,
        ALIAS_DOMAIN,
      );

      if (availability.data && !availability.data.available) {
        set_error(t("settings.alias_already_taken"));
        set_is_creating(false);

        return;
      }

      const result = await create_alias(trimmed, ALIAS_DOMAIN);

      if (result.data?.success) {
        emit_aliases_changed();
        set_local_part("");
        on_close();
      } else {
        set_error(result.error || t("settings.alias_create_failed"));
      }
    } catch {
      set_error(t("settings.alias_create_failed"));
    }

    set_is_creating(false);
  }, [local_part, on_close]);

  const handle_close = () => {
    if (is_creating) return;
    set_local_part("");
    set_error("");
    on_close();
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={handle_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-5">
                <AtSymbolIcon className="w-5 h-5 text-txt-secondary" />
                <h2 className="text-[16px] font-semibold text-txt-primary">
                  {t("settings.create_alias")}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="create-alias-local-part"
                  >
                    {t("settings.alias_address")}
                  </label>
                  <div className="flex items-center gap-0">
                    <input
                      autoFocus
                      className={`flex-1 h-10 px-3 rounded-l-lg bg-transparent border border-r-0 border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none ${error ? "border-red-500" : ""}`}
                      disabled={is_creating}
                      id="create-alias-local-part"
                      placeholder="myalias"
                      type="text"
                      value={local_part}
                      onChange={(e) => {
                        set_local_part(e.target.value);
                        set_error("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handle_create()}
                    />
                    <span className="h-10 px-3 flex items-center rounded-r-lg text-[14px] bg-surf-secondary border border-l-0 border-edge-secondary text-txt-muted select-none">
                      @{ALIAS_DOMAIN}
                    </span>
                  </div>
                </div>

                {error && <p className="text-[13px] text-red-500">{error}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
              <Button
                disabled={is_creating}
                size="xl"
                variant="outline"
                onClick={handle_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!local_part.trim() || is_creating}
                size="xl"
                variant="depth"
                onClick={handle_create}
              >
                {is_creating && <Spinner className="mr-2" size="md" />}
                {t("common.create")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
