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
  console.log(`[DEBUG] HTTP server listening on port ${PORT}`);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("[CRITICAL ERROR] Missing DISCORD_TOKEN environment variable!");
  process.exit(1);
} else {
  console.log("[DEBUG] DISCORD_TOKEN is present (Length:", token.length, ")");
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

client.on("debug", (info) => {
  console.log(`[DISCORD DEBUG]`, info);
});

client.on("warn", (info) => {
  console.warn(`[DISCORD WARN]`, info);
});

client.on("error", (error) => {
  console.error("[DISCORD ERROR] WebSocket error:", error);
});

registerHandlers(client);

client.once("ready", async (readyClient) => {
  console.info(`[SUCCESS] Connected successfully as ${readyClient.user.tag}!`);
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.application.id), {
      body: commands,
    });
    console.info(`[SUCCESS] Registered application commands.`);
  } catch (error) {
    console.error("[ERROR] Command registration failed:", error);
  }
});

console.log("[DEBUG] Attempting client.login()...");

client.login(token).then(() => {
  console.log("[SUCCESS] client.login() resolved successfully!");
}).catch((err) => {
  console.error("[CRITICAL ERROR] Failed to login to Discord:", err);
});
