import { CheckIcon } from "@heroicons/react/24/outline";

import { useTheme } from "@/contexts/theme_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SunFilledIcon, MoonFilledIcon } from "@/components/icons";
import { ACCENT_COLOR_SWATCHES } from "@/constants/style_presets";

function ThemeMockupLight() {
  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div
        className="w-[52px] h-full flex flex-col p-1.5 gap-1.5"
        style={{ backgroundColor: "#f7f7f7", borderRight: "1px solid #e8e8e8" }}
      >
        <div className="flex items-center gap-1.5 px-1 mb-0.5">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: "#3b82f6" }}
          />
          <div
            className="flex-1 h-1.5 rounded-sm"
            style={{ backgroundColor: "#374151" }}
          />
        </div>
        <div
          className="h-5 rounded flex items-center justify-center"
          style={{
            background:
              "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
          }}
        >
          <div className="w-2.5 h-2.5 rounded-sm bg-white/80" />
        </div>
        <div className="space-y-0.5 mt-1">
          <div
            className="h-4 rounded px-1.5 flex items-center gap-1"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e8e8e8",
            }}
          >
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#374151" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#374151" }}
            />
          </div>
          <div className="h-4 rounded px-1.5 flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#9ca3af" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#9ca3af" }}
            />
          </div>
          <div className="h-4 rounded px-1.5 flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#9ca3af" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#9ca3af" }}
            />
          </div>
        </div>
      </div>
      <div
        className="flex-1 flex flex-col"
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="flex-1 flex">
          <div
            className="w-[55%] p-1.5 space-y-1"
            style={{ borderRight: "1px solid #e8e8e8" }}
          >
            <div
              className="h-7 rounded p-1.5 flex items-start gap-1.5"
              style={{ backgroundColor: "#eff6ff" }}
            >
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#3b82f6" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="w-[65%] h-1 rounded-sm mb-1"
                  style={{ backgroundColor: "#111827" }}
                />
                <div
                  className="w-[80%] h-1 rounded-sm"
                  style={{ backgroundColor: "#6b7280" }}
                />
              </div>
            </div>
            <div className="h-7 rounded p-1.5 flex items-start gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#d1d5db" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="w-[55%] h-1 rounded-sm mb-1"
                  style={{ backgroundColor: "#374151" }}
                />
                <div
                  className="w-[70%] h-1 rounded-sm"
                  style={{ backgroundColor: "#9ca3af" }}
                />
              </div>
            </div>
            <div className="h-7 rounded p-1.5 flex items-start gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#d1d5db" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="w-[60%] h-1 rounded-sm mb-1"
                  style={{ backgroundColor: "#374151" }}
                />
                <div
                  className="w-[75%] h-1 rounded-sm"
                  style={{ backgroundColor: "#9ca3af" }}
                />
              </div>
            </div>
          </div>
          <div className="flex-1 p-2">
            <div
              className="w-[70%] h-1.5 rounded-sm mb-2"
              style={{ backgroundColor: "#111827" }}
            />
            <div className="space-y-1">
              <div
                className="w-full h-1 rounded-sm"
                style={{ backgroundColor: "#e5e7eb" }}
              />
              <div
                className="w-[90%] h-1 rounded-sm"
                style={{ backgroundColor: "#e5e7eb" }}
              />
              <div
                className="w-[75%] h-1 rounded-sm"
                style={{ backgroundColor: "#e5e7eb" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeMockupDark() {
  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex"
      style={{ backgroundColor: "#121212" }}
    >
      <div
        className="w-[52px] h-full flex flex-col p-1.5 gap-1.5"
        style={{ backgroundColor: "#0a0a0a", borderRight: "1px solid #2a2a2a" }}
      >
        <div className="flex items-center gap-1.5 px-1 mb-0.5">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: "#3b82f6" }}
          />
          <div
            className="flex-1 h-1.5 rounded-sm"
            style={{ backgroundColor: "#ffffff" }}
          />
        </div>
        <div
          className="h-5 rounded flex items-center justify-center"
          style={{
            background:
              "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
          }}
        >
          <div className="w-2.5 h-2.5 rounded-sm bg-white/80" />
        </div>
        <div className="space-y-0.5 mt-1">
          <div
            className="h-4 rounded px-1.5 flex items-center gap-1"
            style={{
              backgroundColor: "#121212",
              border: "1px solid #333333",
            }}
          >
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#ffffff" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#ffffff" }}
            />
          </div>
          <div className="h-4 rounded px-1.5 flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#666666" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#666666" }}
            />
          </div>
          <div className="h-4 rounded px-1.5 flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#666666" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#666666" }}
            />
          </div>
        </div>
      </div>
      <div
        className="flex-1 flex flex-col"
        style={{ backgroundColor: "#121212" }}
      >
        <div className="flex-1 flex">
          <div
            className="w-[55%] p-1.5 space-y-1"
            style={{ borderRight: "1px solid #2a2a2a" }}
          >
            <div
              className="h-7 rounded p-1.5 flex items-start gap-1.5"
              style={{ backgroundColor: "#142744" }}
            >
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#3b82f6" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="w-[65%] h-1 rounded-sm mb-1"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <div
                  className="w-[80%] h-1 rounded-sm"
                  style={{ backgroundColor: "#888888" }}
                />
              </div>
            </div>
            <div className="h-7 rounded p-1.5 flex items-start gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#3a3a3a" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="w-[55%] h-1 rounded-sm mb-1"
                  style={{ backgroundColor: "#e5e5e5" }}
                />
                <div
                  className="w-[70%] h-1 rounded-sm"
                  style={{ backgroundColor: "#666666" }}
                />
              </div>
            </div>
            <div className="h-7 rounded p-1.5 flex items-start gap-1.5">
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#3a3a3a" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="w-[60%] h-1 rounded-sm mb-1"
                  style={{ backgroundColor: "#e5e5e5" }}
                />
                <div
                  className="w-[75%] h-1 rounded-sm"
                  style={{ backgroundColor: "#666666" }}
                />
              </div>
            </div>
          </div>
          <div className="flex-1 p-2">
            <div
              className="w-[70%] h-1.5 rounded-sm mb-2"
              style={{ backgroundColor: "#ffffff" }}
            />
            <div className="space-y-1">
              <div
                className="w-full h-1 rounded-sm"
                style={{ backgroundColor: "#2a2a2a" }}
              />
              <div
                className="w-[90%] h-1 rounded-sm"
                style={{ backgroundColor: "#2a2a2a" }}
              />
              <div
                className="w-[75%] h-1 rounded-sm"
                style={{ backgroundColor: "#2a2a2a" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeMockupAuto() {
  return (
    <div className="w-full h-full rounded-md overflow-hidden flex">
      <div className="w-1/2 h-full" style={{ backgroundColor: "#f7f7f7" }}>
        <div className="w-full h-full flex flex-col p-1.5 gap-1">
          <div className="flex items-center gap-1 px-0.5">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#3b82f6" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#374151" }}
            />
          </div>
          <div
            className="h-4 rounded flex items-center justify-center"
            style={{
              background:
                "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
            }}
          >
            <div className="w-2 h-2 rounded-sm bg-white/80" />
          </div>
          <div className="space-y-0.5 mt-0.5">
            <div
              className="h-3 rounded px-1 flex items-center gap-0.5"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e8e8e8",
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-sm"
                style={{ backgroundColor: "#374151" }}
              />
              <div
                className="flex-1 h-0.5 rounded-sm"
                style={{ backgroundColor: "#374151" }}
              />
            </div>
            <div className="h-3 rounded px-1 flex items-center gap-0.5">
              <div
                className="w-1.5 h-1.5 rounded-sm"
                style={{ backgroundColor: "#9ca3af" }}
              />
              <div
                className="flex-1 h-0.5 rounded-sm"
                style={{ backgroundColor: "#9ca3af" }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="w-1/2 h-full" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="w-full h-full flex flex-col p-1.5 gap-1">
          <div className="flex items-center gap-1 px-0.5">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#3b82f6" }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: "#ffffff" }}
            />
          </div>
          <div
            className="h-4 rounded flex items-center justify-center"
            style={{
              background:
                "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
            }}
          >
            <div className="w-2 h-2 rounded-sm bg-white/80" />
          </div>
          <div className="space-y-0.5 mt-0.5">
            <div
              className="h-3 rounded px-1 flex items-center gap-0.5"
              style={{
                backgroundColor: "#121212",
                border: "1px solid #333333",
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-sm"
                style={{ backgroundColor: "#ffffff" }}
              />
              <div
                className="flex-1 h-0.5 rounded-sm"
                style={{ backgroundColor: "#ffffff" }}
              />
            </div>
            <div className="h-3 rounded px-1 flex items-center gap-0.5">
              <div
                className="w-1.5 h-1.5 rounded-sm"
                style={{ backgroundColor: "#666666" }}
              />
              <div
                className="flex-1 h-0.5 rounded-sm"
                style={{ backgroundColor: "#666666" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ThemeCardProps {
  mode: "light" | "dark" | "auto";
  label: string;
  is_selected: boolean;
  on_select: () => void;
  active_theme?: "light" | "dark";
}

function ThemeCard({
  mode,
  label,
  is_selected,
  on_select,
  active_theme,
}: ThemeCardProps) {
  const get_mockup = () => {
    if (mode === "light") return <ThemeMockupLight />;
    if (mode === "dark") return <ThemeMockupDark />;

    return <ThemeMockupAuto />;
  };

  const get_border_color = () => {
    if (mode === "light") return "1px solid #e5e5e5";
    if (mode === "dark") return "1px solid #1a1a1a";

    return "1px solid #3a3a3a";
  };

  return (
    <button
      className="flex-1 p-3 rounded-xl border-2 transition-all cursor-pointer"
      style={{
        borderColor: is_selected
          ? "var(--accent-color)"
          : "var(--border-secondary)",
        backgroundColor: is_selected ? "var(--bg-selected)" : "transparent",
      }}
      type="button"
      onClick={on_select}
    >
      <div
        className="w-full aspect-[4/3] rounded-lg overflow-hidden mb-3"
        style={{ border: get_border_color() }}
      >
        {get_mockup()}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </span>
          {mode === "auto" && is_selected && active_theme && (
            <span
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
              }}
            >
              {active_theme === "dark" ? (
                <MoonFilledIcon size={12} />
              ) : (
                <SunFilledIcon size={12} />
              )}
              {active_theme === "dark" ? "Dark" : "Light"}
            </span>
          )}
        </div>
        <div
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0"
          style={{
            borderColor: is_selected
              ? "var(--accent-color)"
              : "var(--border-secondary)",
            backgroundColor: is_selected
              ? "var(--accent-color)"
              : "transparent",
          }}
        >
          {is_selected && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  );
}

interface AccentColorSwatchProps {
  color: string;
  is_selected: boolean;
  on_select: () => void;
}

function AccentColorSwatch({
  color,
  is_selected,
  on_select,
}: AccentColorSwatchProps) {
  return (
    <button
      className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer hover:scale-110"
      style={{
        backgroundColor: color,
        borderColor: is_selected ? "var(--text-primary)" : "transparent",
      }}
      type="button"
      onClick={on_select}
    >
      {is_selected && <CheckIcon className="w-4 h-4 text-white" />}
    </button>
  );
}

interface RadioRowWithDescriptionProps {
  label: string;
  description: string;
  is_selected: boolean;
  on_select: () => void;
}

function RadioRowWithDescription({
  label,
  description,
  is_selected,
  on_select,
}: RadioRowWithDescriptionProps) {
  return (
    <button
      className="w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors"
      style={{
        borderColor: is_selected
          ? "var(--accent-color)"
          : "var(--border-secondary)",
        backgroundColor: is_selected ? "var(--bg-selected)" : "transparent",
      }}
      type="button"
      onClick={on_select}
    >
      <div className="text-left">
        <span
          className="text-sm font-medium block"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </span>
        <span
          className="text-xs mt-0.5 block"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </span>
      </div>
      <div
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ml-3"
        style={{
          borderColor: is_selected
            ? "var(--accent-color)"
            : "var(--border-secondary)",
          backgroundColor: is_selected ? "var(--accent-color)" : "transparent",
        }}
      >
        {is_selected && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
    </button>
  );
}

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </p>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function AppearanceSection() {
  const { theme, theme_preference, set_theme_preference } = useTheme();
  const { preferences, update_preference } = use_preferences();

  const is_dark = theme === "dark";

  const handle_theme_select = (mode: "light" | "dark" | "auto") => {
    set_theme_preference(mode);
    update_preference("theme", mode, true);
  };

  const handle_date_format_change = (value: string) => {
    update_preference("date_format", value);
  };

  const handle_time_format_change = (value: string) => {
    update_preference("time_format", value as "12h" | "24h");
  };

  const handle_accent_color_select = (
    swatch: (typeof ACCENT_COLOR_SWATCHES)[number],
  ) => {
    const accent = is_dark ? swatch.dark : swatch.light;
    const accent_hover = is_dark ? swatch.dark_hover : swatch.light_hover;

    document.documentElement.style.setProperty("--accent-color", accent);
    document.documentElement.style.setProperty(
      "--accent-color-hover",
      accent_hover,
    );

    update_preference("accent_color", accent, false);
    update_preference("accent_color_hover", accent_hover, false);
  };

  const time_format_display =
    preferences.time_format === "24h" ? "24 hours" : "12 hours";

  return (
    <div className="space-y-4">
      <div>
        <h4
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Theme
        </h4>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Change the appearance of Aster
        </p>
        <div className="flex gap-4">
          <ThemeCard
            is_selected={theme_preference === "light"}
            label="Light"
            mode="light"
            on_select={() => handle_theme_select("light")}
          />
          <ThemeCard
            is_selected={theme_preference === "dark"}
            label="Dark"
            mode="dark"
            on_select={() => handle_theme_select("dark")}
          />
          <ThemeCard
            active_theme={theme}
            is_selected={theme_preference === "auto"}
            label="Auto"
            mode="auto"
            on_select={() => handle_theme_select("auto")}
          />
        </div>
      </div>

      <div className="pt-3">
        <h4
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Accent color
        </h4>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Choose a color for highlights and interactive elements
        </p>
        <div className="flex gap-2 flex-wrap">
          {ACCENT_COLOR_SWATCHES.map((swatch) => {
            const swatch_color = is_dark ? swatch.dark : swatch.light;
            const is_selected =
              preferences.accent_color === swatch_color ||
              preferences.accent_color === swatch.light ||
              preferences.accent_color === swatch.dark;

            return (
              <AccentColorSwatch
                key={swatch.name}
                color={swatch_color}
                is_selected={is_selected}
                on_select={() => handle_accent_color_select(swatch)}
              />
            );
          })}
        </div>
      </div>

      <div className="pt-3">
        <SettingRow
          description="Choose how time is displayed"
          label="Time format"
        >
          <Select
            value={preferences.time_format}
            onValueChange={handle_time_format_change}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue>{time_format_display}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12 hours</SelectItem>
              <SelectItem value="24h">24 hours</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          description="Choose how dates are displayed"
          label="Date format"
        >
          <Select
            value={preferences.date_format}
            onValueChange={handle_date_format_change}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      <div className="pt-3">
        <h4
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Email view mode
        </h4>
        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          Choose how emails open when you click on them
        </p>
        <div className="space-y-2">
          <RadioRowWithDescription
            description="Opens in a draggable popup that can be resized"
            is_selected={preferences.email_view_mode === "popup"}
            label="Popup"
            on_select={() =>
              update_preference("email_view_mode", "popup", true)
            }
          />
          <RadioRowWithDescription
            description="Shows email list and preview side by side"
            is_selected={preferences.email_view_mode === "split"}
            label="Split view"
            on_select={() =>
              update_preference("email_view_mode", "split", true)
            }
          />
          <RadioRowWithDescription
            description="Opens email in full-width view without inbox list"
            is_selected={preferences.email_view_mode === "fullpage"}
            label="Full page"
            on_select={() =>
              update_preference("email_view_mode", "fullpage", true)
            }
          />
        </div>
      </div>
    </div>
  );
}
