const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

const NOMINATION_TIME = 60 * 1000;

function generateRoomCode() {
    let code;

    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[code]);

    return code;
}

function createRoomState(code) {
    return {
        code,
        players: [],
        phase: "lobby",

        presidentIndex: 0,
        nomineeId: null,

        votes: {},
        presidentCards: [],
        ministerCard: null,

        constitutionalPolicies: 0,
        qajarPolicies: 0,

        policyDeck: [
            "constitutional",
            "constitutional",
            "constitutional",
            "constitutional",
            "constitutional",
            "constitutional",
            "qajar",
            "qajar",
            "qajar",
            "qajar",
            "qajar",
            "qajar"
        ],

        phaseEndsAt: null,
        electionTracker: 0
    };
}

function shuffle(array) {
    return [...array].sort(() => Math.random() - 0.5);
}

function getPublicState(room) {
    return {
        code: room.code,
        phase: room.phase,
        phaseEndsAt: room.phaseEndsAt,

        players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role
        })),

        presidentId:
            room.players[room.presidentIndex]?.id || null,

        nomineeId: room.nomineeId,

        votes: room.votes,

        constitutionalPolicies: room.constitutionalPolicies,
        qajarPolicies: room.qajarPolicies,

        deckCount: room.policyDeck.length
    };
}

function broadcastRoom(room) {
    io.to(room.code).emit("gameState", getPublicState(room));
}

function assignRoles(room) {
    const count = room.players.length;

    let qajarCount = 1;

    if (count >= 7) {
        qajarCount = 2;
    }

    if (count >= 9) {
        qajarCount = 3;
    }

    const roles = [];

    for (let i = 0; i < qajarCount; i++) {
        roles.push("qajar");
    }

    roles.push("naser");

    while (roles.length < count) {
        roles.push("constitutionalist");
    }

    const shuffledRoles = shuffle(roles);

    room.players.forEach((player, index) => {
        player.role = shuffledRoles[index];
    });
}

function sendRoles(room) {
    room.players.forEach((player) => {
        const allies = room.players
            .filter((p) => {
                if (player.role === "qajar") {
                    return p.role === "qajar" || p.role === "naser";
                }

                if (player.role === "naser") {
                    return p.role === "qajar";
                }

                return false;
            })
            .map((p) => p.name);

        io.to(player.id).emit("roleAssigned", {
            role: player.role,
            allies
        });
    });
}

function startNomination(room) {
    if (room.players.length < 3) {
        room.phase = "lobby";
        room.phaseEndsAt = null;
        broadcastRoom(room);
        return;
    }

    room.phase = "nomination";
    room.nomineeId = null;
    room.votes = {};
    room.presidentCards = [];
    room.ministerCard = null;

    room.phaseEndsAt = Date.now() + NOMINATION_TIME;

    broadcastRoom(room);

    io.to(room.code).emit("phaseMessage", {
        text: "صدر باید وزیر بعدی را انتخاب کند."
    });

    setTimeout(() => {
        const currentRoom = rooms[room.code];

        if (!currentRoom) return;

        if (
            currentRoom.phase === "nomination" &&
            currentRoom.phaseEndsAt &&
            Date.now() >= currentRoom.phaseEndsAt
        ) {
            autoNomination(currentRoom);
        }
    }, NOMINATION_TIME + 100);
}

function autoNomination(room) {
    const president = room.players[room.presidentIndex];

    if (!president) return;

    const possible = room.players.filter(
        (p) => p.id !== president.id
    );

    if (possible.length === 0) return;

    const nominee =
        possible[Math.floor(Math.random() * possible.length)];

    room.nomineeId = nominee.id;
    room.phaseEndsAt = null;

    io.to(room.code).emit("nominationAuto", {
        nomineeId: nominee.id
    });

    startVoting(room);
}

function startVoting(room) {
    room.phase = "voting";
    room.votes = {};
    room.phaseEndsAt = null;

    broadcastRoom(room);

    io.to(room.code).emit("phaseMessage", {
        text: "رأی‌گیری آغاز شد."
    });
}

function checkVotes(room) {
    const totalPlayers = room.players.length;
    const votes = Object.values(room.votes);

    if (votes.length < totalPlayers) {
        return;
    }

    const yes = votes.filter((v) => v === true).length;
    const no = votes.filter((v) => v === false).length;

    const approved = yes > no;

    io.to(room.code).emit("voteResult", {
        yes,
        no,
        approved
    });

    if (!approved) {
        room.nomineeId = null;
        room.electionTracker++;

        room.presidentIndex =
            (room.presidentIndex + 1) % room.players.length;

        if (room.electionTracker >= 3) {
            enactRandomPolicy(room);
            room.electionTracker = 0;
            return;
        }

        setTimeout(() => {
            startNomination(room);
        }, 1800);

        return;
    }

    room.electionTracker = 0;
    startPresidentPolicy(room);
}

function drawPolicies(room, amount) {
    if (room.policyDeck.length < amount) {
        room.policyDeck = shuffle([
            "constitutional",
            "constitutional",
            "constitutional",
            "constitutional",
            "constitutional",
            "constitutional",
            "qajar",
            "qajar",
            "qajar",
            "qajar",
            "qajar",
            "qajar"
        ]);
    }

    return room.policyDeck.splice(0, amount);
}

function startPresidentPolicy(room) {
    const president = room.players[room.presidentIndex];
    const minister = room.players.find(
        (p) => p.id === room.nomineeId
    );

    if (!president || !minister) {
        startNomination(room);
        return;
    }

    room.phase = "presidentPolicy";
    room.phaseEndsAt = null;

    room.presidentCards = drawPolicies(room, 2);

    io.to(president.id).emit("policyDrawn", {
        cards: room.presidentCards
    });

    io.to(room.code).emit("phaseMessage", {
        text: "صدر در حال انتخاب کارت سیاست است."
    });

    broadcastRoom(room);
}

function startMinisterPolicy(room, card) {
    const minister = room.players.find(
        (p) => p.id === room.nomineeId
    );

    if (!minister) return;

    room.ministerCard = card;
    room.phase = "ministerPolicy";

    io.to(minister.id).emit("ministerPolicy", {
        card
    });

    io.to(room.code).emit("phaseMessage", {
        text: "وزیر باید سیاست را تصویب کند."
    });

    broadcastRoom(room);
}

function enactPolicy(room, card) {
    if (card === "constitutional") {
        room.constitutionalPolicies++;
    } else {
        room.qajarPolicies++;
    }

    room.phase = "result";
    room.phaseEndsAt = null;

    io.to(room.code).emit("policyEnacted", {
        card,
        constitutionalPolicies: room.constitutionalPolicies,
        qajarPolicies: room.qajarPolicies
    });

    if (room.constitutionalPolicies >= 5) {
        finishGame(room, "constitutionalist");
        return;
    }

    if (room.qajarPolicies >= 6) {
        finishGame(room, "qajar");
        return;
    }

    room.presidentIndex =
        (room.presidentIndex + 1) % room.players.length;

    room.nomineeId = null;

    setTimeout(() => {
        startNomination(room);
    }, 2200);
}

function enactRandomPolicy(room) {
    const card = drawPolicies(room, 1)[0];

    enactPolicy(room, card);
}

function finishGame(room, winner) {
    room.phase = "finished";
    room.phaseEndsAt = null;

    io.to(room.code).emit("gameOver", {
        winner,
        constitutionalPolicies: room.constitutionalPolicies,
        qajarPolicies: room.qajarPolicies
    });

    broadcastRoom(room);
}

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("createRoom", ({ name }) => {
        if (!name || !name.trim()) {
            socket.emit("errorMessage", "لطفاً نام خود را وارد کنید.");
            return;
        }

        const code = generateRoomCode();

        const room = createRoomState(code);

        room.players.push({
            id: socket.id,
            name: name.trim(),
            role: null
        });

        rooms[code] = room;

        socket.join(code);

        socket.emit("roomCreated", {
            code
        });

        socket.emit("roomState", getPublicState(room));
    });

    socket.on("joinRoom", ({ code, name }) => {
        if (!name || !name.trim()) {
            socket.emit("errorMessage", "لطفاً نام خود را وارد کنید.");
            return;
        }

        code = String(code).trim();

        const room = rooms[code];

        if (!room) {
            socket.emit("errorMessage", "این اتاق پیدا نشد.");
            return;
        }

        if (room.phase !== "lobby") {
            socket.emit("errorMessage", "بازی شروع شده است.");
            return;
        }

        if (room.players.length >= 10) {
            socket.emit("errorMessage", "اتاق پر است.");
            return;
        }

        room.players.push({
            id: socket.id,
            name: name.trim(),
            role: null
        });

        socket.join(code);

        io.to(code).emit("roomState", getPublicState(room));
    });

    socket.on("startGame", ({ code }) => {
        const room = rooms[code];

        if (!room) return;

        if (room.players.length < 3) {
            socket.emit(
                "errorMessage",
                "برای شروع حداقل ۳ بازیکن لازم است."
            );
            return;
        }

        if (room.phase !== "lobby") return;

        assignRoles(room);

        room.policyDeck = shuffle(room.policyDeck);
        room.presidentIndex = 0;

        room.phase = "role";
        room.phaseEndsAt = null;

        sendRoles(room);

        io.to(code).emit("gameStarted");

        broadcastRoom(room);

        setTimeout(() => {
            if (rooms[code] && rooms[code].phase === "role") {
                startNomination(rooms[code]);
            }
        }, 3500);
    });

    socket.on("lobbyChat", ({ code, text }) => {
        const room = rooms[code];

        if (!room || !text || !text.trim()) return;

        const player = room.players.find(
            (p) => p.id === socket.id
        );

        if (!player) return;

        io.to(code).emit("chatMessage", {
            name: player.name,
            text: text.trim().slice(0, 300)
        });
    });

    socket.on("gameChat", ({ code, text }) => {
        const room = rooms[code];

        if (!room || !text || !text.trim()) return;

        if (room.phase === "lobby") return;

        const player = room.players.find(
            (p) => p.id === socket.id
        );

        if (!player) return;

        io.to(code).emit("gameChatMessage", {
            name: player.name,
            text: text.trim().slice(0, 300)
        });
    });

    socket.on("nominateChancellor", ({ code, nomineeId }) => {
        const room = rooms[code];

        if (!room || room.phase !== "nomination") return;

        const president = room.players[room.presidentIndex];

        if (!president || president.id !== socket.id) {
            return;
        }

        if (Date.now() > room.phaseEndsAt) {
            autoNomination(room);
            return;
        }

        const nominee = room.players.find(
            (p) => p.id === nomineeId
        );

        if (!nominee || nominee.id === president.id) {
            socket.emit(
                "errorMessage",
                "این بازیکن نمی‌تواند وزیر شود."
            );
            return;
        }

        room.nomineeId = nominee.id;
        room.phaseEndsAt = null;

        startVoting(room);
    });

    socket.on("castVote", ({ code, vote }) => {
        const room = rooms[code];

        if (!room || room.phase !== "voting") return;

        const player = room.players.find(
            (p) => p.id === socket.id
        );

        if (!player) return;

        room.votes[socket.id] = Boolean(vote);

        broadcastRoom(room);

        checkVotes(room);
    });

    socket.on("presidentDiscard", ({ code, cardIndex }) => {
        const room = rooms[code];

        if (!room || room.phase !== "presidentPolicy") {
            return;
        }

        const president = room.players[room.presidentIndex];

        if (!president || president.id !== socket.id) {
            return;
        }

        if (
            !Number.isInteger(cardIndex) ||
            cardIndex < 0 ||
            cardIndex >= room.presidentCards.length
        ) {
            return;
        }

        const remainingCard =
            room.presidentCards[cardIndex === 0 ? 1 : 0];

        room.presidentCards = [];
        startMinisterPolicy(room, remainingCard);
    });

    socket.on("ministerEnact", ({ code }) => {
        const room = rooms[code];

        if (!room || room.phase !== "ministerPolicy") {
            return;
        }

        const minister = room.players.find(
            (p) => p.id === room.nomineeId
        );

        if (!minister || minister.id !== socket.id) {
            return;
        }

        if (!room.ministerCard) return;

        const card = room.ministerCard;

        room.ministerCard = null;

        enactPolicy(room, card);
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        for (const code of Object.keys(rooms)) {
            const room = rooms[code];

            const index = room.players.findIndex(
                (p) => p.id === socket.id
            );

            if (index === -1) continue;

            room.players.splice(index, 1);

            if (room.players.length === 0) {
                delete rooms[code];
                continue;
            }

            if (
                room.presidentIndex >= room.players.length
            ) {
                room.presidentIndex = 0;
            }

            if (room.phase === "lobby") {
                io.to(code).emit(
                    "roomState",
                    getPublicState(room)
                );
            } else {
                broadcastRoom(room);
            }

            break;
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("🌑 سایه‌های دربار");
    console.log(`Server running on port ${PORT}`);
    console.log("=================================");
});
