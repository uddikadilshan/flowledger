export const themeStorageKey = "flowledger-theme";

export const themeBootstrap = `try {
  const theme = localStorage.getItem(${JSON.stringify(themeStorageKey)});
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {}`;
