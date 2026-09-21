"use strict";

/* =========================================================
   سایه‌های دربار
   Multiplayer Client
   ========================================================= */

const socket = io();

/* =========================================================
   STATE
   ========================================================= */

let state = null;

let currentRoomCode = null;
let myPlayerId = null;

let currentRole = null;
let currentAllies = [];

let roleScreenVisible = false;

let presidentCards = [];
let ministerCards = [];

let selectedAvatar =
    localStorage.getItem("sdb_avatar") || "👑";

let coins =
    Number(localStorage.getItem("sdb_coins") || 250);

let dailyGiftDate =
    localStorage.getItem("sdb_daily_gift") || null;


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const screen = $(id);

    if (screen) {
        screen.classList.add("active");
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToast(message, type = "info") {
    const container = $("toastContainer");

    if (!container) return;

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 20);

    setTimeout(() => {
        toast.classList.remove("show");

        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function saveCoins() {
    localStorage.setItem("sdb_coins", String(coins));

    const element = $("shopCoins");

    if (element) {
        element.textContent = coins;
    }
}

function getMyName() {
    return ($("playerName")?.value || "").trim();
}

function getStoredName() {
    return localStorage.getItem("sdb_name") || "";
}

function setStoredName(name) {
    localStorage.setItem("sdb_name", name);
}

function phaseText(phase) {

    const texts = {
        lobby: "در انتظار بازیکنان",
        nomination: "انتخاب وزیر",
        vote: "رأی‌گیری دولت",
        president_discard: "انتخاب رئیس",
        minister_enact: "انتخاب وزیر",
        game_over: "پایان بازی"
    };

    return texts[phase] || "در جریان بازی";
}

function roleInfo(role) {

    const roles = {

        constitutionalist: {
            name: "مشروطه‌خواه",
            icon: "📜",
            team: "جناح مشروطه",
            description:
                "وظیفه شما پیدا کردن قاجاری‌ها و رساندن سیاست‌های مشروطه به قدرت است.",
            className: "constitutional"
        },

        qajar: {
            name: "قاجاری",
            icon: "🦁",
            team: "جناح قاجار",
            description:
                "خود را پنهان کنید، اعتماد دیگران را به دست آورید و سیاست‌های قاجاری را پیش ببرید.",
            className: "qajar"
        },

        naser: {
            name: "ناصرالدین‌شاه",
            icon: "👑",
            team: "جناح قاجار",
            description:
                "شما رهبر جناح قاجار هستید. هویت خود را پنهان کنید و مسیر دربار را کنترل کنید.",
            className: "naser"
        }
    };

    return roles[role] || {
        name: "نامشخص",
        icon: "🎭",
        team: "",
        description: "",
        className: ""
    };
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    initializeHome();

    initializeNavigation();

    initializeLobby();

    initializeGame();

    initializeShop();

    initializeGift();

    const storedName = getStoredName();

    if (storedName && $("playerName")) {
        $("playerName").value = storedName;
    }

    saveCoins();
});


/* =========================================================
   HOME
   ========================================================= */

function initializeHome() {

    $("createRoomButton")?.addEventListener("click", createRoom);

    $("joinRoomButton")?.addEventListener("click", joinRoom);

    $("playerName")?.addEventListener("keydown", event => {

        if (event.key === "Enter") {
            createRoom();
        }

    });

    $("roomCodeInput")?.addEventListener("keydown", event => {

        if (event.key === "Enter") {
            joinRoom();
        }

    });

    $("roomCodeInput")?.addEventListener("input", event => {
        event.target.value =
            event.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
    });
}


function validateName() {

    const name = getMyName();

    if (!name) {
        showToast("ابتدا نام خود را وارد کنید.", "error");

        $("playerName")?.focus();

        return null;
    }

    if (name.length < 2) {
        showToast("نام باید حداقل ۲ حرف داشته باشد.", "error");

        return null;
    }

    setStoredName(name);

    return name;
}


function createRoom() {

    const name = validateName();

    if (!name) return;

    socket.emit("createRoom", {
        name
    });
}


function joinRoom() {

    const name = validateName();

    if (!name) return;

    const roomCode =
        $("roomCodeInput")?.value.trim().toUpperCase();

    if (!roomCode || roomCode.length < 4) {

        showToast(
            "کد اتاق را درست وارد کنید.",
            "error"
        );

        return;
    }

    socket.emit("joinRoom", {
        roomCode,
        name
    });
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function initializeNavigation() {

    $("tutorialButton")?.addEventListener(
        "click",
        () => showScreen("tutorialScreen")
    );

    $("shopButton")?.addEventListener(
        "click",
        () => showScreen("shopScreen")
    );

    $("giftButton")?.addEventListener(
        "click",
        () => showScreen("giftScreen")
    );

    document.querySelectorAll("[data-back]").forEach(button => {

        button.addEventListener("click", () => {

            const target =
                button.dataset.back || "homeScreen";

            showScreen(target);
        });

    });

    document.querySelectorAll(".back-home-button").forEach(button => {

        button.addEventListener("click", () => {
            showScreen("homeScreen");
        });

    });

    $("returnHomeButton")?.addEventListener(
        "click",
        () => {

            state = null;

            currentRoomCode = null;

            currentRole = null;

            presidentCards = [];

            ministerCards = [];

            showScreen("homeScreen");
        }
    );
}


/* =========================================================
   SOCKET - ROOM
   ========================================================= */

socket.on("connect", () => {

    myPlayerId = socket.id;

});


socket.on("roomCreated", data => {

    currentRoomCode = data.roomCode;

    updateRoomCode(data.roomCode);

    showScreen("lobbyScreen");

    showToast(
        `اتاق ${data.roomCode} ساخته شد.`,
        "success"
    );

});


socket.on("roomState", roomState => {

    state = roomState;

    if (roomState.roomCode) {
        currentRoomCode = roomState.roomCode;
    }

    updateRoomCode(currentRoomCode);

    renderLobby(roomState);

});


socket.on("gameStarted", data => {

    if (data?.role) {

        currentRole = data.role;

    }

});


socket.on("roleAssigned", data => {

    currentRole = data.role || null;

    currentAllies = Array.isArray(data.allies)
        ? data.allies
        : [];

    roleScreenVisible = true;

    renderRoleScreen();

    showScreen("roleScreen");

});


socket.on("gameState", newState => {

    state = newState;

    if (!currentRoomCode && newState.roomCode) {
        currentRoomCode = newState.roomCode;
    }

    if (roleScreenVisible) {
        return;
    }

    renderGameState(newState);

});


socket.on("policyDrawn", data => {

    presidentCards =
        Array.isArray(data.cards)
            ? data.cards
            : [];

    renderPresidentCards();

});


socket.on("ministerPolicy", data => {

    ministerCards =
        Array.isArray(data.cards)
            ? data.cards
            : [];

    renderMinisterCards();

});


socket.on("publicResult", data => {

    if (!data) return;

    if (data.message) {
        showNarrator(data.message);
    }

});


socket.on("narrator", data => {

    const message =
        typeof data === "string"
            ? data
            : data?.message;

    if (message) {
        showNarrator(message);
    }

});


socket.on("gameChatMessage", data => {

    addChatMessage(
        "gameChatMessages",
        data
    );

});


socket.on("chatMessage", data => {

    addChatMessage(
        "lobbyChatMessages",
        data
    );

});


socket.on("gameOver", data => {

    renderGameOver(data);

});


socket.on("errorMessage", message => {

    const text =
        typeof message === "string"
            ? message
            : message?.message;

    showToast(
        text || "خطایی رخ داد.",
        "error"
    );

});


socket.on("disconnect", () => {

    showToast(
        "ارتباط با سرور قطع شد.",
        "error"
    );

});


/* =========================================================
   ROOM / LOBBY
   ========================================================= */

function updateRoomCode(code) {

    const safeCode = code || "------";

    if ($("lobbyRoomCode")) {
        $("lobbyRoomCode").textContent = safeCode;
    }

    if ($("roomCodeLarge")) {
        $("roomCodeLarge").textContent = safeCode;
    }

    if ($("gameRoomCode")) {
        $("gameRoomCode").textContent = safeCode;
    }
}


function renderLobby(room) {

    if (!room) return;

    updateRoomCode(room.roomCode);

    const players =
        Array.isArray(room.players)
            ? room.players
            : [];

    if ($("playerCount")) {
        $("playerCount").textContent =
            `${players.length} / 10`;
    }

    const container = $("lobbyPlayers");

    if (!container) return;

    container.innerHTML = "";

    players.forEach((player, index) => {

        const row =
            document.createElement("div");

        row.className = "lobby-player";

        if (player.id === myPlayerId) {
            row.classList.add("you");
        }

        if (player.id === room.hostId) {
            row.classList.add("host");
        }

        row.innerHTML = `
            <div class="player-avatar">
                ${escapeHTML(player.avatar || "👤")}
            </div>

            <div class="player-info">

                <strong>
                    ${escapeHTML(player.name)}
                </strong>

                ${
                    player.id === myPlayerId
                        ? `<span>شما</span>`
                        : ""
                }

            </div>

            ${
                player.id === room.hostId
                    ? `<div class="host-badge">میزبان</div>`
                    : ""
            }
        `;

        container.appendChild(row);

    });

    const enoughPlayers =
        players.length >= 4;

    const isHost =
        room.hostId === myPlayerId;

    const startButton =
        $("startGameButton");

    if (startButton) {

        startButton.disabled =
            !enoughPlayers || !isHost;

        if (!isHost) {
            startButton.textContent =
                "منتظر میزبان...";
        } else if (!enoughPlayers) {
            startButton.textContent =
                `حداقل ۴ بازیکن`;
        } else {
            startButton.textContent =
                "شروع بازی";
        }

    }

    if ($("lobbyStatus")) {

        if (players.length < 4) {

            $("lobbyStatus").textContent =
                `حداقل ۴ بازیکن لازم است (${players.length}/4)`;

        } else {

            $("lobbyStatus").textContent =
                "اتاق آماده شروع است";

        }

    }
}


function initializeLobby() {

    $("startGameButton")?.addEventListener(
        "click",
        () => socket.emit("startGame")
    );


    $("leaveRoomButton")?.addEventListener(
        "click",
        () => {

            socket.disconnect();

            setTimeout(() => {
                window.location.reload();
            }, 100);

        }
    );


    $("copyRoomCodeButton")?.addEventListener(
        "click",
        async () => {

            if (!currentRoomCode) return;

            try {

                await navigator.clipboard.writeText(
                    currentRoomCode
                );

                showToast(
                    "کد اتاق کپی شد.",
                    "success"
                );

            } catch {

                showToast(
                    `کد اتاق: ${currentRoomCode}`,
                    "info"
                );

            }

        }
    );


    $("lobbyChatForm")?.addEventListener(
        "submit",
        event => {

            event.preventDefault();

            const input =
                $("lobbyChatInput");

            const message =
                input?.value.trim();

            if (!message) return;

            socket.emit("chatMessage", {
                message
            });

            input.value = "";

        }
    );
}


/* =========================================================
   ROLE SCREEN
   ========================================================= */

function renderRoleScreen() {

    const info =
        roleInfo(currentRole);

    if ($("roleIcon")) {
        $("roleIcon").textContent =
            info.icon;
    }

    if ($("roleName")) {
        $("roleName").textContent =
            info.name;

        $("roleName").className =
            `role-name ${info.className}`;
    }

    if ($("roleDescription")) {
        $("roleDescription").textContent =
            info.description;
    }

    if ($("roleTeam")) {
        $("roleTeam").textContent =
            info.team;
    }

    const alliesBox =
        $("alliesBox");

    const alliesList =
        $("alliesList");

    if (
        currentAllies.length > 0 &&
        alliesBox &&
        alliesList
    ) {

        alliesBox.classList.remove("hidden");

        alliesList.innerHTML =
            currentAllies
                .map(player => `
                    <div class="ally">
                        <span>
                            ${escapeHTML(
                                player.avatar || "👤"
                            )}
                        </span>

                        <strong>
                            ${escapeHTML(player.name)}
                        </strong>
                    </div>
                `)
                .join("");

    } else if (alliesBox) {

        alliesBox.classList.add("hidden");

    }

}


$("continueGameButton")?.addEventListener(
    "click",
    () => {

        roleScreenVisible = false;

        showScreen("gameScreen");

        if (state) {
            renderGameState(state);
        }

    }
);


/* =========================================================
   GAME STATE
   ========================================================= */

function renderGameState(gameState) {

    if (!gameState) return;

    state = gameState;

    updateRoomCode(gameState.roomCode);

    updatePolicyBoard(gameState);

    renderGamePlayers(gameState);

    clearActionBoxes();

    updateGameStatus(gameState);

    if (gameState.phase === "nomination") {

        if (gameState.youArePresident) {

            renderNomination(gameState);

        } else {

            showWaiting(
                "رئیس باید وزیر را انتخاب کند."
            );

        }

    } else if (gameState.phase === "vote") {

        renderVote(gameState);

    } else if (
        gameState.phase === "president_discard"
    ) {

        if (gameState.youArePresident) {

            $("presidentBox")
                ?.classList
                .remove("hidden");

            renderPresidentCards();

        } else {

            showWaiting(
                "رئیس در حال انتخاب سیاست است..."
            );

        }

    } else if (
        gameState.phase === "minister_enact"
    ) {

        if (gameState.youAreNominee) {

            $("ministerBox")
                ?.classList
                .remove("hidden");

            renderMinisterCards();

        } else {

            showWaiting(
                "وزیر در حال انتخاب سیاست است..."
            );

        }

    } else {

        showWaiting(
            "منتظر دور بعد..."
        );

    }

}


function updatePolicyBoard(gameState) {

    const constitutional =
        Number(gameState.constitutionalPolicies || 0);

    const qajar =
        Number(gameState.qajarPolicies || 0);

    if ($("constitutionalCount")) {
        $("constitutionalCount").textContent =
            constitutional;
    }

    if ($("qajarCount")) {
        $("qajarCount").textContent =
            qajar;
    }

    const constitutionalSlots =
        document.querySelectorAll(
            ".constitutional-column .policy-slot"
        );

    constitutionalSlots.forEach(
        (slot, index) => {

            slot.classList.toggle(
                "filled",
                index < constitutional
            );

        }
    );

    const qajarSlots =
        document.querySelectorAll(
            ".qajar-column .policy-slot"
        );

    qajarSlots.forEach(
        (slot, index) => {

            slot.classList.toggle(
                "filled",
                index < qajar
            );

        }
    );
}


/* =========================================================
   GAME PLAYERS
   ========================================================= */

function renderGamePlayers(gameState) {

    const container =
        $("gamePlayers");

    if (!container) return;

    container.innerHTML = "";

    const players =
        Array.isArray(gameState.players)
            ? gameState.players
            : [];

    players.forEach(player => {

        const row =
            document.createElement("div");

        row.className = "game-player";

        if (player.id === gameState.presidentId) {
            row.classList.add("president");
        }

        if (player.id === gameState.nomineeId) {
            row.classList.add("minister");
        }

        if (player.id === myPlayerId) {
            row.classList.add("you");
        }

        let badges = "";

        if (player.id === gameState.presidentId) {
            badges += `<span class="mini-badge">رئیس</span>`;
        }

        if (player.id === gameState.nomineeId) {
            badges += `<span class="mini-badge minister-badge">وزیر</span>`;
        }

        row.innerHTML = `

            <div class="game-player-avatar">
                ${escapeHTML(player.avatar || "👤")}
            </div>

            <div class="game-player-name">
                ${escapeHTML(player.name)}
            </div>

            <div class="game-player-badges">
                ${badges}
            </div>

        `;

        container.appendChild(row);

    });
}


/* =========================================================
   STATUS
   ========================================================= */

function updateGameStatus(gameState) {

    const title =
        $("gameStatusTitle");

    const text =
        $("gameStatusText");

    if (!title || !text) return;

    title.textContent =
        phaseText(gameState.phase);

    let message = "";

    const president =
        gameState.presidentName || "رئیس";

    const nominee =
        gameState.nomineeName || "وزیر";

    switch (gameState.phase) {

        case "nomination":

            message =
                `${president} رئیس است و باید یک وزیر انتخاب کند.`;

            break;

        case "vote":

            message =
                `دولت ${president} و ${nominee} در حال رأی‌گیری است.`;

            break;

        case "president_discard":

            message =
                `${president} باید یک کارت سیاست را کنار بگذارد.`;

            break;

        case "minister_enact":

            message =
                `${nominee} باید یک سیاست را تصویب کند.`;

            break;

        default:

            message =
                "منتظر حرکت بازیکنان...";

    }

    text.textContent = message;

}


/* =========================================================
   ACTION BOXES
   ========================================================= */

function clearActionBoxes() {

    [
        "nominationBox",
        "voteBox",
        "presidentBox",
        "ministerBox"
    ].forEach(id => {

        $(id)?.classList.add("hidden");

    });

    if ($("waitingBox")) {
        $("waitingBox").classList.remove("hidden");
    }
}


function showWaiting(message) {

    const box =
        $("waitingBox");

    if (!box) return;

    box.classList.remove("hidden");

    if ($("waitingText")) {
        $("waitingText").textContent =
            message;
    }

}


/* =========================================================
   NOMINATION
   ========================================================= */

function renderNomination(gameState) {

    $("waitingBox")
        ?.classList
        .add("hidden");

    $("nominationBox")
        ?.classList
        .remove("hidden");

    const container =
        $("nomineeOptions");

    if (!container) return;

    container.innerHTML = "";

    const players =
        Array.isArray(gameState.players)
            ? gameState.players
            : [];

    players.forEach(player => {

        if (player.id === myPlayerId) {
            return;
        }

        const button =
            document.createElement("button");

        button.className =
            "nominee-button";

        button.innerHTML = `

            <span class="nominee-avatar">
                ${escapeHTML(
                    player.avatar || "👤"
                )}
            </span>

            <span>
                ${escapeHTML(player.name)}
            </span>

        `;

        button.addEventListener(
            "click",
            () => {

                socket.emit("nominate", {
                    nomineeId: player.id
                });

                showWaiting(
                    "در انتظار رأی بازیکنان..."
                );

            }
        );

        container.appendChild(button);

    });

}


/* =========================================================
   VOTE
   ========================================================= */

function renderVote(gameState) {

    $("waitingBox")
        ?.classList
        .add("hidden");

    $("voteBox")
        ?.classList
        .remove("hidden");

    const yes =
        $("voteYesButton");

    const no =
        $("voteNoButton");

    if (gameState.youVoted) {

        yes.disabled = true;
        no.disabled = true;

        $("voteStatus").textContent =
            "رأی شما ثبت شده است.";

    } else {

        yes.disabled = false;
        no.disabled = false;

        $("voteStatus").textContent =
            "هنوز رأی نداده‌اید.";

    }

    yes.onclick = () => {

        if (gameState.youVoted) return;

        socket.emit("vote", {
            vote: "yes"
        });

        yes.disabled = true;
        no.disabled = true;

        $("voteStatus").textContent =
            "رأی شما: موافق";

    };

    no.onclick = () => {

        if (gameState.youVoted) return;

        socket.emit("vote", {
            vote: "no"
        });

        yes.disabled = true;
        no.disabled = true;

        $("voteStatus").textContent =
            "رأی شما: مخالف";

    };

}


/* =========================================================
   PRESIDENT CARDS
   ========================================================= */

function renderPresidentCards() {

    const container =
        $("presidentCards");

    if (!container) return;

    container.innerHTML = "";

    presidentCards.forEach(
        (card, index) => {

            const button =
                document.createElement("button");

            button.className =
                `policy-card ${
                    card === "qajar"
                        ? "qajar-policy"
                        : "constitutional-policy"
                }`;

            button.innerHTML = `

                <span class="card-symbol">
                    ${
                        card === "qajar"
                            ? "🦁"
                            : "📜"
                    }
                </span>

                <strong>
                    ${
                        card === "qajar"
                            ? "سیاست قاجاری"
                            : "سیاست مشروطه"
                    }
                </strong>

            `;

            button.addEventListener(
                "click",
                () => {

                    socket.emit(
                        "presidentDiscard",
                        {
                            index
                        }
                    );

                    container
                        .querySelectorAll(
                            ".policy-card"
                        )
                        .forEach(
                            cardButton => {
                                cardButton.disabled =
                                    true;
                            }
                        );

                    showWaiting(
                        "کارت‌ها به وزیر ارسال شدند."
                    );

                }
            );

            container.appendChild(button);

        }
    );

}


/* =========================================================
   MINISTER CARDS
   ========================================================= */

function renderMinisterCards() {

    const container =
        $("ministerCards");

    if (!container) return;

    container.innerHTML = "";

    ministerCards.forEach(
        (card, index) => {

            const button =
                document.createElement("button");

            button.className =
                `policy-card ${
                    card === "qajar"
                        ? "qajar-policy"
                        : "constitutional-policy"
                }`;

            button.innerHTML = `

                <span class="card-symbol">
                    ${
                        card === "qajar"
                            ? "🦁"
                            : "📜"
                    }
                </span>

                <strong>
                    ${
                        card === "qajar"
                            ? "سیاست قاجاری"
                            : "سیاست مشروطه"
                    }
                </strong>

            `;

            button.addEventListener(
                "click",
                () => {

                    socket.emit(
                        "ministerEnact",
                        {
                            index
                        }
                    );

                    container
                        .querySelectorAll(
                            ".policy-card"
                        )
                        .forEach(
                            cardButton => {
                                cardButton.disabled =
                                    true;
                            }
                        );

                    showWaiting(
                        "سیاست در حال تصویب است..."
                    );

                }
            );

            container.appendChild(button);

        }
    );

}


/* =========================================================
   NARRATOR
   ========================================================= */

function showNarrator(message) {

    const box =
        $("narratorBox");

    if (!box) return;

    box.textContent = message;

    box.classList.remove("active");

    requestAnimationFrame(() => {
        box.classList.add("active");
    });

}


/* =========================================================
   CHAT
   ========================================================= */

function addChatMessage(containerId, data) {

    const container =
        $(containerId);

    if (!container) return;

    const message =
        typeof data === "string"
            ? {
                name: "سیستم",
                message: data
            }
            : data || {};

    const row =
        document.createElement("div");

    row.className = "chat-message";

    const isMe =
        message.playerId === myPlayerId;

    if (isMe) {
        row.classList.add("me");
    }

    row.innerHTML = `

        <div class="chat-name">
            ${escapeHTML(
                message.name || "بازیکن"
            )}
        </div>

        <div class="chat-text">
            ${escapeHTML(
                message.message || ""
            )}
        </div>

    `;

    container.appendChild(row);

    container.scrollTop =
        container.scrollHeight;

}


function initializeGame() {

    $("gameChatForm")?.addEventListener(
        "submit",
        event => {

            event.preventDefault();

            const input =
                $("gameChatInput");

            const message =
                input?.value.trim();

            if (!message) return;

            socket.emit(
                "gameChatMessage",
                {
                    message
                }
            );

            input.value = "";

        }
    );

}


/* =========================================================
   GAME OVER
   ========================================================= */

function renderGameOver(data) {

    roleScreenVisible = false;

    const winner =
        data?.winner;

    const isQajar =
        winner === "qajar";

    if ($("gameOverIcon")) {

        $("gameOverIcon").textContent =
            isQajar
                ? "🦁"
                : "📜";

    }

    if ($("gameOverTitle")) {

        $("gameOverTitle").textContent =
            isQajar
                ? "قاجار پیروز شد"
                : "مشروطه پیروز شد";

    }

    if ($("gameOverText")) {

        $("gameOverText").textContent =
            data?.message ||
            (
                isQajar
                    ? "سیاست قاجاری کنترل دربار را به دست گرفت."
                    : "مشروطه‌خواهان توانستند مسیر دربار را تغییر دهند."
            );

    }

    if ($("finalConstitutional")) {

        $("finalConstitutional").textContent =
            data?.constitutionalPolicies ?? 0;

    }

    if ($("finalQajar")) {

        $("finalQajar").textContent =
            data?.qajarPolicies ?? 0;

    }

    showScreen("gameOverScreen");

}


/* =========================================================
   SHOP
   ========================================================= */

function initializeShop() {

    document.querySelectorAll(".shop-item")
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    const avatar =
                        item.dataset.avatar;

                    if (!avatar) return;

                    const priceText =
                        item.querySelector("small")
                            ?.textContent || "";

                    const priceMatch =
                        priceText.match(/\d+/);

                    const price =
                        priceMatch
                            ? Number(priceMatch[0])
                            : 0;

                    if (
                        price > 0 &&
                        coins < price
                    ) {

                        showToast(
                            "سکه کافی ندارید.",
                            "error"
                        );

                        return;
                    }

                    if (price > 0) {
                        coins -= price;
                    }

                    selectedAvatar =
                        avatar;

                    localStorage.setItem(
                        "sdb_avatar",
                        avatar
                    );

                    saveCoins();

                    showToast(
                        "آواتار انتخاب شد.",
                        "success"
                    );

                }
            );

        });

}


/* =========================================================
   GIFT
   ========================================================= */

function initializeGift() {

    $("dailyGiftButton")?.addEventListener(
        "click",
        claimDailyGift
    );

    updateGiftButton();

}


function getTodayKey() {

    const now =
        new Date();

    return [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate()
    ].join("-");

}


function updateGiftButton() {

    const button =
        $("dailyGiftButton");

    const message =
        $("giftMessage");

    if (!button) return;

    const today =
        getTodayKey();

    if (dailyGiftDate === today) {

        button.disabled = true;

        button.textContent =
            "هدیه امروز دریافت شده";

        if (message) {
            message.textContent =
                "فردا دوباره برگردید.";
        }

    } else {

        button.disabled = false;

        button.textContent =
            "دریافت 100 سکه";

        if (message) {
            message.textContent =
                "";
        }

    }

}


function claimDailyGift() {

    const today =
        getTodayKey();

    if (dailyGiftDate === today) {

        showToast(
            "هدیه امروز را قبلاً دریافت کرده‌اید.",
            "error"
        );

        return;
    }

    coins += 100;

    dailyGiftDate = today;

    localStorage.setItem(
        "sdb_daily_gift",
        today
    );

    saveCoins();

    updateGiftButton();

    showToast(
        "🎁 ۱۰۰ سکه دریافت کردید!",
        "success"
    );

}


/* =========================================================
   KEYBOARD
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            $("homeScreen") &&
            !$("homeScreen").classList.contains("active")
        ) {

            showScreen("homeScreen");

        }

    }
);


/* =========================================================
   EXTRA SAFETY
   ========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        /*
         * Socket.IO خودش اتصال را مدیریت می‌کند.
         * هیچ state مهمی در اینجا پاک نمی‌شود.
         */

    }
);
