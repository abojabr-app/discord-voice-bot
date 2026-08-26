const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');

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

// ================= ديليجيت: لوحة الميوت العمودية =================
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات الشاملة')
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

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);

        if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 10 });
            await channel.bulkDelete(messages).catch(() => {});

            const panelData = await getVoiceControlPanel(guild);
            panelMessage = await channel.send(panelData);
            console.log('تم إرسال لوحة التحكم الشاملة بنجاح!');
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// ================= تحديث اللوحة تلقائياً عند الدخول والخروج =================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID || !panelMessage) return;

    try {
        const panelData = await getVoiceControlPanel(guild);
        await panelMessage.edit(panelData).catch(() => {});
    } catch (error) {
        console.error('خطأ أثناء تحديث اللوحة:', error);
    }
});

// ================= نظام الحماية من الروابط + الردود التلقائية =================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // 1. نظام حماية الروابط (يحذف أي رسالة فيها رابط ويحذر العضو)
    if (message.content.includes('http://') || message.content.includes('https://') || message.content.includes('www.')) {
        // استثناء المشرفين
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await message.delete().catch(() => {});
            const warning = await message.channel.send(`⚠️ **${message.author.username}**، ممنوع إرسال الروابط هنا!`);
            setTimeout(() => warning.delete().catch(() => {}), 4000);
            return;
        }
    }

    // 2. ردود تلقائية خفيفة
    if (message.content === '!اوامر' || message.content === '!help') {
        message.channel.send('⚡ أهلاً بك يا أبو جبر! البوت شغال ومسيطر على السيرفر بالكامل.');
    }
});

// ================= تنفيذ الميوت الصاروخي والصامت =================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    if (action !== 'mute' && action !== 'unmute') return;

    try {
        await interaction.deferUpdate();

        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) return;

        const shouldMute = (action === 'mute');
        const mutePromises = [];

        for (const [memberId, member] of channel.members) {
            if (member.voice) {
                mutePromises.push(member.voice.setMute(shouldMute).catch(() => {}));
            }
        }

        await Promise.all(mutePromises);
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
