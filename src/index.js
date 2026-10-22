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

// HTTP server για να κρατάει το Render ενεργό (UptimeRobot)
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
  console.error("CRITICAL: Missing DISCORD_TOKEN in environment variables!");
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
  // Ρύθμιση για αποφυγή κολλήματος στο WebSocket handshake
  ws: {
    large_threshold: 250,
  }
});

registerHandlers(client);

client.once("ready", async (readyClient) => {
  console.info(`[L2Clarity] Connected successfully as ${readyClient.user.tag}!`);

  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.application.id), {
      body: commands,
    });
    console.info(`[L2Clarity] Registered ${commands.length} global slash commands.`);
  } catch (error) {
    console.error("[L2Clarity] Could not register slash commands:", error);
  }
});

client.on("error", (error) => {
  console.error("[L2Clarity] Discord connection error:", error);
});

console.log("[L2Clarity] Starting login sequence with network options...");

client.login(token)
  .then(() => {
    console.log("[L2Clarity] login() resolved successfully!");
  })
  .catch((error) => {
    console.error("[L2Clarity] FATAL LOGIN ERROR:", error);
  });
