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

// 1. HTTP Server που απαντάει στα ping του UptimeRobot
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('L2Clarity Bot is active!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[DEBUG] HTTP server listening on port ${PORT}`);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("[CRITICAL ERROR] Missing DISCORD_TOKEN environment variable!");
  process.exit(1);
}

// 2. Discord Client με αυξημένα timeouts για το δίκτυο του Render
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
  ws: {
    readTimeout: 60000,
    largeThreshold: 250,
  }
});

// Logs για παρακολούθηση σφαλμάτων δικτύου
client.on("debug", (info) => console.log(`[DISCORD DEBUG]`, info));
client.on("warn", (info) => console.warn(`[DISCORD WARN]`, info));
client.on("error", (error) => console.error("[DISCORD ERROR]", error));

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

// 3. Σύνδεση στο Discord
console.log("[DEBUG] Initializing Discord connection...");
client.login(token).catch((err) => {
  console.error("[CRITICAL ERROR] Failed to login:", err);
});
