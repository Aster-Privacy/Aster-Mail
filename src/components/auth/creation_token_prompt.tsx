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
import { useEffect, useRef, useState } from "react";

import {
  TURNSTILE_SITE_KEY,
  TurnstileWidget,
  set_creation_token_source,
} from "@/components/auth/turnstile_widget";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

export function CreationTokenPrompt(): React.ReactElement | null {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const pending_resolve = useRef<((token: string | null) => void) | null>(
    null,
  );

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    set_creation_token_source(() => {
      pending_resolve.current?.(null);

      return new Promise<string | null>((resolve) => {
        pending_resolve.current = resolve;
        set_is_open(true);
      });
    });

    return () => {
      set_creation_token_source(null);
      pending_resolve.current?.(null);
      pending_resolve.current = null;
    };
  }, []);

  const settle = (token: string | null) => {
    const resolve = pending_resolve.current;

    pending_resolve.current = null;
    set_is_open(false);
    resolve?.(token);
  };

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <Modal is_open={is_open} on_close={() => settle(null)} size="sm">
      <ModalHeader>
        <ModalTitle>{t("auth.complete_captcha_first")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {is_open && (
          <TurnstileWidget on_verify={(token) => settle(token || null)} />
        )}
      </ModalBody>
      <ModalFooter>
        <button
          className="aster_btn aster_btn_secondary aster_btn_sm"
          type="button"
          onClick={() => settle(null)}
        >
          {t("common.cancel")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
