const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ["websocket", "polling"]
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const profiles = new Map();
const DISCONNECT_GRACE_MS = 2 * 60 * 1000;
const NOMINATION_TIME_MS = 60 * 1000;

const ROLE = {
    CONSTITUTIONALIST: "constitutionalist",
    QAJAR: "qajar",
    NASER: "naser"
};

const GIFT_CODES = new Map([
    ["QAJAR100", 100],
    ["DARBAR250", 250],
    ["NASSER500", 500],
    ["SHADOW777", 777],
    ["GOLESTAN1000", 1000]
]);

function createToken() {
    return crypto.randomUUID();
}

function createRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function makePolicyDeck() {
    return shuffle([
        ...Array(6).fill("constitutional"),
        ...Array(11).fill("qajar")
    ]);
}

function ensureDeck(room, needed = 3) {
    if (room.policyDeck.length >= needed) return;

    if (room.policyDiscard.length) {
        room.policyDeck = shuffle([
            ...room.policyDeck,
            ...room.policyDiscard
        ]);
        room.policyDiscard = [];
    }

    if (room.policyDeck.length < needed) {
        room.policyDeck = shuffle([
            ...room.policyDeck,
            ...makePolicyDeck()
        ]);
    }
}

function getProfile(token) {
    if (!profiles.has(token)) {
        profiles.set(token, {
            coins: 0,
            avatars: ["default"],
            usedGiftCodes: []
        });
    }
    return profiles.get(token);
}

function addMessage(room, type, name, text) {
    room.messages.push({ type, name, text });
    if (room.messages.length > 100) room.messages.shift();
}

function getPublicPlayers(room) {
    return room.players.map((p) => ({
        id: p.id,
        name: p.name,
        host: p.host,
        connected: p.connected !== false,
        avatar: p.avatar || "default"
    }));
}

function getPresident(room) {
    return room.players[room.presidentIndex] || null;
}

function getNominee(room) {
    return room.players.find((p) => p.id === room.nominatedChancellorId) || null;
}

function getPhaseText(phase) {
    return {
        nomination: "انتخاب وزیر",
        vote: "رأی‌گیری",
        president_discard: "صدر یک کارت را کنار می‌گذارد",
        minister_enact: "وزیر از دو کارت یکی را تصویب می‌کند",
        finished: "بازی تمام شد"
    }[phase] || phase;
}

function buildPublicGameState(room) {
    const president = getPresident(room);
    const nominee = getNominee(room);

    return {
        roomCode: room.code,
        phase: room.phase,
        phaseText: getPhaseText(room.phase),
        players: getPublicPlayers(room),
        president: president ? { id: president.id, name: president.name } : null,
        nominee: nominee ? { id: nominee.id, name: nominee.name } : null,
        constitutionalPolicies: room.constitutionalPolicies,
        qajarPolicies: room.qajarPolicies,
        electionFailed: room.electionFailed,
        lastResult: room.lastResult,
        winner: room.winner,
        policyDeckCount: room.policyDeck.length,
        nominationEndsAt: room.nominationEndsAt || null,
        ministerCardCount: room.ministerHand.length
    };
}

function sendGameState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const base = buildPublicGameState(room);
    const president = getPresident(room);

    room.players.forEach((player) => {
        if (!player.id) return;
        io.to(player.id).emit("gameState", {
            ...base,
            youArePresident: president?.token === player.token,
            youAreNominee: room.nominatedChancellorId === player.token,
            youVoted: Boolean(room.votes[player.token])
        });
    });
}

function sendProfile(socket, token) {
    const profile = getProfile(token);
    socket.emit("profileState", {
        coins: profile.coins,
        avatars: profile.avatars,
        giftCodesLeft: [...GIFT_CODES.keys()].filter((code) => !profile.usedGiftCodes.includes(code))
    });
}

function assignRoles(room) {
    const count = room.players.length;
    const qajarCount = count <= 6 ? 2 : 3;
    const roles = [ROLE.NASER];
    for (let i = 1; i < qajarCount; i++) roles.push(ROLE.QAJAR);
    while (roles.length < count) roles.push(ROLE.CONSTITUTIONALIST);

    shuffle(room.players).forEach((player, index) => {
        player.role = roles[index];
    });
}

function sendPrivateRoles(room) {
    const qajarPlayers = room.players.filter(
        (p) => p.role === ROLE.QAJAR || p.role === ROLE.NASER
    );

    room.players.forEach((player) => {
        if (!player.id) return;

        const allies = (player.role === ROLE.QAJAR || player.role === ROLE.NASER)
            ? qajarPlayers
                .filter((ally) => ally.token !== player.token)
                .map((ally) => ({
                    name: ally.name,
                    role: ally.role === ROLE.NASER ? "ناصرالدین شاه" : "قاجاری"
                }))
            : [];

        io.to(player.id).emit("roleAssigned", {
            role: player.role,
            allies
        });

        const roleText = player.role === ROLE.NASER
            ? "نقش شما ناصرالدین شاه است."
            : player.role === ROLE.QAJAR
                ? "نقش شما قاجاری است."
                : "نقش شما مشروطه‌خواه است.";

        io.to(player.id).emit("narrator", {
            text: `راوی دربار: ${roleText}`
        });
    });
}

function clearNominationTimer(room) {
    if (room.nominationTimer) {
        clearTimeout(room.nominationTimer);
        room.nominationTimer = null;
    }
}

function startNominationTimer(room) {
    clearNominationTimer(room);
    room.nominationEndsAt = Date.now() + NOMINATION_TIME_MS;

    room.nominationTimer = setTimeout(() => {
        if (!rooms.has(room.code) || room.phase !== "nomination") return;

        const president = getPresident(room);
        const candidates = room.players.filter((p) => p.token !== president?.token && p.connected !== false);
        if (!president || !candidates.length) return;

        const nominee = candidates[Math.floor(Math.random() * candidates.length)];
        room.nominatedChancellorId = nominee.token;
        room.votes = {};
        room.phase = "vote";
        room.nominationEndsAt = null;

        addMessage(room, "system", "راوی", `زمان صدر تمام شد؛ ${nominee.name} به صورت خودکار معرفی شد.`);
        io.to(room.code).emit("narrator", { text: `راوی دربار: زمان انتخاب وزیر تمام شد. ${nominee.name} معرفی شد.` });
        sendGameState(room.code);
    }, NOMINATION_TIME_MS);
}

function startNextRound(room) {
    room.nominatedChancellorId = null;
    room.votes = {};
    room.presidentHand = [];
    room.ministerHand = [];
    room.phase = "nomination";
    room.lastResult = null;
    room.nominationEndsAt = null;
    startNominationTimer(room);
    sendGameState(room.code);
}

function finishGame(room, faction, reason) {
    clearNominationTimer(room);
    room.winner = { faction, reason };
    room.phase = "finished";
    room.nominationEndsAt = null;
    addMessage(room, "system", "دربار", reason);
    io.to(room.code).emit("gameOver", room.winner);
    io.to(room.code).emit("narrator", { text: `راوی دربار: ${reason}` });
    sendGameState(room.code);
}

function resetRoundAfterDisconnect(room, playerName) {
    room.nominatedChancellorId = null;
    room.votes = {};
    room.presidentHand = [];
    room.ministerHand = [];
    room.phase = "nomination";
    room.lastResult = null;
    addMessage(room, "system", "دربار", `${playerName} موقتاً قطع شد؛ جای او حفظ شد.`);
    startNominationTimer(room);
    sendGameState(room.code);
}

function sendRoomState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    io.to(roomCode).emit("roomState", {
        roomCode,
        players: getPublicPlayers(room),
        started: room.started,
        messages: room.messages
    });
}

function attachPlayer(socket, room, player) {
    player.id = socket.id;
    player.connected = true;
    if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = null;
    }
    socket.data.roomCode = room.code;
    socket.data.playerToken = player.token;
    socket.join(room.code);
}

io.on("connection", (socket) => {
    console.log("بازیکن متصل شد:", socket.id);

    socket.on("createRoom", ({ name, playerToken }) => {
        const cleanName = String(name || "").trim().slice(0, 20);
        const token = String(playerToken || "").trim() || createToken();

        if (!cleanName) return socket.emit("errorMessage", "نام بازیکن را وارد کن.");

        const roomCode = createRoomCode();
        const room = {
            code: roomCode,
            started: false,
            players: [{
                id: socket.id,
                token,
                name: cleanName,
                host: true,
                role: null,
                connected: true,
                avatar: "default",
                disconnectTimer: null
            }],
            messages: [],
            presidentIndex: 0,
            nominatedChancellorId: null,
            votes: {},
            phase: "lobby",
            electionFailed: 0,
            lastResult: null,
            winner: null,
            constitutionalPolicies: 0,
            qajarPolicies: 0,
            policyDeck: [],
            policyDiscard: [],
            presidentHand: [],
            ministerHand: [],
            nominationTimer: null,
            nominationEndsAt: null
        };

        rooms.set(roomCode, room);
        attachPlayer(socket, room, room.players[0]);
        getProfile(token);
        addMessage(room, "system", "دربار", `${cleanName} اتاق را ساخت.`);

        socket.emit("roomCreated", { roomCode, playerToken: token });
        sendProfile(socket, token);
        sendRoomState(roomCode);
    });

    socket.on("joinRoom", ({ name, roomCode, playerToken }) => {
        const cleanName = String(name || "").trim().slice(0, 20);
        const cleanCode = String(roomCode || "").trim();
        const token = String(playerToken || "").trim();

        if (!cleanName) return socket.emit("errorMessage", "نام بازیکن را وارد کن.");
        if (!/^\d{4}$/.test(cleanCode)) return socket.emit("errorMessage", "کد اتاق باید ۴ رقمی باشد.");

        const room = rooms.get(cleanCode);
        if (!room) return socket.emit("errorMessage", "این اتاق وجود ندارد.");

        const reconnecting = token ? room.players.find((p) => p.token === token) : null;
        if (reconnecting) {
            if (room.started || !room.started) {
                reconnecting.name = cleanName || reconnecting.name;
                attachPlayer(socket, room, reconnecting);
                sendProfile(socket, reconnecting.token);
                socket.emit("reconnected", { roomCode: room.code, started: room.started });
                if (room.started) {
                    socket.emit("roleAssigned", {
                        role: reconnecting.role,
                        allies: room.players
                            .filter((p) => p.token !== reconnecting.token && (reconnecting.role === ROLE.QAJAR || reconnecting.role === ROLE.NASER) && (p.role === ROLE.QAJAR || p.role === ROLE.NASER))
                            .map((p) => ({ name: p.name, role: p.role === ROLE.NASER ? "ناصرالدین شاه" : "قاجاری" }))
                    });
                    if (room.phase === "president_discard" && getPresident(room)?.token === reconnecting.token) {
                        socket.emit("policyDrawn", { cards: room.presidentHand });
                    }
                    if (room.phase === "minister_enact" && getNominee(room)?.token === reconnecting.token) {
                        socket.emit("ministerPolicy", { cards: room.ministerHand });
                    }
                    sendGameState(room.code);
                } else {
                    sendRoomState(room.code);
                }
                return;
            }
        }

        if (room.started) return socket.emit("errorMessage", "بازی شروع شده است؛ برای ورود دوباره از همان مرورگر استفاده کن.");
        if (room.players.length >= 10) return socket.emit("errorMessage", "اتاق پر است.");
        if (room.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
            return socket.emit("errorMessage", "این نام قبلاً استفاده شده.");
        }

        const newToken = token || createToken();
        const player = {
            id: socket.id,
            token: newToken,
            name: cleanName,
            host: false,
            role: null,
            connected: true,
            avatar: "default",
            disconnectTimer: null
        };

        room.players.push(player);
        attachPlayer(socket, room, player);
        getProfile(newToken);
        addMessage(room, "system", "دربار", `${cleanName} وارد اتاق شد.`);
        socket.emit("playerToken", { playerToken: newToken });
        sendProfile(socket, newToken);
        sendRoomState(cleanCode);
    });

    socket.on("reconnectPlayer", ({ roomCode, playerToken }) => {
        const room = rooms.get(String(roomCode || ""));
        const token = String(playerToken || "").trim();
        if (!room || !token) return;
        const player = room.players.find((p) => p.token === token);
        if (!player) return socket.emit("errorMessage", "جلسه بازیکن پیدا نشد.");

        attachPlayer(socket, room, player);
        sendProfile(socket, token);
        socket.emit("reconnected", { roomCode: room.code, started: room.started });

        if (room.started) {
            socket.emit("roleAssigned", {
                role: player.role,
                allies: (player.role === ROLE.QAJAR || player.role === ROLE.NASER)
                    ? room.players.filter((p) => p.token !== player.token && (p.role === ROLE.QAJAR || p.role === ROLE.NASER)).map((p) => ({ name: p.name, role: p.role === ROLE.NASER ? "ناصرالدین شاه" : "قاجاری" }))
                    : []
            });
            if (room.phase === "president_discard" && getPresident(room)?.token === player.token) {
                socket.emit("policyDrawn", { cards: room.presidentHand });
            }
            if (room.phase === "minister_enact" && getNominee(room)?.token === player.token) {
                socket.emit("ministerPolicy", { cards: room.ministerHand });
            }
            sendGameState(room.code);
        } else {
            sendRoomState(room.code);
        }
    });

    socket.on("lobbyChat", ({ text }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || room.started) return;
        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;
        const cleanText = String(text || "").trim().slice(0, 300);
        if (!cleanText) return;
        const message = { type: "chat", name: player.name, text: cleanText };
        room.messages.push(message);
        if (room.messages.length > 100) room.messages.shift();
        io.to(room.code).emit("chatMessage", message);
    });

    socket.on("gameChat", ({ text }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started) return;
        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;
        const cleanText = String(text || "").trim().slice(0, 300);
        if (!cleanText) return;
        io.to(room.code).emit("gameChatMessage", {
            type: "chat",
            name: player.name,
            text: cleanText,
            avatar: player.avatar || "default"
        });
    });

    socket.on("startGame", () => {
        const room = rooms.get(socket.data.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === socket.id);
        if (!player?.host) return socket.emit("errorMessage", "فقط سازنده اتاق می‌تواند بازی را شروع کند.");
        if (room.players.length < 5) return socket.emit("errorMessage", "برای شروع بازی حداقل ۵ بازیکن لازم است.");

        room.started = true;
        room.phase = "nomination";
        room.presidentIndex = 0;
        room.nominatedChancellorId = null;
        room.votes = {};
        room.electionFailed = 0;
        room.lastResult = null;
        room.winner = null;
        room.constitutionalPolicies = 0;
        room.qajarPolicies = 0;
        room.policyDeck = makePolicyDeck();
        room.policyDiscard = [];
        room.presidentHand = [];
        room.ministerHand = [];

        assignRoles(room);
        sendPrivateRoles(room);
        addMessage(room, "system", "دربار", "بازی آغاز شد. نقش‌ها اعلام شدند.");
        io.to(room.code).emit("gameStarted");
        io.to(room.code).emit("narrator", { text: "راوی دربار: بازی آغاز شد. اولین صدر انتخاب شده است." });
        startNominationTimer(room);
        sendGameState(room.code);
    });

    socket.on("nominateChancellor", ({ playerId }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started || room.phase !== "nomination") return;
        const president = getPresident(room);
        if (!president || president.id !== socket.id) return socket.emit("errorMessage", "فقط صدر می‌تواند وزیر انتخاب کند.");

        const nominee = room.players.find((p) => p.id === playerId);
        if (!nominee) return;
        if (nominee.token === president.token) return socket.emit("errorMessage", "صدر نمی‌تواند خودش را وزیر انتخاب کند.");

        clearNominationTimer(room);
        room.nominationEndsAt = null;
        room.nominatedChancellorId = nominee.token;
        room.votes = {};
        room.lastResult = null;
        room.phase = "vote";
        addMessage(room, "system", "دربار", `${president.name}، ${nominee.name} را برای وزارت معرفی کرد.`);
        io.to(room.code).emit("narrator", { text: `راوی دربار: ${president.name}، ${nominee.name} را برای وزارت معرفی کرد.` });
        sendGameState(room.code);
    });

    socket.on("castVote", ({ vote }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || !room.started || room.phase !== "vote") return;
        if (vote !== "yes" && vote !== "no") return;
        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;
        if (Object.prototype.hasOwnProperty.call(room.votes, player.token)) return socket.emit("errorMessage", "قبلاً رأی داده‌ای.");

        room.votes[player.token] = vote;
        sendGameState(room.code);
        if (Object.keys(room.votes).length !== room.players.length) return;

        const yesVotes = Object.values(room.votes).filter((v) => v === "yes").length;
        const noVotes = Object.values(room.votes).filter((v) => v === "no").length;
        const approved = yesVotes > noVotes;
        const president = getPresident(room);
        const nominee = getNominee(room);

        room.lastResult = { approved, yesVotes, noVotes, presidentName: president?.name || "", nomineeName: nominee?.name || "" };

        if (!approved) {
            room.electionFailed++;
            room.presidentIndex = (room.presidentIndex + 1) % room.players.length;
            addMessage(room, "system", "دربار", `دولت رد شد: ${yesVotes} موافق و ${noVotes} مخالف.`);
            startNextRound(room);
            return;
        }

        room.electionFailed = 0;

        if (room.qajarPolicies >= 3 && nominee?.role === ROLE.NASER) {
            finishGame(room, "qajar", "ناصرالدین شاه به وزارت رسید؛ قاجاریان کنترل دربار را به دست گرفتند.");
            return;
        }

        room.phase = "president_discard";
        room.presidentHand = [];
        room.ministerHand = [];
        ensureDeck(room, 3);
        room.presidentHand = [room.policyDeck.pop(), room.policyDeck.pop(), room.policyDeck.pop()];

        addMessage(room, "system", "دربار", `دولت تأیید شد. سه کارت محرمانه به ${president.name} رسید.`);
        io.to(president.id).emit("policyDrawn", { cards: room.presidentHand });
        sendGameState(room.code);
    });

    socket.on("presidentDiscard", ({ index }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || room.phase !== "president_discard") return;
        const president = getPresident(room);
        if (!president || president.id !== socket.id) return socket.emit("errorMessage", "فقط صدر می‌تواند کارت کنار بگذارد.");
        if (!Array.isArray(room.presidentHand) || room.presidentHand.length !== 3) return socket.emit("errorMessage", "سه کارت صدر آماده نیستند.");

        const discardIndex = Number(index);
        if (![0, 1, 2].includes(discardIndex)) return;

        const discarded = room.presidentHand[discardIndex];
        room.policyDiscard.push(discarded);
        room.ministerHand = room.presidentHand.filter((_, i) => i !== discardIndex);
        room.presidentHand = [];
        room.phase = "minister_enact";

        const nominee = getNominee(room);
        if (!nominee) {
            room.ministerHand = [];
            startNextRound(room);
            return;
        }

        addMessage(room, "system", "دربار", "صدر یک کارت را کنار گذاشت؛ دو کارت باقی‌مانده به وزیر رسید.");
        io.to(nominee.id).emit("ministerPolicy", { cards: room.ministerHand });
        sendGameState(room.code);
    });

    socket.on("ministerDiscard", ({ index }) => {
        const room = rooms.get(socket.data.roomCode);
        if (!room || room.phase !== "minister_enact") return;
        const nominee = getNominee(room);
        if (!nominee || nominee.id !== socket.id) return socket.emit("errorMessage", "فقط وزیر می‌تواند کارت انتخاب کند.");
        if (!Array.isArray(room.ministerHand) || room.ministerHand.length !== 2) return socket.emit("errorMessage", "دو کارت وزیر آماده نیستند.");

        const chosenIndex = Number(index);
        if (![0, 1].includes(chosenIndex)) return;

        const enacted = room.ministerHand[chosenIndex];
        const discarded = room.ministerHand[chosenIndex === 0 ? 1 : 0];
        room.policyDiscard.push(discarded, enacted);
        room.ministerHand = [];

        if (enacted === "constitutional") room.constitutionalPolicies++;
        else if (enacted === "qajar") room.qajarPolicies++;
        else return socket.emit("errorMessage", "کارت سیاست نامعتبر است.");

        const label = enacted === "constitutional" ? "🟦 سیاست مشروطه" : "🟥 سیاست قاجاری";
        addMessage(room, "system", "دربار", `${label} تصویب شد.`);
        io.to(room.code).emit("narrator", { text: `راوی دربار: ${label} تصویب شد.` });

        if (room.constitutionalPolicies >= 5) return finishGame(room, "constitutionalist", "مشروطه‌خواهان با تصویب ۵ سیاست پیروز شدند.");
        if (room.qajarPolicies >= 6) return finishGame(room, "qajar", "قاجاریان با تصویب ۶ سیاست پیروز شدند.");

        room.presidentIndex = (room.presidentIndex + 1) % room.players.length;
        startNextRound(room);
    });

    socket.on("redeemGiftCode", ({ code }) => {
        const token = socket.data.playerToken;
        if (!token) return socket.emit("errorMessage", "شناسه بازیکن پیدا نشد.");
        const profile = getProfile(token);
        const cleanCode = String(code || "").trim().toUpperCase();
        if (!GIFT_CODES.has(cleanCode)) return socket.emit("giftResult", { ok: false, message: "کد هدیه معتبر نیست." });
        if (profile.usedGiftCodes.includes(cleanCode)) return socket.emit("giftResult", { ok: false, message: "این کد قبلاً استفاده شده است." });
        const amount = GIFT_CODES.get(cleanCode);
        profile.usedGiftCodes.push(cleanCode);
        profile.coins += amount;
        socket.emit("giftResult", { ok: true, message: `${amount} سکه به کیف پول اضافه شد.`, coins: profile.coins });
        sendProfile(socket, token);
    });

    socket.on("buyAvatar", ({ avatar, price }) => {
        const token = socket.data.playerToken;
        if (!token) return;
        const profile = getProfile(token);
        const allowed = {
            shah: 300,
            vizier: 200,
            court: 150,
            warrior: 250,
            ink: 100
        };
        if (!Object.prototype.hasOwnProperty.call(allowed, avatar)) return socket.emit("errorMessage", "آواتار نامعتبر است.");
        const realPrice = allowed[avatar];
        if (profile.avatars.includes(avatar)) return socket.emit("avatarResult", { ok: false, message: "این آواتار را داری." });
        if (profile.coins < realPrice) return socket.emit("avatarResult", { ok: false, message: "سکه کافی نیست." });
        profile.coins -= realPrice;
        profile.avatars.push(avatar);
        const player = rooms.get(socket.data.roomCode)?.players.find((p) => p.token === token);
        if (player) {
            player.avatar = avatar;
            if (socket.data.roomCode) sendRoomState(socket.data.roomCode);
        }
        socket.emit("avatarResult", { ok: true, message: "آواتار خریداری شد.", coins: profile.coins, avatars: profile.avatars });
        sendProfile(socket, token);
    });

    socket.on("selectAvatar", ({ avatar }) => {
        const token = socket.data.playerToken;
        if (!token) return;
        const profile = getProfile(token);
        if (!profile.avatars.includes(avatar)) return socket.emit("errorMessage", "این آواتار را نخریده‌ای.");
        const room = rooms.get(socket.data.roomCode);
        const player = room?.players.find((p) => p.token === token);
        if (player) {
            player.avatar = avatar;
            sendRoomState(room.code);
            sendGameState(room.code);
        }
    });

    socket.on("disconnect", () => {
        const roomCode = socket.data.roomCode;
        const token = socket.data.playerToken;
        const room = rooms.get(roomCode);
        if (!room || !token) return;

        const player = room.players.find((p) => p.token === token);
        if (!player || player.id !== socket.id) return;

        player.connected = false;
        player.id = null;

        if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
        player.disconnectTimer = setTimeout(() => {
            const currentRoom = rooms.get(roomCode);
            if (!currentRoom) return;
            const index = currentRoom.players.findIndex((p) => p.token === token);
            if (index === -1) return;

            const removed = currentRoom.players[index];
            currentRoom.players.splice(index, 1);
            if (!currentRoom.players.length) {
                clearNominationTimer(currentRoom);
                rooms.delete(roomCode);
                return;
            }

            if (currentRoom.presidentIndex > index) currentRoom.presidentIndex--;
            if (currentRoom.presidentIndex >= currentRoom.players.length) currentRoom.presidentIndex = 0;
            if (!currentRoom.players.some((p) => p.host)) currentRoom.players[0].host = true;

            if (currentRoom.started) {
                resetRoundAfterDisconnect(currentRoom, removed.name);
            } else {
                sendRoomState(roomCode);
            }
        }, DISCONNECT_GRACE_MS);

        if (room.started) {
            resetRoundAfterDisconnect(room, player.name);
        } else {
            sendRoomState(roomCode);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("🌑 سایه‌های دربار v2");
    console.log(`Server running on port ${PORT}`);
    console.log("=================================");
});
