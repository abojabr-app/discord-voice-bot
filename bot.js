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
            // جلب الرومات الصوتية التي تحتوي على أعضاء فقط
            const activeVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased() && c.members.size > 0);

            const embed = new EmbedBuilder()
                .setTitle('🎙️ لوحة تحكم الرومات النشطة (مع عدد الأعضاء)')
                .setDescription('الزر يوضح لك عدد الأشخاص بالروم، اضغط لإعطائهم ميوت أو فكه فوراً وبنفس الثانية:')
                .setColor(0x2f3136);

            const rows = [];
            let currentRow = new ActionRowBuilder();
            let buttonCount = 0;

            if (activeVoiceChannels.size === 0) {
                embed.addFields({ name: 'الحالة', value: 'لا توجد رومات صوتية فيها أعضاء حالياً.' });
            } else {
                activeVoiceChannels.forEach(vc => {
                    const memberCount = vc.members.size;

                    // زر الميوت مع العدد
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

                    // زر فك الميوت مع العدد
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
            console.log('تم إرسال اللوحة مع عدد الأعضاء بنجاح!');
        }
    } catch (error) {
        console.error('خطأ أثناء إرسال اللوحة:', error);
    }
});

// استقبال ضغطات الأزرار وتنفيذ الميوت للجميع بنفس اللحظة
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, channelId] = interaction.customId.split('_');
    if (action !== 'mute' && action !== 'unmute') return;

    try {
        const guild = await interaction.guild.fetch();
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) {
            return interaction.reply({ content: '❌ الروم غير موجودة!', ephemeral: true });
        }

        const shouldMute = (action === 'mute');

        // تنفيذ طلبات الميوت لكل الأعضاء بالتوازي وبنفس الثانية
        const mutePromises = [];
        for (const [memberId, member] of channel.members) {
            if (member.voice) {
                mutePromises.push(member.voice.setMute(shouldMute).catch(() => {}));
            }
        }

        await Promise.all(mutePromises);

        const actionText = shouldMute ? 'عمل ميوت لـ' : 'فك الميوت عن';
        await interaction.reply({ content: `⚡ تم ${actionText} جميع أعضاء روم **${channel.name}** (${mutePromises.length} عضو) في نفس الثانية بنجاح!`, ephemeral: true });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ حدث خطأ، تأكد من صلاحيات البوت.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
