const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const ROLE = {
    CONSTITUTIONALIST: "constitutionalist",
    QAJAR: "qajar",
    NASER: "naser"
};

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
    // 6 مشروطه + 11 قاجاری؛ مشابه نسبت دو جبهه در نسخه ساده بازی
    return shuffle([
        ...Array(6).fill("constitutional"),
        ...Array(11).fill("qajar")
    ]);
}

function ensureDeck(room, needed = 2) {
    if (room.policyDeck.length >= needed) return;

    if (room.policyDiscard.length > 0) {
        room.policyDeck = shuffle([
            ...room.policyDeck,
            ...room.policyDiscard
        ]);
        room.policyDiscard = [];
    }
}

function addMessage(room, type, name, text) {
    room.messages.push({ type, name, text });
    if (room.messages.length > 80) room.messages.shift();
}

function getPublicPlayers(room) {
    return room.players.map((p) => ({
        id: p.id,
        name: p.name,
        host: p.host
    }));
}

function getPresident(room) {
    return room.players[room.presidentIndex] || null;
}

function getNominee(room) {
    return room.players.find(
        (p) => p.id === room.nominatedChancellorId
    ) || null;
}

function getPhaseText(phase) {
    const texts = {
        nomination: "انتخاب وزیر",
        vote: "رأی‌گیری",
        president_discard: "انتخاب کارت توسط صدر",
        minister_enact: "تصویب کارت توسط وزیر",
        finished: "بازی تمام شد"
    };
    return texts[phase] || phase;
}

function buildPublicGameState(room) {
    const president = getPresident(room);
    const nominee = getNominee(room);

    return {
        roomCode: room.code,
        phase: room.phase,
        phaseText: getPhaseText(room.phase),
        players: getPublicPlayers(room),
        president: president
            ? { id: president.id, name: president.name }
            : null,
        nominee: nominee
            ? { id: nominee.id, name: nominee.name }
            : null,
        constitutionalPolicies: room.constitutionalPolicies,
        qajarPolicies: room.qajarPolicies,
        electionFailed: room.electionFailed,
        lastResult: room.lastResult,
        winner: room.winner,
        policyDeckCount: room.policyDeck.length
    };
}

function sendGameState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const base = buildPublicGameState(room);
    const president = getPresident(room);

    room.players.forEach((player) => {
        io.to(player.id).emit("gameState", {
            ...base,
            youArePresident: president?.id === player.id,
            youAreNominee: room.nominatedChancellorId === player.id,
            youVoted: Boolean(room.votes[player.id])
        });
    });
}

function assignRoles(room) {
    const playerCount = room.players.length;
    const qajarCount = playerCount <= 6 ? 2 : 3;

    const roles = [ROLE.NASER];
    for (let i = 1; i < qajarCount; i++) roles.push(ROLE.QAJAR);
    while (roles.length < playerCount) roles.push(ROLE.CONSTITUTIONALIST);

    const shuffledRoles = shuffle(roles);
    const shuffledPlayers = shuffle(room.players);

    shuffledPlayers.forEach((player, index) => {
        player.role = shuffledRoles[index];
    });
}

function sendPrivateRoles(room) {
    const qajarPlayers = room.players.filter(
        (p) => p.role === ROLE.QAJAR || p.role === ROLE.NASER
    );

    room.players.forEach((player) => {
        const allies =
            player.role === ROLE.QAJAR || player.role === ROLE.NASER
                ? qajarPlayers
                      .filter((ally) => ally.id !== player.id)
                      .map((ally) => ({
                          name: ally.name,
                          role:
                              ally.role === ROLE.NASER
                                  ? "ناصرالدین شاه"
                                  : "قاجاری"
                      }))
                : [];

        io.to(player.id).emit("roleAssigned", {
            role: player.role,
            allies
        });
    });
}

function startNextRound(room) {
    room.nominatedChancellorId = null;
    room.votes = {};
    room.presidentHand = [];
    room.ministerCard = null;
    room.lastResult = null;
    room.phase = "nomination";
    sendGameState(room.code);
}

function finishGame(room, faction, reason) {
    room.winner = { faction, reason };
    room.phase = "finished";

    addMessage(
        room,
        "system",
        "دربار",
        reason
    );

    io.to(room.code).emit("gameOver", room.winner);
    sendGameState(room.code);
}

io.on("connection", (socket) => {
    console.log("بازیکن متصل شد:", socket.id);

    socket.on("createRoom", ({ name }) => {
        const cleanName = String(name || "").trim().slice(0, 20);
        if (!cleanName) {
            socket.emit("errorMessage", "نام بازیکن را وارد کن.");
            return;
        }

        const roomCode = createRoomCode();
        const room = {
            code: roomCode,
            started: false,
            players: [
                {
                    id: socket.id,
                    name: cleanName,
                    host: true,
                    role: null
                }
            ],
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
            ministerCard: null
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.data.roomCode = roomCode;

        addMessage(room, "system", "دربار", `${cleanName} اتاق را ساخت.`);

        socket.emit("roomCreated", { roomCode });
        sendGameState(roomCode);
        sendRoomState(roomCode);
    });

    socket.on("joinRoom", ({ name, roomCode }) => {
        const cleanName = String(name || "").trim().slice(0, 20);
        const cleanCode = String(roomCode || "").trim();

        if (!cleanName) {
            socket.emit("errorMessage", "نام بازیکن را وارد کن.");
            return;
        }

        if (!/^\d{4}$/.test(cleanCode)) {
            socket.emit("errorMessage", "کد اتاق باید ۴ رقمی باشد.");
            return;
        }

        const room = rooms.get(cleanCode);
        if (!room) {
            socket.emit("errorMessage", "این اتاق وجود ندارد.");
            return;
        }

        if (room.started) {
            socket.emit("errorMessage", "بازی شروع شده است.");
            return;
        }

        if (room.players.length >= 10) {
            socket.emit("errorMessage", "اتاق پر است.");
            return;
        }

        if (
            room.players.some(
                (p) => p.name.toLowerCase() === cleanName.toLowerCase()
            )
        ) {
            socket.emit("errorMessage", "این نام قبلاً استفاده شده.");
            return;
        }

        room.players.push({
            id: socket.id,
            name: cleanName,
            host: false,
            role: null
        });

        socket.join(cleanCode);
        socket.data.roomCode = cleanCode;

        addMessage(room, "system", "دربار", `${cleanName} وارد اتاق شد.`);

        sendRoomState(cleanCode);
    });

    socket.on("lobbyChat", ({ text }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);
        if (!room || room.started) return;

        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;

        const cleanText = String(text || "").trim().slice(0, 300);
        if (!cleanText) return;

        const message = {
            type: "chat",
            name: player.name,
            text: cleanText
        };

        room.messages.push(message);
        if (room.messages.length > 80) room.messages.shift();

        io.to(roomCode).emit("chatMessage", message);
    });

    socket.on("startGame", () => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.id);
        if (!player?.host) {
            socket.emit("errorMessage", "فقط سازنده اتاق می‌تواند بازی را شروع کند.");
            return;
        }

        if (room.players.length < 5) {
            socket.emit("errorMessage", "برای شروع بازی حداقل ۵ بازیکن لازم است.");
            return;
        }

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
        room.ministerCard = null;

        assignRoles(room);
        sendPrivateRoles(room);

        addMessage(room, "system", "دربار", "بازی آغاز شد. اولین صدر مشخص شد.");

        io.to(roomCode).emit("gameStarted");
        sendGameState(roomCode);
    });

    socket.on("nominateChancellor", ({ playerId }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);
        if (!room || !room.started || room.phase !== "nomination") return;

        const president = getPresident(room);
        if (!president || president.id !== socket.id) {
            socket.emit("errorMessage", "فقط صدر می‌تواند وزیر انتخاب کند.");
            return;
        }

        if (playerId === president.id) {
            socket.emit("errorMessage", "صدر نمی‌تواند خودش را وزیر انتخاب کند.");
            return;
        }

        const nominee = room.players.find((p) => p.id === playerId);
        if (!nominee) return;

        room.nominatedChancellorId = nominee.id;
        room.votes = {};
        room.lastResult = null;
        room.phase = "vote";

        addMessage(
            room,
            "system",
            "دربار",
            `${president.name}، ${nominee.name} را برای وزارت معرفی کرد.`
        );

        sendGameState(roomCode);
    });

    socket.on("castVote", ({ vote }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);
        if (!room || !room.started || room.phase !== "vote") return;

        if (vote !== "yes" && vote !== "no") return;

        const player = room.players.find((p) => p.id === socket.id);
        if (!player) return;

        if (Object.prototype.hasOwnProperty.call(room.votes, socket.id)) {
            socket.emit("errorMessage", "قبلاً رأی داده‌ای.");
            return;
        }

        room.votes[socket.id] = vote;
        sendGameState(roomCode);

        if (Object.keys(room.votes).length !== room.players.length) return;

        const yesVotes = Object.values(room.votes).filter((v) => v === "yes").length;
        const noVotes = Object.values(room.votes).filter((v) => v === "no").length;
        const approved = yesVotes > noVotes;
        const president = getPresident(room);
        const nominee = getNominee(room);

        room.lastResult = {
            approved,
            yesVotes,
            noVotes,
            presidentName: president?.name || "",
            nomineeName: nominee?.name || ""
        };

        if (!approved) {
            room.electionFailed += 1;
            addMessage(
                room,
                "system",
                "دربار",
                `دولت رد شد: ${yesVotes} موافق و ${noVotes} مخالف.`
            );

            room.presidentIndex =
                (room.presidentIndex + 1) % room.players.length;

            room.nominatedChancellorId = null;
            room.votes = {};
            room.phase = "nomination";
            sendGameState(roomCode);
            return;
        }

        room.electionFailed = 0;

        // قانون ویژه ناصرالدین شاه:
        // پس از ۳ سیاست قاجاری، اگر ناصر وزیر شود، قاجاریان فوراً برنده‌اند.
        if (room.qajarPolicies >= 3 && nominee?.role === ROLE.NASER) {
            addMessage(
                room,
                "system",
                "دربار",
                `ناصرالدین شاه به وزارت رسید؛ قاجاریان کنترل دربار را به دست گرفتند.`
            );

            finishGame(
                room,
                "qajar",
                "👑 قاجاریان پیروز شدند؛ ناصرالدین شاه پس از ۳ سیاست قاجاری وزیر شد."
            );
            return;
        }

        room.phase = "president_discard";
        room.presidentHand = [];
        room.ministerCard = null;

        ensureDeck(room, 2);

        room.presidentHand = [
            room.policyDeck.pop(),
            room.policyDeck.pop()
        ];

        addMessage(
            room,
            "system",
            "دربار",
            `دولت ${president.name} و ${nominee.name} تأیید شد. صدر کارت‌های سیاست را دریافت کرد.`
        );

        io.to(president.id).emit("policyDrawn", {
            cards: room.presidentHand
        });

        sendGameState(roomCode);
    });

    socket.on("presidentDiscard", ({ index }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);
        if (!room || room.phase !== "president_discard") return;

        const president = getPresident(room);
        if (!president || president.id !== socket.id) {
            socket.emit("errorMessage", "فقط صدر می‌تواند کارت کنار بگذارد.");
            return;
        }

        if (!Array.isArray(room.presidentHand) || room.presidentHand.length !== 2) {
            socket.emit("errorMessage", "کارت‌های صدر آماده نیستند.");
            return;
        }

        const discardIndex = Number(index);
        if (discardIndex !== 0 && discardIndex !== 1) return;

        const [discarded] = room.presidentHand.splice(discardIndex, 1);
        room.policyDiscard.push(discarded);

        room.ministerCard = room.presidentHand[0];
        room.presidentHand = [];
        room.phase = "minister_enact";

        const nominee = getNominee(room);

        if (!nominee) {
            room.phase = "nomination";
            room.nominatedChancellorId = null;
            room.ministerCard = null;
            sendGameState(roomCode);
            return;
        }

        addMessage(
            room,
            "system",
            "دربار",
            `صدر یکی از کارت‌ها را کنار گذاشت. کارت باقی‌مانده به وزیر رسید.`
        );

        io.to(nominee.id).emit("ministerPolicy", {
            card: room.ministerCard
        });

        sendGameState(roomCode);
    });

    socket.on("ministerEnact", () => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);
        if (!room || room.phase !== "minister_enact") return;

        const nominee = getNominee(room);
        if (!nominee || nominee.id !== socket.id) {
            socket.emit("errorMessage", "فقط وزیر می‌تواند کارت را تصویب کند.");
            return;
        }

        const card = room.ministerCard;
        if (card !== "constitutional" && card !== "qajar") {
            socket.emit("errorMessage", "کارت سیاست نامعتبر است.");
            return;
        }

        room.policyDiscard.push(card);
        room.ministerCard = null;

        if (card === "constitutional") {
            room.constitutionalPolicies++;
        } else {
            room.qajarPolicies++;
        }

        const label =
            card === "constitutional"
                ? "🟦 سیاست مشروطه"
                : "🟥 سیاست قاجاری";

        addMessage(
            room,
            "system",
            "دربار",
            `${label} تصویب شد.`
        );

        if (room.constitutionalPolicies >= 5) {
            finishGame(
                room,
                "constitutionalist",
                "🟦 مشروطه‌خواهان با تصویب ۵ سیاست پیروز شدند."
            );
            return;
        }

        if (room.qajarPolicies >= 6) {
            finishGame(
                room,
                "qajar",
                "🟥 قاجاریان با تصویب ۶ سیاست پیروز شدند."
            );
            return;
        }

        room.presidentIndex =
            (room.presidentIndex + 1) % room.players.length;

        startNextRound(room);
    });

    socket.on("disconnect", () => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const leavingIndex = room.players.findIndex(
            (p) => p.id === socket.id
        );

        const leavingPlayer = room.players[leavingIndex];

        room.players = room.players.filter(
            (p) => p.id !== socket.id
        );

        if (room.players.length === 0) {
            rooms.delete(roomCode);
            return;
        }

        if (leavingIndex !== -1 && leavingIndex < room.presidentIndex) {
            room.presidentIndex--;
        }

        if (room.presidentIndex >= room.players.length) {
            room.presidentIndex = 0;
        }

        if (!room.players.some((p) => p.host)) {
            room.players[0].host = true;
        }

        if (room.started) {
            room.nominatedChancellorId = null;
            room.votes = {};
            room.presidentHand = [];
            room.ministerCard = null;
            room.phase = "nomination";
            room.lastResult = null;

            addMessage(
                room,
                "system",
                "دربار",
                `${leavingPlayer?.name || "یک بازیکن"} از بازی خارج شد.`
            );

            sendGameState(roomCode);
        } else {
            addMessage(
                room,
                "system",
                "دربار",
                `${leavingPlayer?.name || "بازیکن"} از اتاق خارج شد.`
            );

            sendRoomState(roomCode);
        }
    });

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
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("🌑 سایه‌های دربار");
    console.log(`Server running on port ${PORT}`);
    console.log("=================================");
});