const socket = io();

const screens = {
    home: document.getElementById("homeScreen"),
    lobby: document.getElementById("lobbyScreen"),
    role: document.getElementById("roleScreen"),
    game: document.getElementById("gameScreen"),
    gameOver: document.getElementById("gameOverScreen")
};

const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const errorMessage = document.getElementById("errorMessage");
const lobbyMessage = document.getElementById("lobbyMessage");

const roomCode = document.getElementById("roomCode");
const playerCount = document.getElementById("playerCount");
const playersList = document.getElementById("playersList");
const startGameButton = document.getElementById("startGameButton");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatButton = document.getElementById("sendChatButton");

const roleCard = document.getElementById("roleCard");
const alliesBox = document.getElementById("alliesBox");
const continueGameButton = document.getElementById("continueGameButton");

const phaseTitle = document.getElementById("phaseTitle");
const policyDeckCount = document.getElementById("policyDeckCount");
const constitutionalCount = document.getElementById("constitutionalCount");
const qajarCount = document.getElementById("qajarCount");
const constitutionalTrack = document.getElementById("constitutionalTrack");
const qajarTrack = document.getElementById("qajarTrack");
const presidentBox = document.getElementById("presidentBox");
const nomineeBox = document.getElementById("nomineeBox");
const gamePlayers = document.getElementById("gamePlayers");

const nominationBox = document.getElementById("nominationBox");
const nomineeSelect = document.getElementById("nomineeSelect");
const nominateButton = document.getElementById("nominateButton");

const voteBox = document.getElementById("voteBox");
const voteDescription = document.getElementById("voteDescription");
const voteStatus = document.getElementById("voteStatus");
const yesVoteButton = document.getElementById("yesVoteButton");
const noVoteButton = document.getElementById("noVoteButton");

const presidentPolicyBox = document.getElementById("presidentPolicyBox");
const presidentCards = document.getElementById("presidentCards");
const discardHint = document.getElementById("discardHint");

const ministerPolicyBox = document.getElementById("ministerPolicyBox");
const ministerCard = document.getElementById("ministerCard");
const enactButton = document.getElementById("enactButton");

const publicResult = document.getElementById("publicResult");
const gameMessage = document.getElementById("gameMessage");

const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverReason = document.getElementById("gameOverReason");
const reloadButton = document.getElementById("reloadButton");

let currentState = null;
let pendingState = null;

function showScreen(screen) {
    Object.values(screens).forEach((item) => item.classList.add("hidden"));
    screen.classList.remove("hidden");
}

function playClickSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 520;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.035, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
}

function showError(text) {
    errorMessage.textContent = text || "";
}

function renderPlayers(players, container = playersList) {
    container.innerHTML = "";
    players.forEach((player) => {
        const item = document.createElement("div");
        item.className = "player";

        const name = document.createElement("span");
        name.className = "playerName";
        name.textContent = `👤 ${player.name}`;
        item.appendChild(name);

        if (player.host) {
            const host = document.createElement("span");
            host.className = "host";
            host.textContent = "👑 سازنده";
            item.appendChild(host);
        }

        container.appendChild(item);
    });
}

function renderChatMessage(message) {
    const item = document.createElement("div");
    item.className = "chatMessage";

    if (message.type === "system") {
        item.classList.add("system");
        item.textContent = `• ${message.text}`;
    } else {
        const name = document.createElement("span");
        name.className = "chatName";
        name.textContent = `${message.name}:`;

        const text = document.createElement("span");
        text.className = "chatText";
        text.textContent = ` ${message.text}`;

        item.appendChild(name);
        item.appendChild(text);
    }

    chatMessages.appendChild(item);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderChat(messages) {
    chatMessages.innerHTML = "";
    messages.forEach(renderChatMessage);
}

function renderTrack(container, count, total, color) {
    container.innerHTML = "";
    for (let i = 0; i < total; i++) {
        const slot = document.createElement("div");
        slot.className = "trackSlot";
        if (i < count) {
            slot.classList.add("active", color);
        }
        container.appendChild(slot);
    }
}

function renderRole(role, allies) {
    roleCard.className = "roleCard";
    alliesBox.innerHTML = "";

    if (role === "constitutionalist") {
        roleCard.classList.add("constitutionalist");
        roleCard.textContent = "🟦 مشروطه‌خواه";
        alliesBox.textContent = "شما در جبهه مشروطه‌خواهان هستید.";
    } else if (role === "qajar") {
        roleCard.classList.add("qajar");
        roleCard.textContent = "🟥 قاجاری";
        alliesBox.innerHTML = "<strong>هم‌پیمانان شما:</strong>";
        renderAllies(allies);
    } else if (role === "naser") {
        roleCard.classList.add("naser");
        roleCard.textContent = "👑 ناصرالدین شاه";
        alliesBox.innerHTML = "<strong>هم‌پیمانان قاجاری شما:</strong>";
        renderAllies(allies);
    }

    roleCard.style.animation = "none";
    requestAnimationFrame(() => {
        roleCard.style.animation = role === "naser"
            ? "roleReveal .8s ease, glowPulse 2.5s ease-in-out infinite"
            : "roleReveal .8s ease";
    });
}

function renderAllies(allies) {
    if (!allies.length) {
        const div = document.createElement("div");
        div.className = "ally";
        div.textContent = "هم‌پیمان دیگری شناسایی نشد.";
        alliesBox.appendChild(div);
        return;
    }

    allies.forEach((ally) => {
        const div = document.createElement("div");
        div.className = "ally";
        div.textContent = `👤 ${ally.name} — ${ally.role}`;
        alliesBox.appendChild(div);
    });
}

function setActionBoxesHidden() {
    nominationBox.classList.add("hidden");
    voteBox.classList.add("hidden");
    presidentPolicyBox.classList.add("hidden");
    ministerPolicyBox.classList.add("hidden");
    publicResult.textContent = "";
    gameMessage.textContent = "";
}

function renderNominees(players) {
    nomineeSelect.innerHTML = "";

    players.forEach((player) => {
        if (player.id === socket.id) return;
        const option = document.createElement("option");
        option.value = player.id;
        option.textContent = player.name;
        nomineeSelect.appendChild(option);
    });
}

function renderPresidentCards(cards) {
    presidentCards.innerHTML = "";

    cards.forEach((card, index) => {
        const el = document.createElement("div");
        el.className = `policyCard ${card === "constitutional" ? "blue" : "red"}`;
        el.innerHTML = card === "constitutional"
            ? "🟦<br>کارت مشروطه"
            : "🟥<br>کارت قاجاری";

        el.addEventListener("click", () => {
            playClickSound();
            socket.emit("presidentDiscard", { index });
            discardHint.textContent = "کارت انتخاب‌شده کنار گذاشته شد...";
            [...presidentCards.children].forEach((node) => node.style.pointerEvents = "none");
        });

        presidentCards.appendChild(el);
    });
}

function renderMinisterCard(card) {
    ministerCard.className = `policyCard single ${card === "constitutional" ? "blue" : "red"}`;
    ministerCard.innerHTML = card === "constitutional"
        ? "🟦<br>کارت مشروطه"
        : "🟥<br>کارت قاجاری";
}

function renderGameState(state) {
    currentState = state;
    pendingState = state;

    showScreen(screens.game);

    phaseTitle.textContent = state.phaseText;
    policyDeckCount.textContent = `کارت‌های باقی‌مانده: ${state.policyDeckCount}`;

    constitutionalCount.textContent = `${state.constitutionalPolicies} / 5`;
    qajarCount.textContent = `${state.qajarPolicies} / 6`;

    renderTrack(constitutionalTrack, state.constitutionalPolicies, 5, "blue");
    renderTrack(qajarTrack, state.qajarPolicies, 6, "red");
    renderPlayers(state.players, gamePlayers);

    const presidentName = state.president?.name || "نامشخص";
    const nomineeName = state.nominee?.name || "هنوز انتخاب نشده";

    presidentBox.innerHTML = `<strong>👑 صدر فعلی</strong><br>${presidentName}`;
    nomineeBox.innerHTML = `<strong>📜 وزیر معرفی‌شده</strong><br>${nomineeName}`;

    setActionBoxesHidden();

    if (state.lastResult) {
        publicResult.textContent = state.lastResult.approved
            ? `✅ دولت تأیید شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`
            : `❌ دولت رد شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`;
    }

    if (state.phase === "nomination") {
        if (state.youArePresident) {
            nominationBox.classList.remove("hidden");
            renderNominees(state.players);
        } else {
            gameMessage.textContent = `⏳ منتظر انتخاب وزیر توسط ${presidentName} هستیم...`;
        }
    }

    if (state.phase === "vote") {
        voteBox.classList.remove("hidden");
        voteDescription.textContent =
            `آیا با ریاست ${presidentName} و وزارت ${nomineeName} موافق هستید؟`;

        if (state.youVoted) {
            yesVoteButton.disabled = true;
            noVoteButton.disabled = true;
            voteStatus.textContent = "✅ رأی شما ثبت شده؛ منتظر بقیه بازیکنان باشید.";
        } else {
            yesVoteButton.disabled = false;
            noVoteButton.disabled = false;
            voteStatus.textContent = "رأی خود را انتخاب کنید.";
        }
    }

    if (state.phase === "president_discard") {
        if (state.youArePresident) {
            presidentPolicyBox.classList.remove("hidden");
            discardHint.textContent = "یکی از دو کارت را انتخاب کن.";
        } else {
            gameMessage.textContent = `⏳ صدر در حال انتخاب بین دو کارت سیاست است...`;
        }
    }

    if (state.phase === "minister_enact") {
        if (state.youAreNominee) {
            ministerPolicyBox.classList.remove("hidden");
            gameMessage.textContent = "این کارت به شما رسیده است. آن را تصویب کنید.";
        } else {
            gameMessage.textContent = `⏳ وزیر در حال تصویب کارت سیاست است...`;
        }
    }

    if (state.phase === "finished" && state.winner) {
        showGameOver(state.winner);
    }
}

function showGameOver(winner) {
    const isQajar = winner.faction === "qajar";
    document.getElementById("gameOverIcon").textContent = isQajar ? "👑" : "🏛️";
    gameOverTitle.textContent = isQajar ? "قاجاریان پیروز شدند" : "مشروطه‌خواهان پیروز شدند";
    gameOverReason.textContent = winner.reason;
    showScreen(screens.gameOver);
}

createRoomButton.addEventListener("click", () => {
    playClickSound();
    const name = playerNameInput.value.trim();
    showError("");
    if (!name) return showError("اول نامت را وارد کن.");
    socket.emit("createRoom", { name });
});

joinRoomButton.addEventListener("click", () => {
    playClickSound();
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim();
    showError("");
    if (!name) return showError("اول نامت را وارد کن.");
    if (!code) return showError("کد اتاق را وارد کن.");
    socket.emit("joinRoom", { name, roomCode: code });
});

startGameButton.addEventListener("click", () => {
    playClickSound();
    socket.emit("startGame");
});

sendChatButton.addEventListener("click", () => {
    playClickSound();
    sendChat();
});

chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChat();
});

function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit("lobbyChat", { text });
    chatInput.value = "";
}

continueGameButton.addEventListener("click", () => {
    playClickSound();
    if (pendingState) renderGameState(pendingState);
});

nominateButton.addEventListener("click", () => {
    playClickSound();
    socket.emit("nominateChancellor", { playerId: nomineeSelect.value });
});

yesVoteButton.addEventListener("click", () => {
    playClickSound();
    socket.emit("castVote", { vote: "yes" });
});

noVoteButton.addEventListener("click", () => {
    playClickSound();
    socket.emit("castVote", { vote: "no" });
});

enactButton.addEventListener("click", () => {
    playClickSound();
    enactButton.disabled = true;
    socket.emit("ministerEnact");
});

reloadButton.addEventListener("click", () => {
    window.location.reload();
});

socket.on("roomCreated", ({ roomCode: code }) => {
    roomCode.textContent = code;
    showScreen(screens.lobby);
});

socket.on("roomState", ({ roomCode: code, players, started, messages }) => {
    roomCode.textContent = code;
    playerCount.textContent = `${players.length} / 10`;
    renderPlayers(players);
    renderChat(messages || []);

    if (!started) {
        showScreen(screens.lobby);
    }
});

socket.on("chatMessage", (message) => renderChatMessage(message));

socket.on("gameStarted", () => {
    lobbyMessage.textContent = "🎴 بازی شروع شد...";
});

socket.on("roleAssigned", ({ role, allies }) => {
    renderRole(role, allies || []);
    showScreen(screens.role);
});

socket.on("gameState", (state) => {
    pendingState = state;

    // در لحظه نمایش نقش، وارد بازی نشو تا بازیکن نقش خود را ببیند.
    if (!screens.role.classList.contains("hidden")) return;

    renderGameState(state);
});

socket.on("policyDrawn", ({ cards }) => {
    if (!currentState?.youArePresident) return;
    showScreen(screens.game);
    presidentPolicyBox.classList.remove("hidden");
    voteBox.classList.add("hidden");
    nominationBox.classList.add("hidden");
    ministerPolicyBox.classList.add("hidden");
    renderPresidentCards(cards);
    phaseTitle.textContent = "📜 انتخاب محرمانه کارت توسط صدر";
    discardHint.textContent = "یکی از دو کارت را انتخاب کن.";
});

socket.on("ministerPolicy", ({ card }) => {
    showScreen(screens.game);
    ministerPolicyBox.classList.remove("hidden");
    presidentPolicyBox.classList.add("hidden");
    nominationBox.classList.add("hidden");
    voteBox.classList.add("hidden");
    renderMinisterCard(card);
    phaseTitle.textContent = "📜 کارت سیاست وزیر";
    gameMessage.textContent = "این کارت را تصویب کن.";
    enactButton.disabled = false;
});

socket.on("gameOver", (winner) => showGameOver(winner));

socket.on("errorMessage", (message) => {
    showError(message);
    lobbyMessage.textContent = message;
});

socket.on("connect", () => console.log("✅ اتصال به سرور برقرار شد."));
