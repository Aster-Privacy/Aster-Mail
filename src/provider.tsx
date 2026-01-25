import { ThemeProvider } from "@/contexts/theme_context";
import { AuthProvider } from "@/contexts/auth_context";
import { PreferencesProvider } from "@/contexts/preferences_context";
import { SignaturesProvider } from "@/contexts/signatures_context";
import { TemplatesProvider } from "@/contexts/templates_context";
import { I18nProvider } from "@/lib/i18n/context";

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <PreferencesProvider>
            <SignaturesProvider>
              <TemplatesProvider>{children}</TemplatesProvider>
            </SignaturesProvider>
          </PreferencesProvider>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
