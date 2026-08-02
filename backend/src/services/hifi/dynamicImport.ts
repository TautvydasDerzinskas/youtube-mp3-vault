// TypeScript's CommonJS module target rewrites `import()` expressions into
// `require()` calls at compile time — which can't load a pure-ESM-only
// package (no "require" export condition), like music-metadata or a
// hand-ported ESM dependency would be. Building the import call via `Function`
// keeps it invisible to tsc's static rewrite, so it stays a genuine dynamic
// import at runtime. Standard workaround for this specific TS+CJS interop gap.
export const dynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<any>;
