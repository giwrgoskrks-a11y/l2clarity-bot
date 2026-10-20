const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("CRITICAL: Missing DISCORD_TOKEN in environment variables!");
  process.exit(1);
} else {
  console.log("DISCORD_TOKEN is present, attempting to login to Discord...");
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

client.login(token).catch((error) => {
  console.error("[L2Clarity] Could not log in. Detailed error:", error);
  process.exitCode = 1;
});
