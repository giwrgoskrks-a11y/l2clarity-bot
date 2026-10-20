import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from "discord.js";
import { getGuildSettings, updateGuildSettings } from "./settings.js";

const joinTimesByGuild = new Map();
const raidAlertedAtByGuild = new Map();
const TICKET_BRAND_COLOR = 0x4f65d9;
const RAID_WINDOW_MS = 10_000;
const RAID_JOIN_LIMIT = 5;
const RAID_TIMEOUT_MS = 10 * 60 * 1000;

const TICKET_CATEGORIES = {
  donation: {
    label: "Donation Support (Claim/Info)",
    emoji: "💳",
    description: "Donation questions, receipts, or help claiming a donation.",
    selectDescription: "Donation questions, receipts, and claims.",
    channelPrefix: "donate",
    guidance:
      "Tell us which donation platform you used and when. Never share full card details or account passwords.",
  },
  general: {
    label: "General Support",
    emoji: "🛠️",
    description: "General questions or help using the L2Clarity community.",
    selectDescription: "General questions and community help.",
    channelPrefix: "ticket",
    guidance:
      "Describe what you were trying to do, what happened, and what you expected to happen.",
  },
  bug: {
    label: "Bug Report",
    emoji: "🐛",
    description: "Report unexpected behavior or a repeatable technical issue.",
    selectDescription: "Report a bug or unexpected behavior.",
    channelPrefix: "bug",
    guidance:
      "Include the steps to reproduce the issue, what you expected, and what happened instead.",
  },
  account: {
    label: "Account Issue",
    emoji: "👤",
    description: "Help with account access, profile details, or verification.",
    selectDescription: "Account access, profile, and verification help.",
    channelPrefix: "account",
    guidance:
      "Explain which account feature is affected. Do not post passwords, recovery codes, or private tokens.",
  },
};

function safeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "member";
}

function shortText(value, limit = 1000) {
  return String(value ?? "").slice(0, limit);
}

function parseHexColor(value) {
  const hex = value?.trim().replace(/^#/, "");
  if (!hex || !/^[\da-f]{6}$/i.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

async function sendLog(guild, title, description, color = 0x5865f2) {
  const settings = getGuildSettings(guild.id);
  const logChannel = settings.logChannelId
    ? guild.channels.cache.get(settings.logChannelId)
    : null;

  if (!logChannel?.isTextBased() || !logChannel.isSendable()) {
    console.info(`[L2Clarity] ${guild.name} (${guild.id}) — ${title}: ${description}`);
    return;
  }

  await logChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(shortText(description))
        .setTimestamp(),
    ],
  });
}

function hasPermission(interaction, permission) {
  return interaction.memberPermissions?.has(permission) ?? false;
}

async function handlePing(interaction) {
  await interaction.reply({
    content: `Pong. WebSocket ping: ${interaction.client.ws.ping}ms`,
    ephemeral: true,
  });
}

async function handleInvite(interaction) {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "Run this command in a server text channel.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.appPermissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
    await interaction.reply({
      content: "I need the Create Invite permission in this channel to make an invite.",
      ephemeral: true,
    });
    return;
  }

  const invite = await interaction.channel.createInvite({
    maxAge: 0,
    maxUses: 0,
    unique: true,
    reason: `Permanent invite requested by ${interaction.user.tag}`,
  });

  await interaction.reply({
    content: `Permanent invite for **${interaction.channel.name}** (no expiration or use limit): ${invite.url}`,
    ephemeral: true,
  });
}

async function handleTicketPanel(interaction) {
  const supportRole = interaction.options.getRole("support-role");
  if (supportRole) {
    updateGuildSettings(interaction.guildId, { supportRoleId: supportRole.id });
  }

  const categoryMenu = new StringSelectMenuBuilder()
    .setCustomId("l2clarity:ticket-category")
    .setPlaceholder("Choose the kind of help you need")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      ...Object.entries(TICKET_CATEGORIES).map(([value, category]) => ({
        label: category.label,
        description: category.selectDescription,
        value,
        emoji: category.emoji,
      })),
    );

  const categoryFields = Object.values(TICKET_CATEGORIES).map((category) => ({
    name: `${category.emoji} ${category.label}`,
    value: category.description,
    inline: true,
  }));

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(TICKET_BRAND_COLOR)
        .setAuthor({ name: "L2Clarity • Member Support" })
        .setTitle("L2Clarity Support Center")
        .setDescription(
          "Choose the option that best matches your request. We’ll open a private channel so you can share the details directly with the support team.",
        )
        .addFields(
          ...categoryFields,
          {
            name: "Help us help you",
            value:
              "Include the relevant context, what you expected, and any steps that help us understand the issue.",
            inline: true,
          },
          {
            name: "Be respectful",
            value:
              "Keep the conversation courteous and allow the team time to respond.",
            inline: true,
          },
          {
            name: "Protect your information",
            value:
              "Never share passwords, recovery codes, private tokens, or full payment details.",
            inline: true,
          },
          {
            name: "Important: closing deletes the ticket",
            value:
              "Close Ticket permanently deletes the channel and its message history. Save anything you need before closing.",
            inline: false,
          },
        )
        .setFooter({ text: "L2Clarity Support • One open ticket at a time, please" })
        .setTimestamp(),
    ],
    components: [new ActionRowBuilder().addComponents(categoryMenu)],
  });

  await interaction.reply({
    content: "The support ticket panel is ready.",
    ephemeral: true,
  });
}

async function handleCreateTicket(interaction, categoryKey) {
  const category = TICKET_CATEGORIES[categoryKey];
  if (!category) {
    await interaction.reply({
      content: "Please select a valid support category from the ticket panel.",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  const existing = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      !channel.name.startsWith("closed-") &&
      channel.topic === `l2clarity-ticket:${interaction.user.id}`,
  );

  if (existing) {
    await interaction.reply({
      content: `You already have an open ticket: ${existing}`,
      ephemeral: true,
    });
    return;
  }

  const settings = getGuildSettings(guild.id);
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      content: "I need the Manage Channels permission to create private tickets.",
      ephemeral: true,
    });
    return;
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (settings.supportRoleId && guild.roles.cache.has(settings.supportRoleId)) {
    overwrites.push({
      id: settings.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const channel = await guild.channels.create({
    name: `${category.channelPrefix}-${safeName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    topic: `l2clarity-ticket:${interaction.user.id}`,
    permissionOverwrites: overwrites,
    reason: `Support ticket opened by ${interaction.user.tag}`,
  });

  const closeButton = new ButtonBuilder()
    .setCustomId("l2clarity:close-ticket")
    .setLabel("Close Ticket")
    .setStyle(ButtonStyle.Danger);

  await channel.send({
    content: `${interaction.user}`,
    embeds: [
      new EmbedBuilder()
        .setColor(TICKET_BRAND_COLOR)
        .setAuthor({ name: "L2Clarity • Member Support" })
        .setTitle(`${category.emoji} ${category.label}`)
        .setDescription(
          "Your private ticket is open. This channel is visible only to you and the support team.",
        )
        .addFields(
          {
            name: "For this request",
            value: category.guidance,
            inline: true,
          },
          {
            name: "Privacy reminder",
            value:
              "Never share passwords, recovery codes, private tokens, or full payment details.",
            inline: true,
          },
          {
            name: "Before closing",
            value:
              "Close Ticket permanently deletes this channel and all messages in it. Save anything you need first.",
            inline: false,
          },
        )
        .setFooter({ text: "L2Clarity Support" })
        .setTimestamp(),
    ],
    components: [new ActionRowBuilder().addComponents(closeButton)],
  });
  await interaction.editReply({ content: `Your private ticket is ready: ${channel}` });
  await sendLog(
    guild,
    "Ticket opened",
    `${interaction.user.tag} opened a ${category.label} ticket: ${channel}.`,
    0x57f287,
  );
}

async function handleCloseTicket(interaction) {
  const channel = interaction.channel;
  const ownerId = channel.topic?.startsWith("l2clarity-ticket:")
    ? channel.topic.slice("l2clarity-ticket:".length)
    : null;

  if (!ownerId) {
    await interaction.reply({
      content: "This button only works in a L2Clarity support ticket.",
      ephemeral: true,
    });
    return;
  }

  const isOwner = interaction.user.id === ownerId;
  const canManage = hasPermission(interaction, PermissionFlagsBits.ManageChannels);
  if (!isOwner && !canManage) {
    await interaction.reply({
      content: "Only the ticket opener or a server moderator can close this ticket.",
      ephemeral: true,
    });
    return;
  }

  const channelName = channel.name;
  await interaction.reply({
    content: `Ticket #${channelName} is being deleted.`,
    ephemeral: true,
  });
  await channel.delete(`Ticket closed by ${interaction.user.tag}`);
  await sendLog(
    interaction.guild,
    "Ticket deleted",
    `${interaction.user.tag} deleted ticket #${channelName}.`,
    0xed4245,
  );
}

async function handleDonationPanel(interaction) {
  const rawUrl = interaction.options.getString("url", true);
  let donationUrl;

  try {
    donationUrl = new URL(rawUrl);
  } catch {
    await interaction.reply({
      content: "Please provide a valid donation URL.",
      ephemeral: true,
    });
    return;
  }

  if (donationUrl.protocol !== "https:") {
    await interaction.reply({
      content: "Donation links must use HTTPS.",
      ephemeral: true,
    });
    return;
  }

  const details =
    interaction.options.getString("details") ??
    "Your support helps keep this community running.";
  const button = new ButtonBuilder()
    .setLabel("Donate")
    .setStyle(ButtonStyle.Link)
    .setURL(donationUrl.toString());

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("Support the Community")
        .setDescription(details),
    ],
    components: [new ActionRowBuilder().addComponents(button)],
  });
  await interaction.reply({
    content: "The donation information panel is ready.",
    ephemeral: true,
  });
}

async function handleRolePanel(interaction) {
  const selectedRoles = ["role-one", "role-two", "role-three"]
    .map((name) => interaction.options.getRole(name))
    .filter(Boolean);

  if (selectedRoles.length === 0) {
    await interaction.reply({
      content: "Choose at least one role for the panel.",
      ephemeral: true,
    });
    return;
  }

  const botMember = interaction.guild.members.me;
  const invalidRole = selectedRoles.find(
    (role) =>
      role.id === interaction.guild.roles.everyone.id ||
      role.managed ||
      role.permissions.has(PermissionFlagsBits.Administrator) ||
      !botMember?.roles.highest ||
      role.comparePositionTo(botMember.roles.highest) >= 0,
  );

  if (invalidRole) {
    await interaction.reply({
      content:
        "I cannot offer @everyone, managed roles, administrator roles, or roles at/above my highest role. Move my bot role higher or choose different roles.",
      ephemeral: true,
    });
    return;
  }

  const buttons = selectedRoles.map((role) =>
    new ButtonBuilder()
      .setCustomId(`l2clarity:role:${role.id}`)
      .setLabel(role.name.slice(0, 80))
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Choose Your Roles")
        .setDescription("Select a button to add or remove the matching role."),
    ],
    components: [new ActionRowBuilder().addComponents(buttons)],
  });
  await interaction.reply({
    content: "The role-selection panel is ready.",
    ephemeral: true,
  });
}

async function handleRoleButton(interaction, roleId) {
  const role = interaction.guild.roles.cache.get(roleId);
  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (
    !role ||
    role.managed ||
    role.permissions.has(PermissionFlagsBits.Administrator) ||
    role.comparePositionTo(interaction.guild.members.me.roles.highest) >= 0
  ) {
    await interaction.reply({
      content: "That role is no longer available for self-selection.",
      ephemeral: true,
    });
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Member used the L2Clarity role panel");
    await interaction.reply({ content: `Removed ${role} from you.`, ephemeral: true });
  } else {
    await member.roles.add(role, "Member used the L2Clarity role panel");
    await interaction.reply({ content: `Added ${role} to you.`, ephemeral: true });
  }
}

async function handleWelcomeConfig(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  updateGuildSettings(interaction.guildId, { welcomeChannelId: channel.id });
  await interaction.reply({
    content: `Welcome messages will be posted in ${channel}.`,
    ephemeral: true,
  });
}

async function handleSetAutoRole(interaction) {
  const role = interaction.options.getRole("role", true);
  const botMember = interaction.guild.members.me;

  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "I need the Manage Roles permission to assign a default role.",
      ephemeral: true,
    });
    return;
  }

  if (
    role.id === interaction.guild.roles.everyone.id ||
    role.managed ||
    role.permissions.has(PermissionFlagsBits.Administrator) ||
    role.comparePositionTo(botMember.roles.highest) >= 0
  ) {
    await interaction.reply({
      content:
        "Choose a non-managed, non-administrator role positioned below my highest role.",
      ephemeral: true,
    });
    return;
  }

  updateGuildSettings(interaction.guildId, { autoRoleId: role.id });
  await interaction.reply({
    content: `New members will be assigned the ${role.name} role when they join.`,
    ephemeral: true,
  });
  await sendLog(
    interaction.guild,
    "Default role updated",
    `${interaction.user.tag} set ${role.name} as the automatic role for new members.`,
  );
}

async function handleLogConfig(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  updateGuildSettings(interaction.guildId, { logChannelId: channel.id });
  await interaction.reply({
    content: `Bot and moderation logs will be posted in ${channel}.`,
    ephemeral: true,
  });
}

async function handleAnnounce(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description", true);
  const colorInput = interaction.options.getString("color");
  const pingType = interaction.options.getString("ping") ?? "none";
  const color = colorInput ? parseHexColor(colorInput) : TICKET_BRAND_COLOR;

  if (color === null) {
    await interaction.reply({
      content: "Color must be a six-digit HEX value such as #4F65D9.",
      ephemeral: true,
    });
    return;
  }

  if (!channel.isTextBased() || !channel.isSendable()) {
    await interaction.reply({
      content: "Choose a text or announcement channel where I can post.",
      ephemeral: true,
    });
    return;
  }

  if (
    pingType !== "none" &&
    !interaction.guild.members.me
      ?.permissionsIn(channel)
      .has(PermissionFlagsBits.MentionEveryone)
  ) {
    await interaction.reply({
      content: "I need the Mention Everyone permission in that channel to use this ping.",
      ephemeral: true,
    });
    return;
  }

  const pingContent =
    pingType === "everyone"
      ? "@everyone"
      : pingType === "here"
        ? "@here"
        : undefined;
  const announcement = {
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: "L2Clarity Announcement" })
        .setTimestamp(),
    ],
    allowedMentions: {
      parse: pingType === "none" ? [] : ["everyone"],
    },
  };

  if (pingContent) announcement.content = pingContent;

  await channel.send(announcement);
  await interaction.reply({
    content: `Announcement posted in ${channel}.`,
    ephemeral: true,
  });
  await sendLog(
    interaction.guild,
    "Announcement posted",
    `${interaction.user.tag} posted “${title}” in ${channel}.`,
  );
}

async function handleAntiRaidConfig(interaction) {
  const current = getGuildSettings(interaction.guildId).antiRaid ?? {
    enabled: true,
    autoTimeout: false,
  };
  const enabled = interaction.options.getBoolean("enabled", true);
  const autoTimeout = interaction.options.getBoolean("auto-timeout") ?? current.autoTimeout;

  updateGuildSettings(interaction.guildId, {
    antiRaid: { enabled, autoTimeout },
  });

  await interaction.reply({
    content: enabled
      ? `Anti-raid alerts are on (five joins in ten seconds). Automatic 10-minute timeouts are ${autoTimeout ? "on" : "off"}.`
      : "Anti-raid join monitoring is off.",
    ephemeral: true,
  });
}

async function handleKick(interaction) {
  const user = interaction.options.getUser("member", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await interaction.reply({ content: "That member is not in this server.", ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({
      content: "I cannot kick that member. Check my Kick Members permission and role position.",
      ephemeral: true,
    });
    return;
  }

  await member.kick(reason);
  await interaction.reply({ content: `Kicked ${user.tag}.`, ephemeral: true });
  await sendLog(
    interaction.guild,
    "Member kicked",
    `${user.tag} was kicked by ${interaction.user.tag}.\nReason: ${reason}`,
    0xed4245,
  );
}

async function handleBan(interaction) {
  const user = interaction.options.getUser("member", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";

  await interaction.guild.members.ban(user, { reason });
  await interaction.reply({ content: `Banned ${user.tag}.`, ephemeral: true });
  await sendLog(
    interaction.guild,
    "Member banned",
    `${user.tag} was banned by ${interaction.user.tag}.\nReason: ${reason}`,
    0xed4245,
  );
}

async function handleTimeout(interaction) {
  const user = interaction.options.getUser("member", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await interaction.reply({ content: "That member is not in this server.", ephemeral: true });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({
      content:
        "I cannot timeout that member. Check my Moderate Members permission and role position.",
      ephemeral: true,
    });
    return;
  }

  await member.timeout(minutes * 60 * 1000, reason);
  await interaction.reply({ content: `Timed out ${user.tag} for ${minutes} minutes.`, ephemeral: true });
  await sendLog(
    interaction.guild,
    "Member timed out",
    `${user.tag} was timed out by ${interaction.user.tag} for ${minutes} minutes.\nReason: ${reason}`,
    0xed4245,
  );
}

async function handleClear(interaction) {
  const amount = interaction.options.getInteger("amount", true);
  const messages = await interaction.channel.bulkDelete(amount, true);
  await interaction.reply({
    content: `Deleted ${messages.size} recent message${messages.size === 1 ? "" : "s"}.`,
    ephemeral: true,
  });
  await sendLog(
    interaction.guild,
    "Messages cleared",
    `${interaction.user.tag} deleted ${messages.size} messages in ${interaction.channel}.`,
    0xed4245,
  );
}

async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case "ping":
      return handlePing(interaction);
    case "invite":
      return handleInvite(interaction);
    case "ticket-panel":
      return handleTicketPanel(interaction);
    case "donation-panel":
      return handleDonationPanel(interaction);
    case "role-panel":
      return handleRolePanel(interaction);
    case "set-welcome":
      return handleWelcomeConfig(interaction);
    case "set-autorole":
      return handleSetAutoRole(interaction);
    case "set-log-channel":
      return handleLogConfig(interaction);
    case "announce":
      return handleAnnounce(interaction);
    case "anti-raid":
      return handleAntiRaidConfig(interaction);
    case "kick":
      return handleKick(interaction);
    case "ban":
      return handleBan(interaction);
    case "timeout":
      return handleTimeout(interaction);
    case "clear":
      return handleClear(interaction);
    default:
      return interaction.reply({
        content: "I do not recognize that command.",
        ephemeral: true,
      });
  }
}

async function handleButton(interaction) {
  const [namespace, action, value] = interaction.customId.split(":");
  if (namespace !== "l2clarity") return;

  if (action === "create-ticket") {
    return handleCreateTicket(interaction, "general");
  }
  if (action === "close-ticket") return handleCloseTicket(interaction);
  if (action === "role") return handleRoleButton(interaction, value);
}

async function handleSelectMenu(interaction) {
  if (interaction.customId !== "l2clarity:ticket-category") return;
  return handleCreateTicket(interaction, interaction.values[0]);
}

async function assignDefaultRole(member, roleId) {
  const guild = member.guild;
  const role = guild.roles.cache.get(roleId);
  const botMember = guild.members.me;

  if (
    !role ||
    role.id === guild.roles.everyone.id ||
    role.managed ||
    role.permissions.has(PermissionFlagsBits.Administrator) ||
    !botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.comparePositionTo(botMember.roles.highest) >= 0
  ) {
    await sendLog(
      guild,
      "Auto-role could not be assigned",
      `The configured default role is missing or not manageable for ${member.user.tag}. Check the role and the bot's Manage Roles permission and hierarchy.`,
      0xed4245,
    );
    return;
  }

  if (member.roles.cache.has(role.id)) return;

  try {
    await member.roles.add(role, "L2Clarity automatic role on member join");
    await sendLog(
      guild,
      "Default role assigned",
      `Assigned ${role.name} to ${member.user.tag} on join.`,
      0x57f287,
    );
  } catch {
    await sendLog(
      guild,
      "Auto-role could not be assigned",
      `Discord rejected the assignment of ${role.name} to ${member.user.tag}. Check the bot's permissions and role hierarchy.`,
      0xed4245,
    );
  }
}

async function handleMemberJoin(member) {
  const settings = getGuildSettings(member.guild.id);
  if (settings.autoRoleId) {
    await assignDefaultRole(member, settings.autoRoleId);
  }

  const welcomeChannel = settings.welcomeChannelId
    ? member.guild.channels.cache.get(settings.welcomeChannelId)
    : null;

  if (welcomeChannel?.isTextBased() && welcomeChannel.isSendable()) {
    await welcomeChannel.send(`Welcome ${member} to **${member.guild.name}**!`);
  }

  if (settings.antiRaid?.enabled === false) return;

  const now = Date.now();
  const recentJoins = (joinTimesByGuild.get(member.guild.id) ?? []).filter(
    (timestamp) => now - timestamp < RAID_WINDOW_MS,
  );
  recentJoins.push(now);
  joinTimesByGuild.set(member.guild.id, recentJoins);

  if (recentJoins.length < RAID_JOIN_LIMIT) return;

  let timeoutNote = "Automatic timeouts are off.";
  if (
    settings.antiRaid?.autoTimeout &&
    member.moderatable &&
    member.guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)
  ) {
    try {
      await member.timeout(RAID_TIMEOUT_MS, "L2Clarity anti-raid: rapid join burst");
      timeoutNote = `Applied a 10-minute timeout to ${member.user.tag}.`;
    } catch {
      timeoutNote = `Could not timeout ${member.user.tag}; check the bot's role and Moderate Members permission.`; **…**

_This response is too long to display in full._