import { Sun, Moon, Monitor } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";

const themes = ["light", "dark", "system"] as const;

const useTheme = () => {
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "system">(
    localStorage.theme || "system",
  );
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      return;
    }
    if (currentTheme === "system") {
      localStorage.removeItem("theme");
    } else {
      localStorage.theme = currentTheme;
    }
    if (
      currentTheme === "dark" ||
      (currentTheme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  }, [currentTheme]);

  return [currentTheme, setCurrentTheme] as const;
};

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          {currentTheme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : currentTheme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((theme) => (
          <DropdownMenuItem
            key={theme}
            onClick={() => setCurrentTheme(theme)}
          >
            {theme === "light" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : theme === "dark" ? (
              <Moon className="mr-2 h-4 w-4" />
            ) : (
              <Monitor className="mr-2 h-4 w-4" />
            )}
            {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSwitcherHome() {
  const [, setCurrentTheme] = useTheme();
  return (
    <div className="flex gap-3">
      {themes.map((theme) => (
        <button key={theme} name="theme" onClick={() => setCurrentTheme(theme)}>
          {theme === "light" ? (
            <Sun className="h-4 w-4 text-primary/80 hover:text-primary" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4 text-primary/80 hover:text-primary" />
          ) : (
            <Monitor className="h-4 w-4 text-primary/80 hover:text-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
