const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const GUILD_ID = '1200422663424847882';
const LOG_CHANNEL_ID = '1539617469201915964';
const INBOX_CHANNEL_ID = '1555355545504850103';

const botMutedMembers = new Set();
const voiceControlMessages = new Map();

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    // إرسال رسالة لوحة التحكم الرئيسية (القديمة) إذا لم تكن موجودة في القناة
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
        if (logChannel && logChannel.isTextBased()) {
            const messages = await logChannel.messages.fetch({ limit: 10 });
            const existingMainMsg = messages.find(m => m.embeds.length > 0 && m.embeds[0].title && m.embeds[0].title.includes('لوحة تحكم الرومات الصوتية'));
            
            if (!existingMainMsg) {
                const mainEmbed = new EmbedBuilder()
                    .setTitle('🎛️ لوحة تحكم الرومات الصوتية')
                    .setDescription('اختر روم للتحكم أو إرسال الرسائل:')
                    .setColor(0x2f3136);

                const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                const selectOptions = [];
                voiceChannels.forEach(vc => {
                    selectOptions.push({
                        label: vc.name,
                        value: `select_vc_${vc.id}`
                    });
                });

                if (selectOptions.length > 0) {
                    const row1 = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('main_voice_select')
                            .setPlaceholder('... اختر روم للتحكم أو إرسال الرسائل')
                            .addOptions(selectOptions.slice(0, 25))
                    );

                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('send_msg_to_vc')
                            .setLabel('إرسال رسالة للروم معين')
                            .setStyle(ButtonStyle.Primary)
                    );

                    await logChannel.send({ embeds: [mainEmbed], components: [row1, row2] });
                }
            }
        }
    } catch (e) {
        console.error('خطأ في إرسال اللوحة الرئيسية:', e);
    }
});

// تحويل رسائل الخاص
client.on('messageCreate', async message => {
    if (message.guild || message.author.bot) return;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});

        if (!inboxChannel || !inboxChannel.isTextBased()) return;

        const dmEmbed = new EmbedBuilder()
            .setTitle('📥 رد جديد في الخاص (DM)')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setDescription(message.content || '[رسالة تحتوى على مرفق أو صورة]')
            .addFields(
                { name: '👤 اسم العضو', value: `${message.author} (${message.author.tag})`, inline: true },
                { name: '🆔 الآيدي', value: `\`${message.author.id}\``, inline: true }
            )
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

        await inboxChannel.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error('خطأ أثناء تحويل رسالة الخاص:', error);
    }
});

// مراقبة دخول وخروج الأعضاء من الرومات الصوتية (إرسال رسالة جديدة مستقلة للميوت أو حذفها إذا فاضي الروم)
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (botMutedMembers.has(memberId) && oldState.serverMute && !newState.serverMute) {
        if (newState.member && newState.member.voice) {
            await newState.member.voice.setMute(true).catch(() => {});
        }
    }

    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
    if (!logChannel || !logChannel.isTextBased()) return;

    // 1. إذا أصبح الروم القديم فاضياً، نحذف رسالة التحكم الخاصة به
    if (oldState.channel && oldState.channel.members.size === 0) {
        if (voiceControlMessages.has(oldState.channel.id)) {
            try {
                const msg = await logChannel.messages.fetch(voiceControlMessages.get(oldState.channel.id));
                if (msg) await msg.delete();
            } catch (e) {}
            voiceControlMessages.delete(oldState.channel.id);
        }
    }

    // 2. إذا دخل شخص إلى روم وفيه أعضاء، نرسل رسالة جديدة مستقلة خاصة بخيارات الكتم لهذا الروم
    if (newState.channel && newState.channel.members.size > 0) {
        const vc = newState.channel;
        
        if (!voiceControlMessages.has(vc.id)) {
            const embed = new EmbedBuilder()
                .setTitle(`🎛️ خيارات الروم الصوتي: ${vc.name}`)
                .setDescription(`تم دخول أعضاء إلى الروم. استخدم الأزرار أدناه لكتم أو فك الكتم:`)
                .setColor(0x2f3136)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_room_${vc.id}`)
                    .setLabel('🔇 كتم أعضاء الروم')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unmute_room_${vc.id}`)
                    .setLabel('🔊 فك الكتم')
                    .setStyle(ButtonStyle.Success)
            );

            try {
                const sentMsg = await logChannel.send({ embeds: [embed], components: [row] });
                voiceControlMessages.set(vc.id, sentMsg.id);
            } catch (err) {
                console.error('خطأ عند إرسال رسالة الروم الصوتي:', err);
            }
        }
    }
});

// التعامل مع جميع الأزرار، القوائم، والمودال (القديمة والجديدة)
client.on('interactionCreate', async interaction => {
    try {
        const guild = await interaction.guild.fetch();

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId.startsWith('mute_room_') || customId.startsWith('unmute_room_')) {
                const parts = customId.split('_');
                const action = parts[0]; 
                const channelId = parts[2];

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
                return;
            }

            // زر إرسال رسالة للروم معين (القديم)
            if (customId === 'send_msg_to_vc') {
                const modal = new ModalBuilder()
                    .setCustomId('send_msg_modal')
                    .setTitle('إرسال رسالة للروم الصوتي');

                const messageInput = new TextInputBuilder()
                    .setCustomId('vc_message_text')
                    .setLabel('اكتب الرسالة التي تريد إرسالها')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                await interaction.showModal(modal);
                return;
            }
        }

        // التعامل مع القوائم المنسدلة (Select Menus) القديمة
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'main_voice_select') {
                const selectedValue = interaction.values[0];
                const channelId = selectedValue.replace('select_vc_', '');
                const channel = await guild.channels.fetch(channelId).catch(() => {});

                if (!channel) {
                    return await interaction.reply({ content: '❌ الروم غير موجود.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🎙️ معلومات الروم: ${channel.name}`)
                    .setDescription(`الأعضاء المتواجدون حالياً: ${channel.members.size}`)
                    .setColor(0x00FF00);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`mute_room_${channel.id}`)
                        .setLabel('🔇 كتم أعضاء الروم')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`unmute_room_${channel.id}`)
                        .setLabel('🔊 فك الكتم')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
                return;
            }
        }

        // التعامل مع المودال (Modal Submit) القديم
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'send_msg_modal') {
                const text = interaction.fields.getTextInputValue('vc_message_text');
                await interaction.reply({ content: `✅ تم حفظ رسالتك بنجاح: "${text}"`, ephemeral: true });
                return;
            }
        }

    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
