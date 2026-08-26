const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const notifier = require('node-notifier');

const app = express();
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ] 
});

const GUILD_ID = '1200422663424847882';
const BOT_TOKEN = process.env.DISCORD_TOKEN; // تم سحب التوكن وجعله يسحب من متغيرات المنصة أماناً
const LOG_CHANNEL_ID = '1539617469201915964';

app.use(express.json());

async function updateDiscordLogMessage() {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.channels.fetch();
        const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!channel) return;

        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
        let activeChannelsCount = 0;
        
        // تصميم Embed أكبر وأرتب
        const embed = new EmbedBuilder()
            .setTitle('🎙️ **لوحة التحكم المباشرة للرومات الصوتية**')
            .setDescription('--------------------------------------------------\n*تحكم بكتم وفك الميوت عن الرومات بضغطة زر واحدة:*')
            .setColor(0x2f3136)
            .setTimestamp()
            .setFooter({ text: 'نظام إدارة السيرفر التلقائي', iconURL: client.user.displayAvatarURL() });

        const components = [];

        voiceChannels.forEach(vc => {
            if (vc.members.size > 0) {
                activeChannelsCount++;
                
                // إضافة حقل (Field) مستقل ومرتب لكل روم صوتي نشط
                embed.addFields({
                    name: `🔊 روم: ${vc.name}`,
                    value: `👤 **عدد المتواجدين:** \`${vc.members.size}\` أعضاء`,
                    inline: false
                });

                // أزرار التحكم الخاصة بالروم مرصوصة وواضحة
                components.push(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`mute_${vc.id}`)
                            .setLabel(`🔇 كتم روم (${vc.name})`)
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`unmute_${vc.id}`)
                            .setLabel(`🔊 فك الميوت عن (${vc.name})`)
                            .setStyle(ButtonStyle.Success)
                    )
                );
            }
        });

        if (activeChannelsCount === 0) {
            embed.addFields({
                name: '🚫 **الحالة الآن**',
                value: 'لا توجد أي نشاطات حالياً، **مافي أحد بالرومات**.',
                inline: false
            });
        }

        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMsg = messages.find(m => m.author.id === client.user.id);

        if (existingMsg) {
            await existingMsg.edit({ embeds: [embed], components: components });
        } else {
            await channel.send({ embeds: [embed], components: components });
        }
    } catch (e) {
        console.log('خطأ في تحديث رسالة الديسكورد:', e);
    }
}

client.on('ready', async () => {
    console.log('البوت شغال تمام: http://localhost:3000');
    updateDiscordLogMessage();
    setInterval(updateDiscordLogMessage, 10000);
});

client.on('voiceStateUpdate', () => {
    updateDiscordLogMessage();
});

// التعامل مع الأزرار
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(channelId);
        
        let count = 0;
        const shouldMute = (action === 'mute');

        for (const [memberId, member] of channel.members) {
            if (shouldMute && !member.voice.serverMute) {
                await member.voice.setMute(true, 'بأمر من أزرار اللوحة');
                count++;
            } else if (!shouldMute && member.voice.serverMute) {
                await member.voice.setMute(false, 'بأمر من أزرار اللوحة');
                count++;
            }
        }

        const actionText = shouldMute ? 'تم كتم روم ' : 'تم فك الميوت عن ';
        const msg = `✅ ${actionText} **${channel.name}** بنجاح (${count} أعضاء)`;

        await interaction.reply({ content: msg, ephemeral: true });
        updateDiscordLogMessage();
    } catch (error) {
        await interaction.reply({ content: '❌ فشل تنفيذ الطلب، تأكد من صلاحيات البوت.', ephemeral: true });
    }
});

// نظام الويب المعتاد
app.get('/', async (req, res) => {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.channels.fetch();
        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
        
        let html = '<html dir="rtl"><head><meta charset="UTF-8"><title>الرومات الصوتية</title></head>';
        html += '<body style="background:#121212;color:#fff;font-family:Tahoma;padding:30px;">';
        html += '<h1>🎙️ لوحة تحكم الرومات الصوتية</h1>';

        if (voiceChannels.size === 0) {
            html += '<p>لا توجد رومات صوتية حالياً.</p>';
        } else {
            voiceChannels.forEach(channel => {
                html += '<div style="background:#1e1e1e;padding:15px 20px;border-radius:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border:1px solid #333;">';
                html += '<div><h3 style="margin:0 0 5px 0;">🔊 ' + channel.name + '</h3>';
                html += '<span style="color:#aaa;font-size:13px;">المتواجدين: ' + channel.members.size + ' أعضاء</span></div>';
                
                html += '<div>';
                html += '<button onclick="muteChannel(\'' + channel.id + '\', true)" style="background:#ff4444;color:#fff;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-weight:bold;margin-left:8px;">ميوت للكل 🔇</button>';
                html += '<button onclick="muteChannel(\'' + channel.id + '\', false)" style="background:#22bb33;color:#fff;border:none;padding:10px 15px;border-radius:5px;cursor:pointer;font-weight:bold;">فك الميوت 🔊</button>';
                html += '</div>';
                
                html += '</div>';
            });
        }

        html += '<script>';
        html += 'function muteChannel(channelId, shouldMute) {';
        html += '  fetch("/toggle-mute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: channelId, mute: shouldMute }) })';
        html += '  .then(function(res) { return res.json(); })';
        html += '  .then(function(data) { console.log(data.message); location.reload(); })';
        html += '}';
        html += '</script></body></html>';

        res.send(html);
    } catch (error) {
        res.send('خطأ');
    }
});

app.post('/toggle-mute', async (req, res) => {
    const channelId = req.body.channelId;
    const shouldMute = req.body.mute;
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(channelId);
        
        let count = 0;
        for (const [memberId, member] of channel.members) {
            if (shouldMute && !member.voice.serverMute) {
                await member.voice.setMute(true, 'من الموقع');
                count++;
            } else if (!shouldMute && member.voice.serverMute) {
                await member.voice.setMute(false, 'من الموقع');
                count++;
            }
        }
        
        const actionText = shouldMute ? 'تم إعطاء ميوت لـ ' : 'تم فك الميوت عن ';
        const msg = actionText + count + ' أشخاص في روم: ' + channel.name;
        
        notifier.notify({ title: 'لوحة التحكم', message: msg });
        updateDiscordLogMessage();
        res.json({ success: true, message: msg });
    } catch (error) {
        res.json({ success: false, message: 'فشل' });
    }
});

client.login(BOT_TOKEN);
app.listen(3000);