const THEME_MODE_KEY = "hubsays-theme-mode";

function storedThemeMode() {
  const mode = localStorage.getItem(THEME_MODE_KEY);
  return ["system", "dark", "light"].includes(mode || "") ? mode : "system";
}

function resolvedColorScheme(mode) {
  if (mode === "dark") {
    return "dark";
  }
  if (mode === "light") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeMode(mode = storedThemeMode()) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = resolvedColorScheme(mode);
  const control = document.getElementById("theme-mode");
  if (control) {
    control.value = mode;
  }
}

function bindThemeControl() {
  const control = document.getElementById("theme-mode");
  if (!control) {
    return;
  }
  control.value = storedThemeMode();
  control.addEventListener("change", (event) => {
    const mode = String(event.target.value || "system");
    localStorage.setItem(THEME_MODE_KEY, mode);
    applyThemeMode(mode);
  });
}

const media = window.matchMedia("(prefers-color-scheme: dark)");
media.addEventListener("change", () => {
  if (storedThemeMode() === "system") {
    applyThemeMode("system");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  applyThemeMode();
  bindThemeControl();
});

applyThemeMode();
