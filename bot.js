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
const MANAGER_ROOM_ID = '1555573365748531251'; // روم مدير القروب

// روم نائب المدير وشخصيته
const DEPUTY_ROOM_ID = '1555941998819811439';
const DEPUTY_USER_ID = '1200448943365034036';
const DEPUTY_VOICE_ID = '1555941900773498951';

// جدول الرومات الخاصة وأصحابها
const SPECIAL_ROOMS = {
    '1431905620230930473': '1218664301729026254',
    '1329454808553357312': '890351885339480115',
    '1511922936297160834': '713105913334071358',
    '1527063216860172429': '1173308991619743865',
    [DEPUTY_VOICE_ID]: DEPUTY_USER_ID
};

const botMutedMembers = new Set();
const voiceControlMessages = new Map();

// تخزين معلومات الشات الفعّال لكل ثريد
const activeThreads = new Map();
// لتخزين سجل المحادثات لكل عضو
const userChatHistories = new Map();

// إرسال اللوحات عند التشغيل
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);

        const cleanBotMessages = async (channel) => {
            if (!channel || !channel.isTextBased()) return;
            try {
                const fetched = await channel.messages.fetch({ limit: 50 });
                const botMsgs = fetched.filter(m => m.author.id === client.user.id);
                if (botMsgs.size > 0) {
                    await channel.bulkDelete(botMsgs, true).catch(async () => {
                        for (const [id, msg] of botMsgs) {
                            await msg.delete().catch(() => {});
                        }
                    });
                }
            } catch (e) {}
        };

        // 1. روم السجلات الرئيسي
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
        if (logChannel && logChannel.isTextBased()) {
            await cleanBotMessages(logChannel);

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

            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('change_bot_avatar_btn').setLabel('تغيير صورة البوت').setStyle(ButtonStyle.Success)
            ));

            await logChannel.send({ embeds: [embed], components: rows });
        }

        // 2. روم مدير القروب
        const managerChannel = await guild.channels.fetch(MANAGER_ROOM_ID).catch(() => {});
        if (managerChannel && managerChannel.isTextBased()) {
            await cleanBotMessages(managerChannel);

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

        // 3. روم نائب المدير الجديد
        const deputyChannel = await guild.channels.fetch(DEPUTY_ROOM_ID).catch(() => {});
        if (deputyChannel && deputyChannel.isTextBased()) {
            await cleanBotMessages(deputyChannel);

            const deputyEmbed = new EmbedBuilder()
                .setTitle('🛡️ لوحة إدارة نائب المدير')
                .setDescription('مرحباً بك يا نائب المدير. يمكنك من هنا إرسال رسائل وتوجيهات رسمية للأعضاء أو الرولات:')
                .setColor(0x3498DB);

            const deputyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('deputy_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('deputy_send_user_btn').setLabel('✉ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            );

            await deputyChannel.send({ embeds: [deputyEmbed], components: [deputyRow] });
        }

    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// التعامل مع الرسائل
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

    const guild = message.guild;
    if (!guild) return; // رسالة خاصة

    // أ) الرد داخل ثريد الشات الخاص بالعضو
    if (message.channel.isThread() && message.channel.parentId === INBOX_CHANNEL_ID) {
        if (message.author.bot) return;

        const threadId = message.channel.id;
        const session = activeThreads.get(threadId);

        if (!session) {
            return message.reply('⚠️ يرجى أولاً اختيار صفة الرد الإدارية من القائمة في أول المحادثة قبل الكتابة!').catch(() => {});
        }

        const userId = session.userId;
        const roleType = session.adminRole;
        const replyText = message.content;

        try {
            const targetMember = await guild.members.fetch(userId).catch(() => null);
            if (!targetMember) {
                return message.reply('❌ عذراً، لم يتم العثور على العضو في السيرفر.').catch(() => {});
            }

            let embedTitle = 'توجيه من إدارة السيرفر 📨';
            let embedColor = 0xFEE75C;

            if (roleType === 'manager') {
                embedTitle = 'توجيه من مدير القروب 📨';
                embedColor = 0xFF0000;
            } else if (roleType === 'deputy') {
                embedTitle = 'توجيه من نائب المدير 📨';
                embedColor = 0x3498DB;
            }

            const replyEmbed = new EmbedBuilder()
                .setTitle(embedTitle)
                .setDescription(replyText)
                .setColor(embedColor)
                .setTimestamp()
                .setFooter({ text: guild.name, iconURL: guild.iconURL() });

            await targetMember.send({ embeds: [replyEmbed] });

            if (userChatHistories.has(userId)) {
                userChatHistories.get(userId).push({ sender: 'admin', content: `[${embedTitle}]:${replyText}`, time: new Date().toLocaleTimeString() });
            }

            await message.react('✅').catch(() => {});
        } catch (err) {
            await message.react('❌').catch(() => {});
            await message.reply('❌ فشل إرسال الرد الخاص (قد يكون مقفل الخاص).').catch(() => {});
        }
        return;
    }

    // ب) رسالة جديدة واردة من خاص العضو (DM)
    if (message.author.bot) return;

    try {
        const userId = message.author.id;
        if (!userChatHistories.has(userId)) {
            userChatHistories.set(userId, []);
        }
        const history = userChatHistories.get(userId);
        history.push({ sender: 'user', content: message.content || '[مرفق]', time: new Date().toLocaleTimeString() });
        if (history.length > 20) history.shift();

        const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});
        if (!inboxChannel || !inboxChannel.isTextBased()) return;

        const dmEmbed = new EmbedBuilder()
            .setTitle('📥 رسالة جديدة من عضو بالخاص')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setDescription(message.content || '[رسالة تحتوي على مرفق أو صورة]')
            .addFields(
                { name: '👤 اسم العضو', value: `${message.author} (${message.author.tag})`, inline: true },
                { name: '🆔 الآيدي', value: `\`${message.author.id}\``, inline: true }
            )
            .setColor(0x5865F2)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`open_chat_thread_${userId}`)
                .setLabel('💬 فتح غرفة الشات والاطلاع والرد')
                .setStyle(ButtonStyle.Primary)
        );

        const sentAlertMsg = await inboxChannel.send({ embeds: [dmEmbed], components: [row] });

        // فتح ثريد تلقائي للشات
        const thread = await sentAlertMsg.startThread({
            name: `شات-${message.author.username}`.slice(0, 100),
            autoArchiveDuration: 1440,
            reason: `محادثة خاصة مع العضو ${message.author.tag}`
        });

        let chatSummary = history.map(h => `**[${h.time}] ${h.sender === 'user' ? '👤 العضو' : '🤖 الإدارة'}:** ${h.content}`).join('\n');
        if (chatSummary.length > 3900) chatSummary = chatSummary.slice(-3900);

        const threadEmbed = new EmbedBuilder()
            .setTitle(`🔍 سجل المحادثة مع: ${message.author.tag}`)
            .setDescription(chatSummary)
            .setColor(0x5865F2)
            .setFooter({ text: 'اختر الصفة بالأسفل، ثم اكتب أي رسالة هنا وستصل للعضو مباشرة بالخاص!' });

        const roleSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`set_thread_role_${userId}`)
            .setPlaceholder('🛡️ اختر صفة الرد الإدارية أولاً...')
            .addOptions([
                { label: '👑 المدير العام', value: 'manager', description: 'الرد بصفتك مدير القروب العام' },
                { label: '🛡️ نائب المدير', value: 'deputy', description: 'الرد بصفتك نائب المدير' },
                { label: '💼 إدارة السيرفر / الدعم', value: 'admin', description: 'الرد بصفتك إداري في السيرفر' }
            ]);

        const threadRow = new ActionRowBuilder().addComponents(roleSelectMenu);

        await thread.send({ embeds: [threadEmbed], components: [threadRow] });

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

// التعامل مع التفاعلات
client.on('interactionCreate', async interaction => {
    try {
        const guild = interaction.guild;
        if (!guild) return;

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId.startsWith('open_chat_thread_')) {
                return await interaction.reply({ content: `✅ تفقد الرومات الفرعية (Threads) المفتوحة في أعلى روم الإنبوت!`, ephemeral: true });
            }

            if (customId === 'change_bot_avatar_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_change_avatar')
                    .setTitle('تغيير صورة البوت (القياسات المناسبة)');

                const infoInput = new TextInputBuilder()
                    .setCustomId('avatar_info_note')
                    .setLabel('القياسات الموصى بها: 512×512 بيكسل (مربع)')
                    .setStyle(TextInputStyle.Short)
                    .setValue('ارفع صورتك بأي روم وخذ Copy Link للرابط المباشر وضعه بالأسفل 👇')
                    .setRequired(false);

                const urlInput = new TextInputBuilder()
                    .setCustomId('avatar_url')
                    .setLabel('رابط الصورة المباشر (Image URL):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق رابط الصورة هنا...')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(infoInput),
                    new ActionRowBuilder().addComponents(urlInput)
                );
                return await interaction.showModal(modal);
            }

            if (customId === 'global_send_role_btn' || customId === 'manager_send_role_btn' || customId === 'deputy_send_role_btn') {
                let suffix = 'admin';
                if (customId.includes('manager')) suffix = 'manager';
                if (customId.includes('deputy')) suffix = 'deputy';

                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId(`direct_role_select_${suffix}`)
                    .setPlaceholder('🎯 ابحث عن الرول بالاسم...')
                    .setMinValues(1)
                    .setMaxValues(1);

                const manualButton = new ButtonBuilder()
                    .setCustomId(`manual_role_btn_${suffix}`)
                    .setLabel('إذا لم تجد الرول اضغط هنا (بالآيدي)')
                    .setStyle(ButtonStyle.Secondary);

                const row1 = new ActionRowBuilder().addComponents(roleSelect);
                const row2 = new ActionRowBuilder().addComponents(manualButton);

                return await interaction.reply({ 
                    content: '👇 اختر الرول من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [row1, row2], 
                    ephemeral: true 
                });
            }

            if (customId === 'global_send_user_btn' || customId === 'manager_send_user_btn' || customId === 'deputy_send_user_btn') {
                let suffix = 'admin';
                if (customId.includes('manager')) suffix = 'manager';
                if (customId.includes('deputy')) suffix = 'deputy';

                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`direct_user_select_${suffix}`)
                    .setPlaceholder('👤 ابحث عن العضو بالاسم...')
                    .setMinValues(1)
                    .setMaxValues(1);

                const manualButton = new ButtonBuilder()
                    .setCustomId(`manual_user_btn_${suffix}`)
                    .setLabel('إذا لم تجد العضو اضغط هنا (بالآيدي)')
                    .setStyle(ButtonStyle.Secondary);

                const row1 = new ActionRowBuilder().addComponents(userSelect);
                const row2 = new ActionRowBuilder().addComponents(manualButton);

                return await interaction.reply({ 
                    content: '👇 اختر العضو من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [row1, row2], 
                    ephemeral: true 
                });
            }

            if (customId.startsWith('manual_role_btn_')) {
                const suffix = customId.replace('manual_role_btn_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_role_${suffix}`)
                    .setTitle('إرسال رسالة لرول (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('أدخل أو الصق آيدي الرول (Role ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق الآيدي هنا...')
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

            if (customId.startsWith('manual_user_btn_')) {
                const suffix = customId.replace('manual_user_btn_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_user_${suffix}`)
                    .setTitle('إرسال رسالة لعضو (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder()
                    .setCustomId('target_id')
                    .setLabel('أدخل أو الصق آيدي العضو (User ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق الآيدي هنا...')
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

        if (interaction.isRoleSelectMenu()) {
            let suffix = 'admin';
            if (interaction.customId.includes('_manager')) suffix = 'manager';
            if (interaction.customId.includes('_deputy')) suffix = 'deputy';

            const selectedRoleId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`modal_role_msg_${suffix}_${selectedRoleId}`)
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

        if (interaction.isUserSelectMenu()) {
            let suffix = 'admin';
            if (interaction.customId.includes('_manager')) suffix = 'manager';
            if (interaction.customId.includes('_deputy')) suffix = 'deputy';

            const selectedUserId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`modal_user_msg_${suffix}_${selectedUserId}`)
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

        if (interaction.isStringSelectMenu()) {
            // اختيار الصفة داخل ثريد الشات
            if (interaction.customId.startsWith('set_thread_role_')) {
                const userId = interaction.customId.replace('set_thread_role_', '');
                const roleType = interaction.values[0];
                const threadId = interaction.channelId;

                activeThreads.set(threadId, { userId, adminRole: roleType });

                let roleNameDesc = 'إدارة السيرفر';
                if (roleType === 'manager') roleNameDesc = 'المدير العام';
                if (roleType === 'deputy') roleNameDesc = 'نائب المدير';

                return await interaction.update({
                    content: `✅ تم تعيين صفة الرد الحالية في هذا الروم إلى: **[${roleNameDesc}]**.\n✍️ **الآن:** اكتب أي رسالة في الشات وسوف تُرسل للعضو مباشرة!`,
                    components: []
                });
            }

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
            const customId = interaction.customId;

            if (customId === 'modal_change_avatar') {
                const avatarUrl = interaction.fields.getTextInputValue('avatar_url').trim();
                await interaction.deferReply({ ephemeral: true });

                try {
                    await client.user.setAvatar(avatarUrl);
                    return interaction.editReply('✅ تم تغيير صورة البوت الشخصية بنجاح!');
                } catch (err) {
                    return interaction.editReply('❌ فشل تغيير الصورة. تأكد من صحة الرابط المباشر وألا تتجاوز الحد المسموح من ديسكورد.');
                }
            }

            if (customId.startsWith('modal_role_msg_') || customId.startsWith('modal_id_role_')) {
                let type, roleId, messageText;

                if (customId.startsWith('modal_role_msg_')) {
                    const parts = customId.split('_');
                    type = parts[3];
                    roleId = parts[4];
                    messageText = interaction.fields.getTextInputValue('role_message_text');
                } else {
                    const parts = customId.split('_');
                    type = parts[3];
                    roleId = interaction.fields.getTextInputValue('target_id').trim();
                    messageText = interaction.fields.getTextInputValue('target_msg');
                }

                await interaction.deferReply({ ephemeral: true });

                const targetRole = await guild.roles.fetch(roleId).catch(() => null);
                if (!targetRole) {
                    return interaction.editReply('❌ عذراً، لم يتم العثور على رول بهذا الآيدي.');
                }

                let embedTitle = 'توجيه من إدارة السيرفر 📨';
                let embedColor = 0x5865F2;

                if (type === 'manager') {
                    embedTitle = 'توجيه من مدير القروب 📨';
                    embedColor = 0xFF0000;
                } else if (type === 'deputy') {
                    embedTitle = 'توجيه من نائب المدير 📨';
                    embedColor = 0x3498DB;
                }

                const roleEmbed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setDescription(messageText)
                    .setColor(embedColor)
                    .setTimestamp()
                    .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                let successCount = 0;
                const membersWithRole = Array.from(targetRole.members.filter(m => !m.user.bot).values());

                // إرسال الرسائل مع مهلة (Delay) لضمان وصولها لكل الأعضاء بدون سبام ديسكورد
                for (const member of membersWithRole) {
                    try {
                        await member.send({ embeds: [roleEmbed] });
                        successCount++;
                        await new Promise(resolve => setTimeout(resolve, 500)); // تأخير نصف ثانية بين كل عضو
                    } catch (err) {}
                }

                return interaction.editReply(`✅ تم الإرسال بنجاح إلى **${successCount}** من أصل **${membersWithRole.length}** عضو يحملون رول **${targetRole.name}**!`);
            }

            if (customId.startsWith('modal_user_msg_') || customId.startsWith('modal_id_user_')) {
                let type, userId, messageText;

                if (customId.startsWith('modal_user_msg_')) {
                    const parts = customId.split('_');
                    type = parts[3];
                    userId = parts[4];
                    messageText = interaction.fields.getTextInputValue('user_message_text');
                } else {
                    const parts = customId.split('_');
                    type = parts[3];
                    userId = interaction.fields.getTextInputValue('target_id').trim();
                    messageText = interaction.fields.getTextInputValue('target_msg');
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    const targetMember = await guild.members.fetch(userId).catch(() => null);
                    if (!targetMember) {
                        return interaction.editReply('❌ عذراً، لم يتم العثور على هذا العضو في السيرفر بهذا الآيدي.');
                    }

                    let embedTitle = 'توجيه من إدارة السيرفر 📨';
                    let embedColor = 0xFEE75C;

                    if (type === 'manager') {
                        embedTitle = 'توجيه من مدير القروب 📨';
                        embedColor = 0xFF0000;
                    } else if (type === 'deputy') {
                        embedTitle = 'توجيه من نائب المدير 📨';
                        embedColor = 0x3498DB;
                    }

                    const userEmbed = new EmbedBuilder()
                        .setTitle(embedTitle)
                        .setDescription(messageText)
                        .setColor(embedColor)
                        .setTimestamp()
                        .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                    await targetMember.send({ embeds: [userEmbed] });

                    return interaction.editReply(`✅ تمت إرسال الرسالة الشخصية بنجاح إلى العضو **${targetMember.user.tag}**!`);
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
