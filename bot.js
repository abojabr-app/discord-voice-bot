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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID);

        if (channel && channel.isTextBased()) {
            await guild.channels.fetch();
            const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

            const embed = new EmbedBuilder()
                .setTitle('🎙️ لوحة تحكم الرومات النشطة (تنفيذ فوري وصامت)')
                .setDescription('اضغط الزر لتطبيق الميوت أو فكه فوراً وبنفس الثانية للجميع بدون رسائل:')
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

            await channel.send({ embeds: [embed], components: rows });
            console.log('تم إرسال اللوحة الصامتة بنجاح!');
        }
    } catch (error) {
        console.error('خطأ أثناء إرسال اللوحة:', error);
    }
});

// استقبال ضغطات الأزرار وتنفيذ الميوت فوراً بدون إرسال أي رسالة رد
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    if (action !== 'mute' && action !== 'unmute') return;

    try {
        // تأكيد الضغطة بصمت تام (deferUpdate عشان الديسكورد ما يحسب أن التفاعل فشل وبدون ما يكتب شي)
        await interaction.deferUpdate();

        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) return;

        const shouldMute = (action === 'mute');

        // تنفيذ الميوت لجميع الأعضاء بنفس الثانية مع بعض
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
