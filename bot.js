const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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
const MANAGER_ROOM_ID = '1555573365748531251'; // روم مدير القروب

// جدول الرومات الخاصة وأصحابها
const SPECIAL_ROOMS = {
    '1431905620230930473': '1218664301729026254',
    '1329454808553357312': '890351885339480115',
    '1511922936297160834': '713105913334071358',
    '1527063216860172429': '1173308991619743865'
};

const botMutedMembers = new Set();
const voiceControlMessages = new Map();

// إرسال اللوحات عند التشغيل وتنظيف رسايل التيست السابقة تلقائياً
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);

        // 1. تنظيف وإعداد روم السجلات الرئيسي
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
        if (logChannel && logChannel.isTextBased()) {
            try {
                const fetchedMessages = await logChannel.messages.fetch({ limit: 50 });
                for (const msg of fetchedMessages.values()) {
                    await msg.delete().catch(() => {});
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
                new ButtonBuilder().setCustomId('global_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('global_send_user_btn').setLabel('✉ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            ));

            await logChannel.send({ embeds: [embed], components: rows });
        }

        // 2. تنظيف وإعداد روم مدير القروب
        const managerChannel = await guild.channels.fetch(MANAGER_ROOM_ID).catch(() => {});
        if (managerChannel && managerChannel.isTextBased()) {
            try {
                const fetchedManagerMsgs = await managerChannel.messages.fetch({ limit: 50 });
                for (const msg of fetchedManagerMsgs.values()) {
                    await msg.delete().catch(() => {});
                }
            } catch (e) {}

            const managerEmbed = new EmbedBuilder()
                .setTitle('🛡 لوحة إدارة القروب الخاصة')
                .setDescription('مرحباً بك يا مدير القروب. يمكنك من هنا إرسال رسائل خاصة وتوجيهات للأعضاء أو الرولات بسرعة وسهولة:')
                .setColor(0xFF0000);

            const managerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manager_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('manager_send_user_btn').setLabel('✉ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            );

            await managerChannel.send({ embeds: [managerEmbed], components: [managerRow] });
        }

        // 3. تنظيف روم الإنبوكس المطلوب (1555355545504850103) بالكامل للإطلاق الرسمي
        const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});
        if (inboxChannel && inboxChannel.isTextBased()) {
            try {
                let fetched;
                do {
                    fetched = await inboxChannel.messages.fetch({ limit: 100 });
                    if (fetched.size > 0) {
                        await inboxChannel.bulkDelete(fetched, true).catch(async () => {
                            for (const msg of fetched.values()) {
                                await msg.delete().catch(() => {});
                            }
                        });
                    }
                } while (fetched.size >= 100);
            } catch (e) {}
        }

    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// تحويل رسائل الخاص الواردة إلى روم الإنبوت
client.on('messageCreate', async message => {
    if (message.content === '!clear_inbox' && message.channel.id === INBOX_CHANNEL_ID) {
        if (message.member && message.member.permissions.has('Administrator')) {
            try {
                const fetched = await message.channel.messages.fetch({ limit: 100 });
                await message.channel.bulkDelete(fetched, true).catch(() => {});
                return;
            } catch (e) {}
        }
    }

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
    } catch (error) {}
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (botMutedMembers.has(memberId) && oldState.serverMute && !newState.serverMute) {
        if (newState.member && newState.member.voice) {
            await newState.member.voice.setMute(true).catch(() => {});
        }
    }

    if (newState.channel && SPECIAL_ROOMS[newState.channel.id]) {
        const ownerId = SPECIAL_ROOMS[newState.channel.id];
        if (memberId !== ownerId) {
            const isOwnerInside = newState.channel.members.has(ownerId);
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
                } catch (e) {}
            }
        }
    }

    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
    if (!logChannel || !logChannel.isTextBased()) return;

    if (oldState.channel && oldState.channel.members.size === 0) {
        if (voiceControlMessages.has(oldState.channel.id)) {
            try {
                const msg = await logChannel.messages.fetch(voiceControlMessages.get(oldState.channel.id));
                if (msg) await msg.delete();
            } catch (e) {}
            voiceControlMessages.delete(oldState.channel.id);
        }
    }

    if (newState.channel && newState.channel.members.size > 0) {
        const vc = newState.channel;
        if (!voiceControlMessages.has(vc.id)) {
            const embed = new EmbedBuilder()
                .setTitle(`🎛️ خيارات الروم الصوتي: ${vc.name}`)
                .setDescription(`تم دخول أعضاء إلى هذا الروم. استخدم الأزرار أدناه لكتم أو فك الكتم عن أعضاء الروم:`)
                .setColor(0x2f3136)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mute_room_${vc.id}`).setLabel('🔇 كتم أعضاء الروم').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`unmute_room_${vc.id}`).setLabel('🔊 فك الكتم').setStyle(ButtonStyle.Success)
            );

            try {
                const sentMsg = await logChannel.send({ embeds: [embed], components: [row] });
                voiceControlMessages.set(vc.id, sentMsg.id);
            } catch (err) {}
        }
    }
});

// التعامل مع الأزرار ونوافذ إدخال الآيدي المباشرة والمضمونة 100%
client.on('interactionCreate', async interaction => {
    try {
        const guild = interaction.guild;
        if (!guild) return;

        if (interaction.isButton()) {
            const customId = interaction.customId;

            // 1. زر إرسال رول (إدارة السيرفر) -> يفتح نافذة تطلب آيدي الرول ونص الرسالة
            if (customId === 'global_send_role_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_id_role_admin')
                    .setTitle('إرسال رسالة لرول معين (بالآيدي)');

                const idInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('أدخل أو الصق آيدي الرول (Role ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق الآيدي هنا مباشرة...')
                    .setRequired(true);

                const msgInput = new TextInputBuilder()
                    .setCustomId('target_msg')
                    .setLabel('محتوى الرسالة:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب رسالتك هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            // 2. زر إرسال لعضو (إدارة السيرفر) -> يفتح نافذة تطلب آيدي العضو ونص الرسالة
            if (customId === 'global_send_user_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_id_user_admin')
                    .setTitle('إرسال رسالة لعضو معين (بالآيدي)');

                const idInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('أدخل أو الصق آيدي العضو (User ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق الآيدي هنا مباشرة...')
                    .setRequired(true);

                const msgInput = new TextInputBuilder()
                    .setCustomId('target_msg')
                    .setLabel('محتوى الرسالة الشخصية:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب رسالتك هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            // 3. زر إرسال رول (مدير القروب)
            if (customId === 'manager_send_role_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_id_role_manager')
                    .setTitle('إرسال رسالة لرول (مدير القروب)');

                const idInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('أدخل أو الصق آيدي الرول (Role ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق الآيدي هنا مباشرة...')
                    .setRequired(true);

                const msgInput = new TextInputBuilder()
                    .setCustomId('target_msg')
                    .setLabel('محتوى الرسالة:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب رسالتك هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            // 4. زر إرسال لعضو (مدير القروب)
            if (customId === 'manager_send_user_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_id_user_manager')
                    .setTitle('إرسال رسالة لعضو (مدير القروب)');

                const idInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('أدخل أو الصق آيدي العضو (User ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق الآيدي هنا مباشرة...')
                    .setRequired(true);

                const msgInput = new TextInputBuilder()
                    .setCustomId('target_msg')
                    .setLabel('محتوى الرسالة الشخصية:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب رسالتك هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
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

        // استقبال الآيدي والرسالة وإرسالها مباشرة
        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;

            if (customId === 'modal_id_role_admin' || customId === 'modal_id_role_manager') {
                const isManager = customId.includes('manager');
                const roleId = interaction.fields.getTextInputValue('target_id').trim();
                const messageText = interaction.fields.getTextInputValue('target_msg');

                await interaction.deferReply({ ephemeral: true });

                const targetRole = await guild.roles.fetch(roleId).catch(() => null);
                if (!targetRole) {
                    return interaction.editReply('❌ عذراً، لم يتم العثور على رول بهذا الآيدي. تأكد من صحة الآيدي المُلصق.');
                }

                const embedTitle = isManager ? 'توجيه من مدير القروب 📨' : 'توجيه من إدارة السيرفر 📨';
                const embedColor = isManager ? 0xFF0000 : 0x5865F2;

                const roleEmbed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setDescription(messageText)
                    .setColor(embedColor)
                    .setTimestamp()
                    .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                let successCount = 0;
                const membersWithRole = targetRole.members.filter(m => !m.user.bot);

                for (const [memberId, member] of membersWithRole) {
                    try {
                        await member.send({ embeds: [roleEmbed] });
                        successCount++;
                    } catch (err) {}
                }

                return interaction.editReply(`✅ تم الإرسال بنجاح إلى **${successCount}** عضو يحملون رول **${targetRole.name}**!`);
            }

            if (customId === 'modal_id_user_admin' || customId === 'modal_id_user_manager') {
                const isManager = customId.includes('manager');
                const userId = interaction.fields.getTextInputValue('target_id').trim();
                const messageText = interaction.fields.getTextInputValue('target_msg');

                await interaction.deferReply({ ephemeral: true });

                try {
                    const targetMember = await guild.members.fetch(userId).catch(() => null);
                    if (!targetMember) {
                        return interaction.editReply('❌ عذراً، لم يتم العثور على عضو بهذا الآيدي في السيرفر.');
                    }

                    const embedTitle = isManager ? 'توجيه من مدير القروب 📨' : 'توجيه من إدارة السيرفر 📨';
                    const embedColor = isManager ? 0xFF0000 : 0xFEE75C;

                    const userEmbed = new EmbedBuilder()
                        .setTitle(embedTitle)
                        .setDescription(messageText)
                        .setColor(embedColor)
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
                                { name: '🛡️ الإداري المرسل', value: `${interaction.user}`, inline: true },
                                { name: '📌 المصدر', value: embedTitle, inline: true }
                            )
                            .setColor(0x57F287)
                            .setTimestamp();
                        await inboxChannel.send({ embeds: [copyEmbed] });
                    }

                    return interaction.editReply(`✅ تمت إرسال الرسالة الشخصية بنجاح إلى العضو **${targetMember.user.tag}** وتم توثيقها!`);
                } catch (err) {
                    return interaction.editReply('❌ فشل إرسال الرسالة الخاصة لهذا العضو (قد يكون مقفل الخاص).');
                }
            }
            return;
        }
    } catch (error) {
        console.error('خطأ في التفاعل:', error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة هذا الطلب.', ephemeral: true }).catch(() => {});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
