import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { commands } from "./commands.js";
import { registerHandlers } from "./handlers.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing DISCORD_TOKEN. Add it in Replit Secrets, then restart the bot.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

registerHandlers(client);

client.once("clientReady", async (readyClient) => {
  console.info(`[L2Clarity] Connected as ${readyClient.user.tag}.`);

  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.application.id), {
      body: commands,
    });
    console.info(`[L2Clarity] Registered ${commands.length} global slash commands.`);
  } catch {
    console.error(
      "[L2Clarity] Could not register slash commands. Check the bot's Discord application and permissions.",
    );
  }
});

client.on("error", () => {
  console.error("[L2Clarity] Discord connection error.");
});

client.login(token).catch(() => {
  console.error(
    "[L2Clarity] Could not log in. Check DISCORD_TOKEN and the bot application's settings.",
  );
  process.exitCode = 1;
});