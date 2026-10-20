import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

const textChannelOption = (option, name, description) =>
  option
    .setName(name)
    .setDescription(description)
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(true);

const announcementChannelOption = (option) =>
  option
    .setName("channel")
    .setDescription("Text or announcement channel for the post.")
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true);

export const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether L2Clarity is online."),

  new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Create a permanent invite for this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.CreateInstantInvite),

  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Post the private support ticket panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addRoleOption((option) =>
      option
        .setName("support-role")
        .setDescription("Optional staff role that can view support tickets.")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("donation-panel")
    .setDescription("Post a panel with your donation information.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("HTTPS link to your donation page.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("details")
        .setDescription("A short explanation of how donations help.")
        .setMaxLength(500)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("role-panel")
    .setDescription("Post buttons that let members choose up to three roles.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((option) =>
      option.setName("role-one").setDescription("First self-selectable role."),
    )
    .addRoleOption((option) =>
      option.setName("role-two").setDescription("Second self-selectable role."),
    )
    .addRoleOption((option) =>
      option.setName("role-three").setDescription("Third self-selectable role."),
    ),

  new SlashCommandBuilder()
    .setName("set-welcome")
    .setDescription("Choose where new-member welcome messages are posted.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      textChannelOption(option, "channel", "Text channel for welcome messages."),
    ),

  new SlashCommandBuilder()
    .setName("set-autorole")
    .setDescription("Set the role automatically assigned to new members.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Default role to assign when a member joins.")
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("set-log-channel")
    .setDescription("Choose where bot and moderation logs are posted.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      textChannelOption(option, "channel", "Text channel for server logs."),
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post a formatted announcement to a server channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(announcementChannelOption)
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Announcement heading.")
        .setMaxLength(256)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Main announcement text.")
        .setMaxLength(4000)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Optional HEX color, for example #4F65D9.")
        .setMaxLength(7)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("ping")
        .setDescription("Optional notification ping.")
        .addChoices(
          { name: "None", value: "none" },
          { name: "@everyone", value: "everyone" },
          { name: "@here", value: "here" },
        )
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("anti-raid")
    .setDescription("Set the basic new-member raid protection mode.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Alert when five or more members join within ten seconds.")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("auto-timeout")
        .setDescription("Also timeout new arrivals during a detected burst.")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Remove a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to kick.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why this member is being kicked.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to ban.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why this member is being banned.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily prevent a member from participating.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to timeout.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Timeout length, from 1 minute to 28 days.")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why this member is being timed out.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete recent messages from this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete, from 1 to 100.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    ),
].map((command) => command.toJSON());