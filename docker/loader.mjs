// docker/loader.mjs
// This loader ensures that user-uploaded scripts can import modules
// from /app/node_modules even if they run from /data/scripts.

import { pathToFileURL } from "url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Rewrite module path to global node_modules in /app
    if (!specifier.startsWith(".") && !specifier.startsWith("file:")) {
      return nextResolve(`/app/node_modules/${specifier}`, context);
    }
    throw err;
  }
}