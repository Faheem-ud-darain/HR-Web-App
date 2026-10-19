// DuoIcons is wired up via the CSS-only path instead (see
// `@import "@duo-icons/tailwind/base"` and `@import "@duo-icons/tailwind/icons"`
// in src/app/globals.css) — that's the "recommended" install method per the
// official docs and it does not need this file at all.
//
// This file intentionally does NOT register the package's JS plugin
// (`@duo-icons/tailwind`'s default export). Inspecting the installed
// v1.0.2 source (node_modules/@duo-icons/tailwind/dist/plugin.js) shows two
// real problems with that path:
//
//   1. The default export is already a plugin object (`{ handler, config }`),
//      not a factory function — calling it as `duoicons()` throws
//      "(0, _tailwind.default) is not a function" during the Tailwind v4
//      PostCSS build. That crash is what this file previously caused.
//   2. Even called correctly (`plugins: [duoicons]`, no parens), the plugin's
//      handler reads icon SVGs from a hardcoded relative path (`./icons`)
//      resolved against the process's CWD rather than the package directory
//      — it silently no-ops in a Next.js project layout like this one, since
//      that folder doesn't exist there. So the plugin currently can't add any
//      utilities in this project even when it doesn't crash.
//
// The static CSS import (`icons.css`) already ships every `.duo-icons-*`
// class pre-built, so nothing here is lost by skipping the plugin.
//
// If a future version of the package fixes the path-resolution bug and you
// want on-demand/tree-shaken icon generation instead of importing all icons
// statically, the correct registration (once fixed upstream) would be:
//
//   import duoicons from '@duo-icons/tailwind';
//   export default { plugins: [duoicons] }; // no parentheses — see note 1 above
//
// and you'd also add `@config "./tailwind.config.js";` back to globals.css.

/** @type {import('tailwindcss').Config} */
const tailwindConfig = {
  plugins: [],
};

export default tailwindConfig;
