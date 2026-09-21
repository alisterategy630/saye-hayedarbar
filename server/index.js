const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../public")));

const rooms = new Map();

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const RECONNECT_TIME = 2 * 60 * 1000;

const POLICY_TYPES = {
  CONSTITUTION: "constitution",
  QAJAR: "qajar"
};

function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

function roomCode() {
  let code;

  do {
    code =
      "DARB-" +
      Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function createPolicyDeck() {
  const deck = [];

  // 6 قانون مشروطه
  for (let i = 0; i < 6; i++) {
    deck.push(POLICY_TYPES.CONSTITUTION);
  }

  // 11 قانون قاجاری
  for (let i = 0; i < 11; i++) {
    deck.push(POLICY_TYPES.QAJAR);
  }

  return shuffle(deck);
}

function createRoom(socket, name) {
  const code = roomCode();

  const room = {
    code,

    host: socket.id,

    phase: "lobby",

    round: 0,

    players: new Map(),

    presidentIndex: 0,

    currentPresidentId: null,

    nomineeId: null,

    electionVotes: new Map(),

    electionTracker: 0,

    policies: {
      constitution: 0,
      qajar: 0
    },

    deck: createPolicyDeck(),

    discard: [],

    presidentCards: [],

    ministerCards: [],

    ministerId: null,

    lastGovernment: null,

    winner: null
  };

  rooms.set(code, room);

  addPlayer(socket, room, name);

  return room;
}

function addPlayer(socket, room, name) {
  const player = {
    id: socket.id,

    token: randomId(),

    name: String(name || "مهمان").slice(0, 24),

    connected: true,

    role: null,

    dead: false,

    reconnectUntil: null
  };

  room.players.set(socket.id, player);

  socket.join(room.code);

  socket.data.room = room.code;

  socket.data.playerToken = player.token;

  socket.emit("session", {
    token: player.token,
    room: room.code
  });

  updateRoom(room);
}

function publicPlayers(room) {
  return [...room.players.values()].map(player => ({
    id: player.id,
    name: player.name,
    connected: player.connected,
    dead: player.dead
  }));
}

function updateRoom(room) {
  io.to(room.code).emit("room:update", {
    code: room.code,

    phase: room.phase,

    round: room.round,

    players: publicPlayers(room),

    presidentId: room.currentPresidentId,

    nomineeId: room.nomineeId,

    electionTracker: room.electionTracker,

    policies: room.policies,

    lastGovernment: room.lastGovernment,

    winner: room.winner
  });
}

function chat(room, scope, user, message) {
  io.to(room.code).emit("chat", {
    scope,
    user,
    message,
    time: Date.now()
  });
}

function connectedPlayers(room) {
  return [...room.players.values()].filter(
    player => player.connected && !player.dead
  );
}

function getPlayerBySocket(room, socket) {
  return room.players.get(socket.id);
}

function getPlayerById(room, id) {
  return room.players.get(id);
}

/*
|--------------------------------------------------------------------------
| نقش‌ها
|--------------------------------------------------------------------------
*/

function assignRoles(room) {
  const players = [...room.players.values()];

  const roles = [];

  let qajarCount;

  if (players.length <= 6) {
    qajarCount = 2;
  } else if (players.length <= 8) {
    qajarCount = 3;
  } else {
    qajarCount = 4;
  }

  roles.push("SHAH");

  for (let i = 1; i < qajarCount; i++) {
    roles.push("QAJAR");
  }

  while (roles.length < players.length) {
    roles.push("CONSTITUTION");
  }

  const randomizedRoles = shuffle(roles);

  players.forEach((player, index) => {
    player.role = randomizedRoles[index];

    const qajarTeam = players
      .filter(
        other =>
          other.role === "QAJAR" ||
          other.role === "SHAH"
      )
      .map(other => ({
        name: other.name,
        role: other.role
      }));

    io.to(player.id).emit("role", {
      role: player.role,
      teammates:
        player.role === "CONSTITUTION"
          ? []
          : qajarTeam
    });
  });
}

/*
|--------------------------------------------------------------------------
| شروع بازی
|--------------------------------------------------------------------------
*/

function startGame(room) {
  if (room.players.size < MIN_PLAYERS) {
    return false;
  }

  assignRoles(room);

  room.phase = "election";

  room.round = 1;

  room.presidentIndex = 0;

  room.currentPresidentId =
    connectedPlayers(room)[room.presidentIndex]?.id || null;

  room.nomineeId = null;

  room.electionVotes.clear();

  room.electionTracker = 0;

  room.presidentCards = [];

  room.ministerCards = [];

  room.ministerId = null;

  updateRoom(room);

  chat(
    room,
    "game",
    "راوی",
    "بازی آغاز شد. نقش مخفی خود را بررسی کنید."
  );

  announcePresident(room);

  return true;
}

function announcePresident(room) {
  const president = getPlayerById(
    room,
    room.currentPresidentId
  );

  if (!president) return;

  chat(
    room,
    "game",
    "راوی",
    `صدر اعظم این دور: ${president.name}`
  );

  io.to(president.id).emit("president:turn", {
    round: room.round
  });
}

/*
|--------------------------------------------------------------------------
| انتخاب وزیر
|--------------------------------------------------------------------------
*/

function nominateMinister(room, socket, ministerId) {
  if (room.phase !== "election") {
    return {
      ok: false,
      error: "الان زمان انتخاب وزیر نیست."
    };
  }

  if (socket.id !== room.currentPresidentId) {
    return {
      ok: false,
      error: "فقط صدر اعظم می‌تواند وزیر انتخاب کند."
    };
  }

  if (ministerId === socket.id) {
    return {
      ok: false,
      error: "صدر اعظم نمی‌تواند خودش وزیر باشد."
    };
  }

  const minister = getPlayerById(room, ministerId);

  if (!minister || !minister.connected || minister.dead) {
    return {
      ok: false,
      error: "این بازیکن قابل انتخاب نیست."
    };
  }

  room.nomineeId = ministerId;

  room.electionVotes.clear();

  room.phase = "election-vote";

  updateRoom(room);

  chat(
    room,
    "game",
    "راوی",
    `${getPlayerById(room, room.currentPresidentId).name}، ${minister.name} را به عنوان وزیر پیشنهاد کرد.`
  );

  return { ok: true };
}

/*
|--------------------------------------------------------------------------
| رأی دولت
|--------------------------------------------------------------------------
*/

function castElectionVote(room, socket, yes) {
  if (room.phase !== "election-vote") {
    return {
      ok: false,
      error: "الان زمان رأی‌گیری نیست."
    };
  }

  const player = getPlayerBySocket(room, socket);

  if (!player || !player.connected || player.dead) {
    return {
      ok: false,
      error: "بازیکن معتبر نیست."
    };
  }

  room.electionVotes.set(
    socket.id,
    Boolean(yes)
  );

  io.to(room.code).emit("vote:count", {
    current: room.electionVotes.size,
    total: connectedPlayers(room).length
  });

  if (
    room.electionVotes.size >=
    connectedPlayers(room).length
  ) {
    resolveElection(room);
  }

  return { ok: true };
}

function resolveElection(room) {
  const votes = [...room.electionVotes.values()];

  const yesVotes = votes.filter(Boolean).length;

  const noVotes = votes.length - yesVotes;

  const total = votes.length;

  const passed = yesVotes > total / 2;

  io.to(room.code).emit("vote:result", {
    passed,
    yesVotes,
    noVotes,
    total
  });

  room.electionVotes.clear();

  if (!passed) {
    room.electionTracker++;

    chat(
      room,
      "game",
      "راوی",
      "این دولت رأی نیاورد."
    );

    room.nomineeId = null;

    if (room.electionTracker >= 3) {
      chat(
        room,
        "game",
        "راوی",
        "سه دولت پیاپی رد شدند؛ قانون از روی دسته انتخاب می‌شود."
      );

      room.electionTracker = 0;

      resolveTopDeckGovernment(room);

      return;
    }

    nextPresident(room);

    return;
  }

  room.electionTracker = 0;

  room.ministerId = room.nomineeId;

  room.lastGovernment = {
    presidentId: room.currentPresidentId,
    ministerId: room.ministerId
  };

  room.phase = "president-policy";

  room.presidentCards = drawPolicies(room, 3);

  room.ministerCards = [];

  updateRoom(room);

  const president = getPlayerById(
    room,
    room.currentPresidentId
  );

  const minister = getPlayerById(
    room,
    room.ministerId
  );

  chat(
    room,
    "game",
    "راوی",
    `دولت ${president.name} و ${minister.name} تشکیل شد.`
  );

  io.to(president.id).emit(
    "president:policies",
    {
      policies: room.presidentCards
    }
  );
}

/*
|--------------------------------------------------------------------------
| کارت‌ها
|--------------------------------------------------------------------------
*/

function drawPolicies(room, amount) {
  ensureDeck(room);

  const cards = [];

  for (let i = 0; i < amount; i++) {
    cards.push(room.deck.pop());
  }

  return cards;
}

function ensureDeck(room) {
  if (room.deck.length < 3) {
    room.deck = shuffle([
      ...room.deck,
      ...room.discard
    ]);

    room.discard = [];
  }
}

/*
|--------------------------------------------------------------------------
| صدر اعظم یک قانون حذف می‌کند
|--------------------------------------------------------------------------
*/

function presidentDiscard(
  room,
  socket,
  cardIndex
) {
  if (room.phase !== "president-policy") {
    return {
      ok: false,
      error: "الان نوبت صدر اعظم نیست."
    };
  }

  if (socket.id !== room.currentPresidentId) {
    return {
      ok: false,
      error: "شما صدر اعظم این دور نیستید."
    };
  }

  if (
    !Number.isInteger(cardIndex) ||
    cardIndex < 0 ||
    cardIndex >= room.presidentCards.length
  ) {
    return {
      ok: false,
      error: "کارت نامعتبر است."
    };
  }

  if (room.presidentCards.length !== 3) {
    return {
      ok: false,
      error: "باید دقیقاً ۳ قانون در دست صدر اعظم باشد."
    };
  }

  const removed =
    room.presidentCards[cardIndex];

  const remaining =
    room.presidentCards.filter(
      (_, index) => index !== cardIndex
    );

  room.discard.push(removed);

  room.presidentCards = [];

  room.ministerCards = remaining;

  room.phase = "minister-policy";

  const minister = getPlayerById(
    room,
    room.ministerId
  );

  updateRoom(room);

  if (minister) {
    io.to(minister.id).emit(
      "minister:policies",
      {
        policies: remaining
      }
    );
  }

  io.to(room.code).emit(
    "policy:stage",
    {
      stage: "minister"
    }
  );

  return { ok: true };
}

/*
|--------------------------------------------------------------------------
| وزیر یکی از دو قانون را انتخاب می‌کند
|--------------------------------------------------------------------------
*/

function ministerChoosePolicy(
  room,
  socket,
  cardIndex
) {
  if (room.phase !== "minister-policy") {
    return {
      ok: false,
      error: "الان نوبت وزیر نیست."
    };
  }

  if (socket.id !== room.ministerId) {
    return {
      ok: false,
      error: "شما وزیر این دور نیستید."
    };
  }

  if (
    !Number.isInteger(cardIndex) ||
    cardIndex < 0 ||
    cardIndex >= room.ministerCards.length
  ) {
    return {
      ok: false,
      error: "کارت نامعتبر است."
    };
  }

  if (room.ministerCards.length !== 2) {
    return {
      ok: false,
      error: "وزیر باید از بین ۲ قانون انتخاب کند."
    };
  }

  const selected =
    room.ministerCards[cardIndex];

  const rejected =
    room.ministerCards[
      cardIndex === 0 ? 1 : 0
    ];

  room.discard.push(rejected);

  room.ministerCards = [];

  if (selected === POLICY_TYPES.CONSTITUTION) {
    room.policies.constitution++;
  } else {
    room.policies.qajar++;
  }

  room.phase = "policy-result";

  io.to(room.code).emit(
    "policy:result",
    {
      policy: selected,

      policies: room.policies
    }
  );

  checkWin(room);

  if (room.phase === "finished") {
    updateRoom(room);
    return { ok: true };
  }

  updateRoom(room);

  setTimeout(() => {
    nextRound(room);
  }, 2500);

  return { ok: true };
}

/*
|--------------------------------------------------------------------------
| انتخاب اجباری قانون بعد از ۳ شکست
|--------------------------------------------------------------------------
*/

function resolveTopDeckGovernment(room) {
  ensureDeck(room);

  const selected = room.deck.pop();

  room.discard.push(selected);

  if (selected === POLICY_TYPES.CONSTITUTION) {
    room.policies.constitution++;
  } else {
    room.policies.qajar++;
  }

  room.phase = "policy-result";

  io.to(room.code).emit(
    "policy:forced",
    {
      policy: selected,
      policies: room.policies
    }
  );

  checkWin(room);

  if (room.phase === "finished") {
    updateRoom(room);
    return;
  }

  updateRoom(room);

  setTimeout(() => {
    nextRound(room);
  }, 2500);
}

/*
|--------------------------------------------------------------------------
| بررسی پایان بازی
|--------------------------------------------------------------------------
*/

function checkWin(room) {
  if (room.policies.constitution >= 5) {
    room.winner = "CONSTITUTION";

    room.phase = "finished";

    io.to(room.code).emit(
      "game:finished",
      {
        winner: room.winner,
        reason: "پنج قانون مشروطه اجرا شد."
      }
    );

    return true;
  }

  if (room.policies.qajar >= 6) {
    room.winner = "QAJAR";

    room.phase = "finished";

    io.to(room.code).emit(
      "game:finished",
      {
        winner: room.winner,
        reason: "شش قانون قاجاری اجرا شد."
      }
    );

    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| دور بعد
|--------------------------------------------------------------------------
*/

function nextRound(room) {
  if (room.phase === "finished") {
    return;
  }

  room.round++;

  room.presidentCards = [];

  room.ministerCards = [];

  room.ministerId = null;

  room.nomineeId = null;

  room.electionVotes.clear();

  nextPresident(room);
}

function nextPresident(room) {
  const players = connectedPlayers(room);

  if (players.length === 0) {
    return;
  }

  let index = players.findIndex(
    player => player.id === room.currentPresidentId
  );

  index++;

  if (index >= players.length) {
    index = 0;
  }

  room.presidentIndex = index;

  room.currentPresidentId =
    players[index].id;

  room.nomineeId = null;

  room.phase = "election";

  updateRoom(room);

  announcePresident(room);
}

/*
|--------------------------------------------------------------------------
| چت
|--------------------------------------------------------------------------
*/

function sendChatMessage(
  room,
  socket,
  scope,
  message
) {
  const player = getPlayerBySocket(room, socket);

  if (!player) return;

  if (!message || !message.trim()) {
    return;
  }

  chat(
    room,
    scope === "game"
      ? "game"
      : "lobby",
    player.name,
    message.trim().slice(0, 500)
  );
}

/*
|--------------------------------------------------------------------------
| Reconnect
|--------------------------------------------------------------------------
*/

function disconnectPlayer(socket) {
  const roomCode = socket.data.room;

  if (!roomCode) return;

  const room = rooms.get(roomCode);

  if (!room) return;

  const player = room.players.get(socket.id);

  if (!player) return;

  player.connected = false;

  player.reconnectUntil =
    Date.now() + RECONNECT_TIME;

  io.to(room.code).emit(
    "player:disconnected",
    {
      id: player.id,
      name: player.name,
      reconnectMs: RECONNECT_TIME
    }
  );

  updateRoom(room);

  setTimeout(() => {
    const current = room.players.get(player.id);

    if (
      current &&
      !current.connected &&
      current.reconnectUntil <= Date.now()
    ) {
      room.players.delete(player.id);

      updateRoom(room);

      chat(
        room,
        room.phase === "lobby"
          ? "lobby"
          : "game",
        "راوی",
        `${player.name} پس از پایان زمان بازگشت از میز خارج شد.`
      );
    }
  }, RECONNECT_TIME + 1000);
}

/*
|--------------------------------------------------------------------------
| Socket.IO
|--------------------------------------------------------------------------
*/

io.on("connection", socket => {
  /*
  |--------------------------------------------------------------------------
  | ساخت اتاق
  |--------------------------------------------------------------------------
  */

  socket.on(
    "room:create",
    ({ name }, callback) => {
      const room = createRoom(
        socket,
        name
      );

      callback({
        ok: true,
        code: room.code,
        token: socket.data.playerToken
      });

      chat(
        room,
        "lobby",
        "راوی",
        `${name || "مهمان"} میز جدیدی ساخت.`
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | ورود به اتاق
  |--------------------------------------------------------------------------
  */

  socket.on(
    "room:join",
    ({ code, name }, callback) => {
      const normalized =
        String(code || "")
          .trim()
          .toUpperCase();

      const room =
        rooms.get(normalized);

      if (!room) {
        return callback({
          ok: false,
          error: "این میز وجود ندارد."
        });
      }

      if (
        room.phase !== "lobby"
      ) {
        return callback({
          ok: false,
          error: "بازی شروع شده است."
        });
      }

      if (
        room.players.size >= MAX_PLAYERS
      ) {
        return callback({
          ok: false,
          error: "میز پر است."
        });
      }

      addPlayer(
        socket,
        room,
        name
      );

      callback({
        ok: true,
        code: room.code,
        token: socket.data.playerToken
      });

      chat(
        room,
        "lobby",
        "راوی",
        `${name || "مهمان"} وارد دربار شد.`
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | شروع بازی
  |--------------------------------------------------------------------------
  */

  socket.on(
    "game:start",
    callback => {
      const room =
        rooms.get(socket.data.room);

      if (!room) {
        return callback({
          ok: false,
          error: "اتاق پیدا نشد."
        });
      }

      if (
        room.host !== socket.id
      ) {
        return callback({
          ok: false,
          error:
            "فقط سازنده میز می‌تواند بازی را شروع کند."
        });
      }

      const started =
        startGame(room);

      callback({
        ok: started,

        error: started
          ? null
          : `حداقل ${MIN_PLAYERS} بازیکن لازم است.`
      });
    }
  );

  /*
  |--------------------------------------------------------------------------
  | انتخاب وزیر
  |--------------------------------------------------------------------------
  */

  socket.on(
    "minister:nominate",
    ({ playerId }, callback) => {
      const room =
        rooms.get(socket.data.room);

      if (!room) {
        return callback({
          ok: false,
          error: "اتاق پیدا نشد."
        });
      }

      const result =
        nominateMinister(
          room,
          socket,
          playerId
        );

      callback(result);
    }
  );

  /*
  |--------------------------------------------------------------------------
  | رأی دولت
  |--------------------------------------------------------------------------
  */

  socket.on(
    "election:vote",
    ({ yes }, callback) => {
      const room =
        rooms.get(socket.data.room);

      if (!room) {
        return callback({
          ok: false,
          error: "اتاق پیدا نشد."
        });
      }

      const result =
        castElectionVote(
          room,
          socket,
          yes
        );

      callback(result);
    }
  );

  /*
  |--------------------------------------------------------------------------
  | صدر اعظم: حذف قانون
  |--------------------------------------------------------------------------
  */

  socket.on(
    "president:discard",
    ({ cardIndex }, callback) => {
      const room =
        rooms.get(socket.data.room);

      if (!room) {
        return callback({
          ok: false,
          error: "اتاق پیدا نشد."
        });
      }

      const result =
        presidentDiscard(
          room,
          socket,
          cardIndex
        );

      callback(result);
    }
  );

  /*
  |--------------------------------------------------------------------------
  | وزیر: انتخاب قانون
  |--------------------------------------------------------------------------
  */

  socket.on(
    "minister:choose",
    ({ cardIndex }, callback) => {
      const room =
        rooms.get(socket.data.room);

      if (!room) {
        return callback({
          ok: false,
          error: "اتاق پیدا نشد."
        });
      }

      const result =
        ministerChoosePolicy(
          room,
          socket,
          cardIndex
        );

      callback(result);
    }
  );

  /*
  |--------------------------------------------------------------------------
  | چت
  |--------------------------------------------------------------------------
  */

  socket.on(
    "chat:send",
    ({ scope, message }) => {
      const room =
        rooms.get(socket.data.room);

      if (!room) return;

      sendChatMessage(
        room,
        socket,
        scope,
        message
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | قطع اتصال
  |--------------------------------------------------------------------------
  */

  socket.on(
    "disconnect",
    () => {
      disconnectPlayer(socket);
    }
  );
});

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get(
  "/health",
  (req, res) => {
    res.json({
      online: true,
      rooms: rooms.size,
      service: "Shadows Court"
    });
  }
);

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  () => {
    console.log(
      `Shadows Court running on port ${PORT}`
    );
  }
);