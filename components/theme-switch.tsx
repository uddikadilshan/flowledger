"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./vip-ui/button";
import { themeStorageKey } from "@/lib/theme";

export function ThemeSwitch() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      const preference = document.documentElement.dataset.theme;
      setDark(preference ? preference === "dark" : system.matches);
    }
    sync();
    system.addEventListener("change", sync);
    return () => system.removeEventListener("change", sync);
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(next === "dark");
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // The current page still honors the preference when storage is unavailable.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      iconOnly
      size="lg"
      onPress={toggle}
      aria-label="Dark mode"
      aria-pressed={dark}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
