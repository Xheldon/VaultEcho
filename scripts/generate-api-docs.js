import fs from "node:fs/promises";
import path from "node:path";
import { renderApiDocs } from "../src/api-spec.js";

const outputPath = path.resolve("docs/api.md");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, renderApiDocs(), "utf8");
console.log(`Wrote ${outputPath}`);
