import { ProfileDropdown } from "@/components/profile_dropdown";

interface EmailProfileTriggerProps {
  email: string;
  name?: string;
  children: React.ReactNode;
  on_compose?: (email: string) => void;
  className?: string;
}

export function EmailProfileTrigger({
  email,
  name,
  children,
  on_compose,
  className = "",
}: EmailProfileTriggerProps) {
  return (
    <ProfileDropdown email={email} name={name} on_compose={on_compose}>
      <button
        className={`cursor-pointer transition-colors ${className}`}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </button>
    </ProfileDropdown>
  );
}
