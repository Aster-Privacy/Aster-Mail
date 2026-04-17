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
import { I18nProvider } from "@/lib/i18n/context";
import { ColorVisionFilters } from "@/components/ui/color_vision_filters";

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

  const should_reduce = preferences.reduce_motion || os_prefers_reduced;
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

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <PreferencesProvider>
            <ExternalLinkProvider>
              <MotionWrapper>
                <ColorVisionFilters />
                <SignaturesProvider>
                  <TemplatesProvider>{children}</TemplatesProvider>
                </SignaturesProvider>
              </MotionWrapper>
            </ExternalLinkProvider>
          </PreferencesProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
