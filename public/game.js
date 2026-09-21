const socket = io();

let roomCode = null;
let myRole = null;
let isPresident = false;
let isMinister = false;
let localPlayers = [];


/* ================= ELEMENTS ================= */

const $ = (id) => document.getElementById(id);

const screens = [
  "homeScreen",
  "tutorialScreen",
  "lobbyScreen",
  "gameScreen"
];

function showScreen(id) {
  screens.forEach((screen) => {
    const element = $(screen);

    if (!element) return;

    element.classList.add("hidden");
    element.classList.remove("active");
  });

  const target = $(id);

  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }
}


/* ================= HOME ================= */

const createRoomBtn = $("createRoomBtn");

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", () => {
    const name = $("playerName").value.trim();

    if (!name) {
      alert("ابتدا نام خود را وارد کنید.");
      return;
    }

    socket.emit(
      "room:create",
      { name },
      (result) => {
        if (!result.ok) {
          alert(result.error);
          return;
        }

        roomCode = result.code;

        if ($("roomCodeDisplay")) {
          $("roomCodeDisplay").textContent = roomCode;
        }

        showScreen("lobbyScreen");
      }
    );
  });
}


const joinRoomBtn = $("joinRoomBtn");

if (joinRoomBtn) {
  joinRoomBtn.addEventListener("click", () => {
    const name = $("playerName").value.trim();
    const code = $("roomCode").value.trim();

    if (!name) {
      alert("نام خود را وارد کنید.");
      return;
    }

    if (!code) {
      alert("کد میز را وارد کنید.");
      return;
    }

    socket.emit(
      "room:join",
      {
        name,
        code
      },
      (result) => {
        if (!result.ok) {
          alert(result.error);
          return;
        }

        roomCode = result.code;

        if ($("roomCodeDisplay")) {
          $("roomCodeDisplay").textContent = roomCode;
        }

        showScreen("lobbyScreen");
      }
    );
  });
}


/* ================= TUTORIAL ================= */

const tutorialBtn = $("tutorialBtn");

if (tutorialBtn) {
  tutorialBtn.addEventListener("click", () => {
    showScreen("tutorialScreen");
  });
}


document
  .querySelectorAll("[data-close]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.close;

      if (target === "tutorialScreen") {
        showScreen("homeScreen");
      }
    });
  });


/* ================= LOBBY ================= */

const startGameBtn = $("startGameBtn");

if (startGameBtn) {
  startGameBtn.addEventListener("click", () => {
    socket.emit(
      "game:start",
      (result) => {
        if (!result.ok) {
          alert(result.error);
        }
      }
    );
  });
}


/* ================= ROOM UPDATE ================= */

socket.on("room:update", (data) => {
  roomCode = data.code;

  if ($("roomCodeDisplay")) {
    $("roomCodeDisplay").textContent = data.code;
  }

  localPlayers = data.players || [];

  updatePlayers(localPlayers);
  updateGovernmentProposal(data);
  updateGameState(data);
});


function updatePlayers(players) {
  const container = $("playerList");

  if (!container) return;

  container.innerHTML = "";

  players.forEach((player) => {
    const div = document.createElement("div");

    div.className = "player-item";

    div.innerHTML = `
      <span>
        ${escapeHtml(player.name)}
      </span>

      <span class="player-status ${
        player.connected ? "" : "offline"
      }"></span>
    `;

    container.appendChild(div);
  });
}


/* ================= GOVERNMENT PROPOSAL ================= */

function updateGovernmentProposal(data) {
  const proposal = $("governmentProposal");

  if (!proposal) return;

  if (!data.nomineeId || !data.presidentId) {
    proposal.textContent = "";
    return;
  }

  const president = localPlayers.find(
    (player) => player.id === data.presidentId
  );

  const minister = localPlayers.find(
    (player) => player.id === data.nomineeId
  );

  if (!president || !minister) return;

  proposal.textContent =
    `${president.name} ← صدر اعظم | ${minister.name} ← وزیر`;
}


/* ================= ROLE ================= */

socket.on("role", (data) => {
  myRole = data.role;

  const labels = {
    QAJAR: "👑 قاجاری",
    CONSTITUTION: "📜 مشروطه‌خواه",
    SHAH: "👑 ناصرالدین‌شاه"
  };

  if ($("myRole")) {
    $("myRole").textContent =
      labels[data.role] || "نامشخص";
  }

  if (!$("teamInfo")) return;

  $("teamInfo").innerHTML = "";

  if (
    data.teammates &&
    data.teammates.length
  ) {
    const title = document.createElement("p");

    title.textContent =
      "هم‌پیمانان شناخته‌شده:";

    $("teamInfo").appendChild(title);

    data.teammates.forEach((member) => {
      const row =
        document.createElement("div");

      row.textContent =
        `${member.name} — ${
          labels[member.role] || "نامشخص"
        }`;

      $("teamInfo").appendChild(row);
    });
  }
});


/* ================= PRESIDENT TURN ================= */

socket.on("president:turn", () => {
  isPresident = true;

  if ($("gameStatus")) {
    $("gameStatus").textContent =
      "نوبت صدر اعظم شماست";
  }

  if ($("gameInstruction")) {
    $("gameInstruction").textContent =
      "یک بازیکن را به عنوان وزیر انتخاب کنید.";
  }

  showMinisterCandidates();
});


function showMinisterCandidates() {
  const selection = $("ministerSelection");
  const votePanel = $("votePanel");
  const container = $("ministerCandidates");

  if (!selection || !votePanel || !container) {
    return;
  }

  selection.classList.remove("hidden");
  votePanel.classList.add("hidden");

  container.innerHTML = "";

  localPlayers
    .filter((player) => {
      return (
        player.connected &&
        player.id !== socket.id
      );
    })
    .forEach((player) => {
      const button =
        document.createElement("button");

      button.className = "candidate";
      button.textContent = player.name;

      button.addEventListener("click", () => {
        socket.emit(
          "minister:nominate",
          {
            playerId: player.id
          },
          (result) => {
            if (!result.ok) {
              alert(result.error);
              return;
            }

            selection.classList.add("hidden");
          }
        );
      });

      container.appendChild(button);
    });
}


/* ================= VOTE ================= */

const voteYes = $("voteYes");
const voteNo = $("voteNo");

if (voteYes) {
  voteYes.addEventListener(
    "click",
    () => castVote(true)
  );
}

if (voteNo) {
  voteNo.addEventListener(
    "click",
    () => castVote(false)
  );
}


function castVote(value) {
  if (voteYes) voteYes.disabled = true;
  if (voteNo) voteNo.disabled = true;

  socket.emit(
    "election:vote",
    {
      yes: value
    },
    (result) => {
      if (!result.ok) {
        alert(result.error);

        if (voteYes) voteYes.disabled = false;
        if (voteNo) voteNo.disabled = false;
      }
    }
  );
}


socket.on("vote:count", (data) => {
  if (!$("voteCount")) return;

  $("voteCount").textContent =
    `${data.current} / ${data.total}`;
});


socket.on("vote:result", (data) => {
  if (voteYes) voteYes.disabled = false;
  if (voteNo) voteNo.disabled = false;

  if ($("votePanel")) {
    $("votePanel").classList.add("hidden");
  }

  if (data.passed) {
    if ($("gameStatus")) {
      $("gameStatus").textContent =
        "✓ دولت تأیید شد";
    }

    if ($("gameInstruction")) {
      $("gameInstruction").textContent =
        "اکنون مرحله قانون‌گذاری آغاز می‌شود.";
    }
  } else {
    if ($("gameStatus")) {
      $("gameStatus").textContent =
        "✕ دولت رد شد";
    }

    if ($("gameInstruction")) {
      $("gameInstruction").textContent =
        `موافق: ${data.yesVotes} | مخالف: ${data.noVotes}`;
    }
  }
});


/* ================= PRESIDENT CARDS ================= */

socket.on("president:policies", (data) => {
  showScreen("gameScreen");

  if ($("presidentPolicyPanel")) {
    $("presidentPolicyPanel")
      .classList.remove("hidden");
  }

  if ($("ministerPolicyPanel")) {
    $("ministerPolicyPanel")
      .classList.add("hidden");
  }

  if ($("gameStatus")) {
    $("gameStatus").textContent =
      "سه قانون در دست شماست";
  }

  if ($("gameInstruction")) {
    $("gameInstruction").textContent =
      "یکی از قوانین را حذف کنید.";
  }

  renderPolicyCards(
    $("presidentCards"),
    data.policies || [],
    (cardIndex) => {
      socket.emit(
        "president:discard",
        {
          cardIndex
        },
        (result) => {
          if (!result.ok) {
            alert(result.error);
            return;
          }

          if ($("presidentPolicyPanel")) {
            $("presidentPolicyPanel")
              .classList.add("hidden");
          }
        }
      );
    }
  );
});


/* ================= MINISTER CARDS ================= */

socket.on("minister:policies", (data) => {
  if ($("ministerPolicyPanel")) {
    $("ministerPolicyPanel")
      .classList.remove("hidden");
  }

  if ($("gameStatus")) {
    $("gameStatus").textContent =
      "دو قانون به شما رسیده";
  }

  if ($("gameInstruction")) {
    $("gameInstruction").textContent =
      "یکی را انتخاب کنید.";
  }

  renderPolicyCards(
    $("ministerCards"),
    data.policies || [],
    (cardIndex) => {
      socket.emit(
        "minister:choose",
        {
          cardIndex
        },
        (result) => {
          if (!result.ok) {
            alert(result.error);
            return;
          }

          if ($("ministerPolicyPanel")) {
            $("ministerPolicyPanel")
              .classList.add("hidden");
          }
        }
      );
    }
  );
});


/* ================= POLICY UI ================= */

function renderPolicyCards(
  container,
  policies,
  onSelect
) {
  if (!container) return;

  container.innerHTML = "";

  policies.forEach((policy, index) => {
    const button =
      document.createElement("button");

    button.className =
      `policy-card ${policy}`;

    const isConstitution =
      policy === "constitution";

    button.innerHTML = `
      <span class="card-icon">
        ${isConstitution ? "📜" : "👑"}
      </span>

      <strong>
        ${
          isConstitution
            ? "قانون مشروطه"
            : "قانون قاجاری"
        }
      </strong>
    `;

    button.addEventListener("click", () => {
      onSelect(index);
    });

    container.appendChild(button);
  });
}


/* ================= POLICY RESULT ================= */

socket.on("policy:result", (data) => {
  showPolicyResult(data.policy);
});


socket.on("policy:forced", (data) => {
  showPolicyResult(
    data.policy,
    true
  );
});


function showPolicyResult(
  policy,
  forced = false
) {
  if (!$("policyResult")) return;

  $("policyResult")
    .classList.remove("hidden");

  const constitution =
    policy === "constitution";

  if ($("resultIcon")) {
    $("resultIcon").textContent =
      constitution ? "📜" : "👑";
  }

  if ($("resultTitle")) {
    $("resultTitle").textContent =
      constitution
        ? "قانون مشروطه اجرا شد"
        : "قانون قاجاری اجرا شد";
  }

  if ($("resultText")) {
    $("resultText").textContent =
      forced
        ? "پس از سه شکست پیاپی، قانون به صورت اجباری انتخاب شد."
        : "قانون جدید در دربار اجرا شد.";
  }
}


/* ================= FINISH ================= */

socket.on("game:finished", (data) => {
  const winner =
    data.winner === "CONSTITUTION"
      ? "مشروطه‌خواهان پیروز شدند"
      : "قاجاریان پیروز شدند";

  if ($("winnerTitle")) {
    $("winnerTitle").textContent =
      winner;
  }

  if ($("winnerReason")) {
    $("winnerReason").textContent =
      data.reason || "";
  }

  if ($("finishOverlay")) {
    $("finishOverlay")
      .classList.remove("hidden");
  }
});


/* ================= STATE ================= */

function updateGameState(data) {
  if (data.phase !== "lobby") {
    showScreen("gameScreen");

    if ($("roundLabel")) {
      $("roundLabel").textContent =
        `دور ${data.round || 1}`;
    }
  }

  if ($("constitutionCount")) {
    $("constitutionCount").textContent =
      data.policies?.constitution || 0;
  }

  if ($("qajarCount")) {
    $("qajarCount").textContent =
      data.policies?.qajar || 0;
  }

  if ($("electionTracker")) {
    $("electionTracker").textContent =
      `${data.electionTracker || 0} / 3`;
  }

  isPresident =
    socket.id === data.presidentId;

  isMinister =
    socket.id === data.nomineeId;

  if (
    data.phase === "election" &&
    isPresident
  ) {
    if ($("gameStatus")) {
      $("gameStatus").textContent =
        "نوبت شماست";
    }

    if ($("gameInstruction")) {
      $("gameInstruction").textContent =
        "یک وزیر انتخاب کنید.";
    }

    showMinisterCandidates();
  }

  if (data.phase === "election-vote") {
    if ($("ministerSelection")) {
      $("ministerSelection")
        .classList.add("hidden");
    }

    if ($("votePanel")) {
      $("votePanel")
        .classList.remove("hidden");
    }

    if ($("gameStatus")) {
      $("gameStatus").textContent =
        "رأی‌گیری دولت";
    }

    if ($("gameInstruction")) {
      $("gameInstruction").textContent =
        "نظر خود را درباره دولت اعلام کنید.";
    }
  }
}


/* ================= CHAT ================= */

const lobbySendBtn = $("lobbySendBtn");

if (lobbySendBtn) {
  lobbySendBtn.addEventListener("click", () => {
    sendChat(
      "lobby",
      $("lobbyMessage")
    );
  });
}


const gameSendBtn = $("gameSendBtn");

if (gameSendBtn) {
  gameSendBtn.addEventListener("click", () => {
    sendChat(
      "game",
      $("gameMessage")
    );
  });
}


const lobbyMessage = $("lobbyMessage");

if (lobbyMessage) {
  lobbyMessage.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();

        sendChat(
          "lobby",
          lobbyMessage
        );
      }
    }
  );
}


const gameMessage = $("gameMessage");

if (gameMessage) {
  gameMessage.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();

        sendChat(
          "game",
          gameMessage
        );
      }
    }
  );
}


function sendChat(scope, input) {
  if (!input) return;

  const message =
    input.value.trim();

  if (!message) return;

  socket.emit(
    "chat:send",
    {
      scope,
      message
    }
  );

  input.value = "";
}


/* ================= CHAT EVENTS ================= */

socket.on("chat", (data) => {
  const container =
    data.scope === "game"
      ? $("gameChat")
      : $("lobbyChat");

  if (!container) return;

  const div =
    document.createElement("div");

  div.className =
    "chat-message";

  div.innerHTML = `
    <strong>
      ${escapeHtml(data.user)}
    </strong>

    <br>

    ${escapeHtml(data.message)}
  `;

  container.appendChild(div);

  container.scrollTop =
    container.scrollHeight;
});


/* ================= DISCONNECT ================= */

socket.on(
  "player:disconnected",
  (data) => {
    addSystemMessage(
      `${data.name} ارتباطش قطع شد؛ تا دو دقیقه فرصت بازگشت دارد.`
    );
  }
);


/* ================= SOCKET ================= */

socket.on("connect", () => {
  console.log(
    "Connected:",
    socket.id
  );
});


socket.on("disconnect", (reason) => {
  console.log(
    "Disconnected:",
    reason
  );
});


/* ================= HELPERS ================= */

function addSystemMessage(message) {
  const containers = [
    $("lobbyChat"),
    $("gameChat")
  ];

  containers.forEach((container) => {
    if (!container) return;

    const div =
      document.createElement("div");

    div.className =
      "chat-message";

    div.textContent =
      `راوی: ${message}`;

    container.appendChild(div);

    container.scrollTop =
      container.scrollHeight;
  });
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}