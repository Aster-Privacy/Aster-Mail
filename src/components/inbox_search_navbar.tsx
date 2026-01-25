import { SearchIcon } from "@/components/icons";

interface InboxSearchNavbarProps {
  search_query: string;
  on_search_change: (query: string) => void;
}

export default function InboxSearchNavbar({
  search_query,
  on_search_change,
}: InboxSearchNavbarProps) {
  return (
    <div
      className="w-full px-6 py-4 border-b sticky top-0 z-10"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <div className="flex items-center max-w-lg mx-auto">
        <div className="relative flex-1">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          >
            <SearchIcon className="w-5 h-5" />
          </span>
          <input
            className="w-full pl-10 pr-16 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            placeholder="Search"
            style={{
              backgroundColor: "var(--input-bg)",
              borderColor: "var(--input-border)",
              color: "var(--text-primary)",
            }}
            type="text"
            value={search_query}
            onChange={(e) => on_search_change(e.target.value)}
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded font-mono select-none border"
            style={{
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            ⌘K
          </span>
        </div>
      </div>
    </div>
  );
}
