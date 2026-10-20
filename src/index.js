import http from 'http';
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { commands } from "./commands.js";
import { registerHandlers } from "./handlers.js";

// HTTP server για το Render Web Service
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('L2Clarity Bot is running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing DISCORD_TOKEN. Add it in Render Environment variables.");
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

client.once("ready", async (readyClient) => {
  console.info(`[L2Clarity] Connected as ${readyClient.user.tag}.`);

  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.application.id), {
      body: commands,
    });
    console.info(`[L2Clarity] Registered ${commands.length} global slash commands.`);
  } catch (error) {
    console.error(
      "[L2Clarity] Could not register slash commands. Check permissions.",
      error
    );
  }
});

client.on("error", (error) => {
  console.error("[L2Clarity] Discord connection error:", error);
});

client.login(token).catch((error) => {
  console.error(
    "[L2Clarity] Could not log in. Check DISCORD_TOKEN.",
    error
  );
  process.exitCode = 1;
});
