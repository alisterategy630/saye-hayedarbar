"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   GAME CONSTANTS
   ========================================================= */

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;

const ROLE = {
    CONSTITUTIONALIST: "constitutionalist",
    QAJAR: "qajar",
    NASER: "naser"
};

const PHASE = {
    LOBBY: "lobby",
    NOMINATION: "nomination",
    VOTE: "vote",
    PRESIDENT_DISCARD: "president_discard",
    MINISTER_ENACT: "minister_enact",
    GAME_OVER: "game_over"
};

/* =========================================================
   ROOMS
   ========================================================= */

const rooms = new Map();

/* =========================================================
   UTILITY
   ========================================================= */

function generateRoomCode() {
    let code;

    do {
        code = String(Math.floor(1000 + Math.random() * 9000));
    } while (rooms.has(code));

    return code;
}

function cleanName(name) {
    return String(name || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 20);
}

function getRoom(socket) {
    const roomCode = socket.data.roomCode;

    if (!roomCode) {
        return null;
    }

    return rooms.get(roomCode) || null;
}

function getPlayer(room, socketId) {
    return room?.players.find(
        player => player.id === socketId
    );
}

function publicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        connected: player.connected
    };
}

function publicPlayers(room) {
    return room.players.map(publicPlayer);
}

/* =========================================================
   ROOM STATE
   ========================================================= */

function publicGameState(room, socketId) {
    const game = room.game;

    if (!game) {
        return null;
    }

    const player = getPlayer(room, socketId);

    return {
        phase: game.phase,

        players: publicPlayers(room),

        president: game.president
            ? publicPlayer(game.president)
            : null,

        nominee: game.nominee
            ? publicPlayer(game.nominee)
            : null,

        youArePresident:
            game.president?.id === socketId,

        youAreNominee:
            game.nominee?.id === socketId,

        youVoted:
            game.votes.has(socketId),

        constitutionalPolicies:
            game.constitutionalPolicies,

        qajarPolicies:
            game.qajarPolicies,

        policyDeckCount:
            game.policyDeck.length,

        currentPlayerId:
            player?.id || null
    };
}

/* =========================================================
   POLICY DECK
   ========================================================= */

function createPolicyDeck() {
    const deck = [];

    /*
      6 قاجاری
      11 مشروطه
    */

    for (let i = 0; i < 6; i++) {
        deck.push("qajar");
    }

    for (let i = 0; i < 11; i++) {
        deck.push("constitutional");
    }

    return shuffle(deck);
}

function shuffle(array) {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [copy[i], copy[j]] =
            [copy[j], copy[i]];
    }

    return copy;
}

function ensureDeck(room) {
    if (!room.game) {
        return;
    }

    if (room.game.policyDeck.length < 3) {
        room.game.policyDeck = shuffle(
            room.game.discardPile.concat(
                room.game.policyDeck
            )
        );

        room.game.discardPile = [];
    }
}

function drawPolicies(room, count) {
    ensureDeck(room);

    const cards = [];

    for (let i = 0; i < count; i++) {
        if (room.game.policyDeck.length === 0) {
            ensureDeck(room);
        }

        const card =
            room.game.policyDeck.shift();

        if (card) {
            cards.push(card);
        }
    }

    return cards;
}

/* =========================================================
   ROLES
   ========================================================= */

function assignRoles(players) {
    const shuffled = shuffle(players);

    const result = new Map();

    /*
      یک ناصر
      یک یا چند قاجاری
      بقیه مشروطه‌خواه
    */

    result.set(
        shuffled[0].id,
        ROLE.NASER
    );

    const qajarCount =
        players.length >= 8 ? 3 :
        players.length >= 6 ? 2 :
        1;

    for (let i = 1; i <= qajarCount; i++) {
        result.set(
            shuffled[i].id,
            ROLE.QAJAR
        );
    }

    for (
        let i = qajarCount + 1;
        i < shuffled.length;
        i++
    ) {
        result.set(
            shuffled[i].id,
            ROLE.CONSTITUTIONALIST
        );
    }

    return result;
}

/* =========================================================
   ROLE DESCRIPTION
   ========================================================= */

function roleDescription(role) {
    switch (role) {
        case ROLE.NASER:
            return "شما ناصرالدین شاه هستید. باید حکومت قاجار را حفظ کنید.";

        case ROLE.QAJAR:
            return "شما قاجاری هستید. هدف شما پیروزی جناح قاجار است.";

        case ROLE.CONSTITUTIONALIST:
            return "شما مشروطه‌خواه هستید. باید مسیر مشروطه را به پیروزی برسانید.";

        default:
            return "";
    }
}

/* =========================================================
   ALLIES
   ========================================================= */

function getAllies(room, player) {
    if (!room.game) {
        return [];
    }

    if (
        player.role === ROLE.CONSTITUTIONALIST
    ) {
        return [];
    }

    return room.players
        .filter(other =>
            other.id !== player.id &&
            (
                other.role === ROLE.QAJAR ||
                other.role === ROLE.NASER
            )
        )
        .map(publicPlayer);
}

/* =========================================================
   SEND ROLE
   ========================================================= */

function sendRole(room, player) {
    const socket =
        io.sockets.sockets.get(player.id);

    if (!socket) {
        return;
    }

    socket.emit("roleAssigned", {
        role: player.role,
        description: roleDescription(player.role),
        allies: getAllies(room, player)
    });
}

/* =========================================================
   SEND GAME STATE
   ========================================================= */

function broadcastGameState(room) {
    for (const player of room.players) {
        const socket =
            io.sockets.sockets.get(player.id);

        if (!socket) {
            continue;
        }

        socket.emit(
            "gameState",
            publicGameState(
                room,
                player.id
            )
        );
    }
}

/* =========================================================
   CHAT
   ========================================================= */

function broadcastLobbyChat(
    room,
    player,
    message
) {
    io.to(room.code).emit(
        "chatMessage",
        {
            name: player.name,
            message
        }
    );
}

function broadcastGameChat(
    room,
    player,
    message
) {
    io.to(room.code).emit(
        "gameChatMessage",
        {
            name: player.name,
            message
        }
    );
}

/* =========================================================
   ROOM STATE
   ========================================================= */

function broadcastRoomState(room) {
    io.to(room.code).emit(
        "roomState",
        {
            roomCode: room.code,
            players: publicPlayers(room)
        }
    );
}

/* =========================================================
   GAME START
   ========================================================= */

function startGame(room) {
    if (room.players.length < MIN_PLAYERS) {
        return false;
    }

    const roles =
        assignRoles(room.players);

    for (const player of room.players) {
        player.role =
            roles.get(player.id);
    }

    room.game = {
        phase: PHASE.NOMINATION,

        policyDeck:
            createPolicyDeck(),

        discardPile: [],

        constitutionalPolicies: 0,

        qajarPolicies: 0,

        presidentIndex: 0,

        president:
            room.players[0],

        nominee: null,

        votes: new Map(),

        presidentHand: [],

        ministerHand: [],

        nominationTimer: null,

        electionTracker: 0
    };

    for (const player of room.players) {
        sendRole(room, player);
    }

    io.to(room.code).emit(
        "gameStarted",
        {
            started: true
        }
    );

    broadcastGameState(room);

    return true;
}

/* =========================================================
   NEXT PRESIDENT
   ========================================================= */

function moveToNextPresident(room) {
    if (!room.game) {
        return;
    }

    const players = room.players;

    if (!players.length) {
        return;
    }

    room.game.presidentIndex =
        (
            room.game.presidentIndex + 1
        ) % players.length;

    room.game.president =
        players[
            room.game.presidentIndex
        ];

    room.game.nominee = null;

    room.game.votes =
        new Map();

    room.game.phase =
        PHASE.NOMINATION;

    broadcastGameState(room);
}

/* =========================================================
   NOMINATION
   ========================================================= */

function nominate(room, socket, nomineeId) {
    const game = room.game;

    if (!game) {
        return;
    }

    if (
        game.phase !== PHASE.NOMINATION
    ) {
        socket.emit(
            "errorMessage",
            {
                message:
                    "الان زمان انتخاب وزیر نیست."
            }
        );

        return;
    }

    if (
        game.president?.id !== socket.id
    ) {
        socket.emit(
            "errorMessage",
            {
                message:
                    "فقط صدر می‌تواند وزیر انتخاب کند."
            }
        );

        return;
    }

    const nominee =
        room.players.find(
            player =>
                player.id === nomineeId
        );

    if (!nominee) {
        socket.emit(
            "errorMessage",
            {
                message:
                    "بازیکن انتخاب‌شده پیدا نشد."
            }
        );

        return;
    }

    if (
        nominee.id === game.president.id
    ) {
        socket.emit(
            "errorMessage",
            {
                message:
                    "صدر نمی‌تواند خودش وزیر باشد."
            }
        );

        return;
    }

    game.nominee = nominee;
    game.votes = new Map();

    game.phase = PHASE.VOTE;

    broadcastGameState(room);
}

/* =========================================================
   VOTE
   ========================================================= */

function vote(room, socket, value) {
    const game = room.game;

    if (!game) {
        return;
    }

    if (game.phase !== PHASE.VOTE) {
        return;
    }

    if (
        value !== "yes" &&
        value !== "no"
    ) {
        return;
    }

    if (game.votes.has(socket.id)) {
        return;
    }

    game.votes.set(
        socket.id,
        value
    );

    broadcastGameState(room);

    if (
        game.votes.size >=
        room.players.length
    ) {
        resolveVote(room);
    }
}

/* =========================================================
   RESOLVE VOTE
   ========================================================= */

function resolveVote(room) {
    const game = room.game;

    let yes = 0;
    let no = 0;

    for (const vote of game.votes.values()) {
        if (vote === "yes") {
            yes++;
        } else {
            no++;
        }
    }

    io.to(room.code).emit(
        "publicResult",
        {
            type: "vote",
            yes,
            no
        }
    );

    if (yes > no) {
        game.electionTracker = 0;

        game.phase =
            PHASE.PRESIDENT_DISCARD;

        game.presidentHand =
            drawPolicies(room, 3);

        broadcastGameState(room);

        const presidentSocket =
            io.sockets.sockets.get(
                game.president.id
            );

        if (presidentSocket) {
            presidentSocket.emit(
                "policyDrawn",
                {
                    cards:
                        game.presidentHand
                }
            );
        }

        return;
    }

    game.electionTracker++;

    if (game.electionTracker >= 3) {
        enactTopDeck(room);
        return;
    }

    moveToNextPresident(room);
}

/* =========================================================
   PRESIDENT DISCARD
   ========================================================= */

function presidentDiscard(
    room,
    socket,
    index
) {
    const game = room.game;

    if (
        game.phase !==
        PHASE.PRESIDENT_DISCARD
    ) {
        return;
    }

    if (
        game.president?.id !== socket.id
    ) {
        return;
    }

    index = Number(index);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= game.presidentHand.length
    ) {
        socket.emit(
            "errorMessage",
            {
                message:
                    "انتخاب کارت نامعتبر است."
            }
        );

        return;
    }

    const discarded =
        game.presidentHand[index];

    game.discardPile.push(
        discarded
    );

    const ministerHand =
        game.presidentHand.filter(
            (_, i) => i !== index
        );

    game.presidentHand = [];

    game.ministerHand =
        ministerHand;

    game.phase =
        PHASE.MINISTER_ENACT;

    broadcastGameState(room);

    const ministerSocket =
        io.sockets.sockets.get(
            game.nominee.id
        );

    if (ministerSocket) {
        ministerSocket.emit(
            "ministerPolicy",
            {
                cards: ministerHand
            }
        );
    }
}

/* =========================================================
   MINISTER ENACT
   ========================================================= */

function ministerEnact(
    room,
    socket,
    index
) {
    const game = room.game;

    if (
        game.phase !==
        PHASE.MINISTER_ENACT
    ) {
        return;
    }

    if (
        game.nominee?.id !== socket.id
    ) {
        return;
    }

    index = Number(index);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= game.ministerHand.length
    ) {
        socket.emit(
            "errorMessage",
            {
                message:
                    "انتخاب کارت نامعتبر است."
            }
        );

        return;
    }

    const enacted =
        game.ministerHand[index];

    for (
        let i = 0;
        i < game.ministerHand.length;
        i++
    ) {
        if (i !== index) {
            game.discardPile.push(
                game.ministerHand[i]
            );
        }
    }

    game.ministerHand = [];

    if (enacted === "constitutional") {
        game.constitutionalPolicies++;
    } else {
        game.qajarPolicies++;
    }

    io.to(room.code).emit(
        "publicResult",
        {
            type: "policy",
            policy: enacted,
            constitutionalPolicies:
                game.constitutionalPolicies,
            qajarPolicies:
                game.qajarPolicies
        }
    );

    /*
      شرط برد مشروطه
    */

    if (
        game.constitutionalPolicies >= 5
    ) {
        finishGame(
            room,
            "constitutional",
            "پنج سیاست مشروطه تصویب شد."
        );

        return;
    }

    /*
      شرط برد قاجار
    */

    if (
        game.qajarPolicies >= 6
    ) {
        finishGame(
            room,
            "qajar",
            "شش سیاست قاجاری تصویب شد."
        );

        return;
    }

    /*
      اگر سه سیاست قاجاری تصویب شده
      و ناصر وزیر بوده، قاجار پیروز می‌شود.
    */

    if (
        game.qajarPolicies >= 3 &&
        game.nominee?.role === ROLE.NASER
    ) {
        finishGame(
            room,
            "qajar",
            "ناصرالدین شاه به مقام وزارت رسید."
        );

        return;
    }

    moveToNextPresident(room);
}

/* =========================================================
   TOP DECK
   ========================================================= */

function enactTopDeck(room) {
    const game = room.game;

    const card =
        drawPolicies(room, 1)[0];

    if (!card) {
        return;
    }

    if (card === "constitutional") {
        game.constitutionalPolicies++;
    } else {
        game.qajarPolicies++;
    }

    io.to(room.code).emit(
        "publicResult",
        {
            type: "automaticPolicy",
            policy: card
        }
    );

    if (
        game.constitutionalPolicies >= 5
    ) {
        finishGame(
            room,
            "constitutional",
            "پنج سیاست مشروطه تصویب شد."
        );

        return;
    }

    if (
        game.qajarPolicies >= 6
    ) {
        finishGame(
            room,
            "qajar",
            "شش سیاست قاجاری تصویب شد."
        );

        return;
    }

    moveToNextPresident(room);
}

/* =========================================================
   GAME OVER
   ========================================================= */

function finishGame(
    room,
    winner,
    reason
) {
    if (!room.game) {
        return;
    }

    room.game.phase =
        PHASE.GAME_OVER;

    io.to(room.code).emit(
        "gameOver",
        {
            winner,
            reason
        }
    );

    broadcastGameState(room);
}

/* =========================================================
   SOCKET CONNECTION
   ========================================================= */

io.on("connection", socket => {
    console.log(
        "Connected:",
        socket.id
    );

    /* =====================================================
       CREATE ROOM
       ===================================================== */

    socket.on(
        "createRoom",
        ({ name }) => {
            name = cleanName(name);

            if (!name) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "نام بازیکن الزامی است."
                    }
                );

                return;
            }

            const code =
                generateRoomCode();

            const player = {
                id: socket.id,
                name,
                role: null,
                connected: true
            };

            const room = {
                code,
                players: [player],
                game: null
            };

            rooms.set(code, room);

            socket.data.roomCode =
                code;

            socket.join(code);

            socket.emit(
                "roomCreated",
                {
                    roomCode: code
                }
            );

            broadcastRoomState(room);
        }
    );

    /* =====================================================
       JOIN ROOM
       ===================================================== */

    socket.on(
        "joinRoom",
        ({ roomCode, name }) => {
            roomCode =
                String(roomCode || "")
                    .replace(/\D/g, "")
                    .slice(0, 4);

            name = cleanName(name);

            const room =
                rooms.get(roomCode);

            if (!room) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "اتاق پیدا نشد."
                    }
                );

                return;
            }

            if (room.game) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "این بازی شروع شده است."
                    }
                );

                return;
            }

            if (
                room.players.length >=
                MAX_PLAYERS
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "اتاق پر است."
                    }
                );

                return;
            }

            if (!name) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "نام بازیکن الزامی است."
                    }
                );

                return;
            }

            const duplicate =
                room.players.some(
                    player =>
                        player.name
                            .toLowerCase() ===
                        name.toLowerCase()
                );

            if (duplicate) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "این نام قبلاً استفاده شده است."
                    }
                );

                return;
            }

            const player = {
                id: socket.id,
                name,
                role: null,
                connected: true
            };

            room.players.push(player);

            socket.data.roomCode =
                roomCode;

            socket.join(roomCode);

            socket.emit(
                "roomCreated",
                {
                    roomCode
                }
            );

            broadcastRoomState(room);
        }
    );

    /* =====================================================
       START GAME
       ===================================================== */

    socket.on(
        "startGame",
        () => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (!player) {
                return;
            }

            if (
                room.players[0].id !==
                socket.id
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "فقط سازنده اتاق می‌تواند بازی را شروع کند."
                    }
                );

                return;
            }

            if (
                room.players.length <
                MIN_PLAYERS
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            `حداقل ${MIN_PLAYERS} بازیکن لازم است.`
                    }
                );

                return;
            }

            startGame(room);
        }
    );

    /* =====================================================
       NOMINATE
       ===================================================== */

    socket.on(
        "nominate",
        ({ nomineeId }) => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            nominate(
                room,
                socket,
                nomineeId
            );
        }
    );

    /* =====================================================
       VOTE
       ===================================================== */

    socket.on(
        "vote",
        ({ vote: value }) => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            vote(
                room,
                socket,
                value
            );
        }
    );

    /* =====================================================
       PRESIDENT DISCARD
       ===================================================== */

    socket.on(
        "presidentDiscard",
        ({ index }) => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            presidentDiscard(
                room,
                socket,
                index
            );
        }
    );

    /* =====================================================
       MINISTER ENACT
       ===================================================== */

    socket.on(
        "ministerEnact",
        ({ index }) => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            ministerEnact(
                room,
                socket,
                index
            );
        }
    );

    /* =====================================================
       LOBBY CHAT
       ===================================================== */

    socket.on(
        "chatMessage",
        ({ message }) => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (!player) {
                return;
            }

            message =
                String(message || "")
                    .trim()
                    .slice(0, 300);

            if (!message) {
                return;
            }

            broadcastLobbyChat(
                room,
                player,
                message
            );
        }
    );

    /* =====================================================
       GAME CHAT
       ===================================================== */

    socket.on(
        "gameChatMessage",
        ({ message }) => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (!player) {
                return;
            }

            message =
                String(message || "")
                    .trim()
                    .slice(0, 300);

            if (!message) {
                return;
            }

            broadcastGameChat(
                room,
                player,
                message
            );
        }
    );

    /* =====================================================
       DISCONNECT
       ===================================================== */

    socket.on(
        "disconnect",
        () => {
            const room =
                getRoom(socket);

            if (!room) {
                return;
            }

            const index =
                room.players.findIndex(
                    player =>
                        player.id ===
                        socket.id
                );

            if (index === -1) {
                return;
            }

            room.players.splice(
                index,
                1
            );

            if (
                room.players.length === 0
            ) {
                rooms.delete(
                    room.code
                );

                return;
            }

            /*
              اگر بازی در جریان بود و بازیکن
              خارج شد، فعلاً بازی ادامه پیدا می‌کند
              ولی وضعیت بازیکنان به‌روز می‌شود.
            */

            if (room.game) {
                if (
                    room.game.president?.id ===
                    socket.id
                ) {
                    room.game.president =
                        room.players[
                            room.game
                                .presidentIndex %
                            room.players.length
                        ];
                }

                broadcastGameState(room);

                return;
            }

            broadcastRoomState(room);
        }
    );
});

/* =========================================================
   HTTP
   ========================================================= */

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        rooms: rooms.size
    });
});

app.get("*", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

/* =========================================================
   START
   ========================================================= */

server.listen(
    PORT,
    () => {
        console.log(
            `سایه‌های دربار running on port ${PORT}`
        );
    }
);
