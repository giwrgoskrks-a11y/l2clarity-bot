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

  await
