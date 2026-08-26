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
            // جلب الرومات الصوتية في السيرفر
            await guild.channels.fetch();
            const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

            const embed = new EmbedBuilder()
                .setTitle('🎙️ لوحة تحكم الرومات الصوتية')
                .setDescription('اختر الروم الصوتي وأعطِ الميوت للكل أو فكه مباشرة من الأزرار بالأسفل:')
                .setColor(0x2f3136);

            const rows = [];
            let currentRow = new ActionRowBuilder();
            let buttonCount = 0;

            if (voiceChannels.size === 0) {
                embed.addFields({ name: 'التنبيهات', value: 'لا توجد رومات صوتية حالياً في السيرفر.' });
            } else {
                voiceChannels.forEach(vc => {
                    if (buttonCount >= 5) {
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
                });
                if (buttonCount > 0) {
                    rows.push(currentRow);
                }
            }

            // إرسال رسالة اللوحة للقناة
            await channel.send({ embeds: [embed], components: rows });
            console.log('تم إرسال لوحة التحكم بنجاح داخل القناة!');
        }
    } catch (error) {
        console.error('خطأ أثناء إرسال لوحة التحكم للقناة:', error);
    }
});

// استقبال ضغطات الأزرار وتنفيذ الميوت
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('mute_')) {
        const channelId = interaction.customId.replace('mute_', '');
        try {
            const guild = await interaction.guild.fetch();
            const channel = await guild.channels.fetch(channelId);

            if (!channel || !channel.isVoiceBased()) {
                return interaction.reply({ content: '❌ الروم الصوتية غير موجودة أو تم حذفها!', ephemeral: true });
            }

            let count = 0;
            for (const [memberId, member] of channel.members) {
                if (member.voice) {
                    await member.voice.setMute(true).catch(() => {});
                    count++;
                }
            }

            await interaction.reply({ content: `✅ تم عمل ميوت لـ ${count} عضو في روم **${channel.name}** بنجاح!`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ حدث خطأ أثناء تنفيذ الميوت، تأكد من صلاحيات البوت.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
