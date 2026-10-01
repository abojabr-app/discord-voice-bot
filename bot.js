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

// دالة لتوليد أزرار الرومات النشطة (بالطول) مع قائمة النقل المضافة
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);
    const allVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة')
        .setDescription('الرومات النشطة حالياً والأزرار مرتبة بالطول للتحكم الفوري والصامت، مع قائمة النقل السريع:')
        .setColor(0x2f3136);

    const rows = [];

    if (activeVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
    } else {
        activeVoiceChannels.forEach(vc => {
            const memberCount = vc.members.size;
            
            // 1. أزرار الميوت والفك القديمة
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_${vc.id}`)
                    .setLabel(`🔇 ميوت ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unmute_${vc.id}`)
                    .setLabel(`🔊 فك ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Success)
            );
            rows.push(row);

            // 2. قائمة النقل المضافة حديثاً لكل روم نشط
            const options = [];
            allVoiceChannels.forEach(targetVc => {
                if (targetVc.id !== vc.id) {
                    options.push({
                        label: `نقل إلى: ${targetVc.name}`.slice(0, 100),
                        value: `move_${vc.id}_to_${targetVc.id}`
                    });
                }
            });

            if (options.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_move_${vc.id}`)
                    .setPlaceholder(`🔀 نقل أعضاء [ ${vc.name} ] إلى...`)
                    .addOptions(options.slice(0, 25));

                const menuRow = new ActionRowBuilder().addComponents(selectMenu);
                rows.push(menuRow);
            }
        });
    }

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

            const panelData = await getVoiceControlPanel(guild);
            panelMessage = await channel.send(panelData);
            console.log('تم إرسال لوحة التحكم بنجاح!');
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// الحماية الذكية لميوت البوت وميوت الإداريين
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

// تنفيذ الأزرار والقوائم المنسدلة (الميوت، الفك، والنقل)
client.on('interactionCreate', async interaction => {
    try {
        const guild = await interaction.guild.fetch();

        // 1. معالجة القائمة المنسدلة للنقل
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('select_move_')) {
                await interaction.deferUpdate();

                const selectedValue = interaction.values[0];
                const parts = selectedValue.split('_');
                const fromChannelId = parts[1];
                const targetChannelId = parts[3];

                const fromChannel = await guild.channels.fetch(fromChannelId).catch(() => {});
                const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => {});

                if (!fromChannel || !targetChannel || !fromChannel.isVoiceBased() || !targetChannel.isVoiceBased()) return;

                const movePromises = [];
                fromChannel.members.forEach(member => {
                    if (member.voice) {
                        movePromises.push(member.voice.setChannel(targetChannel).catch(() => {}));
                    }
                });

                await Promise.all(movePromises);
            }
            return;
        }

        // 2. معالجة الأزرار القديمة (الميوت والفك)
        if (!interaction.isButton()) return;

        const [action, channelId] = interaction.customId.split('_');
        if (action !== 'mute' && action !== 'unmute') return;

        await interaction.deferUpdate();

        const channel = await guild.channels.fetch(channelId).catch(() => {});
        if (!channel || !channel.isVoiceBased()) return;

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
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
