const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const app = express();
app.use(express.json());

const GUILD_ID = '1200422663424847882';

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// صفحة الويب للوحة التحكم
app.get('/', async (req, res) => {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.channels.fetch();
        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

        let html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>لوحة التحكم</title></head><body style="background:#121212;color:#fff;font-family:Tahoma;padding:30px;">`;
        html += `<h1>لوحة تحكم الرومات الصوتية</h1>`;

        if (voiceChannels.size === 0) {
            html += `<p>لا توجد رومات صوتية حالياً.</p>`;
        } else {
            voiceChannels.forEach(channel => {
                html += `<div style="background:#1e1e1e;padding:15px 20px;border-radius:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border:1px solid #333">`;
                html += `<div><h3 style="margin:0 0 5px 0;">🎙️ ${channel.name}</h3><span style="color:#aaa;font-size:13px">المتواجدين: ${channel.members.size} أعضاء</span></div>`;
                html += `<div>`;
                html += `<button onclick="muteChannel('${channel.id}', true)" style="background:#ff4444;color:#fff;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-weight:bold;margin-left:8px">🔇 ميوت للكل</button>`;
                html += `<button onclick="muteChannel('${channel.id}', false)" style="background:#22bb33;color:#fff;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-weight:bold">🔊 فك الميوت</button>`;
                html += `</div></div>`;
            });
        }

        html += `<script>
            function muteChannel(channelId, shouldMute) {
                fetch("/toggle-mute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channelId, shouldMute })
                }).then(res => res.json())
                  .then(data => { alert(data.message); location.reload(); });
            }
        </script>`;
        html += `</body></html>`;

        res.send(html);
    } catch (error) {
        console.error(error);
        res.status(500).send('حدث خطأ في تحميل اللوحة');
    }
});

// مسار استقبال أمر الميوت من الموقع
app.post('/toggle-mute', async (req, res) => {
    try {
        const { channelId, shouldMute } = req.body;
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) {
            return res.status(404).json({ message: 'الروم غير موجود!' });
        }

        let count = 0;
        for (const [memberId, member] of channel.members) {
            if (member.voice) {
                await member.voice.setMute(shouldMute).catch(() => {});
                count++;
            }
        }

        res.json({ message: `تم تطبيق الميوت على ${count} عضو بنجاح!` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'فشل تنفيذ الطلب، تأكد من صلاحيات البوت.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
