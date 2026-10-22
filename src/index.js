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

// HTTP server για να κρατάει το Render ενεργό στη θύρα 10000
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
  console.error("CRITICAL: Missing DISCORD_TOKEN!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
  restTimeOffset: 0,
  failIfNotExists: false,
});

registerHandlers(client);

client.once("ready", async (readyClient) => {
  console.info(`[L2Clarity] Connected successfully as ${readyClient.user.tag}!`);
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.application.id), {
      body: commands,
    });
    console.info(`[L2Clarity] Registered commands.`);
  } catch (error) {
    console.error("[L2Clarity] Command registration error:", error);
  }
});

client.on("error", (error) => {
  console.error("[L2Clarity] Discord WebSocket error:", error);
});

console.log("[L2Clarity] Attempting final login...");

client.login(token).catch((err) => {
  console.error("[L2Clarity] Login failed with error:", err);
});
