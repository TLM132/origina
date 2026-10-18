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
  ButtonStyle,
  SlashCommandBuilder,
  Routes,
  REST
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
  console.error("❌ ERROR: GUILD_ID missing.");
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
// Guild Helper
// ===============================
async function getGuild() {
  try {
    return await client.guilds.fetch(GUILD_ID);
  } catch (e) {
    console.log("❌ Guild fetch failed:", e);
    return null;
  }
}

// ===============================
// Dropdown Endpoints
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
      name: m.user.username
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
// TICKET PANEL
// ===============================
app.post("/api/tickets/panel/create", async (req, res) => {
  const { channelId, title, description, categoryId } = req.body;
  const guild = await getGuild();
  if (!guild) return res.json({ error: "Guild not found" });

  try {
    const channel = await guild.channels.fetch(channelId);

    const embed = new EmbedBuilder()
      .setTitle(title || "Ticket Panel")
      .setDescription(description || "Click below to open a ticket.")
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
      categoryId,
      openTickets: []
    });

    writeSave();
    res.json({ success: true });
  } catch {
    res.json({ error: "Failed" });
  }
});

// ===============================
// OPEN TICKET HANDLER
// ===============================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "open_ticket") {
    const guild = await getGuild();
    const categoryId = save.tickets.find(t => t.id === interaction.message.id)?.categoryId;

    const category = categoryId ? guild.channels.cache.get(categoryId) : null;

    const ticketChannel = await guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: 0,
      parent: categoryId || null,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: ["ViewChannel"]
        },
        {
          id: interaction.user.id,
          allow: ["ViewChannel", "SendMessages"]
        }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle("Ticket Opened")
      .setDescription("A staff member will assist you shortly.")
      .setColor(config.mainColor);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({ embeds: [embed], components: [row] });

    await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
  }

  if (interaction.customId === "claim_ticket") {
    await interaction.reply({ content: `Ticket claimed by ${interaction.user.username}`, ephemeral: false });
  }

  if (interaction.customId === "close_ticket") {
    await interaction.channel.delete();
  }
});

// ===============================
// /close COMMAND
// ===============================
const commands = [
  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close the current ticket")
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands
    });
    console.log("✔ /close command registered");
  } catch (e) {
    console.log("❌ Failed to register /close:", e);
  }
})();

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "close") {
    await interaction.reply("Closing ticket...");
    await interaction.channel.delete();
  }
});

// ===============================
// START SERVER + BOT
// ===============================
app.listen(config.port, () => {
  console.log(`Dashboard running on http://localhost:${config.port}`);
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log("✔ Connected to guild:", guild.name);
  } catch {
    console.log("❌ Could not connect to guild:", GUILD_ID);
  }
});

client.login(process.env.DISCORD_TOKEN);
