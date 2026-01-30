import { Button } from "@/components/ui/button";
import { ThreeDotsHorizontal } from "@/components/common/icons";

export const Navbar = () => {
  return (
    <nav className="w-full sticky top-0 z-40 flex items-center justify-between px-6 h-16 bg-background border-b border-border">
      <div className="flex items-center">
        <Button>Button</Button>
      </div>
      <div className="flex items-center">
        <Button size="icon" variant="ghost">
          <ThreeDotsHorizontal size={20} />
        </Button>
      </div>
    </nav>
  );
};
