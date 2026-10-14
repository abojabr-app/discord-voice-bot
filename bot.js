const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// 1. سيرفر الويب لإبقاء البوت شغال
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot is online!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});

// 2. إعداد البوت والاتصال بـ Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`SUCCESS: Logged in as ${client.user.tag}!`);
});

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error('ERROR: DISCORD_TOKEN is missing in Environment!');
} else {
    client.login(TOKEN).catch(err => {
        console.error('LOGIN ERROR:', err.message);
    });
}
