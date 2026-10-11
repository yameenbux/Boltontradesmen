// Light/dark choice: stored in localStorage (never a cookie, so public pages stay cookie-free).
export const THEME_STORAGE_KEY = "bv-theme";

export type Theme = "light" | "dark";

export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}

// Runs in <head> before first paint. Kept tiny and static (no interpolated input besides the constant key).
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
