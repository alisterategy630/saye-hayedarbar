const express = require("express");
const http = require("http");
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

const ROLE = {
    CONSTITUTIONALIST: "constitutionalist",
    QAJAR: "qajar",
    NASER: "naser"
};

/*
    قوانین بازی:

    حداقل بازیکن: 4
    حداکثر بازیکن: 10

    هر دولت:
    1. صدر یک وزیر معرفی می‌کند.
    2. همه رأی می‌دهند.
    3. اگر دولت تأیید شد:
       - صدر 3 کارت دریافت می‌کند.
       - صدر 1 کارت را حذف می‌کند.
       - 2 کارت باقی‌مانده به وزیر می‌رود.
       - وزیر 1 کارت را تصویب می‌کند.
       - کارت دیگر کنار گذاشته می‌شود.
*/

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

        [copy[i], copy[j]] = [
            copy[j],
            copy[i]
        ];
    }

    return copy;
}

/*
    دسته سیاست:

    6 کارت مشروطه
    11 کارت قاجاری
*/
function makePolicyDeck() {
    return shuffle([
        ...Array(6).fill("constitutional"),
        ...Array(11).fill("qajar")
    ]);
}

/*
    اطمینان از وجود تعداد کافی کارت
*/
function ensureDeck(room, needed = 3) {

    if (room.policyDeck.length >= needed) {
        return;
    }

    if (room.policyDiscard.length > 0) {

        room.policyDeck = shuffle([
            ...room.policyDeck,
            ...room.policyDiscard
        ]);

        room.policyDiscard = [];
    }

    /*
        اگر هنوز کارت کافی نداریم،
        یک دسته جدید اضافه می‌کنیم.
    */
    while (room.policyDeck.length < needed) {

        room.policyDeck = shuffle([
            ...room.policyDeck,
            ...makePolicyDeck()
        ]);
    }
}

function addMessage(room, type, name, text) {

    room.messages.push({
        type,
        name,
        text
    });

    if (room.messages.length > 100) {
        room.messages.shift();
    }
}

function getPublicPlayers(room) {

    return room.players.map((player) => ({
        id: player.id,
        name: player.name,
        host: player.host,
        connected: player.connected !== false
    }));
}

function getPresident(room) {

    return room.players[room.presidentIndex] || null;
}

function getNominee(room) {

    return room.players.find(
        (player) =>
            player.id === room.nominatedChancellorId
    ) || null;
}

function getPhaseText(phase) {

    const texts = {

        nomination:
            "انتخاب وزیر",

        vote:
            "رأی‌گیری",

        president_discard:
            "صدر یک کارت را کنار می‌گذارد",

        minister_enact:
            "وزیر یک سیاست را تصویب می‌کند",

        finished:
            "بازی تمام شد"
    };

    return texts[phase] || phase;
}

function buildPublicGameState(room) {

    const president = getPresident(room);
    const nominee = getNominee(room);

    return {

        roomCode: room.code,

        phase: room.phase,

        phaseText:
            getPhaseText(room.phase),

        players:
            getPublicPlayers(room),

        president:
            president
                ? {
                    id: president.id,
                    name: president.name
                }
                : null,

        nominee:
            nominee
                ? {
                    id: nominee.id,
                    name: nominee.name
                }
                : null,

        constitutionalPolicies:
            room.constitutionalPolicies,

        qajarPolicies:
            room.qajarPolicies,

        electionFailed:
            room.electionFailed,

        lastResult:
            room.lastResult,

        winner:
            room.winner,

        policyDeckCount:
            room.policyDeck.length,

        /*
            فقط تعداد کارت‌های وزیر نمایش داده می‌شود.
            خود کارت‌ها محرمانه هستند.
        */
        ministerCardCount:
            Array.isArray(room.ministerHand)
                ? room.ministerHand.length
                : 0
    };
}

function sendGameState(roomCode) {

    const room = rooms.get(roomCode);

    if (!room) {
        return;
    }

    const base =
        buildPublicGameState(room);

    const president =
        getPresident(room);

    room.players.forEach((player) => {

        if (!player.id) {
            return;
        }

        io.to(player.id).emit(
            "gameState",
            {
                ...base,

                youArePresident:
                    president?.id === player.id,

                youAreNominee:
                    room.nominatedChancellorId === player.id,

                youVoted:
                    Object.prototype.hasOwnProperty.call(
                        room.votes,
                        player.id
                    )
            }
        );
    });
}

/*
    نقش‌ها

    4 بازیکن:
    ناصرالدین شاه
    1 قاجاری
    2 مشروطه‌خواه

    5-6 بازیکن:
    ناصرالدین شاه
    1 قاجاری
    بقیه مشروطه‌خواه

    7-10 بازیکن:
    ناصرالدین شاه
    2 قاجاری
    بقیه مشروطه‌خواه
*/
function assignRoles(room) {

    const count =
        room.players.length;

    let qajarCount;

    if (count <= 6) {
        qajarCount = 2;
    } else {
        qajarCount = 3;
    }

    const roles = [
        ROLE.NASER
    ];

    for (
        let i = 1;
        i < qajarCount;
        i++
    ) {
        roles.push(ROLE.QAJAR);
    }

    while (
        roles.length < count
    ) {
        roles.push(
            ROLE.CONSTITUTIONALIST
        );
    }

    const shuffledRoles =
        shuffle(roles);

    room.players.forEach(
        (player, index) => {

            player.role =
                shuffledRoles[index];
        }
    );
}

function sendPrivateRoles(room) {

    const qajarPlayers =
        room.players.filter(
            (player) =>
                player.role === ROLE.QAJAR ||
                player.role === ROLE.NASER
        );

    room.players.forEach((player) => {

        if (!player.id) {
            return;
        }

        let allies = [];

        if (
            player.role === ROLE.QAJAR ||
            player.role === ROLE.NASER
        ) {

            allies =
                qajarPlayers
                    .filter(
                        (ally) =>
                            ally.id !== player.id
                    )
                    .map((ally) => ({
                        name: ally.name,

                        role:
                            ally.role === ROLE.NASER
                                ? "ناصرالدین شاه"
                                : "قاجاری"
                    }));
        }

        io.to(player.id).emit(
            "roleAssigned",
            {
                role: player.role,
                allies
            }
        );
    });
}

function startNextRound(room) {

    room.nominatedChancellorId =
        null;

    room.votes = {};

    room.presidentHand = [];

    room.ministerHand = [];

    room.lastResult = null;

    room.phase = "nomination";

    sendGameState(room.code);
}

function finishGame(
    room,
    faction,
    reason
) {

    room.winner = {
        faction,
        reason
    };

    room.phase = "finished";

    addMessage(
        room,
        "system",
        "دربار",
        reason
    );

    io.to(room.code).emit(
        "gameOver",
        room.winner
    );

    sendGameState(room.code);
}

io.on("connection", (socket) => {

    console.log(
        "بازیکن متصل شد:",
        socket.id
    );

    /*
        ساخت اتاق
    */
    socket.on(
        "createRoom",
        ({ name }) => {

            const cleanName =
                String(name || "")
                    .trim()
                    .slice(0, 20);

            if (!cleanName) {

                socket.emit(
                    "errorMessage",
                    "نام بازیکن را وارد کن."
                );

                return;
            }

            const roomCode =
                createRoomCode();

            const room = {

                code: roomCode,

                started: false,

                players: [
                    {
                        id: socket.id,
                        name: cleanName,
                        host: true,
                        role: null,
                        connected: true
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

                ministerHand: []
            };

            rooms.set(
                roomCode,
                room
            );

            socket.join(roomCode);

            socket.data.roomCode =
                roomCode;

            addMessage(
                room,
                "system",
                "دربار",
                `${cleanName} اتاق را ساخت.`
            );

            socket.emit(
                "roomCreated",
                {
                    roomCode
                }
            );

            sendRoomState(
                roomCode
            );
        }
    );

    /*
        ورود به اتاق
    */
    socket.on(
        "joinRoom",
        ({ name, roomCode }) => {

            const cleanName =
                String(name || "")
                    .trim()
                    .slice(0, 20);

            const cleanCode =
                String(roomCode || "")
                    .trim();

            if (!cleanName) {

                socket.emit(
                    "errorMessage",
                    "نام بازیکن را وارد کن."
                );

                return;
            }

            if (
                !/^\d{4}$/.test(
                    cleanCode
                )
            ) {

                socket.emit(
                    "errorMessage",
                    "کد اتاق باید ۴ رقمی باشد."
                );

                return;
            }

            const room =
                rooms.get(cleanCode);

            if (!room) {

                socket.emit(
                    "errorMessage",
                    "این اتاق وجود ندارد."
                );

                return;
            }

            if (room.started) {

                socket.emit(
                    "errorMessage",
                    "بازی شروع شده است."
                );

                return;
            }

            if (
                room.players.length >= 10
            ) {

                socket.emit(
                    "errorMessage",
                    "اتاق پر است."
                );

                return;
            }

            const duplicate =
                room.players.some(
                    (player) =>
                        player.name.toLowerCase() ===
                        cleanName.toLowerCase()
                );

            if (duplicate) {

                socket.emit(
                    "errorMessage",
                    "این نام قبلاً استفاده شده."
                );

                return;
            }

            room.players.push({
                id: socket.id,
                name: cleanName,
                host: false,
                role: null,
                connected: true
            });

            socket.join(cleanCode);

            socket.data.roomCode =
                cleanCode;

            addMessage(
                room,
                "system",
                "دربار",
                `${cleanName} وارد اتاق شد.`
            );

            sendRoomState(
                cleanCode
            );
        }
    );

    /*
        چت لابی
    */
    socket.on(
        "lobbyChat",
        ({ text }) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (
                !room ||
                room.started
            ) {
                return;
            }

            const player =
                room.players.find(
                    (p) =>
                        p.id === socket.id
                );

            if (!player) {
                return;
            }

            const cleanText =
                String(text || "")
                    .trim()
                    .slice(0, 300);

            if (!cleanText) {
                return;
            }

            const message = {
                type: "chat",
                name: player.name,
                text: cleanText
            };

            room.messages.push(message);

            if (
                room.messages.length > 100
            ) {
                room.messages.shift();
            }

            io.to(roomCode).emit(
                "chatMessage",
                message
            );
        }
    );

    /*
        شروع بازی
    */
    socket.on(
        "startGame",
        () => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (!room) {
                return;
            }

            const player =
                room.players.find(
                    (p) =>
                        p.id === socket.id
                );

            if (!player?.host) {

                socket.emit(
                    "errorMessage",
                    "فقط سازنده اتاق می‌تواند بازی را شروع کند."
                );

                return;
            }

            /*
                مهم:
                حالا 4 نفر کافی است.
            */
            if (
                room.players.length < 4
            ) {

                socket.emit(
                    "errorMessage",
                    "برای شروع بازی حداقل ۴ بازیکن لازم است."
                );

                return;
            }

            room.started = true;

            room.phase =
                "nomination";

            room.presidentIndex = 0;

            room.nominatedChancellorId =
                null;

            room.votes = {};

            room.electionFailed = 0;

            room.lastResult = null;

            room.winner = null;

            room.constitutionalPolicies = 0;

            room.qajarPolicies = 0;

            room.policyDeck =
                makePolicyDeck();

            room.policyDiscard = [];

            room.presidentHand = [];

            room.ministerHand = [];

            assignRoles(room);

            sendPrivateRoles(room);

            addMessage(
                room,
                "system",
                "دربار",
                "بازی آغاز شد. اولین صدر مشخص شد."
            );

            io.to(roomCode).emit(
                "gameStarted"
            );

            sendGameState(
                roomCode
            );
        }
    );

    /*
        معرفی وزیر
    */
    socket.on(
        "nominateChancellor",
        ({ playerId }) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (
                !room ||
                !room.started ||
                room.phase !== "nomination"
            ) {
                return;
            }

            const president =
                getPresident(room);

            if (
                !president ||
                president.id !== socket.id
            ) {

                socket.emit(
                    "errorMessage",
                    "فقط صدر می‌تواند وزیر انتخاب کند."
                );

                return;
            }

            if (
                playerId === president.id
            ) {

                socket.emit(
                    "errorMessage",
                    "صدر نمی‌تواند خودش را وزیر انتخاب کند."
                );

                return;
            }

            const nominee =
                room.players.find(
                    (p) =>
                        p.id === playerId
                );

            if (!nominee) {
                return;
            }

            room.nominatedChancellorId =
                nominee.id;

            room.votes = {};

            room.lastResult = null;

            room.phase = "vote";

            addMessage(
                room,
                "system",
                "دربار",
                `${president.name}، ${nominee.name} را برای وزارت معرفی کرد.`
            );

            sendGameState(
                roomCode
            );
        }
    );

    /*
        رأی‌گیری
    */
    socket.on(
        "castVote",
        ({ vote }) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (
                !room ||
                !room.started ||
                room.phase !== "vote"
            ) {
                return;
            }

            if (
                vote !== "yes" &&
                vote !== "no"
            ) {
                return;
            }

            const player =
                room.players.find(
                    (p) =>
                        p.id === socket.id
                );

            if (!player) {
                return;
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    room.votes,
                    socket.id
                )
            ) {

                socket.emit(
                    "errorMessage",
                    "قبلاً رأی داده‌ای."
                );

                return;
            }

            room.votes[socket.id] =
                vote;

            sendGameState(
                roomCode
            );

            if (
                Object.keys(room.votes).length !==
                room.players.length
            ) {
                return;
            }

            const yesVotes =
                Object.values(room.votes)
                    .filter(
                        (v) => v === "yes"
                    )
                    .length;

            const noVotes =
                Object.values(room.votes)
                    .filter(
                        (v) => v === "no"
                    )
                    .length;

            /*
                در 4 نفر:
                3-1 یا 4-0 قبول
                2-2 رد
            */
            const approved =
                yesVotes > noVotes;

            const president =
                getPresident(room);

            const nominee =
                getNominee(room);

            room.lastResult = {
                approved,
                yesVotes,
                noVotes,
                presidentName:
                    president?.name || "",
                nomineeName:
                    nominee?.name || ""
            };

            /*
                دولت رد شد
            */
            if (!approved) {

                room.electionFailed++;

                addMessage(
                    room,
                    "system",
                    "دربار",
                    `دولت رد شد: ${yesVotes} موافق و ${noVotes} مخالف.`
                );

                room.presidentIndex =
                    (
                        room.presidentIndex + 1
                    ) %
                    room.players.length;

                room.nominatedChancellorId =
                    null;

                room.votes = {};

                room.phase =
                    "nomination";

                sendGameState(
                    roomCode
                );

                return;
            }

            /*
                دولت قبول شد
            */
            room.electionFailed = 0;

            /*
                قانون ناصرالدین شاه
            */
            if (
                room.qajarPolicies >= 3 &&
                nominee?.role === ROLE.NASER
            ) {

                finishGame(
                    room,
                    "qajar",
                    "👑 قاجاریان پیروز شدند؛ ناصرالدین شاه پس از ۳ سیاست قاجاری وزیر شد."
                );

                return;
            }

            /*
                شروع مرحله صدر
            */

            room.phase =
                "president_discard";

            room.presidentHand = [];

            room.ministerHand = [];

            /*
                بسیار مهم:
                صدر باید 3 کارت بگیرد.
            */
            ensureDeck(room, 3);

            room.presidentHand = [
                room.policyDeck.pop(),
                room.policyDeck.pop(),
                room.policyDeck.pop()
            ];

            addMessage(
                room,
                "system",
                "دربار",
                `دولت تأیید شد. سه کارت سیاست به ${president.name} رسید.`
            );

            /*
                فقط صدر کارت‌ها را می‌بیند.
            */
            io.to(president.id).emit(
                "policyDrawn",
                {
                    cards:
                        room.presidentHand
                }
            );

            sendGameState(
                roomCode
            );
        }
    );

    /*
        صدر یک کارت از سه کارت حذف می‌کند
    */
    socket.on(
        "presidentDiscard",
        ({ index }) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (
                !room ||
                room.phase !== "president_discard"
            ) {
                return;
            }

            const president =
                getPresident(room);

            if (
                !president ||
                president.id !== socket.id
            ) {

                socket.emit(
                    "errorMessage",
                    "فقط صدر می‌تواند کارت کنار بگذارد."
                );

                return;
            }

            if (
                !Array.isArray(
                    room.presidentHand
                ) ||
                room.presidentHand.length !== 3
            ) {

                socket.emit(
                    "errorMessage",
                    "سه کارت صدر آماده نیستند."
                );

                return;
            }

            const discardIndex =
                Number(index);

            if (
                ![0, 1, 2].includes(
                    discardIndex
                )
            ) {
                return;
            }

            /*
                کارت حذف‌شده
            */
            const discarded =
                room.presidentHand[
                    discardIndex
                ];

            /*
                دو کارت باقی‌مانده
            */
            const remaining =
                room.presidentHand.filter(
                    (_, i) =>
                        i !== discardIndex
                );

            /*
                کارت حذف‌شده وارد discard می‌شود
            */
            room.policyDiscard.push(
                discarded
            );

            /*
                دو کارت به وزیر
            */
            room.ministerHand =
                remaining;

            room.presidentHand = [];

            room.phase =
                "minister_enact";

            const nominee =
                getNominee(room);

            if (!nominee) {

                room.ministerHand = [];

                room.phase =
                    "nomination";

                room.nominatedChancellorId =
                    null;

                sendGameState(
                    roomCode
                );

                return;
            }

            addMessage(
                room,
                "system",
                "دربار",
                "صدر یک کارت را کنار گذاشت؛ دو کارت باقی‌مانده به وزیر رسید."
            );

            /*
                دو کارت به وزیر
            */
            io.to(nominee.id).emit(
                "ministerPolicy",
                {
                    cards:
                        room.ministerHand
                }
            );

            sendGameState(
                roomCode
            );
        }
    );

    /*
        وزیر یکی از دو کارت را انتخاب می‌کند
    */
    socket.on(
        "ministerEnact",
        ({ index }) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (
                !room ||
                room.phase !== "minister_enact"
            ) {
                return;
            }

            const nominee =
                getNominee(room);

            if (
                !nominee ||
                nominee.id !== socket.id
            ) {

                socket.emit(
                    "errorMessage",
                    "فقط وزیر می‌تواند کارت را تصویب کند."
                );

                return;
            }

            if (
                !Array.isArray(
                    room.ministerHand
                ) ||
                room.ministerHand.length !== 2
            ) {

                socket.emit(
                    "errorMessage",
                    "دو کارت وزیر آماده نیستند."
                );

                return;
            }

            const chosenIndex =
                Number(index);

            if (
                ![0, 1].includes(
                    chosenIndex
                )
            ) {
                return;
            }

            const enacted =
                room.ministerHand[
                    chosenIndex
                ];

            const discarded =
                room.ministerHand[
                    chosenIndex === 0
                        ? 1
                        : 0
                ];

            /*
                کارت انتخاب‌شده تصویب می‌شود.
                کارت دیگر هم کنار گذاشته می‌شود.
            */
            room.policyDiscard.push(
                discarded,
                enacted
            );

            room.ministerHand = [];

            if (
                enacted === "constitutional"
            ) {

                room.constitutionalPolicies++;

            } else if (
                enacted === "qajar"
            ) {

                room.qajarPolicies++;

            } else {

                socket.emit(
                    "errorMessage",
                    "کارت سیاست نامعتبر است."
                );

                return;
            }

            const label =
                enacted === "constitutional"
                    ? "🟦 سیاست مشروطه"
                    : "🟥 سیاست قاجاری";

            addMessage(
                room,
                "system",
                "دربار",
                `${label} تصویب شد.`
            );

            io.to(roomCode).emit(
                "narrator",
                {
                    text:
                        `راوی دربار: ${label} تصویب شد.`
                }
            );

            /*
                پیروزی مشروطه
            */
            if (
                room.constitutionalPolicies >= 5
            ) {

                finishGame(
                    room,
                    "constitutionalist",
                    "🟦 مشروطه‌خواهان با تصویب ۵ سیاست پیروز شدند."
                );

                return;
            }

            /*
                پیروزی قاجار
            */
            if (
                room.qajarPolicies >= 6
            ) {

                finishGame(
                    room,
                    "qajar",
                    "🟥 قاجاریان با تصویب ۶ سیاست پیروز شدند."
                );

                return;
            }

            /*
                صدر بعدی
            */
            room.presidentIndex =
                (
                    room.presidentIndex + 1
                ) %
                room.players.length;

            startNextRound(room);
        }
    );

    /*
        چت داخل بازی
    */
    socket.on(
        "gameChat",
        ({ text }) => {

            const roomCode =
                socket.data.roomCode;

            const room =
                rooms.get(roomCode);

            if (
                !room ||
                !room.started
            ) {
                return;
            }

            const player =
                room.players.find(
                    (p) =>
                        p.id === socket.id
                );

            if (!player) {
                return;
            }

            const cleanText =
                String(text || "")
                    .trim()
                    .slice(0, 300);

            if (!cleanText) {
                return;
            }

            io.to(roomCode).emit(
                "gameChatMessage",
                {
                    type: "chat",
                    name: player.name,
                    text: cleanText
                }
            );
        }
    );

    /*
        قطع اتصال
    */
    socket.on(
        "disconnect",
        () => {

            const roomCode =
                socket.data.roomCode;

            if (!roomCode) {
                return;
            }

            const room =
                rooms.get(roomCode);

            if (!room) {
                return;
            }

            const leavingIndex =
                room.players.findIndex(
                    (p) =>
                        p.id === socket.id
                );

            if (
                leavingIndex === -1
            ) {
                return;
            }

            const leavingPlayer =
                room.players[
                    leavingIndex
                ];

            room.players.splice(
                leavingIndex,
                1
            );

            if (
                room.players.length === 0
            ) {

                rooms.delete(roomCode);

                return;
            }

            if (
                leavingIndex <
                room.presidentIndex
            ) {

                room.presidentIndex--;
            }

            if (
                room.presidentIndex >=
                room.players.length
            ) {

                room.presidentIndex = 0;
            }

            /*
                اگر سازنده خارج شد،
                بازیکن اول سازنده می‌شود.
            */
            if (
                !room.players.some(
                    (p) => p.host
                )
            ) {

                room.players[0].host =
                    true;
            }

            if (room.started) {

                room.nominatedChancellorId =
                    null;

                room.votes = {};

                room.presidentHand = [];

                room.ministerHand = [];

                room.phase =
                    "nomination";

                room.lastResult = null;

                addMessage(
                    room,
                    "system",
                    "دربار",
                    `${leavingPlayer?.name || "یک بازیکن"} از بازی خارج شد.`
                );

                sendGameState(
                    roomCode
                );

            } else {

                addMessage(
                    room,
                    "system",
                    "دربار",
                    `${leavingPlayer?.name || "بازیکن"} از اتاق خارج شد.`
                );

                sendRoomState(
                    roomCode
                );
            }
        }
    );

    /*
        وضعیت لابی
    */
    function sendRoomState(roomCode) {

        const room =
            rooms.get(roomCode);

        if (!room) {
            return;
        }

        io.to(roomCode).emit(
            "roomState",
            {
                roomCode,

                players:
                    getPublicPlayers(room),

                started:
                    room.started,

                messages:
                    room.messages
            }
        );
    }
});

const PORT =
    process.env.PORT || 3000;

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
            "👥 حداقل بازیکن: 4"
        );

        console.log(
            "🎴 قانون کارت: 3 → 2 → 1"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            "================================="
        );
    }
);
