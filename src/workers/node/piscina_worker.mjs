import fs from "fs";
import { pathToFileURL } from "url";

export async function runUserModule({ scriptPath, row, resultFile, logFile }) {
  const mod = await import(pathToFileURL(scriptPath).href + `?t=${Date.now()}`);
  const fn = mod.default || mod.run;
  if (typeof fn !== "function") throw new Error("Module has no default/run function");

  const res = await fn(row);

  if (resultFile)
    fs.writeFileSync(resultFile, JSON.stringify(res));

  return { code:0, out: JSON.stringify(res), err:"" };
}