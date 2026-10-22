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
    console.info(`[L2Clarity] ${guild.name} (${guild.id}) — ${title}:${description}`);
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
  await interaction.editReply({
    content: `Pong. WebSocket ping: ${interaction.client.ws.ping}ms`,
  });
}

async function handleInvite(interaction) {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.editReply({
      content: "Run this command in a server text channel.",
    });
    return;
  }

  if (!interaction.appPermissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
    await interaction.editReply({
      content: "I need the Create Invite permission in this channel to make an invite.",
    });
    return;
  }

  const invite = await interaction.channel.createInvite({
    maxAge: 0,
    maxUses: 0,
    unique: true,
    reason: `Permanent invite requested by ${interaction.user.tag}`,
  });

  await interaction.editReply({
    content: `Permanent invite for **${interaction.channel.name}** (no expiration or use limit):${invite.url}`,
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
    name: `${category.emoji}${category.label}`,
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

  await interaction.editReply({
    content: "The support ticket panel is ready.",
  });
}

async function handleCreateTicket(interaction, categoryKey) {
  const category = TICKET_CATEGORIES[categoryKey];
  if (!category) {
    await interaction.editReply({
      content: "Please select a valid support category from the ticket panel.",
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
    await interaction.editReply({
      content: `You already have an open ticket: ${existing}`,
    });
    return;
  }

  const settings = getGuildSettings(guild.id);
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply({
      content: "I need the Manage Channels permission to create private tickets.",
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
        .setTitle(`${category.emoji}${category.label}`)
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
    `${interaction.user.tag} opened a ${category.label} ticket:${channel}.`,
    0x57f287,
  );
}

async function handleCloseTicket(interaction) {
  const channel = interaction.channel;
  const ownerId = channel.topic?.startsWith("l2clarity-ticket:")
    ? channel.topic.slice("l2clarity-ticket:".length)
    : null;

  if (!ownerId) {
    await interaction.editReply({
      content: "This button only works in a L2Clarity support ticket.",
    });
    return;
  }

  const isOwner = interaction.user.id === ownerId;
  const canManage = hasPermission(interaction, PermissionFlagsBits.ManageChannels);
  if (!isOwner && !canManage) {
    await interaction.editReply({
      content: "Only the ticket opener or a server moderator can close this ticket.",
    });
    return;
  }

  const channelName = channel.name;
  await interaction.editReply({
    content: `Ticket #${channelName} is being deleted.`,
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
    await interaction.editReply({
      content: "Please provide a valid donation URL.",
    });
    return;
  }

  if (donationUrl.protocol !== "https:") {
    await interaction.editReply({
      content: "Donation links must use HTTPS.",
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
  await interaction.editReply({
    content: "The donation information panel is ready.",
  });
}

async function handleRolePanel(interaction) {
  const selectedRoles = ["role-one", "role-two", "role-three"]
    .map((name) => interaction.options.getRole(name))
    .filter(Boolean);

  if (selectedRoles.length === 0) {
    await interaction.editReply({
      content: "Choose at least one role for the panel.",
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
    await interaction.editReply({
      content:
        "I cannot offer @everyone, managed roles, administrator roles, or roles at/above my highest role. Move my bot role higher or choose different roles.",
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
  await interaction.editReply({
    content: "The role-selection panel is ready.",
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
    await interaction.editReply({
      content: "That role is no longer available for self-selection.",
    });
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Member used the L2Clarity role panel");
    await interaction.editReply({ content: `Removed ${role} from you.` });
  } else {
    await member.roles.add(role, "Member used the L2Clarity role panel");
    await interaction.editReply({ content: `Added ${role} to you.` });
  }
}

async function handleWelcomeConfig(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  updateGuildSettings(interaction.guildId, { welcomeChannelId: channel.id });
  await interaction.editReply({
    content: `Welcome messages will be posted in ${channel}.`,
  });
}

async function handleSetAutoRole(interaction) {
  const role = interaction.options.getRole("role", true);
  const botMember = interaction.guild.members.me;

  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply({
      content: "I need the Manage Roles permission to assign a default role.",
    });
    return;
  }

  if (
    role.id === interaction.guild.roles.everyone.id ||
    role.managed ||
    role.permissions.has(PermissionFlagsBits.Administrator) ||
    role.comparePositionTo(botMember.roles.highest) >= 0
  ) {
    await interaction.editReply({
      content:
        "Choose a non-managed, non-administrator role positioned below my highest role.",
    });
    return;
  }

  updateGuildSettings(interaction.guildId, { autoRoleId: role.id });
  await interaction.editReply({
    content: `New members will be assigned the ${role.name} role when they join.`,
  });
  await sendLog(
    interaction.guild,
    "Default role updated",
    `${interaction.user.tag} set${role.name} as the automatic role for new members.`,
  );
}

async function handleLogConfig(interaction) {
  const channel = interaction.options.getChannel("channel", true);
  updateGuildSettings(interaction.guildId, { logChannelId: channel.id });
  await interaction.editReply({
    content: `Bot and moderation logs will be posted in ${
