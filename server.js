const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const rooms = new Map();

// =========================
// ابزارها
// =========================

function makeRoomCode() {
    let code;

    do {
        code = String(
            Math.floor(1000 + Math.random() * 9000)
        );
    } while (rooms.has(code));

    return code;
}

function getRoom(socket) {
    for (const room of rooms.values()) {
        if (room.players.has(socket.id)) {
            return room;
        }
    }

    return null;
}

function getPlayer(room, id) {
    return room.players.get(id);
}

function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [
            result[j],
            result[i]
        ];
    }

    return result;
}

function publicPlayers(room) {
    return [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        host: player.host
    }));
}

function sendError(socket, message) {
    socket.emit("errorMessage", message);
}

// =========================
// کارت‌ها
// =========================

function createPolicyDeck() {
    const deck = [];

    // 11 کارت مشروطه
    for (let i = 0; i < 11; i++) {
        deck.push("constitutional");
    }

    // 6 کارت قاجاری
    for (let i = 0; i < 6; i++) {
        deck.push("qajar");
    }

    return shuffle(deck);
}

function drawCards(room, amount) {
    if (room.deck.length < amount) {
        room.deck = shuffle([
            ...room.deck,
            ...room.discardPile,
            ...createPolicyDeck()
        ]);

        room.discardPile = [];
    }

    return room.deck.splice(0, amount);
}

// =========================
// پیام اتاق
// =========================

function broadcastRoom(room) {
    io.to(room.code).emit("roomState", {
        roomCode: room.code,
        players: publicPlayers(room),
        started: room.started,
        messages: room.messages
    });
}

// =========================
// متن مرحله
// =========================

function getPhaseText(phase) {
    switch (phase) {
        case "nomination":
            return "👑 انتخاب وزیر";

        case "vote":
            return "🗳️ رأی‌گیری";

        case "president_discard":
            return "📜 انتخاب کارت توسط صدر";

        case "minister_enact":
            return "📜 تصویب سیاست";

        case "finished":
            return "🏆 پایان بازی";

        default:
            return "در حال آماده‌سازی...";
    }
}

// =========================
// تایمر
// =========================

function clearRoomTimer(room) {
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }
}

// =========================
// Game State
// =========================

function sendGameState(room) {
    for (const player of room.players.values()) {
        const president = room.players.get(
            room.presidentId
        );

        const nominee = room.players.get(
            room.nomineeId
        );

        io.to(player.id).emit("gameState", {
            phase: room.phase,

            phaseText: getPhaseText(
                room.phase
            ),

            players: publicPlayers(room),

            president: president
                ? {
                      id: president.id,
                      name: president.name
                  }
                : null,

            nominee: nominee
                ? {
                      id: nominee.id,
                      name: nominee.name
                  }
                : null,

            youArePresident:
                room.presidentId === player.id,

            youAreNominee:
                room.nomineeId === player.id,

            youVoted:
                room.votes.has(player.id),

            constitutionalPolicies:
                room.constitutionalPolicies,

            qajarPolicies:
                room.qajarPolicies,

            policyDeckCount:
                room.deck.length,

            lastResult:
                room.lastResult,

            winner:
                room.winner
        });
    }
}

// =========================
// انتخاب صدر بعدی
// =========================

function chooseNextPresident(room) {
    const players = [
        ...room.players.values()
    ];

    if (!players.length) return;

    let index = players.findIndex(
        (player) =>
            player.id === room.presidentId
    );

    if (index === -1) {
        index = 0;
    } else {
        index++;

        if (index >= players.length) {
            index = 0;
        }
    }

    room.presidentId =
        players[index].id;
}

// =========================
// پایان بازی
// =========================

function finishGame(
    room,
    faction,
    reason
) {
    clearRoomTimer(room);

    room.phase = "finished";

    room.winner = {
        faction,
        reason
    };

    sendGameState(room);

    io.to(room.code).emit(
        "gameOver",
        room.winner
    );
}

function checkWinner(room) {
    if (
        room.constitutionalPolicies >= 5
    ) {
        finishGame(
            room,
            "constitutionalist",
            "پنج سیاست مشروطه تصویب شد."
        );

        return true;
    }

    if (
        room.qajarPolicies >= 6
    ) {
        finishGame(
            room,
            "qajar",
            "شش سیاست قاجاری تصویب شد."
        );

        return true;
    }

    return false;
}

// =========================
// مرحله انتخاب وزیر
// =========================

function startNomination(room) {
    clearRoomTimer(room);

    room.phase = "nomination";

    room.nomineeId = null;
    room.votes.clear();
    room.lastResult = null;

    sendGameState(room);

    // 60 ثانیه
    room.timer = setTimeout(() => {
        if (!rooms.has(room.code)) {
            return;
        }

        if (room.phase !== "nomination") {
            return;
        }

        const players = [
            ...room.players.values()
        ];

        const possible = players.filter(
            (player) =>
                player.id !== room.presidentId
        );

        if (!possible.length) {
            return;
        }

        const nominee =
            possible[
                Math.floor(
                    Math.random() *
                    possible.length
                )
            ];

        room.nomineeId =
            nominee.id;

        io.to(room.code).emit(
            "chatMessage",
            {
                type: "system",
                text:
                    `⏱️ زمان انتخاب وزیر تمام شد. ${nominee.name} به صورت خودکار انتخاب شد.`
            }
        );

        startVote(room);
    }, 60000);
}

// =========================
// رأی‌گیری
// =========================

function startVote(room) {
    clearRoomTimer(room);

    room.phase = "vote";
    room.votes.clear();

    sendGameState(room);
}

// =========================
// پایان رأی‌گیری
// =========================

function finishVoting(room) {
    const yesVotes = [
        ...room.votes.values()
    ].filter(
        (vote) => vote === "yes"
    ).length;

    const noVotes = [
        ...room.votes.values()
    ].filter(
        (vote) => vote === "no"
    ).length;

    const approved =
        yesVotes > noVotes;

    room.lastResult = {
        approved,
        yesVotes,
        noVotes
    };

    if (!approved) {
        io.to(room.code).emit(
            "chatMessage",
            {
                type: "system",
                text:
                    "❌ دولت رأی نیاورد."
            }
        );

        chooseNextPresident(room);

        setTimeout(() => {
            if (rooms.has(room.code)) {
                startNomination(room);
            }
        }, 1200);

        return;
    }

    io.to(room.code).emit(
        "chatMessage",
        {
            type: "system",
            text:
                "✅ دولت تأیید شد. مرحله سیاست آغاز شد."
        }
    );

    startPresidentPolicy(room);
}

// =========================
// مرحله کارت صدر
// =========================

function startPresidentPolicy(room) {
    clearRoomTimer(room);

    const cards =
        drawCards(room, 3);

    room.presidentCards = cards;

    room.phase =
        "president_discard";

    sendGameState(room);

    const president =
        room.players.get(
            room.presidentId
        );

    if (president) {
        io.to(
            president.id
        ).emit(
            "policyDrawn",
            {
                cards
            }
        );
    }
}

// =========================
// شروع بازی
// =========================

function startGame(room) {
    const players = [
        ...room.players.values()
    ];

    if (players.length < 3) {
        return false;
    }

    room.started = true;

    room.deck =
        createPolicyDeck();

    room.discardPile = [];

    room.constitutionalPolicies = 0;
    room.qajarPolicies = 0;

    room.phase = null;

    room.presidentId =
        players[0].id;

    room.nomineeId = null;

    room.votes.clear();

    room.lastResult = null;

    room.winner = null;

    room.currentMinisterCard =
        null;

    // =========================
    // نقش‌ها
    // =========================

    const shuffledPlayers =
        shuffle(players);

    shuffledPlayers.forEach(
        (player) => {
            player.role =
                "constitutionalist";

            player.allies = [];
        }
    );

    // یک ناصر
    const naser =
        shuffledPlayers[0];

    naser.role = "naser";

    // تعداد قاجاری
    const qajarCount =
        players.length >= 6
            ? 2
            : 1;

    for (
        let i = 1;
        i <= qajarCount;
        i++
    ) {
        if (shuffledPlayers[i]) {
            shuffledPlayers[i].role =
                "qajar";
        }
    }

    // =========================
    // هم‌پیمانان
    // =========================

    for (
        const player of players
    ) {
        player.allies =
            players
                .filter(
                    (other) =>
                        other.id !==
                            player.id &&
                        (
                            other.role ===
                                "qajar" ||
                            other.role ===
                                "naser"
                        ) &&
                        (
                            player.role ===
                                "qajar" ||
                            player.role ===
                                "naser"
                        )
                )
                .map(
                    (other) => ({
                        name:
                            other.name,

                        role:
                            other.role ===
                            "naser"
                                ? "ناصرالدین شاه"
                                : "قاجاری"
                    })
                );
    }

    // =========================
    // ارسال نقش
    // =========================

    for (
        const player of players
    ) {
        io.to(player.id).emit(
            "roleAssigned",
            {
                role:
                    player.role,

                allies:
                    player.allies
            }
        );
    }

    io.to(room.code).emit(
        "gameStarted"
    );

    // شروع بعد از نمایش نقش
    setTimeout(() => {
        if (!rooms.has(room.code)) {
            return;
        }

        startNomination(room);
    }, 1500);

    return true;
}

// =========================
// اتصال Socket
// =========================

io.on(
    "connection",
    (socket) => {
        console.log(
            "Client connected:",
            socket.id
        );

        // =========================
        // ساخت اتاق
        // =========================

        socket.on(
            "createRoom",
            ({ name }) => {
                name =
                    String(
                        name || ""
                    ).trim();

                if (!name) {
                    return sendError(
                        socket,
                        "اول نامت را وارد کن."
                    );
                }

                if (getRoom(socket)) {
                    return sendError(
                        socket,
                        "شما قبلاً وارد یک اتاق شده‌اید."
                    );
                }

                const code =
                    makeRoomCode();

                const player = {
                    id:
                        socket.id,

                    name,

                    host: true,

                    role: null,

                    allies: []
                };

                const room = {
                    code,

                    players:
                        new Map([
                            [
                                socket.id,
                                player
                            ]
                        ]),

                    started: false,

                    messages: [
                        {
                            type:
                                "system",

                            text:
                                "اتاق ساخته شد. منتظر بازیکنان دیگر باشید."
                        }
                    ],

                    phase: null,

                    presidentId:
                        socket.id,

                    nomineeId:
                        null,

                    votes:
                        new Map(),

                    deck: [],

                    discardPile: [],

                    presidentCards: [],

                    currentMinisterCard:
                        null,

                    constitutionalPolicies:
                        0,

                    qajarPolicies:
                        0,

                    lastResult:
                        null,

                    winner:
                        null,

                    timer:
                        null
                };

                rooms.set(
                    code,
                    room
                );

                socket.join(code);

                socket.emit(
                    "roomCreated",
                    {
                        roomCode:
                            code
                    }
                );

                broadcastRoom(
                    room
                );

                console.log(
                    `Room ${code} created`
                );
            }
        );

        // =========================
        // ورود به اتاق
        // =========================

        socket.on(
            "joinRoom",
            ({ name, roomCode }) => {
                name =
                    String(
                        name || ""
                    ).trim();

                roomCode =
                    String(
                        roomCode || ""
                    ).trim();

                if (!name) {
                    return sendError(
                        socket,
                        "اول نامت را وارد کن."
                    );
                }

                if (!roomCode) {
                    return sendError(
                        socket,
                        "کد اتاق را وارد کن."
                    );
                }

                const room =
                    rooms.get(
                        roomCode
                    );

                if (!room) {
                    return sendError(
                        socket,
                        "این اتاق وجود ندارد."
                    );
                }

                if (room.started) {
                    return sendError(
                        socket,
                        "این بازی قبلاً شروع شده است."
                    );
                }

                if (
                    room.players.size >=
                    10
                ) {
                    return sendError(
                        socket,
                        "ظرفیت اتاق کامل است."
                    );
                }

                const player = {
                    id:
                        socket.id,

                    name,

                    host: false,

                    role: null,

                    allies: []
                };

                room.players.set(
                    socket.id,
                    player
                );

                socket.join(
                    room.code
                );

                room.messages.push({
                    type:
                        "system",

                    text:
                        `${name} وارد اتاق شد.`
                });

                socket.emit(
                    "roomCreated",
                    {
                        roomCode:
                            room.code
                    }
                );

                broadcastRoom(
                    room
                );
            }
        );

        // =========================
        // شروع بازی
        // =========================

        socket.on(
            "startGame",
            () => {
                const room =
                    getRoom(socket);

                if (!room) {
                    return sendError(
                        socket,
                        "ابتدا وارد اتاق شوید."
                    );
                }

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !player ||
                    !player.host
                ) {
                    return sendError(
                        socket,
                        "فقط سازنده اتاق می‌تواند بازی را شروع کند."
                    );
                }

                if (
                    room.players.size <
                    3
                ) {
                    return sendError(
                        socket,
                        "برای شروع حداقل ۳ بازیکن لازم است."
                    );
                }

                if (room.started) {
                    return;
                }

                startGame(room);
            }
        );

        // =========================
        // چت لابی
        // =========================

        socket.on(
            "lobbyChat",
            ({ text }) => {
                const room =
                    getRoom(socket);

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) return;

                text =
                    String(
                        text || ""
                    ).trim();

                if (!text) return;

                text =
                    text.slice(
                        0,
                        300
                    );

                const message = {
                    type:
                        "chat",

                    name:
                        player.name,

                    text
                };

                room.messages.push(
                    message
                );

                if (
                    room.messages.length >
                    100
                ) {
                    room.messages.shift();
                }

                io.to(
                    room.code
                ).emit(
                    "chatMessage",
                    message
                );
            }
        );

        // =========================
        // چت داخل بازی
        // =========================

        socket.on(
            "gameChat",
            ({ text }) => {
                const room =
                    getRoom(socket);

                if (
                    !room ||
                    !room.started
                ) {
                    return;
                }

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) return;

                text =
                    String(
                        text || ""
                    ).trim();

                if (!text) return;

                text =
                    text.slice(
                        0,
                        300
                    );

                io.to(
                    room.code
                ).emit(
                    "gameChatMessage",
                    {
                        type:
                            "chat",

                        name:
                            player.name,

                        text
                    }
                );
            }
        );

        // =========================
        // انتخاب وزیر
        // =========================

        socket.on(
            "nominateChancellor",
            ({ playerId }) => {
                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "nomination"
                ) {
                    return sendError(
                        socket,
                        "الان زمان انتخاب وزیر نیست."
                    );
                }

                if (
                    room.presidentId !==
                    socket.id
                ) {
                    return sendError(
                        socket,
                        "فقط صدر فعلی می‌تواند وزیر انتخاب کند."
                    );
                }

                const nominee =
                    room.players.get(
                        playerId
                    );

                if (!nominee) {
                    return sendError(
                        socket,
                        "بازیکن انتخاب‌شده پیدا نشد."
                    );
                }

                if (
                    nominee.id ===
                    socket.id
                ) {
                    return sendError(
                        socket,
                        "نمی‌توانید خودتان را انتخاب کنید."
                    );
                }

                clearRoomTimer(
                    room
                );

                room.nomineeId =
                    nominee.id;

                io.to(
                    room.code
                ).emit(
                    "chatMessage",
                    {
                        type:
                            "system",

                        text:
                            `${getPlayer(room, socket.id).name}، ${nominee.name} را برای وزارت معرفی کرد.`
                    }
                );

                startVote(room);
            }
        );

        // =========================
        // رأی دادن
        // =========================

        socket.on(
            "castVote",
            ({ vote }) => {
                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "vote"
                ) {
                    return;
                }

                if (
                    vote !== "yes" &&
                    vote !== "no"
                ) {
                    return;
                }

                if (
                    room.votes.has(
                        socket.id
                    )
                ) {
                    return;
                }

                room.votes.set(
                    socket.id,
                    vote
                );

                sendGameState(
                    room
                );

                if (
                    room.votes.size >=
                    room.players.size
                ) {
                    finishVoting(
                        room
                    );
                }
            }
        );

        // =========================
        // کنار گذاشتن کارت توسط صدر
        // =========================

        socket.on(
            "presidentDiscard",
            ({ index }) => {
                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "president_discard"
                ) {
                    return;
                }

                if (
                    room.presidentId !==
                    socket.id
                ) {
                    return;
                }

                if (
                    !Number.isInteger(
                        index
                    )
                ) {
                    return;
                }

                if (
                    index < 0 ||
                    index >=
                        room.presidentCards.length
                ) {
                    return;
                }

                const discarded =
                    room.presidentCards[
                        index
                    ];

                const remaining =
                    room.presidentCards.filter(
                        (_, i) =>
                            i !== index
                    );

                room.discardPile.push(
                    discarded
                );

                const ministerCard =
                    remaining[0];

                room.presidentCards =
                    [];

                room.currentMinisterCard =
                    ministerCard;

                room.phase =
                    "minister_enact";

                sendGameState(
                    room
                );

                const nominee =
                    room.players.get(
                        room.nomineeId
                    );

                if (nominee) {
                    io.to(
                        nominee.id
                    ).emit(
                        "ministerPolicy",
                        {
                            card:
                                ministerCard
                        }
                    );
                }
            }
        );

        // =========================
        // تصویب سیاست توسط وزیر
        // =========================

        socket.on(
            "ministerEnact",
            () => {
                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "minister_enact"
                ) {
                    return;
                }

                if (
                    room.nomineeId !==
                    socket.id
                ) {
                    return;
                }

                const card =
                    room.currentMinisterCard;

                if (!card) {
                    return;
                }

                if (
                    card ===
                    "constitutional"
                ) {
                    room.constitutionalPolicies++;
                } else if (
                    card === "qajar"
                ) {
                    room.qajarPolicies++;
                }

                room.discardPile.push(
                    card
                );

                room.currentMinisterCard =
                    null;

                io.to(
                    room.code
                ).emit(
                    "chatMessage",
                    {
                        type:
                            "system",

                        text:
                            card ===
                            "constitutional"
                                ? "🟦 سیاست مشروطه تصویب شد."
                                : "🟥 سیاست قاجاری تصویب شد."
                    }
                );

                if (
                    checkWinner(room)
                ) {
                    return;
                }

                chooseNextPresident(
                    room
                );

                setTimeout(() => {
                    if (
                        rooms.has(
                            room.code
                        )
                    ) {
                        startNomination(
                            room
                        );
                    }
                }, 1200);
            }
        );

        // =========================
        // قطع اتصال
        // =========================

        socket.on(
            "disconnect",
            () => {
                console.log(
                    "Client disconnected:",
                    socket.id
                );

                const room =
                    getRoom(socket);

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                room.players.delete(
                    socket.id
                );

                if (
                    room.players.size ===
                    0
                ) {
                    clearRoomTimer(
                        room
                    );

                    rooms.delete(
                        room.code
                    );

                    return;
                }

                // اگر صدر خارج شد
                if (
                    room.presidentId ===
                    socket.id
                ) {
                    const first =
                        [
                            ...room.players.values()
                        ][0];

                    room.presidentId =
                        first.id;
                }

                if (
                    room.nomineeId ===
                    socket.id
                ) {
                    room.nomineeId =
                        null;
                }

                room.messages.push({
                    type:
                        "system",

                    text:
                        `${player?.name || "یک بازیکن"} از اتاق خارج شد.`
                });

                broadcastRoom(
                    room
                );

                if (room.started) {
                    sendGameState(
                        room
                    );
                }
            }
        );
    }
);

// =========================
// سرور
// =========================

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "================================="
        );

        console.log(
            "🌑 سایه‌های دربار"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            "================================="
        );
    }
);
