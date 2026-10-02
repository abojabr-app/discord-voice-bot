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

// جدول الرومات الخاصة وأصحابها (روم صوتي -> آيدي الشخص)
const SPECIAL_ROOMS = {
    '1431905620230930473': '1218664301729026254',
    '1329454808553357312': '890351885339480115',
    '1511922936297160834': '713105913334071358',
    '1527063216860172429': '1173308991619743865'
};

const botMutedMembers = new Set();
const voiceControlMessages = new Map();

// إرسال اللوحة الرئيسية عند التشغيل (مع حذف القديم أولاً)
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});

        if (channel && channel.isTextBased()) {
            try {
                const fetchedMessages = await channel.messages.fetch({ limit: 10 });
                for (const msg of fetchedMessages.values()) {
                    if (msg.author.id === client.user.id) {
                        await msg.delete().catch(() => {});
                    }
                }
            } catch (e) {}

            const embed = new EmbedBuilder()
                .setTitle('🎙️ لوحة تحكم الرومات الصوتية')
                .setDescription('استخدم القائمة أدناه لاختيار الروم وإرسال رسائل خاصة، أو تحكم بأبرز الرومات:')
                .setColor(0x2f3136);

            const rows = [];
            await guild.channels.fetch();
            const allVoiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

            const roomOptions = [];
            allVoiceChannels.forEach(vc => {
                roomOptions.push({
                    label: vc.name.slice(0, 100),
                    description: `خيارات إرسال وتحكم لـ: ${vc.name}`.slice(0, 100),
                    value: `manage_room_${vc.id}`
                });
            });

            if (roomOptions.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_room_actions')
                        .setPlaceholder('📂 اختر روم للتحكم أو إرسال الرسائل...')
                        .addOptions(roomOptions.slice(0, 25))
                ));
            }

            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('global_send_role_btn')
                    .setLabel('📢 إرسال رسالة لرول معين')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('global_send_user_btn')
                    .setLabel('✉ إرسال رسالة لعضو معين')
                    .setStyle(ButtonStyle.Secondary)
            ));

            await channel.send({ embeds: [embed], components: rows });
            console.log('تم إرسال اللوحة الرئيسية بنجاح!');
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// تحويل رسائل الخاص الواردة إلى روم الإنبوت
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

// مراقبة دخول وخروج الأعضاء للرومات الصوتية
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (botMutedMembers.has(memberId) && oldState.serverMute && !newState.serverMute) {
        if (newState.member && newState.member.voice) {
            await newState.member.voice.setMute(true).catch(() => {});
        }
    }

    // فحص الرومات الخاصة (إرسال تنبيه في الخاص لصاحب الروم إذا دخل شخص وهو ليس موجوداً)
    if (newState.channel && SPECIAL_ROOMS[newState.channel.id]) {
        const ownerId = SPECIAL_ROOMS[newState.channel.id];
        // التأكد أن العضو الداخل ليس هو صاحب الروم نفسه
        if (memberId !== ownerId) {
            const isOwnerInside = newState.channel.members.has(ownerId);
            // إذا لم يكن صاحب الروم موجوداً في الغرفة
            if (!isOwnerInside) {
                try {
                    const ownerMember = await guild.members.fetch(ownerId);
                    if (ownerMember) {
                        const alertEmbed = new EmbedBuilder()
                            .setTitle('🚨 تنبيه: شخص دخل رومك الخاص!')
                            .setDescription(`دخل شخص إلى رومك الصوتي وصاحب الروم غير موجود داخله حالياً.`)
                            .addFields(
                                { name: '👤 الشخص الداخل', value: `${newState.member} (\`${newState.member.user.tag}\`)`, inline: true },
                                { name: '🔊 اسم الروم', value: `${newState.channel.name}`, inline: true }
                            )
                            .setColor(0xED4245)
                            .setTimestamp();

                        await ownerMember.send({ embeds: [alertEmbed] }).catch(() => {});
                    }
                } catch (e) {
                    console.error('خطأ في إرسال التنبيه الخاص لصاحب الروم:', e);
                }
            }
        }
    }

    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
    if (!logChannel || !logChannel.isTextBased()) return;

    // حذف رسالة التحكم إذا أصبح الروم فاضياً
    if (oldState.channel && oldState.channel.members.size === 0) {
        if (voiceControlMessages.has(oldState.channel.id)) {
            try {
                const msg = await logChannel.messages.fetch(voiceControlMessages.get(oldState.channel.id));
                if (msg) await msg.delete();
            } catch (e) {}
            voiceControlMessages.delete(oldState.channel.id);
        }
    }

    // إرسال رسالة التحكم للروم إذا دخل أعضاء
    if (newState.channel && newState.channel.members.size > 0) {
        const vc = newState.channel;
        
        if (!voiceControlMessages.has(vc.id)) {
            const embed = new EmbedBuilder()
                .setTitle(`🎛️ خيارات الروم الصوتي: ${vc.name}`)
                .setDescription(`تم دخول أعضاء إلى هذا الروم. استخدم الأزرار أدناه لكتم أو فك الكتم عن أعضاء الروم:`)
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

// التعامل مع الأزرار والقوائم والمودال
client.on('interactionCreate', async interaction => {
    try {
        const guild = await interaction.guild.fetch();

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'global_send_role_btn') {
                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId('direct_role_select')
                    .setPlaceholder('🎯 اختر الرول المستهدف للإرسال')
                    .setMinValues(1)
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(roleSelect);
                return await interaction.reply({ content: '👇 اختر الرول المطلوب إرسال الرسالة لأصحابه:', components: [row], ephemeral: true });
            }

            if (customId === 'global_send_user_btn') {
                await guild.members.fetch().catch(() => {});

                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId('direct_user_select')
                    .setPlaceholder('👤 ابحث واختار العضو المستهدف بالاسم...')
                    .setMinValues(1)
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(userSelect);
                return await interaction.reply({ content: '👇 اختر أو ابحث عن العضو المطلوب إرسال الرسالة الشخصية له:', components: [row], ephemeral: true });
            }

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
        }

        if (interaction.isRoleSelectMenu()) {
            if (interaction.customId === 'direct_role_select') {
                const selectedRoleId = interaction.values[0];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_role_msg_${selectedRoleId}`)
                    .setTitle('اكتب رسالة أصحاب الرول');

                const messageInput = new TextInputBuilder()
                    .setCustomId('role_message_text')
                    .setLabel('محتوى الرسالة:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب هنا رسالتك...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                return await interaction.showModal(modal);
            }
        }

        if (interaction.isUserSelectMenu()) {
            if (interaction.customId === 'direct_user_select') {
                const selectedUserId = interaction.values[0];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_user_msg_${selectedUserId}`)
                    .setTitle('رسالة توجيه/تنبيه شخصية');

                const messageInput = new TextInputBuilder()
                    .setCustomId('user_message_text')
                    .setLabel('محتوى الرسالة الشخصية:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب التنبيه هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
                return await interaction.showModal(modal);
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_room_actions') {
                const vcId = interaction.values[0].replace('manage_room_', '');
                const actionSelect = new StringSelectMenuBuilder()
                    .setCustomId(`room_sub_action_${vcId}`)
                    .setPlaceholder('⚙️ اختر العملية المطلوبة لهذا الروم...')
                    .addOptions([
                        { label: '🔇 ميوت جميع أعضاء الروم', value: `mute_${vcId}` },
                        { label: '🔊 فك الميوت عن أعضاء الروم', value: `unmute_${vcId}` }
                    ]);

                const row = new ActionRowBuilder().addComponents(actionSelect);
                return await interaction.reply({ content: '👇 ماذا تريد أن تفعل بهذا الروم؟', components: [row], ephemeral: true });
            }

            if (interaction.customId.startsWith('room_sub_action_')) {
                const selectedVal = interaction.values[0];
                const [action, channelId] = selectedVal.split('_');

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
                return interaction.followUp({ content: `✅ تم تنفيذ العملية بنجاح على روم **${channel.name}**!`, ephemeral: true });
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_role_msg_')) {
                const roleId = interaction.customId.split('_')[3];
                const messageText = interaction.fields.getTextInputValue('role_message_text');

                await interaction.deferReply({ ephemeral: true });

                await guild.members.fetch();
                const targetRole = guild.roles.cache.get(roleId);
                const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId) && !m.user.bot);

                if (!targetRole || membersWithRole.size === 0) {
                    return interaction.editReply('❌ عذراً، لا يوجد أي عضو يملك هذا الرول حالياً.');
                }

                const roleEmbed = new EmbedBuilder()
                    .setTitle('📢 تنبيه إداري رسمي')
                    .setDescription(messageText)
                    .setColor(0x5865F2)
                    .setTimestamp()
                    .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                let successCount = 0;
                let failCount = 0;

                for (const [memberId, member] of membersWithRole) {
                    try {
                        await member.send({ embeds: [roleEmbed] });
                        successCount++;
                    } catch (err) {
                        failCount++;
                    }
                }

                return interaction.editReply(`✅ تمت الإرسال بنجاح إلى **${successCount}** عضو يحملون رول **${targetRole.name}**! (فشل لـ ${failCount} بسبب إغلاق الخاص).`);
            }

            if (interaction.customId.startsWith('modal_user_msg_')) {
                const userId = interaction.customId.split('_')[3];
                const messageText = interaction.fields.getTextInputValue('user_message_text');

                await interaction.deferReply({ ephemeral: true });

                try {
                    const targetMember = await guild.members.fetch(userId);
                    if (!targetMember) {
                        return interaction.editReply('❌ لم يتم العثور على هذا العضو في السيرفر.');
                    }

                    const userEmbed = new EmbedBuilder()
                        .setTitle('✉️ توجيه أو تنبيه خاص لك')
                        .setDescription(messageText)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                        .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                    await targetMember.send({ embeds: [userEmbed] });

                    const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});
                    if (inboxChannel && inboxChannel.isTextBased()) {
                        const copyEmbed = new EmbedBuilder()
                            .setTitle('📤 رسالة تم إرسالها لعضو (سجل الإرسال)')
                            .setDescription(messageText)
                            .addFields(
                                { name: '👤 المرسل إليه', value: `${targetMember} (${targetMember.user.tag})`, inline: true },
                                { name: '🛡️ الإداري المرسل', value: `${interaction.user}`, inline: true }
                            )
                            .setColor(0x57F287)
                            .setTimestamp();
                        await inboxChannel.send({ embeds: [copyEmbed] });
                    }

                    return interaction.editReply(`✅ تمت إرسال الرسالة الشخصية بنجاح إلى العضو **${targetMember.user.tag}** وتم توثيقها في الروم المخصص!`);
                } catch (err) {
                    return interaction.editReply('❌ فشل إرسال الرسالة الخاصة لهذا العضو (قد يكون مقفل الخاص).');
                }
            }
            return;
        }
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);
