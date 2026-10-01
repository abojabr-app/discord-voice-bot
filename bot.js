const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, ApplicationCommandOptionType, ChannelType } = require('discord.js');

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

// دالة لتوليد أزرار الرومات النشطة (بالطول)
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة')
        .setDescription('الرومات النشطة حالياً والأزرار مرتبة بالطول للتحكم الفوري والصامت:')
        .setColor(0x2f3136);

    const rows = [];

    if (activeVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
    } else {
        activeVoiceChannels.forEach(vc => {
            const memberCount = vc.members.size;
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
        });
    }

    return { embeds: [embed], components: rows };
}

let panelMessage = null;

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    // تسجيل أمر /move كـ Slash Command تلقائياً عند تشغيل البوت
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: [
                {
                    name: 'move',
                    description: 'نقل جميع الأعضاء من روم صوتي إلى روم آخر',
                    options: [
                        {
                            name: 'from',
                            description: 'الروم الصوتي المراد النقل منه',
                            type: ApplicationCommandOptionType.Channel,
                            channel_types: [ChannelType.GuildVoice],
                            required: true
                        },
                        {
                            name: 'to',
                            description: 'الروم الصوتي المراد النقل إليه',
                            type: ApplicationCommandOptionType.Channel,
                            channel_types: [ChannelType.GuildVoice],
                            required: true
                        }
                    ]
                }
            ]}
        );
        console.log('تم تسجيل أمر /move بنجاح!');
    } catch (error) {
        console.error('خطأ في تسجيل الأوامر:', error);
    }

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

// مراقبة حالات الصوت: حماية ميوت البوت وميوت الإداريين
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

// التعامل مع الأوامر (Slash Commands) والأزرار
client.on('interactionCreate', async interaction => {
    // 1. معالجة أمر /move الجديد
    if (interaction.isChatInputCommand() && interaction.commandName === 'move') {
        const fromChannel = interaction.options.getChannel('from');
        const toChannel = interaction.options.getChannel('to');

        if (!fromChannel || !toChannel || !fromChannel.isVoiceBased() || !toChannel.isVoiceBased()) {
            return interaction.reply({ content: '❌ يجب اختيار رومات صوتية صحيحة!', ephemeral: true });
        }

        if (fromChannel.members.size === 0) {
            return interaction.reply({ content: '❌ الروم المراد النقل منه فارغ ولا يوجد فيه أعضاء!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        let movedCount = 0;
        const movePromises = [];

        for (const [memberId, member] of fromChannel.members) {
            if (member.voice) {
                movePromises.push(
                    member.voice.setChannel(toChannel)
                        .then(() => { movedCount++; })
                        .catch(() => {})
                );
            }
        }

        await Promise.all(movePromises);
        return interaction.editReply(`✅ تم نقل **${movedCount}** عضو بنجاح من روم **${fromChannel.name}** إلى روم **${toChannel.name}**!`);
    }

    // 2. معالجة الأزرار القديمة (الميوت والفك)
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    if (action !== 'mute' && action !== 'unmute') return;

    try {
        await interaction.deferUpdate();

        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

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
