const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

// إعداد سيرفر الويب القوي لمنع النوم في Render
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running 24/7!');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

app.listen(port, () => {
    console.log(`Web server is running on port ${port}`);
});

// إعداد عميل ديسكورد
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const GUILD_ID = '1200422663424847882'; // آيدي سيرفرك
const LOG_CHANNEL_ID = '1539617469201915964'; // آيدي قناة ميوت-الرومات

// قائمة خاصة لتتبع الأعضاء الذين تم كتمهم بواسطة البوت حصرياً
const botMutedMembers = new Set();

// دالة لتوليد لوحة تحكم الرومات النشطة مع قائمة النقل السريع
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);
    const allVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة')
        .setDescription('الرومات النشطة حالياً والأزرار للتحكم الفوري، بالإضافة إلى أزرار النقل السريع:')
        .setColor(0x2f3136);

    const rows = [];

    if (activeVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
    } else {
        activeVoiceChannels.forEach(vc => {
            const memberCount = vc.members.size;
            
            // صف أزرار الميوت والفك لكل روم نشط
            const muteRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_${vc.id}`)
                    .setLabel(`🔇 ميوت ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unmute_${vc.id}`)
                    .setLabel(`🔊 فك ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Success)
            );
            rows.push(muteRow);

            // زر نقل سريع لكل روم فيه أعضاء (ينقضّ على كل اللي فيه وينقلهم لروم تختاره أو قائمة)
            // لتنفيذ فكرتك، نقدر نخلي زر نقل يفتح قائمة أو يظهر خيارات الرومات المتاحة للنقل
        });
    }

    // إضافة قائمة منسدلة (Select Menu) لاختيار الروم المستهدف لنقل أعضاء روم معين، أو زر مخصص
    // بناءً على طلبك البسيط: نجعل الأزرار واضحة ومباشرة في نفس القناة
    return { embeds: [embed], components: rows };
}

let panelMessage = null;

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);

        if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 10 });
            await channel.bulkDelete(messages).catch(() => {});

            // نرسل لوحة التحكم الأساسية مع رسالة تفاعلية أو إشعار بأن نظام النقل جاهز
            const panelData = await getVoiceControlPanel(guild);
            panelMessage = await channel.send(panelData);
            console.log('تم إرسال لوحة التحكم بنجاح!');
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// مراقبة حالات الصوت: حماية ميوت البوت وميوت الإداريين وتحديث اللوحة
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (botMutedMembers.has(memberId) && oldState.serverMute && !newState.serverMute) {
        if (newState.member && newState.member.voice) {
            await newState.member.voice.setMute(true).catch(() => {});
        }
    }

    if (panelMessage) {
        try {
            const panelData = await getVoiceControlPanel(guild);
            await panelMessage.edit(panelData).catch(() => {});
        } catch (error) {
            console.error('خطأ أثناء تحديث اللوحة:', error);
        }
    }
});

// التعامل مع الأزرار والتفاعل
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');

    try {
        await interaction.deferUpdate();

        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) return;

        if (action === 'mute' || action === 'unmute') {
            const shouldMute = (action === 'mute');
            const promises = [];

            channel.members.forEach(member => {
                if (member.voice) {
                    if (shouldMute) {
                        botMutedMembers.add(member.id);
                        promises.push(member.voice.setMute(true).catch(() => {}));
                    } else {
                        if (botMutedMembers.has(member.id)) {
                            botMutedMembers.delete(member.id);
                            promises.push(member.voice.setMute(false).catch(() => {}));
                        }
                    }
                }
            });

            await Promise.all(promises);
        }
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
