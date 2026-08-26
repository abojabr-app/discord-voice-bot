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
            // جلب الرومات الصوتية التي تحتوي على عضو واحد على الأقل فقط
            const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

            const embed = new EmbedBuilder()
                .setTitle('🎙️ لوحة تحكم الرومات النشطة')
                .setDescription('هذه الرومات التي فيها أشخاص حالياً، يمكنك إعطاؤهم ميوت أو فكه بالأزرار بالأسفل:')
                .setColor(0x2f3136);

            const rows = [];
            let currentRow = new ActionRowBuilder();
            let buttonCount = 0;

            if (activeVoiceChannels.size === 0) {
                embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
            } else {
                activeVoiceChannels.forEach(vc => {
                    // زر الميوت
                    if (buttonCount >= 4) { // كل صف يشيل زرين أو ثلاثة عشان المساحة
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                        buttonCount = 0;
                    }
                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`mute_${vc.id}`)
                            .setLabel(`🔇 ${vc.name}`)
                            .setStyle(ButtonStyle.Danger)
                    );
                    buttonCount++;

                    // زر فك الميوت
                    if (buttonCount >= 4) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                        buttonCount = 0;
                    }
                    currentRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`unmute_${vc.id}`)
                            .setLabel(`🔊 فك ${vc.name}`)
                            .setStyle(ButtonStyle.Success)
                    );
                    buttonCount++;
                });

                if (buttonCount > 0) {
                    rows.push(currentRow);
                }
            }

            // إرسال اللوحة للقناة
            await channel.send({ embeds: [embed], components: rows });
            console.log('تم إرسال لوحة التحكم المحدثة بنجاح!');
        }
    } catch (error) {
        console.error('خطأ أثناء إرسال لوحة التحكم:', error);
    }
});

// استقبال ضغطات الأزرار (ميوت أو فك ميوت)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    if (action !== 'mute' && action !== 'unmute') return;

    try {
        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) {
            return interaction.reply({ content: '❌ الروم الصوتية غير موجودة أو تم حذفها!', ephemeral: true });
        }

        const shouldMute = (action === 'mute');
        let count = 0;
        for (const [memberId, member] of channel.members) {
            if (member.voice) {
                await member.voice.setMute(shouldMute).catch(() => {});
                count++;
            }
        }

        const actionText = shouldMute ? 'عمل ميوت لـ' : 'فك الميوت عن';
        await interaction.reply({ content: `✅ تم ${actionText} ${count} عضو في روم **${channel.name}** بنجاح!`, ephemeral: true });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ حدث خطأ أثناء تنفيذ الطلب، تأكد من صلاحيات البوت.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
