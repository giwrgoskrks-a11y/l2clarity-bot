import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const settingsPath = fileURLToPath(
  new URL("../data/guild-settings.json", import.meta.url),
);

if (!existsSync(settingsPath)) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, "{}\n", "utf8");
}

let guildSettings;

try {
  guildSettings = JSON.parse(readFileSync(settingsPath, "utf8"));
} catch {
  throw new Error(
    "Could not read data/guild-settings.json. Fix or remove the invalid JSON file and restart the bot.",
  );
}

export function getGuildSettings(guildId) {
  return guildSettings[guildId] ?? {};
}

export function updateGuildSettings(guildId, changes) {
  guildSettings[guildId] = {
    ...getGuildSettings(guildId),
    ...changes,
  };
  writeFileSync(settingsPath, `${JSON.stringify(guildSettings, null, 2)}\n`, "utf8");
  return guildSettings[guildId];
}