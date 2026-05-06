import { useEffect } from "react";

export function useRootDarkMode(isDarkMode: boolean) {
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);
}
