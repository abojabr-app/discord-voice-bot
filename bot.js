const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// 1. سيرفر Express لإبقاء البوت شغال 24/7
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot is active 24/7!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});

// 2. إعداد بوت الديسكورد
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

// 3. تسجيل الدخول بالتوكن
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error('ERROR: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(TOKEN).catch(err => {
        console.error('FAILED TO LOGIN TO DISCORD:', err.message);
    });
}
