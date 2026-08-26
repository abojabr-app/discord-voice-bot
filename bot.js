const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

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
const VOICE_ROOM_ID = '1504143545337118792'; // آيدي الروم الصوتي الثابت

// دالة لتوليد أزرار الرومات النشطة (بالطول)
async function getVoiceControlPanel(guild) {
    await guild.channels.fetch();
    const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ لوحة تحكم الرومات النشطة (تحديث تلقائي وفوري)')
        .setDescription('الرومات النشطة حالياً والأزرار مرتبة بالطول لتسهيل التحكم:')
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
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);

        // الدخول والثبات في الروم الصوتي المحدد
        const targetVoiceChannel = await guild.channels.fetch(VOICE_ROOM_ID);
        if (targetVoiceChannel && targetVoiceChannel.isVoiceBased()) {
            joinVoiceChannel({
                channelId: targetVoiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            console.log(`تم دخول البوت وثباته في الروم الصوتي: ${targetVoiceChannel.name}`);
        }

        // إرسال لوحة التحكم للقناة النصية
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
            const messages = await channel.messages.fetch({ limit: 10 });
            await channel.bulkDelete(messages).catch(() => {});

            const panelData = await getVoiceControlPanel(guild);
            panelMessage = await channel.send(panelData);
            console.log('تم إرسال اللوحة العمودية بنجاح!');
        }
    } catch (error) {
        console.error('خطأ أثناء بدء البوت:', error);
    }
});

// تحديث اللوحة تلقائياً عند دخول أو خروج أي عضو
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
