// Every internal link goes through here, because the site is served under /strataglyph on GitHub Pages.
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export const url = (path = "") => `${base}/${path.replace(/^\//, "")}`;

export const repo = "https://github.com/ATLURI0001/strataglyph";
export const blob = (path: string) => `${repo}/blob/main/${path}`;
export const npm = "https://www.npmjs.com/package/@atluri0001/strataglyph";
