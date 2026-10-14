const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running 24/7!');
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
const MANAGER_ROOM_ID = '1555573365748531251';
const DEPUTY_ROOM_ID = '1555941998819811439';

// رومات الانتخابات والقضاة الجديدة
const PUBLIC_VOTE_ROOM = '1559895002769920010';
const ADMIN_VOTE_ROOM = '1559895171938652290';

// تخزين المرشحين والأصوات (Memory Storage)
const candidatesList = []; // يحفظ { name, userId, votes: Set }
const userVotedSet = new Set(); // أعضاء صوتوا مسبقاً

// جدول الرومات الخاصة وأصحابها
const SPECIAL_ROOMS = {
    '1329454808553357312': '890351885339480115',
    '1555941900773498951': '1200448943365034036',
    '1431905620230930473': '1218664301729026254',
    '1511922936297160834': '713105913334071358',
    '1527063216860172429': '1173308991619743865'
};

const voiceControlMessages = new Map();

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

        // 1. لوحة التحكم الرئيسية
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => {});
        if (logChannel && logChannel.isTextBased()) {
            await cleanBotMessages(logChannel);
            const embed = new EmbedBuilder()
                .setTitle('⚖️ لوحة التحكم الإدارية الرسمية')
                .setDescription('مرحباً بك في لوحة تحكم السيرفر الرسمية.\nاستخدم الأزرار أدناه للإرسال الموجه والتوجيهات الرسمية:')
                .setColor(0x2f3136);

            const rows = [];
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('global_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('global_send_user_btn').setLabel('✉️ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            ));

            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('send_to_server_channel_btn').setLabel('📂 إرسال رسالة لروم في السيرفر').setStyle(ButtonStyle.Success)
            ));

            await logChannel.send({ embeds: [embed], components: rows });
        }

        // 2. روم المسؤولين للانتخابات
        const adminVoteChan = await guild.channels.fetch(ADMIN_VOTE_ROOM).catch(() => {});
        if (adminVoteChan && adminVoteChan.isTextBased()) {
            await cleanBotMessages(adminVoteChan);
            const adminEmbed = new EmbedBuilder()
                .setTitle('⚖️ وزارة العدل - لوحة إدارة المترشحين (خاص للمسؤولين)')
                .setDescription('مرحباً بك في غرفة تحكم المسؤولين للانتخابات القضائية.\nيمكنك من هنا إضافة المتقدمين لمنصب القضاة ومتابعة عدد الأصوات السري لكل مرشح:')
                .setColor(0x111111)
                .setFooter({ text: 'وزارة العدل - قسم شؤون القضاء' });

            const adminRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('add_candidate_modal_btn').setLabel('➕ إضافة مرشح جديد للقضاة').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('view_votes_results_btn').setLabel('📊 عرض الأصوات والنتائج (سرية)').setStyle(ButtonStyle.Secondary)
            );

            await adminVoteChan.send({ embeds: [adminEmbed], components: [adminRow] });
        }

        // 3. روم العلَن للانتخابات (التصويت للناس)
        const publicVoteChan = await guild.channels.fetch(PUBLIC_VOTE_ROOM).catch(() => {});
        if (publicVoteChan && publicVoteChan.isTextBased()) {
            await cleanBotMessages(publicVoteChan);
            const publicEmbed = new EmbedBuilder()
                .setTitle('⚖️ وزارة العدل - انتخابات القضاة الرسمية')
                .setDescription('المواطنين الكرام، انطلاقاً من تعزيز العدالة وشفافية الاختيار، تم فتح باب التصويت لاختيار قاضي جديد.\nيرجى الاطلاع على المرشحين أدناه والإدلاء بصوتكم بكل نزاهة (يحق لك التصويت مرة واحدة فقط ولا يمكنك التصويت لنفسك):')
                .setColor(0xC9B037)
                .setFooter({ text: 'وزارة العدل - الانتخابات القضائية' });

            const voteRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_voting_booth_btn').setLabel('🗳️ اضغط هنا للمشاركة والتصويت').setStyle(ButtonStyle.Primary)
            );

            await publicVoteChan.send({ embeds: [publicEmbed], components: [voteRow] });
        }

        // لوحة إدارة القروب
        const managerChannel = await guild.channels.fetch(MANAGER_ROOM_ID).catch(() => {});
        if (managerChannel && managerChannel.isTextBased()) {
            await cleanBotMessages(managerChannel);
            const managerEmbed = new EmbedBuilder()
                .setTitle('🛡️ لوحة إدارة القروب الرسمية')
                .setDescription('مرحباً بك يا مدير القروب. يمكنك من هنا إرسال التوجيهات الرسمية المعتمدة للأعضاء أو الرولات:')
                .setColor(0xFF0000);

            const managerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manager_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('manager_send_user_btn').setLabel('✉️ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            );

            await managerChannel.send({ embeds: [managerEmbed], components: [managerRow] });
        }

        // لوحة نائب المدير
        const deputyChannel = await guild.channels.fetch(DEPUTY_ROOM_ID).catch(() => {});
        if (deputyChannel && deputyChannel.isTextBased()) {
            await cleanBotMessages(deputyChannel);
            const deputyEmbed = new EmbedBuilder()
                .setTitle('🛡️ لوحة إدارة نائب المدير الرسمية')
                .setDescription('مرحباً بك يا نائب المدير. يمكنك من هنا إرسال التوجيهات والإشعارات الرسمية للأعضاء أو الرولات:')
                .setColor(0x3498DB);

            const deputyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('deputy_send_role_btn').setLabel('📢 إرسال رسالة لرول معين').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('deputy_send_user_btn').setLabel('✉️ إرسال رسالة لعضو معين').setStyle(ButtonStyle.Secondary)
            );

            await deputyChannel.send({ embeds: [deputyEmbed], components: [deputyRow] });
        }
    } catch (error) {
        console.error('خطأ عند بدء البوت:', error);
    }
});

// التعامل مع الدخول للرومات الصوتية والتنبيهات
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    if (guild.id !== GUILD_ID) return;

    const memberId = newState.id;

    if (newState.channel && SPECIAL_ROOMS[newState.channel.id]) {
        const ownerId = SPECIAL_ROOMS[newState.channel.id];
        if (memberId !== ownerId) {
            const isOwnerInside = newState.channel.members.has(ownerId);
            if (!isOwnerInside) {
                try {
                    const ownerMember = await guild.members.fetch(ownerId).catch(() => null);
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

client.on('messageCreate', async message => {
    const guild = message.guild;
    if (!guild) return;

    if (!message.guild && !message.author.bot) {
        try {
            const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});
            if (!inboxChannel || !inboxChannel.isTextBased()) return;

            const dmEmbed = new EmbedBuilder()
                .setTitle('📥 رسالة جديدة من عضو بالخاص')
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setDescription(message.content || '[رسالة تحتوي على مرفق أو صورة]')
                .addFields(
                    { name: '👤 اسم العضو', value: `${message.author} (\`${message.author.tag}\`)`, inline: true },
                    { name: '🆔 الآيدي', value: `\`${message.author.id}\``, inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reply_user_modal_admin_${message.author.id}`)
                    .setLabel('💬 الرد على العضو (إداري)')
                    .setStyle(ButtonStyle.Primary)
            );

            await inboxChannel.send({ embeds: [dmEmbed], components: [row] });
        } catch (err) {}
    }
});

client.on('interactionCreate', async interaction => {
    try {
        const guild = interaction.guild;
        if (!guild) return;

        const inboxChannel = await guild.channels.fetch(INBOX_CHANNEL_ID).catch(() => {});

        const getSenderInfo = (int) => {
            if (int.channelId === MANAGER_ROOM_ID || int.customId.includes('manager')) {
                return { title: 'توجيه رسمي من مدير القروب', label: 'مدير القروب' };
            }
            if (int.channelId === DEPUTY_ROOM_ID || int.customId.includes('deputy')) {
                return { title: 'توجيه رسمي من نائب المدير', label: 'نائب المدير' };
            }
            return { title: `توجيه رسمي من الإدارة (${int.user.username})`, label: 'إداري عام' };
        };

        if (interaction.isButton()) {
            const customId = interaction.customId;

            // فتح مودال إضافة مرشح للمسؤولين
            if (customId === 'add_candidate_modal_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_add_candidate')
                    .setTitle('وزارة العدل - إضافة مرشح قاضي جديد');

                const nameInput = new TextInputBuilder()
                    .setCustomId('cand_name')
                    .setLabel('الاسم الأساسي للمرشح:')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: القاضي فلان أو اسم المتقدم...')
                    .setRequired(true);

                const idInput = new TextInputBuilder()
                    .setCustomId('cand_user_id')
                    .setLabel('آيدي حساب ديسكورد للمرشح (User ID):')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ألصق آيدي العضو هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(idInput));
                return await interaction.showModal(modal);
            }

            // عرض النتائج للمسؤولين فقط (سرية ولا تظهر للعامة)
            if (customId === 'view_votes_results_btn') {
                if (candidatesList.length === 0) {
                    return await interaction.reply({ content: '⚠️ لا يوجد أي مرشحين مضافين حتى الآن في النظام.', ephemeral: true });
                }

                let resultsDesc = '📊 **إحصائيات الأصوات الحالية (خاص بالمسؤولين):**\n\n';
                candidatesList.forEach((c, index) => {
                    resultsDesc += `**${index + 1}. المرشح:** ${c.name} (<@${c.userId}>)\n📌 **عدد الأصوات:** \`${c.votes.size} صوت\`\n----------------------------------\n`;
                });

                const resEmbed = new EmbedBuilder()
                    .setTitle('⚖️ وزارة العدل - نتائج الأصوات السرية')
                    .setDescription(resultsDesc)
                    .setColor(0xC9B037)
                    .setTimestamp();

                return await interaction.reply({ embeds: [resEmbed], ephemeral: true });
            }

            // فتح قائمة التصويت للعامة في روم العلَن
            if (customId === 'open_voting_booth_btn') {
                if (userVotedSet.has(interaction.user.id)) {
                    return await interaction.reply({ content: '❌ عذراً، لقد قمت بالتصويت مسبقاً ولا يمكنك التصويت مرتين!', ephemeral: true });
                }

                if (candidatesList.length === 0) {
                    return await interaction.reply({ content: '⚠️ لم يتم اعتماد أي مرشحين للانتخابات حتى الآن من قبل المسؤولين.', ephemeral: true });
                }

                const options = candidatesList.map(c => ({
                    label: c.name.slice(0, 100),
                    description: `تصويت لصالح المرشح المعتمد`.slice(0, 100),
                    value: `vote_for_${c.userId}`
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('public_vote_select_menu')
                    .setPlaceholder('🗳️ اختر المرشح الذي تود انتخابه...')
                    .addOptions(options.slice(0, 25));

                return await interaction.reply({
                    content: '👇 اختر من القائمة أدناه مرشحك المناسب لمنصب القاضي:',
                    components: [new ActionRowBuilder().addComponents(selectMenu)],
                    ephemeral: true
                });
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
                        promises.push(member.voice.setMute(shouldMute).catch(() => {}));
                    }
                });

                await Promise.all(promises);
                return;
            }

            if (customId === 'send_to_server_channel_btn') {
                const channelSelect = new ChannelSelectMenuBuilder()
                    .setCustomId('direct_channel_select')
                    .setPlaceholder('📂 ابحث عن الروم بالاسم...')
                    .addChannelTypes(ChannelType.GuildText)
                    .setMinValues(1)
                    .setMaxValues(1);

                const manualButton = new ButtonBuilder()
                    .setCustomId('manual_channel_btn')
                    .setLabel('إذا لم تجد الروم اضغط هنا (بالآيدي)')
                    .setStyle(ButtonStyle.Secondary);

                return await interaction.reply({ 
                    content: '👇 اختر الروم من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [new ActionRowBuilder().addComponents(channelSelect), new ActionRowBuilder().addComponents(manualButton)], 
                    ephemeral: true 
                });
            }

            if (customId === 'manual_channel_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_id_channel')
                    .setTitle('إرسال رسالة لروم (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder().setCustomId('target_id').setLabel('آيدي الروم (Channel ID):').setStyle(TextInputStyle.Short).setRequired(true);
                const msgInput = new TextInputBuilder().setCustomId('target_msg').setLabel('محتوى الرسالة الرسمية:').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            if (customId.startsWith('reply_user_modal_')) {
                const parts = customId.split('_');
                const userId = parts[parts.length - 1];
                let suffix = 'admin';
                if (interaction.channelId === MANAGER_ROOM_ID) suffix = 'manager';
                if (interaction.channelId === DEPUTY_ROOM_ID) suffix = 'deputy';

                const modal = new ModalBuilder()
                    .setCustomId(`modal_direct_reply_${suffix}_${userId}`)
                    .setTitle('الرد الرسمي المباشر على العضو');

                const msgInput = new TextInputBuilder()
                    .setCustomId('reply_text')
                    .setLabel('محتوى الرد:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('اكتب ردك هنا...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
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

                return await interaction.reply({ 
                    content: '👇 اختر الرول من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [new ActionRowBuilder().addComponents(roleSelect), new ActionRowBuilder().addComponents(manualButton)], 
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

                return await interaction.reply({ 
                    content: '👇 اختر العضو من القائمة، أو اضغط الزر الأسفل للإدخال اليدوي بالآيدي:', 
                    components: [new ActionRowBuilder().addComponents(userSelect), new ActionRowBuilder().addComponents(manualButton)], 
                    ephemeral: true 
                });
            }

            if (customId.startsWith('manual_role_btn_')) {
                const suffix = customId.replace('manual_role_btn_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_role_${suffix}`)
                    .setTitle('إرسال رسالة لرول (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder().setCustomId('target_id').setLabel('آيدي الرول (Role ID):').setStyle(TextInputStyle.Short).setRequired(true);
                const msgInput = new TextInputBuilder().setCustomId('target_msg').setLabel('محتوى الرسالة الرسمية:').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }

            if (customId.startsWith('manual_user_btn_')) {
                const suffix = customId.replace('manual_user_btn_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_id_user_${suffix}`)
                    .setTitle('إرسال رسالة لعضو (بالآيدي اليدوي)');

                const idInput = new TextInputBuilder().setCustomId('target_id').setLabel('آيدي العضو (User ID):').setStyle(TextInputStyle.Short).setRequired(true);
                const msgInput = new TextInputBuilder().setCustomId('target_msg').setLabel('محتوى الرسالة الرسمية:').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(msgInput));
                return await interaction.showModal(modal);
            }
        }

        if (interaction.isStringSelectMenu()) {
            // معالجة اختيار التصويت في روم العلَن
            if (interaction.customId === 'public_vote_select_menu') {
                if (userVotedSet.has(interaction.user.id)) {
                    return await interaction.reply({ content: '❌ عذراً، لقد قمت بالتصويت مسبقاً!', ephemeral: true });
                }

                const selectedVal = interaction.values[0];
                const targetUserId = selectedVal.replace('vote_for_', '');

                // منع العضو من التصويت لنفسه
                if (interaction.user.id === targetUserId) {
                    return await interaction.reply({ content: '❌ لا يمكنك التصويت لنفسك في الانتخابات!', ephemeral: true });
                }

                const candidate = candidatesList.find(c => c.userId === targetUserId);
                if (!candidate) {
                    return await interaction.reply({ content: '❌ عذراً، هذا المرشح لم يعد موجوداً في القائمة.', ephemeral: true });
                }

                // تسجيل الصوت
                candidate.votes.add(interaction.user.id);
                userVotedSet.add(interaction.user.id);

                return await interaction.reply({
                    content: `✅ **تم اعتماد صوتك بنجاح لصالح المرشح:** ${candidate.name} (<@${candidate.userId}>).\nشكراً لمشاركتك في العملية الانتخابية لوزارة العدل.`,
                    ephemeral: true
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

                const channel = await guild.
