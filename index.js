// ===============================
// Origin SMP Staff Panel Backend
// ===============================

const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

require("dotenv").config();
const config = require("./config.json");

// ===============================
// Self-Healing save.json
// ===============================
const SAVE_PATH = path.join(__dirname, "save.json");

function healSave() {
  let base = {
    staffPoints: {},
    warnings: {},
    raidLogs: [],
    adultLogs: [],
    serverEvents: [],
    tickets: [],
    trustedBotAdders: [],
    activityChecks: [],
    antiRaidEnabled: false
  };

  if (!fs.existsSync(SAVE_PATH)) {
    fs.writeFileSync(SAVE_PATH, JSON.stringify(base, null, 2));
    return base;
  }

  let loaded = {};
  try {
    loaded = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  } catch {
    loaded = {};
  }

  for (const key of Object.keys(base)) {
    if (loaded[key] === undefined) loaded[key] = base[key];
  }

  fs.writeFileSync(SAVE_PATH, JSON.stringify(loaded, null, 2));
  return loaded;
}

let save = healSave();

function writeSave() {
  fs.writeFileSync(SAVE_PATH, JSON.stringify(save, null, 2));
}

// ===============================
// Discord Client
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ===============================
// REQUIRED GUILD ID
// ===============================
const GUILD_ID = process.env.GUILD_ID;

if (!GUILD_ID) {
  console.error("❌ ERROR: GUILD_ID is missing in environment variables.");
  process.exit(1);
}

// ===============================
// Express Server
// ===============================
const app = express();
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.post("/api/access/check", (req, res) => {
  const { key } = req.body;
  res.json({ allowed: key === config.dashboardKey });
});

app.post("/api/save", (req, res) => {
  writeSave();
  res.json({ success: true });
});

// ===============================
// Guild Helper (ONLY uses GUILD_ID)
// ===============================
async function getGuild() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    return guild;
  } catch (e) {
    console.error("❌ ERROR: Cannot fetch guild with GUILD_ID:", GUILD_ID);
    console.error(e);
    return null;
  }
}

// ===============================
// Dropdown Endpoints (FIXED)
// ===============================
app.get("/api/guild/text-channels", async (req, res) => {
  const guild = await getGuild();
  if (!guild) return res.json([]);

  await guild.channels.fetch();

  const channels = guild.channels.cache
    .filter(ch => ch.type === 0)
    .map(ch => ({ id: ch.id, name: ch.name }));

  res.json(channels);
});

app.get("/api/guild/categories", async (req, res) => {
  const guild = await getGuild();
  if (!guild) return res.json([]);

  await guild.channels.fetch();

  const categories = guild.channels.cache
    .filter(ch => ch.type === 4)
    .map(ch => ({ id: ch.id, name: ch.name }));

  res.json(categories);
});

app.get("/api/guild/members", async (req, res) => {
  const guild = await getGuild();
  if (!guild) return res.json([]);

  await guild.members.fetch();

  const members = guild.members.cache
    .filter(m => !m.user.bot)
    .map(m => ({
      id: m.id,
      name: m.user.username // FIXED: username instead of ID
    }));

  res.json(members);
});

// ===============================
// Moderation
// ===============================
app.post("/api/mod/warn", (req, res) => {
  const { userId, reason } = req.body;

  if (!save.warnings[userId]) save.warnings[userId] = [];

  save.warnings[userId].push({
    reason,
    timestamp: Date.now()
  });

  save.serverEvents.push({
    type: "warn",
    userId,
    reason,
    timestamp: Date.now()
  });

  writeSave();
  res.json({ success: true });
});

// ===============================
// Kick / Ban
// ===============================
app.post("/api/mod/kick", async (req, res) => {
  const { userId, reason } = req.body;
  const guild = await getGuild();
  if (!guild) return res.json({ error: "Guild not found" });

  try {
    const member = await guild.members.fetch(userId);
    await member.kick(reason || "No reason");

    save.serverEvents.push({
      type: "kick",
      userId,
      reason,
      timestamp: Date.now()
    });

    writeSave();
    res.json({ success: true });
  } catch {
    res.json({ error: "Kick failed" });
  }
});

app.post("/api/mod/ban", async (req, res) => {
  const { userId, reason } = req.body;
  const guild = await getGuild();
  if (!guild) return res.json({ error: "Guild not found" });

  try {
    await guild.members.ban(userId, { reason: reason || "No reason" });

    save.serverEvents.push({
      type: "ban",
      userId,
      reason,
      timestamp: Date.now()
    });

    writeSave();
    res.json({ success: true });
  } catch {
    res.json({ error: "Ban failed" });
  }
});

// ===============================
// Warnings
// ===============================
app.get("/api/warnings", (req, res) => {
  res.json(save.warnings);
});

app.post("/api/warnings/delete", (req, res) => {
  const { userId, index } = req.body;

  if (!save.warnings[userId]) return res.json({ error: "No warnings" });

  save.warnings[userId].splice(index, 1);

  save.serverEvents.push({
    type: "warning_deleted",
    userId,
    timestamp: Date.now()
  });

  writeSave();
  res.json({ success: true });
});

// ===============================
// Staff Points
// ===============================
app.get("/api/staff/points", (req, res) => {
  res.json(save.staffPoints);
});

app.post("/api/staff/points/add", (req, res) => {
  const { userId, amount } = req.body;

  if (!save.staffPoints[userId]) save.staffPoints[userId] = 0;
  save.staffPoints[userId] += amount;

  save.serverEvents.push({
    type: "points_added",
    userId,
    amount,
    timestamp: Date.now()
  });

  writeSave();
  res.json({ success: true });
});

// ===============================
// Tickets
// ===============================
app.post("/api/tickets/panel/create", async (req, res) => {
  const { channelId, title, description, categoryId } = req.body;
  const guild = await getGuild();
  if (!guild) return res.json({ error: "Guild not found" });

  try {
    const channel = await guild.channels.fetch(channelId);

    const embed = new EmbedBuilder()
      .setTitle(title || "Ticket Panel")
      .setDescription(description || "Click the button below to open a ticket.")
      .setColor(config.mainColor);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_ticket")
        .setLabel("Open Ticket")
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    save.tickets.push({
      id: msg.id,
      channelId,
      categoryId: categoryId || null,
      openTickets: []
    });

    save.serverEvents.push({
      type: "ticket_panel_sent",
      channelId,
      timestamp: Date.now()
    });

    writeSave();
    res.json({ success: true, messageId: msg.id });
  } catch {
    res.json({ error: "Failed to create panel" });
  }
});

// ===============================
// Anti-Raid & Trusted Bot Adders
// ===============================
app.get("/api/anti-raid/state", (req, res) => {
  res.json({
    antiRaidEnabled: !!save.antiRaidEnabled,
    trustedBotAdders: save.trustedBotAdders || []
  });
});

app.post("/api/anti-raid/toggle", (req, res) => {
  const { enabled } = req.body;
  save.antiRaidEnabled = !!enabled;

  save.serverEvents.push({
    type: "anti_raid_toggle",
    enabled,
    timestamp: Date.now()
  });

  writeSave();
  res.json({ success: true });
});

app.post("/api/trusted-bot-adders/add", (req, res) => {
  const { userId } = req.body;

  if (!save.trustedBotAdders.includes(userId)) {
    save.trustedBotAdders.push(userId);

    save.serverEvents.push({
      type: "trusted_add",
      userId,
      timestamp: Date.now()
    });

    writeSave();
  }

  res.json({ success: true, list: save.trustedBotAdders });
});

app.post("/api/trusted-bot-adders/remove", (req, res) => {
  const { userId } = req.body;

  save.trustedBotAdders = save.trustedBotAdders.filter(id => id !== userId);

  save.serverEvents.push({
    type: "trusted_remove",
    userId,
    timestamp: Date.now()
  });

  writeSave();
  res.json({ success: true, list: save.trustedBotAdders });
});

// ===============================
// Adult Logs
// ===============================
app.get("/api/adult/logs", (req, res) => {
  res.json(save.adultLogs);
});

// ===============================
// Server Events
// ===============================
app.get("/api/server/events", (req, res) => {
  res.json(save.serverEvents);
});

// ===============================
// Activity Check
// ===============================
app.post("/api/activity/create", async (req, res) => {
  const { channelId, durationMinutes, requiredCount } = req.body;
  const guild = await getGuild();
  if (!guild) return res.json({ error: "Guild not found" });

  try {
    const channel = await guild.channels.fetch(channelId);

    const embed = new EmbedBuilder()
      .setTitle("Activity Check")
      .setDescription("React with ✅ to confirm you're active.")
      .setColor(config.mainColor);

    const msg = await channel.send({ embeds: [embed] });
    await msg.react("✅");

    const check = {
      id: `${msg.id}-${Date.now()}`,
      guildId: guild.id,
      channelId,
      messageId: msg.id,
      startTime: Date.now(),
      endTime: Date.now() + durationMinutes * 60000,
      requiredCount,
      reactedUserIds: [],
      completed: false
    };

    save.activityChecks.push(check);

    save.serverEvents.push({
      type: "activity_check_created",
      channelId,
      timestamp: Date.now()
    });

    writeSave();

    scheduleActivityCheck(check);

    res.json({ success: true, check });
  } catch {
    res.json({ error: "Failed to create activity check" });
  }
});

function scheduleActivityCheck(check) {
  const delay = check.endTime - Date.now();
  setTimeout(() => finalizeActivityCheck(check), delay);
}

async function finalizeActivityCheck(check) {
  const guild = await getGuild();
  if (!guild) return;

  try {
    await guild.members.fetch();
    const channel = await guild.channels.fetch(check.channelId);
    const message = await channel.messages.fetch(check.messageId);

    const reacted = new Set(check.reactedUserIds);

    const reaction = message.reactions.resolve("✅");
    if (reaction) {
      const users = await reaction.users.fetch();
      users.forEach(u => {
        if (!u.bot) reacted.add(u.id);
      });
    }

    const active = [];
    const inactive = [];

    guild.members.cache.forEach(m => {
      if (m.user.bot) return;
      if (reacted.has(m.id)) active.push(m.user.username);
      else inactive.push(m.user.username);
    });

    const embed = new EmbedBuilder()
      .setTitle("Activity Check Summary")
      .setColor(config.mainColor)
      .addFields(
        { name: "Active", value: active.join("\n") || "None" },
        { name: "Inactive", value: inactive.join("\n") || "None" },
        { name: "Required Count", value: String(check.requiredCount) }
      );

    await channel.send({ embeds: [embed] });

    check.completed = true;

    save.serverEvents.push({
      type: "activity_check_completed",
      channelId: check.channelId,
      timestamp: Date.now()
    });

    writeSave();
  } catch {}
}

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.emoji.name !== "✅") return;

  const msg = reaction.message;
  const check = save.activityChecks.find(
    c => c.messageId === msg.id && !c.completed
  );

  if (!check) return;

  if (!check.reactedUserIds.includes(user.id)) {
    check.reactedUserIds.push(user.id);
    writeSave();
  }
});

// ===============================
// Message Delete Logging
// ===============================
client.on("messageDelete", async message => {
  if (!message.guild) return;

  save.serverEvents.push({
    type: "message_deleted",
    content: message.content || "(no content)",
    author: message.author ? message.author.username : "Unknown",
    channel: message.channel.name,
    timestamp: Date.now()
  });

  writeSave();
});

// ===============================
// START SERVER + BOT
// ===============================
app.listen(config.port, () => {
  console.log(`Dashboard running on http://localhost:${config.port}`);
});

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log("✔ Connected to guild:", guild.name);
  } catch {
    console.log("❌ Could not connect to guild with ID:", GUILD_ID);
  }
});

client.login(process.env.DISCORD_TOKEN);
