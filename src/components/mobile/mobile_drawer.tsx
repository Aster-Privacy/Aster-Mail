import { useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  motion,
  AnimatePresence,
  useDragControls,
  type PanInfo,
} from "framer-motion";
import {
  InboxIcon,
  StarIcon,
  PaperAirplaneIcon,
  DocumentIcon,
  ClockIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ExclamationCircleIcon,
  FolderIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_platform } from "@/hooks/use_platform";
import { haptic_impact } from "@/native/haptic_feedback";

interface MobileDrawerProps {
  is_open: boolean;
  on_close: () => void;
  folders?: Array<{ id: string; name: string; token: string; color?: string }>;
  mail_stats?: {
    inbox_count?: number;
    drafts_count?: number;
    spam_count?: number;
  };
  user?: {
    email?: string;
    name?: string;
  };
  on_settings_click?: () => void;
  on_compose_click?: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badge?: number;
}

const SWIPE_CLOSE_THRESHOLD = 100;
const DRAWER_WIDTH = 280;

export function MobileDrawer({
  is_open,
  on_close,
  folders = [],
  mail_stats,
  user,
  on_settings_click,
  on_compose_click,
}: MobileDrawerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { safe_area_insets } = use_platform();
  const drag_controls = useDragControls();
  const drawer_ref = useRef<HTMLDivElement>(null);

  const nav_items: NavItem[] = [
    {
      path: "/",
      label: "Inbox",
      icon: InboxIcon,
      badge: mail_stats?.inbox_count,
    },
    { path: "/starred", label: "Starred", icon: StarIcon },
    { path: "/sent", label: "Sent", icon: PaperAirplaneIcon },
    {
      path: "/drafts",
      label: "Drafts",
      icon: DocumentIcon,
      badge: mail_stats?.drafts_count,
    },
    { path: "/scheduled", label: "Scheduled", icon: ClockIcon },
    { path: "/snoozed", label: "Snoozed", icon: ClockIcon },
    { path: "/archive", label: "Archive", icon: ArchiveBoxIcon },
    {
      path: "/spam",
      label: "Spam",
      icon: ExclamationCircleIcon,
      badge: mail_stats?.spam_count,
    },
    { path: "/trash", label: "Trash", icon: TrashIcon },
  ];

  const handle_nav_click = useCallback(
    (path: string) => {
      haptic_impact("light");
      navigate(path);
      on_close();
    },
    [navigate, on_close],
  );

  const handle_drag_end = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -SWIPE_CLOSE_THRESHOLD || info.velocity.x < -500) {
        on_close();
      }
    },
    [on_close],
  );

  const handle_backdrop_click = useCallback(() => {
    on_close();
  }, [on_close]);

  useEffect(() => {
    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && is_open) {
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  useEffect(() => {
    if (is_open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [is_open]);

  const is_active = (path: string) => {
    if (path === "/") {
      return location.pathname === "/" || location.pathname === "/all";
    }

    return location.pathname === path;
  };

  return (
    <AnimatePresence>
      {is_open && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handle_backdrop_click}
          />

          <motion.div
            ref={drawer_ref}
            animate={{ x: 0 }}
            className={cn(
              "fixed left-0 top-0 z-50 h-full bg-background shadow-xl",
              "flex flex-col",
            )}
            drag="x"
            dragConstraints={{ left: -DRAWER_WIDTH, right: 0 }}
            dragControls={drag_controls}
            dragElastic={0.1}
            exit={{ x: -DRAWER_WIDTH }}
            initial={{ x: -DRAWER_WIDTH }}
            style={{
              width: DRAWER_WIDTH,
              paddingTop: safe_area_insets.top,
              paddingBottom: safe_area_insets.bottom,
            }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onDragEnd={handle_drag_end}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <UserCircleIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">
                  {user?.name || "User"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email || ""}
                </p>
              </div>
            </div>

            {on_compose_click && (
              <div className="border-b border-border p-3">
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-full",
                    "bg-primary px-4 py-3 text-primary-foreground",
                    "shadow-md transition-transform active:scale-95",
                  )}
                  onClick={() => {
                    haptic_impact("medium");
                    on_compose_click();
                    on_close();
                  }}
                >
                  <PlusIcon className="h-5 w-5" />
                  <span className="font-medium">Compose</span>
                </button>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto py-2">
              <div className="space-y-0.5 px-2">
                {nav_items.map((item) => (
                  <button
                    key={item.path}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
                      "text-sm transition-colors",
                      is_active(item.path)
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted",
                    )}
                    onClick={() => handle_nav_click(item.path)}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          is_active(item.path)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {folders.length > 0 && (
                <>
                  <div className="my-2 border-t border-border" />
                  <div className="px-4 py-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Folders
                    </p>
                  </div>
                  <div className="space-y-0.5 px-2">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
                          "text-sm transition-colors",
                          location.pathname === `/folder/${folder.token}`
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted",
                        )}
                        onClick={() =>
                          handle_nav_click(`/folder/${folder.token}`)
                        }
                      >
                        <FolderIcon
                          className="h-5 w-5 flex-shrink-0"
                          style={{ color: folder.color }}
                        />
                        <span className="flex-1 truncate text-left">
                          {folder.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </nav>

            {on_settings_click && (
              <div className="border-t border-border p-2">
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
                    "text-sm text-foreground transition-colors hover:bg-muted",
                  )}
                  onClick={() => {
                    haptic_impact("light");
                    on_settings_click();
                    on_close();
                  }}
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                  <span>Settings</span>
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
