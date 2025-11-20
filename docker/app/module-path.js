import path from "path";
import { fileURLToPath } from "url";
import module from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point NODE_PATH to root app node_modules
process.env.NODE_PATH = path.join(__dirname, "../node_modules");
module.Module._initPaths();