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

let phaseTimerInterval = null;

// ======================================================
// ابزارهای عمومی
// ======================================================

function showScreen(screen) {
    Object.values(screens).forEach((item) => {
        if (item) item.classList.add("hidden");
    });

    if (screen) {
        screen.classList.remove("hidden");
    }
}

function playClickSound() {
    try {
        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) return;

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.value = 520;
        osc.type = "sine";

        gain.gain.setValueAtTime(
            0.035,
            ctx.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            ctx.currentTime + 0.08
        );

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
}

function showError(text) {
    if (errorMessage) {
        errorMessage.textContent = text || "";
    }
}

// ======================================================
// تایمر
// ======================================================

function stopPhaseTimer() {
    if (phaseTimerInterval) {
        clearInterval(phaseTimerInterval);
        phaseTimerInterval = null;
    }

    const oldTimer =
        document.getElementById("phaseTimer");

    if (oldTimer) {
        oldTimer.remove();
    }
}

function createPhaseTimer() {
    if (!phaseTitle) return null;

    let timer =
        document.getElementById("phaseTimer");

    if (!timer) {
        timer = document.createElement("div");
        timer.id = "phaseTimer";
        timer.className = "phaseTimer";

        phaseTitle.parentElement.appendChild(timer);
    }

    return timer;
}

function startPhaseTimer(endTime) {
    stopPhaseTimer();

    if (!endTime) return;

    const timer = createPhaseTimer();

    if (!timer) return;

    function update() {
        const remaining = Math.max(
            0,
            endTime - Date.now()
        );

        const seconds = Math.ceil(
            remaining / 1000
        );

        if (seconds <= 10) {
            timer.classList.add("danger");
        } else {
            timer.classList.remove("danger");
        }

        timer.textContent =
            `⏱️ ${seconds} ثانیه`;

        if (remaining <= 0) {
            clearInterval(phaseTimerInterval);
            phaseTimerInterval = null;

            timer.textContent =
                "⏰ زمان تمام شد";
        }
    }

    update();

    phaseTimerInterval =
        setInterval(update, 250);
}

// ======================================================
// بازیکنان
// ======================================================

function renderPlayers(
    players,
    container = playersList
) {
    if (!container) return;

    container.innerHTML = "";

    players.forEach((player) => {
        const item =
            document.createElement("div");

        item.className = "player";

        const name =
            document.createElement("span");

        name.className = "playerName";

        name.textContent =
            `👤 ${player.name}`;

        item.appendChild(name);

        if (player.host) {
            const host =
                document.createElement("span");

            host.className = "host";

            host.textContent =
                "👑 سازنده";

            item.appendChild(host);
        }

        container.appendChild(item);
    });
}

// ======================================================
// چت
// ======================================================

function renderChatMessage(message) {
    if (!chatMessages) return;

    const item =
        document.createElement("div");

    item.className = "chatMessage";

    if (message.type === "system") {
        item.classList.add("system");

        item.textContent =
            `• ${message.text}`;
    } else {
        const name =
            document.createElement("span");

        name.className = "chatName";

        name.textContent =
            `${message.name}:`;

        const text =
            document.createElement("span");

        text.className = "chatText";

        text.textContent =
            ` ${message.text}`;

        item.appendChild(name);
        item.appendChild(text);
    }

    chatMessages.appendChild(item);

    chatMessages.scrollTop =
        chatMessages.scrollHeight;
}

function renderChat(messages) {
    if (!chatMessages) return;

    chatMessages.innerHTML = "";

    messages.forEach(
        renderChatMessage
    );
}

function sendChat() {
    const text =
        chatInput?.value.trim();

    if (!text) return;

    /*
     * اگر بازی شروع شده باشد،
     * پیام با gameChat ارسال می‌شود.
     *
     * اگر هنوز در لابی باشیم،
     * پیام با lobbyChat ارسال می‌شود.
     */

    if (
        currentState &&
        currentState.phase &&
        currentState.phase !== "finished"
    ) {
        socket.emit("gameChat", {
            text
        });
    } else {
        socket.emit("lobbyChat", {
            text
        });
    }

    chatInput.value = "";
}

// ======================================================
// مسیر و نقش
// ======================================================

function renderTrack(
    container,
    count,
    total,
    color
) {
    if (!container) return;

    container.innerHTML = "";

    for (let i = 0; i < total; i++) {
        const slot =
            document.createElement("div");

        slot.className = "trackSlot";

        if (i < count) {
            slot.classList.add(
                "active",
                color
            );
        }

        container.appendChild(slot);
    }
}

function renderRole(role, allies) {
    if (!roleCard || !alliesBox) return;

    roleCard.className =
        "roleCard";

    alliesBox.innerHTML = "";

    if (role === "constitutionalist") {
        roleCard.classList.add(
            "constitutionalist"
        );

        roleCard.textContent =
            "🟦 مشروطه‌خواه";

        alliesBox.textContent =
            "شما در جبهه مشروطه‌خواهان هستید.";
    }

    else if (role === "qajar") {
        roleCard.classList.add("qajar");

        roleCard.textContent =
            "🟥 قاجاری";

        alliesBox.innerHTML =
            "<strong>هم‌پیمانان شما:</strong>";

        renderAllies(allies);
    }

    else if (role === "naser") {
        roleCard.classList.add("naser");

        roleCard.textContent =
            "👑 ناصرالدین شاه";

        alliesBox.innerHTML =
            "<strong>هم‌پیمانان قاجاری شما:</strong>";

        renderAllies(allies);
    }

    roleCard.style.animation = "none";

    requestAnimationFrame(() => {
        roleCard.style.animation =
            role === "naser"
                ? "roleReveal .8s ease, glowPulse 2.5s ease-in-out infinite"
                : "roleReveal .8s ease";
    });
}

function renderAllies(allies) {
    if (!allies.length) {
        const div =
            document.createElement("div");

        div.className = "ally";

        div.textContent =
            "هم‌پیمان دیگری شناسایی نشد.";

        alliesBox.appendChild(div);

        return;
    }

    allies.forEach((ally) => {
        const div =
            document.createElement("div");

        div.className = "ally";

        div.textContent =
            `👤 ${ally.name} — ${ally.role}`;

        alliesBox.appendChild(div);
    });
}

// ======================================================
// کنترل پنل‌های بازی
// ======================================================

function setActionBoxesHidden() {
    nominationBox?.classList.add("hidden");
    voteBox?.classList.add("hidden");
    presidentPolicyBox?.classList.add("hidden");
    ministerPolicyBox?.classList.add("hidden");

    if (publicResult) {
        publicResult.textContent = "";
    }

    if (gameMessage) {
        gameMessage.textContent = "";
    }
}

function renderNominees(players) {
    if (!nomineeSelect) return;

    nomineeSelect.innerHTML = "";

    players.forEach((player) => {
        if (player.id === socket.id) return;

        const option =
            document.createElement("option");

        option.value = player.id;

        option.textContent =
            player.name;

        nomineeSelect.appendChild(option);
    });
}

// ======================================================
// کارت‌های سیاست
// ======================================================

function renderPresidentCards(cards) {
    if (!presidentCards) return;

    presidentCards.innerHTML = "";

    cards.forEach((card, index) => {
        const el =
            document.createElement("div");

        el.className =
            `policyCard ${
                card === "constitutional"
                    ? "blue"
                    : "red"
            }`;

        el.innerHTML =
            card === "constitutional"
                ? "🟦<br>کارت مشروطه"
                : "🟥<br>کارت قاجاری";

        el.addEventListener(
            "click",
            () => {
                playClickSound();

                socket.emit(
                    "presidentDiscard",
                    { index }
                );

                if (discardHint) {
                    discardHint.textContent =
                        "کارت انتخاب‌شده کنار گذاشته شد...";
                }

                [
                    ...presidentCards.children
                ].forEach(
                    (node) => {
                        node.style.pointerEvents =
                            "none";
                    }
                );
            }
        );

        presidentCards.appendChild(el);
    });
}

function renderMinisterCard(card) {
    if (!ministerCard) return;

    ministerCard.className =
        `policyCard single ${
            card === "constitutional"
                ? "blue"
                : "red"
        }`;

    ministerCard.innerHTML =
        card === "constitutional"
            ? "🟦<br>کارت مشروطه"
            : "🟥<br>کارت قاجاری";
}

// ======================================================
// وضعیت بازی
// ======================================================

function renderGameState(state) {
    currentState = state;
    pendingState = state;

    showScreen(screens.game);

    stopPhaseTimer();

    if (phaseTitle) {
        phaseTitle.textContent =
            state.phaseText;
    }

    if (
        state.phaseEndsAt &&
        state.phase === "nomination"
    ) {
        startPhaseTimer(
            state.phaseEndsAt
        );
    }

    if (policyDeckCount) {
        policyDeckCount.textContent =
            `کارت‌های باقی‌مانده: ${state.policyDeckCount}`;
    }

    if (constitutionalCount) {
        constitutionalCount.textContent =
            `${state.constitutionalPolicies} / 5`;
    }

    if (qajarCount) {
        qajarCount.textContent =
            `${state.qajarPolicies} / 6`;
    }

    renderTrack(
        constitutionalTrack,
        state.constitutionalPolicies,
        5,
        "blue"
    );

    renderTrack(
        qajarTrack,
        state.qajarPolicies,
        6,
        "red"
    );

    renderPlayers(
        state.players,
        gamePlayers
    );

    const presidentName =
        state.president?.name ||
        "نامشخص";

    const nomineeName =
        state.nominee?.name ||
        "هنوز انتخاب نشده";

    if (presidentBox) {
        presidentBox.innerHTML =
            `<strong>👑 صدر فعلی</strong><br>${presidentName}`;
    }

    if (nomineeBox) {
        nomineeBox.innerHTML =
            `<strong>📜 وزیر معرفی‌شده</strong><br>${nomineeName}`;
    }

    setActionBoxesHidden();

    if (state.lastResult) {
        if (publicResult) {
            publicResult.textContent =
                state.lastResult.approved
                    ? `✅ دولت تأیید شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`
                    : `❌ دولت رد شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`;
        }
    }

    // ------------------------------------------
    // انتخاب وزیر
    // ------------------------------------------

    if (state.phase === "nomination") {
        if (state.youArePresident) {
            nominationBox?.classList.remove(
                "hidden"
            );

            renderNominees(
                state.players
            );
        } else {
            if (gameMessage) {
                gameMessage.textContent =
                    `⏳ منتظر انتخاب وزیر توسط ${presidentName} هستیم...`;
            }
        }
    }

    // ------------------------------------------
    // رأی گیری
    // ------------------------------------------

    if (state.phase === "vote") {
        voteBox?.classList.remove(
            "hidden"
        );

        if (voteDescription) {
            voteDescription.textContent =
                `آیا با ریاست ${presidentName} و وزارت ${nomineeName} موافق هستید؟`;
        }

        if (state.youVoted) {
            if (yesVoteButton) {
                yesVoteButton.disabled = true;
            }

            if (noVoteButton) {
                noVoteButton.disabled = true;
            }

            if (voteStatus) {
                voteStatus.textContent =
                    "✅ رأی شما ثبت شده؛ منتظر بقیه بازیکنان باشید.";
            }
        } else {
            if (yesVoteButton) {
                yesVoteButton.disabled = false;
            }

            if (noVoteButton) {
                noVoteButton.disabled = false;
            }

            if (voteStatus) {
                voteStatus.textContent =
                    "رأی خود را انتخاب کنید.";
            }
        }
    }

    // ------------------------------------------
    // انتخاب کارت صدر
    // ------------------------------------------

    if (
        state.phase ===
        "president_discard"
    ) {
        if (state.youArePresident) {
            presidentPolicyBox?.classList.remove(
                "hidden"
            );

            if (discardHint) {
                discardHint.textContent =
                    "یکی از دو کارت را انتخاب کن.";
            }
        } else {
            if (gameMessage) {
                gameMessage.textContent =
                    "⏳ صدر در حال انتخاب بین دو کارت سیاست است...";
            }
        }
    }

    // ------------------------------------------
    // تصویب کارت وزیر
    // ------------------------------------------

    if (
        state.phase ===
        "minister_enact"
    ) {
        if (state.youAreNominee) {
            ministerPolicyBox?.classList.remove(
                "hidden"
            );

            if (gameMessage) {
                gameMessage.textContent =
                    "این کارت به شما رسیده است. آن را تصویب کنید.";
            }
        } else {
            if (gameMessage) {
                gameMessage.textContent =
                    "⏳ وزیر در حال تصویب کارت سیاست است...";
            }
        }
    }

    // ------------------------------------------
    // پایان
    // ------------------------------------------

    if (
        state.phase === "finished" &&
        state.winner
    ) {
        showGameOver(
            state.winner
        );
    }
}

// ======================================================
// پایان بازی
// ======================================================

function showGameOver(winner) {
    stopPhaseTimer();

    const isQajar =
        winner.faction === "qajar";

    const icon =
        document.getElementById(
            "gameOverIcon"
        );

    if (icon) {
        icon.textContent =
            isQajar
                ? "👑"
                : "🏛️";
    }

    if (gameOverTitle) {
        gameOverTitle.textContent =
            isQajar
                ? "قاجاریان پیروز شدند"
                : "مشروطه‌خواهان پیروز شدند";
    }

    if (gameOverReason) {
        gameOverReason.textContent =
            winner.reason;
    }

    showScreen(
        screens.gameOver
    );
}

// ======================================================
// ساخت اتاق
// ======================================================

createRoomButton.addEventListener(
    "click",
    () => {
        playClickSound();

        const name =
            playerNameInput.value.trim();

        showError("");

        if (!name) {
            showError(
                "اول نامت را وارد کن."
            );

            return;
        }

        socket.emit(
            "createRoom",
            { name }
        );
    }
);

// ======================================================
// ورود به اتاق
// ======================================================

joinRoomButton.addEventListener(
    "click",
    () => {
        playClickSound();

        const name =
            playerNameInput.value.trim();

        const code =
            roomCodeInput.value.trim();

        showError("");

        if (!name) {
            showError(
                "اول نامت را وارد کن."
            );

            return;
        }

        if (!code) {
            showError(
                "کد اتاق را وارد کن."
            );

            return;
        }

        socket.emit(
            "joinRoom",
            {
                name,
                roomCode: code
            }
        );
    }
);

// ======================================================
// شروع بازی
// ======================================================

startGameButton.addEventListener(
    "click",
    () => {
        playClickSound();

        socket.emit(
            "startGame"
        );
    }
);

// ======================================================
// چت
// ======================================================

sendChatButton.addEventListener(
    "click",
    () => {
        playClickSound();
        sendChat();
    }
);

chatInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendChat();
        }
    }
);

// ======================================================
// نقش
// ======================================================

continueGameButton.addEventListener(
    "click",
    () => {
        playClickSound();

        if (pendingState) {
            renderGameState(
                pendingState
            );
        }
    }
);

// ======================================================
// انتخاب وزیر
// ======================================================

nominateButton.addEventListener(
    "click",
    () => {
        playClickSound();

        if (!nomineeSelect.value) {
            return;
        }

        socket.emit(
            "nominateChancellor",
            {
                playerId:
                    nomineeSelect.value
            }
        );
    }
);

// ======================================================
// رأی
// ======================================================

yesVoteButton.addEventListener(
    "click",
    () => {
        playClickSound();

        socket.emit(
            "castVote",
            {
                vote: "yes"
            }
        );
    }
);

noVoteButton.addEventListener(
    "click",
    () => {
        playClickSound();

        socket.emit(
            "castVote",
            {
                vote: "no"
            }
        );
    }
);

// ======================================================
// تصویب کارت
// ======================================================

enactButton.addEventListener(
    "click",
    () => {
        playClickSound();

        enactButton.disabled = true;

        socket.emit(
            "ministerEnact"
        );
    }
);

// ======================================================
// شروع دوباره
// ======================================================

reloadButton.addEventListener(
    "click",
    () => {
        window.location.reload();
    }
);

// ======================================================
// Socket Events
// ======================================================

socket.on(
    "roomCreated",
    ({ roomCode: code }) => {
        roomCode.textContent =
            code;

        showScreen(
            screens.lobby
        );
    }
);

socket.on(
    "roomState",
    ({
        roomCode: code,
        players,
        started,
        messages
    }) => {
        roomCode.textContent =
            code;

        playerCount.textContent =
            `${players.length} / 10`;

        renderPlayers(
            players
        );

        renderChat(
            messages || []
        );

        if (!started) {
            showScreen(
                screens.lobby
            );
        }
    }
);

socket.on(
    "chatMessage",
    (message) => {
        renderChatMessage(
            message
        );
    }
);

// چت مخصوص داخل بازی
socket.on(
    "gameChatMessage",
    (message) => {
        renderGameChatMessage(
            message
        );
    }
);

socket.on(
    "gameStarted",
    () => {
        if (lobbyMessage) {
            lobbyMessage.textContent =
                "🎴 بازی شروع شد...";
        }
    }
);

socket.on(
    "roleAssigned",
    ({
        role,
        allies
    }) => {
        renderRole(
            role,
            allies || []
        );

        showScreen(
            screens.role
        );
    }
);

socket.on(
    "gameState",
    (state) => {
        pendingState =
            state;

        /*
         * تا وقتی صفحه نقش باز است،
         * بازیکن فرصت دیدن نقش خودش را دارد.
         */
        if (
            !screens.role.classList.contains(
                "hidden"
            )
        ) {
            return;
        }

        renderGameState(
            state
        );
    }
);

socket.on(
    "policyDrawn",
    ({ cards }) => {
        if (
            !currentState?.youArePresident
        ) {
            return;
        }

        showScreen(
            screens.game
        );

        presidentPolicyBox?.classList.remove(
            "hidden"
        );

        voteBox?.classList.add(
            "hidden"
        );

        nominationBox?.classList.add(
            "hidden"
        );

        ministerPolicyBox?.classList.add(
            "hidden"
        );

        renderPresidentCards(
            cards
        );

        phaseTitle.textContent =
            "📜 انتخاب محرمانه کارت توسط صدر";

        discardHint.textContent =
            "یکی از دو کارت را انتخاب کن.";
    }
);

socket.on(
    "ministerPolicy",
    ({ card }) => {
        showScreen(
            screens.game
        );

        ministerPolicyBox?.classList.remove(
            "hidden"
        );

        presidentPolicyBox?.classList.add(
            "hidden"
        );

        nominationBox?.classList.add(
            "hidden"
        );

        voteBox?.classList.add(
            "hidden"
        );

        renderMinisterCard(
            card
        );

        phaseTitle.textContent =
            "📜 کارت سیاست وزیر";

        gameMessage.textContent =
            "این کارت را تصویب کن.";

        enactButton.disabled =
            false;
    }
);

socket.on(
    "gameOver",
    (winner) => {
        showGameOver(
            winner
        );
    }
);

socket.on(
    "errorMessage",
    (message) => {
        showError(
            message
        );

        if (lobbyMessage) {
            lobbyMessage.textContent =
                message;
        }
    }
);

socket.on(
    "connect",
    () => {
        console.log(
            "✅ اتصال به سرور برقرار شد."
        );
    }
);

socket.on(
    "disconnect",
    () => {
        console.log(
            "❌ اتصال به سرور قطع شد."
        );
    }
);

// ======================================================
// چت داخل بازی
// ======================================================

function renderGameChatMessage(message) {
    /*
     * اگر هنوز پنل چت داخل بازی را به HTML
     * اضافه نکرده‌ایم، پیام‌ها را فعلاً در
     * console نگه می‌داریم تا چیزی خراب نشود.
     */

    const gameChatMessages =
        document.getElementById(
            "gameChatMessages"
        );

    if (!gameChatMessages) {
        console.log(
            `[GAME CHAT] ${message.name}: ${message.text}`
        );

        return;
    }

    const item =
        document.createElement("div");

    item.className =
        "chatMessage";

    if (message.type === "system") {
        item.classList.add(
            "system"
        );

        item.textContent =
            `• ${message.text}`;
    } else {
        const name =
            document.createElement("span");

        name.className =
            "chatName";

        name.textContent =
            `${message.name}:`;

        const text =
            document.createElement("span");

        text.className =
            "chatText";

        text.textContent =
            ` ${message.text}`;

        item.appendChild(name);
        item.appendChild(text);
    }

    gameChatMessages.appendChild(
        item
    );

    gameChatMessages.scrollTop =
        gameChatMessages.scrollHeight;
}
const tutorialButton = document.getElementById("tutorialButton");
const backFromTutorialButton = document.getElementById("backFromTutorialButton");

const tutorialScreen = document.getElementById("tutorialScreen");
const homeScreen = document.getElementById("homeScreen");

const gameChatMessages = document.getElementById("gameChatMessages");
const gameChatInput = document.getElementById("gameChatInput");
const gameChatSendButton = document.getElementById("gameChatSendButton");

tutorialButton.addEventListener("click", () => {
    playClickSound();
    showScreen(tutorialScreen);
});

backFromTutorialButton.addEventListener("click", () => {
    playClickSound();
    showScreen(homeScreen);
});


function sendGameChat() {
    const text = gameChatInput.value.trim();

    if (!text) return;

    socket.emit("gameChat", {
        code: currentState?.code,
        text
    });

    gameChatInput.value = "";
}


gameChatSendButton.addEventListener("click", () => {
    playClickSound();
    sendGameChat();
});


gameChatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        sendGameChat();
    }
});


socket.on("gameChatMessage", (message) => {

    const item = document.createElement("div");

    item.className = "chatMessage";

    const name = document.createElement("span");

    name.className = "chatName";

    name.textContent = message.name + ":";

    const text = document.createElement("span");

    text.className = "chatText";

    text.textContent = " " + message.text;

    item.appendChild(name);
    item.appendChild(text);

    gameChatMessages.appendChild(item);

    gameChatMessages.scrollTop =
        gameChatMessages.scrollHeight;
});
