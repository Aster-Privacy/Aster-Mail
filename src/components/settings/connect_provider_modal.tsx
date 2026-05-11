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
import { useState } from "react";
import { ArrowRightIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { FaMicrosoft, FaYahoo } from "react-icons/fa6";
import { SiGmail } from "react-icons/si";
import { Button } from "@aster/ui";

import { Modal, ModalBody } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { start_oauth_authorize } from "@/services/api/external_accounts";

export type ConnectProvider = "google" | "microsoft" | "yahoo";

interface ConnectProviderModalProps {
  provider: ConnectProvider | null;
  on_close: () => void;
}

interface ProviderTheme {
  icon: React.ReactNode;
  name_key:
    | "settings.connect_provider_name_google"
    | "settings.connect_provider_name_microsoft"
    | "settings.connect_provider_name_yahoo";
  button_key:
    | "settings.connect_sign_in_google"
    | "settings.connect_sign_in_microsoft"
    | "settings.connect_sign_in_yahoo";
  ring: string;
}

const PROVIDER_THEME: Record<ConnectProvider, ProviderTheme> = {
  google: {
    icon: <SiGmail className="w-9 h-9" color="#EA4335" />,
    name_key: "settings.connect_provider_name_google",
    button_key: "settings.connect_sign_in_google",
    ring: "ring-[#EA4335]/20",
  },
  microsoft: {
    icon: <FaMicrosoft className="w-9 h-9" color="#0078D4" />,
    name_key: "settings.connect_provider_name_microsoft",
    button_key: "settings.connect_sign_in_microsoft",
    ring: "ring-[#0078D4]/20",
  },
  yahoo: {
    icon: <FaYahoo className="w-9 h-9" color="#6001D2" />,
    name_key: "settings.connect_provider_name_yahoo",
    button_key: "settings.connect_sign_in_yahoo",
    ring: "ring-[#6001D2]/20",
  },
};

export function ConnectProviderModal({
  provider,
  on_close,
}: ConnectProviderModalProps) {
  const { t } = use_i18n();
  const [is_loading, set_is_loading] = useState(false);

  if (!provider) return null;

  const theme = PROVIDER_THEME[provider];

  const handle_connect = async () => {
    set_is_loading(true);
    try {
      const result = await start_oauth_authorize(provider);
      if (result.error) {
        show_toast(
          t("settings.oauth_import_error", { reason: result.error }),
          "error",
        );
        set_is_loading(false);
        return;
      }
      if (result.data?.authorize_url) {
        window.location.href = result.data.authorize_url;
        return;
      }
      set_is_loading(false);
    } catch {
      show_toast(
        t("settings.oauth_import_error", { reason: "unexpected_error" }),
        "error",
      );
      set_is_loading(false);
    }
  };

  return (
    <Modal is_open={provider !== null} size="md" on_close={on_close}>
      <ModalBody className="p-0">
        <div className="flex flex-col items-center px-8 pt-10 pb-8">
          <div className="flex items-center justify-center gap-5 mb-8">
            <div
              className={`flex items-center justify-center w-16 h-16 rounded-2xl bg-surf-secondary ring-1 ${theme.ring}`}
            >
              {theme.icon}
            </div>
            <ArrowRightIcon className="w-5 h-5 text-txt-muted" />
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surf-secondary ring-1 ring-brand/20 overflow-hidden">
              <img
                alt="Aster"
                className="w-10 h-10 object-contain"
                src="/mail_logo.png"
              />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-txt-primary text-center">
            {t("settings.connect_modal_title", {
              provider: t(theme.name_key),
            })}
          </h2>
          <p className="mt-2 text-sm text-txt-secondary text-center max-w-sm leading-relaxed">
            {t("settings.connect_modal_description", {
              provider: t(theme.name_key),
            })}
          </p>

          <Button
            className="mt-8 w-full"
            disabled={is_loading}
            size="xl"
            variant="depth"
            onClick={handle_connect}
          >
            {is_loading ? (
              <Spinner className="text-current" size="sm" />
            ) : (
              t(theme.button_key)
            )}
          </Button>

          <div className="mt-6 flex items-start gap-2 text-xs text-txt-muted leading-relaxed">
            <LockClosedIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              {t("settings.connect_modal_privacy_note", {
                provider: t(theme.name_key),
              })}
            </p>
          </div>

          <button
            className="mt-6 text-xs text-txt-muted hover:text-txt-secondary"
            disabled={is_loading}
            type="button"
            onClick={on_close}
          >
            {t("common.cancel")}
          </button>
        </div>
      </ModalBody>
    </Modal>
  );
}
