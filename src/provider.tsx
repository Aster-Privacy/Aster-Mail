import { MotionConfig } from "framer-motion";

import { ThemeProvider } from "@/contexts/theme_context";
import { AuthProvider } from "@/contexts/auth_context";
import {
  PreferencesProvider,
  use_preferences,
} from "@/contexts/preferences_context";
import { SignaturesProvider } from "@/contexts/signatures_context";
import { TemplatesProvider } from "@/contexts/templates_context";
import { I18nProvider } from "@/lib/i18n/context";

function MotionWrapper({ children }: { children: React.ReactNode }) {
  const { preferences } = use_preferences();

  return (
    <MotionConfig
      reducedMotion={preferences.reduce_motion ? "always" : "never"}
    >
      {children}
    </MotionConfig>
  );
}

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <PreferencesProvider>
            <MotionWrapper>
              <SignaturesProvider>
                <TemplatesProvider>{children}</TemplatesProvider>
              </SignaturesProvider>
            </MotionWrapper>
          </PreferencesProvider>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
