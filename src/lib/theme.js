export const THEME_STORAGE_KEY = "ui_theme";
export const THEME_CHANGE_EVENT = "quiz-app-theme-change";

export const THEMES = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

function normalizeTheme(value) {
  return value === THEMES.LIGHT ? THEMES.LIGHT : THEMES.DARK;
}

function applyTheme(theme) {
  if (typeof document === "undefined") {
    return;
  }

  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
}

export function getStoredTheme() {
  if (typeof window === "undefined") {
    return THEMES.DARK;
  }

  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch (_error) {
    return THEMES.DARK;
  }
}

export function setThemePreference(theme) {
  const nextTheme = normalizeTheme(theme);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (_error) {
      // Ignore localStorage write failures.
    }
  }

  applyTheme(nextTheme);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { theme: nextTheme },
      })
    );
  }

  return nextTheme;
}

export function initializeTheme() {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
