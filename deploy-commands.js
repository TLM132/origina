const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ⭐ Your bot's application/client ID
const clientId = "1523615776064405595";

// ⭐ Load token from config.json
const config = require('./config.json');
const token = config.token;

// ⭐ Load all commands from /commands folder
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`⚠️ WARNING: ${file} is missing "data" or "execute"`);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

// ⭐ Register commands globally (Discord)
async function deploy() {
    try {
        console.log('🔄 Deploying slash commands to Discord…');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('✅ Commands deployed globally.');
        console.log('💻 Commands also ready for localhost.');
    } catch (error) {
        console.error(error);
    }
}

deploy();
