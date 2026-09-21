const socket = io();

const $ = (id) => document.getElementById(id);

let playerToken = "";
let savedRoom = "";
let currentRoom = "";
let currentRole = null;
let currentGameState = null;
let currentProfile = null;
let avatarList = [];
let menuMusicPlaying = false;

try {
    playerToken = localStorage.getItem("qajar_player_token") || "";
    savedRoom = localStorage.getItem("qajar_room_code") || "";
} catch (error) {
    console.warn("localStorage unavailable:", error);
}

/* =========================
   Helpers
========================= */

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((screen) => {
        screen.classList.add("hidden");
    });

    const screen = $(screenId);
    if (screen) {
        screen.classList.remove("hidden");
    }
}

function showError(message) {
    const text = message || "";

    if ($("errorMessage")) {
        $("errorMessage").textContent = text;
    }

    if ($("gameMessage")) {
        $("gameMessage").textContent = text;
    }
}

function saveSession(roomCode) {
    savedRoom = roomCode || "";

    try {
        if (savedRoom) {
            localStorage.setItem("qajar_room_code", savedRoom);
        } else {
            localStorage.removeItem("qajar_room_code");
        }
    } catch (error) {
        console.warn("Could not save room:", error);
    }
}

function saveToken(token) {
    playerToken = token || "";

    try {
        if (playerToken) {
            localStorage.setItem("qajar_player_token", playerToken);
        } else {
            localStorage.removeItem("qajar_player_token");
        }
    } catch (error) {
        console.warn("Could not save token:", error);
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function roleTitle(role) {
    if (role === "constitutionalist") return "مشروطه‌خواه";
    if (role === "qajar") return "قاجاری";
    if (role === "naser") return "ناصرالدین شاه";
    return "نامشخص";
}

function roleEmoji(role) {
    if (role === "constitutionalist") return "🟦";
    if (role === "qajar") return "🟥";
    if (role === "naser") return "👑";
    return "🎭";
}

function phaseTitle(phase) {
    const titles = {
        nomination: "انتخاب وزیر",
        vote: "رأی‌گیری",
        president_discard: "تصمیم صدر",
        minister_enact: "تصمیم وزیر",
        result: "نتیجه",
        finished: "پایان بازی"
    };

    return titles[phase] || "دربار";
}

function playerNameById(players, id) {
    const player = (players || []).find((p) => p.id === id);
    return player ? player.name : "نامشخص";
}

function setMessage(elementId, message) {
    const element = $(elementId);
    if (element) {
        element.textContent = message || "";
    }
}

function clearMessages() {
    [
        "errorMessage",
        "lobbyMessage",
        "giftMessage",
        "gameMessage",
        "voteStatus",
        "discardHint"
    ].forEach((id) => {
        if ($(id)) $(id).textContent = "";
    });
}

/* =========================
   Profile
========================= */

function updateProfile(profile) {
    if (!profile) return;

    currentProfile = profile;

    const coins = Number(profile.coins || 0);

    if ($("coinCount")) {
        $("coinCount").textContent = coins;
    }

    if ($("shopCoins")) {
        $("shopCoins").textContent = coins;
    }
}

/* =========================
   Avatar Shop
========================= */

function renderAvatarShop() {
    const grid = $("avatarGrid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!Array.isArray(avatarList) || avatarList.length === 0) {
        grid.innerHTML = `<div class="smallText">آواتاری پیدا نشد.</div>`;
        return;
    }

    avatarList.forEach((avatar) => {
        const card = document.createElement("div");
        card.className = "avatarItem";

        const active =
            currentProfile &&
            currentProfile.avatar === avatar.id;

        card.innerHTML = `
            <div class="avatarEmoji">${escapeHtml(avatar.emoji || "👤")}</div>
            <div class="avatarName">${escapeHtml(avatar.name || avatar.id)}</div>
            <div class="avatarPrice">
                ${avatar.price > 0 ? `🪙 ${avatar.price}` : "رایگان"}
            </div>
            <button
                type="button"
                class="${active ? "secondary" : ""}"
                data-avatar-id="${escapeHtml(avatar.id)}"
            >
                ${active ? "انتخاب شده" : avatar.price > 0 ? "خرید / انتخاب" : "انتخاب"}
            </button>
        `;

        const button = card.querySelector("button");

        if (active) {
            button.disabled = true;
        } else {
            button.addEventListener("click", () => {
                socket.emit("buyAvatar", {
                    avatarId: avatar.id
                });
            });
        }

        grid.appendChild(card);
    });
}

/* =========================
   Lobby Players
========================= */

function renderPlayers(players, containerId) {
    const container = $(containerId);
    if (!container) return;

    container.innerHTML = "";

    (players || []).forEach((player) => {
        const item = document.createElement("div");
        item.className = "playerItem";

        const avatar = player.avatar || "👤";

        item.innerHTML = `
            <span class="playerAvatar">${escapeHtml(avatar)}</span>
            <span class="playerName">${escapeHtml(player.name)}</span>
            ${player.isPresident ? `<span class="playerBadge">👑 صدر</span>` : ""}
            ${player.isNominee ? `<span class="playerBadge">🎩 وزیر</span>` : ""}
        `;

        container.appendChild(item);
    });
}

function renderGamePlayers(state) {
    const container = $("gamePlayers");
    if (!container) return;

    container.innerHTML = "";

    (state.players || []).forEach((player) => {
        const item = document.createElement("div");
        item.className = "playerItem";

        let badges = "";

        if (player.id === state.president) {
            badges += `<span class="playerBadge">👑 صدر</span>`;
        }

        if (player.id === state.nominee) {
            badges += `<span class="playerBadge">🎩 وزیر</span>`;
        }

        item.innerHTML = `
            <span class="playerAvatar">${escapeHtml(player.avatar || "👤")}</span>
            <span class="playerName">${escapeHtml(player.name)}</span>
            ${badges}
        `;

        container.appendChild(item);
    });
}

/* =========================
   Tracks
========================= */

function renderTrack(containerId, count, max) {
    const container = $(containerId);
    if (!container) return;

    container.innerHTML = "";

    for (let i = 0; i < max; i++) {
        const box = document.createElement("div");
        box.className = i < count ? "trackBox filled" : "trackBox";
        box.textContent = i < count ? "✓" : "";
        container.appendChild(box);
    }
}

/* =========================
   Nominee Select
========================= */

function renderNomineeSelect(state) {
    const select = $("nomineeSelect");
    if (!select) return;

    select.innerHTML = "";

    const players = state.players || [];

    players
        .filter((player) => player.id !== state.president)
        .forEach((player) => {
            const option = document.createElement("option");
            option.value = player.id;
            option.textContent = `${player.avatar || "👤"} ${player.name}`;
            select.appendChild(option);
        });
}

/* =========================
   Game State
========================= */

function renderGameState(state) {
    if (!state) return;

    currentGameState = state;

    if ($("phaseTitle")) {
        $("phaseTitle").textContent =
            state.phaseText || phaseTitle(state.phase);
    }

    if ($("policyDeckCount")) {
        $("policyDeckCount").textContent =
            `کارت‌های باقی‌مانده: ${state.policyDeckCount ?? "--"}`;
    }

    const constitutional =
        Number(state.constitutionalPolicies || 0);

    const qajar =
        Number(state.qajarPolicies || 0);

    if ($("constitutionalCount")) {
        $("constitutionalCount").textContent =
            `${constitutional} / 5`;
    }

    if ($("qajarCount")) {
        $("qajarCount").textContent =
            `${qajar} / 6`;
    }

    renderTrack(
        "constitutionalTrack",
        constitutional,
        5
    );

    renderTrack(
        "qajarTrack",
        qajar,
        6
    );

    renderGamePlayers(state);

    /* President */

    if ($("presidentBox")) {
        const presidentName =
            playerNameById(state.players, state.president);

        $("presidentBox").innerHTML = `
            <strong>👑 صدر فعلی:</strong>
            ${escapeHtml(presidentName)}
        `;
    }

    /* Nominee */

    if ($("nomineeBox")) {
        const nomineeName = state.nominee
            ? playerNameById(state.players, state.nominee)
            : "هنوز معرفی نشده";

        $("nomineeBox").innerHTML = `
            <strong>🎩 وزیر پیشنهادی:</strong>
            ${escapeHtml(nomineeName)}
        `;
    }

    /* Hide all action boxes first */

    [
        "nominationBox",
        "voteBox",
        "presidentPolicyBox",
        "ministerPolicyBox"
    ].forEach((id) => {
        if ($(id)) $(id).classList.add("hidden");
    });

    /* Nomination */

    if (
        state.phase === "nomination" &&
        state.youArePresident
    ) {
        if ($("nominationBox")) {
            $("nominationBox").classList.remove("hidden");
        }

        renderNomineeSelect(state);
    }

    /* Vote */

    if (state.phase === "vote") {
        if ($("voteBox")) {
            $("voteBox").classList.remove("hidden");
        }

        if ($("voteDescription")) {
            const nomineeName =
                playerNameById(state.players, state.nominee);

            $("voteDescription").textContent =
                `آیا با انتخاب ${nomineeName} به عنوان وزیر موافقی؟`;
        }

        const voted = Boolean(state.youVoted);

        if ($("yesVoteButton")) {
            $("yesVoteButton").disabled = voted;
        }

        if ($("noVoteButton")) {
            $("noVoteButton").disabled = voted;
        }

        if ($("voteStatus")) {
            $("voteStatus").textContent = voted
                ? "رأی شما ثبت شده است."
                : "هنوز رأی نداده‌اید.";
        }
    }

    /* Result */

    if ($("publicResult")) {
        if (state.lastResult) {
            const result =
                typeof state.lastResult === "string"
                    ? state.lastResult
                    : state.lastResult.message ||
                      state.lastResult.text ||
                      "";

            $("publicResult").textContent = result;
        } else {
            $("publicResult").textContent = "";
        }
    }
}

/* =========================
   Role
========================= */

function renderRole(data) {
    currentRole = data.role;

    if ($("roleCard")) {
        $("roleCard").innerHTML = `
            <div class="roleEmoji">${roleEmoji(data.role)}</div>
            <h2>${escapeHtml(roleTitle(data.role))}</h2>
            <p>
                ${data.role === "naser"
                    ? "شما ناصرالدین شاه هستید."
                    : data.role === "qajar"
                        ? "شما در جناح قاجاری هستید."
                        : "شما در جناح مشروطه‌خواه هستید."
                }
            </p>
        `;
    }

    if ($("alliesBox")) {
        const allies = Array.isArray(data.allies)
            ? data.allies
            : [];

        if (allies.length) {
            $("alliesBox").innerHTML = `
                <strong>🤝 هم‌پیمانان شما:</strong>
                <div>
                    ${allies
                        .map((ally) => escapeHtml(ally.name || ally))
                        .join("، ")}
                </div>
            `;
        } else {
            $("alliesBox").innerHTML =
                `<span>🤫 شما هم‌پیمانی ندارید.</span>`;
        }
    }
}

/* =========================
   Chat
========================= */

function addChatMessage(containerId, message) {
    const container = $(containerId);
    if (!container || !message) return;

    const item = document.createElement("div");
    item.className = "chatMessage";

    const name =
        message.name ||
        message.playerName ||
        "بازیکن";

    const text =
        message.text ||
        message.message ||
        "";

    item.innerHTML = `
        <strong>${escapeHtml(name)}:</strong>
        <span>${escapeHtml(text)}</span>
    `;

    container.appendChild(item);

    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }

    container.scrollTop = container.scrollHeight;
}

function sendLobbyChat() {
    const input = $("chatInput");
    if (!input) return;

    const text = input.value.trim();

    if (!text) return;

    socket.emit("lobbyChat", { text });

    input.value = "";
    input.focus();
}

function sendGameChat() {
    const input = $("gameChatInput");
    if (!input) return;

    const text = input.value.trim();

    if (!text) return;

    socket.emit("gameChat", { text });

    input.value = "";
    input.focus();
}

/* =========================
   Cards
========================= */

function renderPolicyCards(containerId, cards, eventName) {
    const container = $(containerId);
    if (!container) return;

    container.innerHTML = "";

    (cards || []).forEach((card, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "policyCard";

        const isConstitutionalist =
            card === "constitutionalist" ||
            card === "constitutional";

        button.innerHTML = `
            <span class="policyCardIcon">
                ${isConstitutionalist ? "🟦" : "🟥"}
            </span>
            <strong>
                ${isConstitutionalist
                    ? "مشروطه"
                    : "قاجاری"}
            </strong>
        `;

        button.addEventListener("click", () => {
            socket.emit(eventName, {
                index
            });

            Array.from(container.children).forEach((child) => {
                child.disabled = true;
            });
        });

        container.appendChild(button);
    });
}

/* =========================
   Buttons
========================= */

if ($("createRoomButton")) {
    $("createRoomButton").addEventListener("click", () => {
        clearMessages();

        const name =
            $("playerName")?.value.trim() || "";

        if (!name) {
            showError("اول نام بازیکن را وارد کن.");
            return;
        }

        socket.emit("createRoom", {
            name
        });
    });
}

if ($("joinRoomButton")) {
    $("joinRoomButton").addEventListener("click", () => {
        clearMessages();

        const name =
            $("playerName")?.value.trim() || "";

        const roomCode =
            $("roomCodeInput")?.value.trim() || "";

        if (!name) {
            showError("اول نام بازیکن را وارد کن.");
            return;
        }

        if (!roomCode) {
            showError("کد اتاق را وارد کن.");
            return;
        }

        socket.emit("joinRoom", {
            name,
            roomCode
        });
    });
}

/* Tutorial */

if ($("tutorialButton")) {
    $("tutorialButton").addEventListener("click", () => {
        showScreen("tutorialScreen");
    });
}

if ($("backFromTutorialButton")) {
    $("backFromTutorialButton").addEventListener("click", () => {
        showScreen("homeScreen");
    });
}

/* Shop */

if ($("openShopButton")) {
    $("openShopButton").addEventListener("click", () => {
        socket.emit("getAvatars");
        socket.emit("getProfile");
        showScreen("shopScreen");
    });
}

if ($("closeShopButton")) {
    $("closeShopButton").addEventListener("click", () => {
        showScreen("homeScreen");
    });
}

/* Gift */

if ($("openGiftButton")) {
    $("openGiftButton").addEventListener("click", () => {
        setMessage("giftMessage", "");
        showScreen("giftScreen");
    });
}

if ($("closeGiftButton")) {
    $("closeGiftButton").addEventListener("click", () => {
        showScreen("homeScreen");
    });
}

if ($("redeemGiftButton")) {
    $("redeemGiftButton").addEventListener("click", () => {
        const code =
            $("giftCodeInput")?.value.trim() || "";

        if (!code) {
            setMessage(
                "giftMessage",
                "کد هدیه را وارد کن."
            );
            return;
        }

        socket.emit("redeemGift", {
            code
        });
    });
}

/* Lobby */

if ($("startGameButton")) {
    $("startGameButton").addEventListener("click", () => {
        socket.emit("startGame");
    });
}

if ($("sendChatButton")) {
    $("sendChatButton").addEventListener(
        "click",
        sendLobbyChat
    );
}

if ($("chatInput")) {
    $("chatInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendLobbyChat();
        }
    });
}

/* Continue */

if ($("continueGameButton")) {
    $("continueGameButton").addEventListener("click", () => {
        showScreen("gameScreen");

        if (currentGameState) {
            renderGameState(currentGameState);
        }
    });
}

/* Nomination */

if ($("nominateButton")) {
    $("nominateButton").addEventListener("click", () => {
        const nomineeId =
            $("nomineeSelect")?.value;

        if (!nomineeId) {
            setMessage(
                "gameMessage",
                "یک بازیکن را برای وزارت انتخاب کن."
            );
            return;
        }

        socket.emit("nominateChancellor", {
            playerId: nomineeId
        });
    });
}

/* Vote */

if ($("yesVoteButton")) {
    $("yesVoteButton").addEventListener("click", () => {
        socket.emit("castVote", {
            vote: true
        });
    });
}

if ($("noVoteButton")) {
    $("noVoteButton").addEventListener("click", () => {
        socket.emit("castVote", {
            vote: false
        });
    });
}

/* Game chat */

if ($("gameChatSendButton")) {
    $("gameChatSendButton").addEventListener(
        "click",
        sendGameChat
    );
}

if ($("gameChatInput")) {
    $("gameChatInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendGameChat();
        }
    });
}

/* Restart */

if ($("reloadButton")) {
    $("reloadButton").addEventListener("click", () => {
        window.location.reload();
    });
}

/* Music */

if ($("musicButton")) {
    $("musicButton").addEventListener("click", async () => {
        const music = $("menuMusic");

        if (!music) return;

        try {
            if (menuMusicPlaying) {
                music.pause();
                menuMusicPlaying = false;
                $("musicButton").textContent =
                    "🎵 موسیقی: خاموش";
            } else {
                await music.play();

                menuMusicPlaying = true;
                $("musicButton").textContent =
                    "🎵 موسیقی: روشن";
            }
        } catch (error) {
            console.warn("Music could not play:", error);

            setMessage(
                "errorMessage",
                "فایل موسیقی پیدا نشد یا مرورگر اجازه پخش خودکار نداد."
            );
        }
    });
}

/* =========================
   Socket Events
========================= */

socket.on("connect", () => {
    console.log("Socket connected:", socket.id);

    if (playerToken) {
        socket.emit("restoreSession", {
            token: playerToken
        });
    } else {
        socket.emit("getProfile");
    }
});

socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
});

/* Auth */

socket.on("authResult", (result) => {
    if (!result) return;

    if (!result.ok) {
        showError(result.message || "خطا در ورود.");
        return;
    }

    if (result.token) {
        saveToken(result.token);
    }

    if (result.profile) {
        updateProfile(result.profile);
    }
});

socket.on("profile", (result) => {
    if (!result) return;

    if (result.ok && result.profile) {
        updateProfile(result.profile);
        renderAvatarShop();
    }
});

/* Avatars */

socket.on("avatarList", (list) => {
    avatarList = Array.isArray(list)
        ? list
        : [];

    renderAvatarShop();
});

socket.on("avatarResult", (result) => {
    if (!result) return;

    if ($("giftMessage")) {
        $("giftMessage").textContent =
            result.message || "";
    }

    if (result.ok) {
        socket.emit("getProfile");
        socket.emit("getAvatars");
    }
});

/* Gift */

socket.on("giftResult", (result) => {
    if (!result) return;

    if ($("giftMessage")) {
        $("giftMessage").textContent =
            result.message || "";
    }

    if (result.ok) {
        if ($("giftCodeInput")) {
            $("giftCodeInput").value = "";
        }

        socket.emit("getProfile");
    }
});

/* Room created */

socket.on("roomCreated", (data) => {
    if (!data) return;

    currentRoom =
        data.roomCode ||
        data.code ||
        "";

    saveSession(currentRoom);

    if ($("roomCode")) {
        $("roomCode").textContent =
            currentRoom || "----";
    }

    showScreen("lobbyScreen");
});

/* Room state */

socket.on("roomState", (state) => {
    if (!state) return;

    currentRoom =
        state.roomCode ||
        currentRoom;

    if (currentRoom) {
        saveSession(currentRoom);
    }

    if ($("roomCode")) {
        $("roomCode").textContent =
            currentRoom || "----";
    }

    const players =
        Array.isArray(state.players)
            ? state.players
            : [];

    if ($("playerCount")) {
        $("playerCount").textContent =
            `${players.length} / 10`;
    }

    renderPlayers(
        players,
        "playersList"
    );

    if (Array.isArray(state.messages)) {
        const chat = $("chatMessages");

        if (chat) {
            chat.innerHTML = "";

            state.messages.forEach((message) => {
                addChatMessage(
                    "chatMessages",
                    message
                );
            });
        }
    }

    if (!state.started) {
        showScreen("lobbyScreen");
    }
});

/* Lobby chat */

socket.on("chatMessage", (message) => {
    addChatMessage(
        "chatMessages",
        message
    );
});

/* Game started */

socket.on("gameStarted", () => {
    setMessage(
        "lobbyMessage",
        "🎴 بازی شروع شد!"
    );

    if (currentRole) {
        showScreen("roleScreen");
    }
});

/* Role */

socket.on("roleAssigned", (data) => {
    if (!data) return;

    renderRole(data);

    showScreen("roleScreen");
});

/* Game state */

socket.on("gameState", (state) => {
    renderGameState(state);

    if (state.phase !== "finished") {
        if (
            currentRole &&
            !$("roleScreen")?.classList.contains("hidden")
        ) {
            // نقش نمایش داده شده؛ بازیکن خودش دکمه ورود را می‌زند.
        } else {
            showScreen("gameScreen");
        }
    }
});

/* President gets 3 cards */

socket.on("policyDrawn", (cards) => {
    if (!currentGameState) return;

    const list =
        Array.isArray(cards)
            ? cards
            : cards?.cards || [];

    if (!currentGameState.youArePresident) {
        return;
    }

    const box = $("presidentPolicyBox");

    if (box) {
        box.classList.remove("hidden");
    }

    renderPolicyCards(
        "presidentCards",
        list,
        "presidentDiscard"
    );

    setMessage(
        "discardHint",
        "یکی از سه کارت را کنار بگذار."
    );

    showScreen("gameScreen");
});

/* Minister gets 2 cards */

socket.on("ministerPolicy", (cards) => {
    if (!currentGameState) return;

    const list =
        Array.isArray(cards)
            ? cards
            : cards?.cards || [];

    if (!currentGameState.youAreNominee) {
        return;
    }

    const box = $("ministerPolicyBox");

    if (box) {
        box.classList.remove("hidden");
    }

    renderPolicyCards(
        "ministerCards",
        list,
        "ministerEnact"
    );

    showScreen("gameScreen");
});

/* Game chat */

socket.on("gameChatMessage", (message) => {
    addChatMessage(
        "gameChatMessages",
        message
    );
});

/* Game over */

socket.on("gameOver", (data) => {
    if (!data) return;

    const winner =
        data.winner ||
        data.faction ||
        "";

    const reason =
        data.reason ||
        data.message ||
        "";

    if ($("gameOverTitle")) {
        $("gameOverTitle").textContent =
            winner === "constitutionalist"
                ? "🟦 مشروطه‌خواهان پیروز شدند"
                : winner === "qajar"
                    ? "🟥 قاجاریان پیروز شدند"
                    : "🏆 بازی تمام شد";
    }

    if ($("gameOverReason")) {
        $("gameOverReason").textContent =
            reason;
    }

    if ($("gameOverIcon")) {
        $("gameOverIcon").textContent =
            winner === "constitutionalist"
                ? "🟦"
                : winner === "qajar"
                    ? "🟥"
                    : "🏆";
    }

    showScreen("gameOverScreen");
});

/* Server errors */

socket.on("errorMessage", (message) => {
    showError(message);

    if ($("lobbyMessage")) {
        $("lobbyMessage").textContent =
            message || "";
    }

    if ($("giftMessage")) {
        $("giftMessage").textContent =
            message || "";
    }

    if ($("gameMessage")) {
        $("gameMessage").textContent =
            message || "";
    }
});

/* Old reconnect event support */

socket.on("reconnected", ({ roomCode, started }) => {
    if (roomCode) {
        saveSession(roomCode);
    }

    if ($("lobbyMessage")) {
        $("lobbyMessage").textContent =
            started
                ? "🔌 اتصال دوباره برقرار شد؛ جایگاه شما حفظ شد."
                : "🔌 اتصال دوباره برقرار شد.";
    }
});

/* =========================
   Initial setup
========================= */

socket.emit("getAvatars");

if (window.speechSynthesis &&
    typeof window.speechSynthesis.getVoices === "function") {
    window.speechSynthesis.getVoices();
}

console.log("🎭 Shadows of the Court - old game.js loaded");
