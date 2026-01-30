import { Skeleton } from "@/components/ui/skeleton";

interface AppItem {
  id: string;
  name: string;
  icon_src?: string;
  href?: string;
  disabled?: boolean;
  on_click?: () => void;
}

interface AppGridProps {
  apps: AppItem[];
  on_app_click?: (app: AppItem) => void;
}

export function AppGrid({ apps, on_app_click }: AppGridProps) {
  const handle_click = (app: AppItem) => {
    if (app.disabled) return;
    if (app.on_click) {
      app.on_click();
    } else if (on_app_click) {
      on_app_click(app);
    }
  };

  return (
    <div className="grid grid-cols-3">
      {apps.map((app) => {
        const content = (
          <>
            <div className="w-11 h-11 rounded-lg overflow-hidden flex items-center justify-center p-0.5">
              {app.icon_src ? (
                <img
                  alt={app.name}
                  className="w-full h-full object-contain select-none"
                  decoding="async"
                  draggable={false}
                  loading="lazy"
                  src={app.icon_src}
                />
              ) : (
                <Skeleton className="w-full h-full rounded-lg" />
              )}
            </div>
            <span
              className="text-[10px] font-medium"
              style={{
                color: app.disabled
                  ? "var(--text-muted)"
                  : "var(--text-primary)",
              }}
            >
              {app.name}
            </span>
          </>
        );

        const class_name = `flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
          app.disabled
            ? "opacity-40 cursor-default"
            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95 cursor-pointer"
        }`;

        if (app.href && !app.disabled) {
          return (
            <a
              key={app.id}
              className={class_name}
              href={app.href}
              onClick={() => handle_click(app)}
            >
              {content}
            </a>
          );
        }

        return (
          <button
            key={app.id}
            className={class_name}
            disabled={app.disabled}
            type="button"
            onClick={() => handle_click(app)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export const DEFAULT_APPS: AppItem[] = [
  {
    id: "mail",
    name: "Mail",
    icon_src: "/mail_logo.webp",
    href:
      import.meta.env.VITE_MAIL_URL ||
      (import.meta.env.DEV
        ? "http://mail.localhost:5173"
        : "https://mail.astermail.org"),
  },
  {
    id: "portal",
    name: "Portal",
    icon_src: "/aster.webp",
    href:
      import.meta.env.VITE_PORTAL_URL ||
      (import.meta.env.DEV
        ? "http://portal.localhost:5174"
        : "https://portal.astermail.org"),
  },
  {
    id: "pages",
    name: "Pages",
    disabled: true,
  },
  {
    id: "calendar",
    name: "Calendar",
    disabled: true,
  },
  {
    id: "contacts",
    name: "Contacts",
    disabled: true,
  },
  {
    id: "drive",
    name: "Drive",
    disabled: true,
  },
];

export type { AppItem };
