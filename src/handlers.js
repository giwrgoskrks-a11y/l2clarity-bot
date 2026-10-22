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
    content: `Permanent invite for **${interaction.channel.name}** (no expiration or use limit): ${invite.url}`,
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
