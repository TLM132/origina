// ===============================
// Origin SMP – deploy-commands.js
// ===============================

const { REST, Routes } = require("discord.js");
require("dotenv").config();

// Your bot's application/client ID (saved in memory)
const CLIENT_ID = "1523615776064405595";

// Your bot token
const TOKEN = process.env.DISCORD_TOKEN;

// ===============================
// Slash Commands
// ===============================

const commands = [
  {
    name: "close",
    description: "Close the current ticket"
  },

  {
    name: "panel1",
    description: "Send panel 1"
  },

  {
    name: "panel2",
    description: "Send panel 2"
  },

  {
    name: "logs",
    description: "Show logs"
  },

  {
    name: "apply",
    description: "Send apply panel"
  },

  {
    name: "application-log",
    description: "Show application logs"
  },

  {
    name: "points",
    description: "Show your staff points"
  },

  {
    name: "addpoints",
    description: "Add points to a staff member",
    options: [
      {
        name: "user",
        description: "User to add points to",
        type: 6,
        required: true
      },
      {
        name: "amount",
        description: "Amount of points",
        type: 4,
        required: true
      }
    ]
  },

  {
    name: "point-leaderboard",
    description: "Show staff point leaderboard"
  },

  {
    name: "level",
    description: "Show your level"
  },

  {
    name: "level-leaderboard",
    description: "Show level leaderboard"
  }
];

// ===============================
// Deploy Commands
// ===============================

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Deploying slash commands...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✔ Slash commands deployed successfully.");
  } catch (err) {
    console.error("❌ Error deploying commands:");
    console.error(err);
  }
})();
