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
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { MotionConfig } from "framer-motion";

import { ThemeProvider } from "@/contexts/theme_context";
import { AuthProvider } from "@/contexts/auth_context";
import {
  PreferencesProvider,
  use_preferences,
} from "@/contexts/preferences_context";
import { ExternalLinkProvider } from "@/contexts/external_link_context";
import { SignaturesProvider } from "@/contexts/signatures_context";
import { TemplatesProvider } from "@/contexts/templates_context";
import { UiStringsProvider, type AsterUiStrings } from "@aster/ui";

import { I18nProvider, use_i18n } from "@/lib/i18n/context";

const ReducedMotionContext = createContext(false);

export function use_should_reduce_motion() {
  return useContext(ReducedMotionContext);
}

function use_os_reduced_motion() {
  const [os_prefers_reduced, set_os_prefers_reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) =>
      set_os_prefers_reduced(e.matches);

    mq.addEventListener("change", handler);

    return () => mq.removeEventListener("change", handler);
  }, []);

  return os_prefers_reduced;
}

const INSTANT_TRANSITION = { duration: 0 };

function MotionWrapper({ children }: { children: React.ReactNode }) {
  const { preferences } = use_preferences();
  const os_prefers_reduced = use_os_reduced_motion();

  const should_reduce =
    preferences.reduce_motion ||
    preferences.low_network_mode ||
    os_prefers_reduced;
  const transition = useMemo(
    () => (should_reduce ? INSTANT_TRANSITION : undefined),
    [should_reduce],
  );

  return (
    <ReducedMotionContext.Provider value={should_reduce}>
      <MotionConfig
        reducedMotion={should_reduce ? "always" : "never"}
        transition={transition}
      >
        {children}
      </MotionConfig>
    </ReducedMotionContext.Provider>
  );
}

function MailUiStrings({ children }: { children: React.ReactNode }) {
  const { t } = use_i18n();
  const strings = useMemo<Partial<AsterUiStrings>>(
    () => ({
      close: t("common.close"),
      cancel: t("common.cancel"),
      confirm: t("common.confirm"),
      loading: t("common.loading"),
      more_info: t("common.more_information"),
      copy: t("common.copy"),
      copied: t("common.copied"),
      retry: t("common.retry"),
      show_password: t("settings.show_password_toggle"),
      hide_password: t("settings.hide_password_toggle"),
      next_month: t("common.next_month"),
      qr_code: t("common.qr_code"),
      learn_more: t("common.learn_more"),
    }),
    [t],
  );

  return <UiStringsProvider strings={strings}>{children}</UiStringsProvider>;
}

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MailUiStrings>
          <AuthProvider>
            <PreferencesProvider>
              <ExternalLinkProvider>
                <MotionWrapper>
                  <SignaturesProvider>
                    <TemplatesProvider>{children}</TemplatesProvider>
                  </SignaturesProvider>
                </MotionWrapper>
              </ExternalLinkProvider>
            </PreferencesProvider>
          </AuthProvider>
        </MailUiStrings>
      </I18nProvider>
    </ThemeProvider>
  );
}
