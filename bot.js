const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

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

// دالة لتوليد أزرار الرومات النشطة
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة (تحديث تلقائي وفوري)')
        .setDescription('هذه الرومات التي فيها أشخاص حالياً، الأزرار تتحدث تلقائياً وتنفذ الميوت بصمت وبنفس الثانية:')
        .setColor(0x2f3136);

    const rows = [];
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;

    if (activeVoiceChannels.size === 0) {
        embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
    } else {
        activeVoiceChannels.forEach(vc => {
            const memberCount = vc.members.size;

            if (buttonCount >= 4) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
                buttonCount = 0;
            }
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_${vc.id}`)
                    .setLabel(`🔇 ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Danger)
            );
            buttonCount++;

            if (buttonCount >= 4) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
                buttonCount = 0;
            }
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`unmute_${vc.id}`)
                    .setLabel(`🔊 فك ${vc.name} (${memberCount})`)
                    .setStyle(ButtonStyle.Success)
            );
            buttonCount++;
        });

        if (buttonCount > 0) {
            rows.push(currentRow);
        }
    }

    return { embeds: [embed], components: rows };
}

// متغير لحفظ رسالة اللوحة عشان نحدثها بدل ما نرسل رسالة جديدة كل شوي
let panelMessage = null;

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);

        if (channel && channel.isTextBased()) {
            // حذف الرسائل القديمة في القناة وتنظيفها
            const messages = await channel.messages.fetch({ limit: 10 });
            await channel.bulkDelete(messages).catch(() => {});

            // إرسال اللوحة لأول مرة
            const panelData = await getVoiceControlPanel(guild);
            panelMessage = await channel.send(panelData);
            console.log('تم إرسال اللوحة بنجاح!');
        }
    } catch (error) {
        console.error('خطأ أثناء بدء اللوحة:', error);
    }
});

// تحديث اللوحة تلقائياً كل ما دخل أو طلع أحد من الرومات
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

// تنفيذ الميوت بصمت تام وبنفس الثانية عند الضغط على الزر
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
