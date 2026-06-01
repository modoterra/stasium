import { generateUpdateMetadata, parseChecksums } from "../src/update-release-metadata";

const [version, baseUrl, checksumsPath, outputPath] = process.argv.slice(2);

if (!version || !baseUrl || !checksumsPath || !outputPath) {
  throw new Error(
    "Usage: bun scripts/generate-update-metadata.ts <version> <base-url> <checksums-path> <output-path>",
  );
}

const checksums = parseChecksums(await Bun.file(checksumsPath).text());
const metadata = generateUpdateMetadata({ version, baseUrl, checksums });
await Bun.write(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
