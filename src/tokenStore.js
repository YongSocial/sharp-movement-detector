import fs from "node:fs";

const TOKEN_PATH = new URL("../data/credentials.json", import.meta.url);

export function saveCredentials({ jwt, apiToken, network }) {
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify({ jwt, apiToken, network, savedAt: new Date().toISOString() }, null, 2)
  );
}

export function loadCredentials() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      "No credentials found. Run `npm run activate` first to subscribe and activate API access."
    );
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
}
