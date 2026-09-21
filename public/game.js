"use strict";

/* =========================================================
   سایه‌های دربار - game.js
   هماهنگ با index.html
   قانون کارت: 3 → 2 → 1
========================================================= */

const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

/* =========================================================
   ابزارهای پایه
========================================================= */

const $ = (id) => document.getElementById(id);

const screens = {
    home: $("homeScreen"),
    tutorial: $("tutorialScreen"),
    shop: $("shopScreen"),
    gift: $("giftScreen"),
    lobby: $("lobbyScreen"),
    role: $("roleScreen"),
    game: $("gameScreen"),
    gameOver: $("gameOverScreen")
};

const playerNameInput = $("playerName");
const roomCodeInput = $("roomCodeInput");
const errorMessage = $("errorMessage");

const PLAYER_TOKEN_KEY = "saye-darbar-player-token";
const SAVED_ROOM_KEY = "saye-darbar-room";

let playerToken =
    localStorage.getItem(PLAYER_TOKEN_KEY) || "";

let savedRoom =
    localStorage.getItem(SAVED_ROOM_KEY) || "";

let currentState = null;
let pendingState = null;
let nominationTimerInterval = null;

/* =========================================================
   آواتارها
========================================================= */

const avatarCatalog = [
    {
        id: "default",
        icon: "🧑🏻‍⚖️",
        name: "درباری",
        price: 0
    },
    {
        id: "shah",
        icon: "👑",
        name: "شاه قاجار",
        price: 300
    },
    {
        id: "vizier",
        icon: "🧿",
        name: "وزیر اعظم",
        price: 200
    },
    {
        id: "court",
        icon: "🎩",
        name: "اشراف‌زاده",
        price: 150
    },
    {
        id: "warrior",
        icon: "⚔️",
        name: "محافظ سلطنت",
        price: 250
    },
    {
        id: "ink",
        icon: "🖋️",
        name: "منشی دربار",
        price: 100
    }
];

/* =========================================================
   نمایش صفحه
========================================================= */

function showScreen(screen) {
    if (!screen) return;

    Object.values(screens).forEach((s) => {
        if (s) {
            s.classList.add("hidden");
        }
    });

    screen.classList.remove("hidden");
}

/* =========================================================
   صدا
========================================================= */

function playClickSound() {
    try {
        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) return;

        const context = new AudioContext();

        const oscillator =
            context.createOscillator();

        const gain =
            context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = 520;

        gain.gain.setValueAtTime(
            0.025,
            context.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            context.currentTime + 0.08
        );

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start();

        oscillator.stop(
            context.currentTime + 0.08
        );
    } catch (_) {}
}

/* =========================================================
   راوی
========================================================= */

function speak(text) {
    if (!("speechSynthesis" in window)) {
        return;
    }

    if (!text) return;

    window.speechSynthesis.cancel();

    const utterance =
        new SpeechSynthesisUtterance(text);

    utterance.lang = "fa-IR";
    utterance.rate = 0.88;
    utterance.pitch = 0.72;
    utterance.volume = 1;

    const voices =
        window.speechSynthesis.getVoices();

    const preferred =
        voices.find(
            (voice) =>
                /fa|persian/i.test(
                    voice.lang || voice.name || ""
                ) &&
                /male|man|مرد/i.test(
                    voice.name || ""
                )
        ) ||
        voices.find(
            (voice) =>
                /fa/i.test(
                    voice.lang || ""
                )
        );

    if (preferred) {
        utterance.voice = preferred;
    }

    window.speechSynthesis.speak(
        utterance
    );
}

/* =========================================================
   خطاها
========================================================= */

function showError(message) {
    if (!errorMessage) return;

    errorMessage.textContent =
        message || "";
}

/* =========================================================
   ذخیره اتاق
========================================================= */

function saveSession(roomCode) {
    if (!roomCode) return;

    savedRoom = roomCode;

    localStorage.setItem(
        SAVED_ROOM_KEY,
        roomCode
    );
}

/* =========================================================
   هویت بازیکن
========================================================= */

function emitIdentity() {
    return {
        playerToken
    };
}

/* =========================================================
   بازیکنان
========================================================= */

function getAvatarIcon(avatarId) {
    const avatar =
        avatarCatalog.find(
            (a) => a.id === avatarId
        );

    return avatar?.icon || "👤";
}

function renderPlayers(
    players,
    container = $("playersList")
) {
    if (!container) return;

    container.innerHTML = "";

    (players || []).forEach((player) => {
        const item =
            document.createElement("div");

        item.className = "player";

        if (player.connected === false) {
            item.classList.add("offline");
        }

        const name =
            document.createElement("span");

        name.className = "playerName";

        name.textContent =
            `${getAvatarIcon(player.avatar)} ${player.name}`;

        item.appendChild(name);

        if (player.host) {
            const host =
                document.createElement("span");

            host.className = "host";

            host.textContent =
                "👑 سازنده";

            item.appendChild(host);
        }

        if (player.connected === false) {
            const offline =
                document.createElement("span");

            offline.className =
                "smallText";

            offline.textContent =
                "اتصال قطع";

            item.appendChild(offline);
        }

        container.appendChild(item);
    });
}

/* =========================================================
   چت
========================================================= */

function renderChatMessage(
    message,
    box = $("chatMessages")
) {
    if (!box || !message) return;

    const item =
        document.createElement("div");

    item.className =
        "chatMessage";

    if (message.type === "system") {
        item.classList.add("system");

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

        text.textContent =
            ` ${message.text}`;

        item.appendChild(name);
        item.appendChild(text);
    }

    box.appendChild(item);

    box.scrollTop =
        box.scrollHeight;
}

function renderChat(
    messages,
    box = $("chatMessages")
) {
    if (!box) return;

    box.innerHTML = "";

    (messages || []).forEach(
        (message) =>
            renderChatMessage(
                message,
                box
            )
    );
}

/* =========================================================
   نوار سیاست‌ها
========================================================= */

function renderTrack(
    container,
    count,
    total,
    color
) {
    if (!container) return;

    container.innerHTML = "";

    const safeCount =
        Math.max(
            0,
            Math.min(
                Number(count) || 0,
                total
            )
        );

    for (
        let i = 0;
        i < total;
        i++
    ) {
        const slot =
            document.createElement("div");

        slot.className =
            "trackSlot";

        if (i < safeCount) {
            slot.classList.add(
                "active",
                color
            );
        }

        container.appendChild(slot);
    }
}

/* =========================================================
   نقش
========================================================= */

function renderRole(
    role,
    allies
) {
    const card =
        $("roleCard");

    const alliesBox =
        $("alliesBox");

    if (!card || !alliesBox) {
        return;
    }

    card.className =
        "roleCard";

    card.innerHTML = "";

    const roleNames = {
        constitutionalist:
            "🟦 مشروطه‌خواه",

        qajar:
            "🟥 قاجاری",

        naser:
            "👑 ناصرالدین شاه"
    };

    card.classList.add(
        role || "unknown"
    );

    card.textContent =
        roleNames[role] ||
        "نقش ناشناس";

    alliesBox.innerHTML = "";

    if (role === "constitutionalist") {
        alliesBox.textContent =
            "شما در جبهه مشروطه‌خواهان هستید.";
        return;
    }

    const title =
        document.createElement("strong");

    title.textContent =
        "هم‌پیمانان شما:";

    alliesBox.appendChild(title);

    const list =
        Array.isArray(allies)
            ? allies
            : [];

    if (list.length === 0) {
        const item =
            document.createElement("div");

        item.className =
            "ally";

        item.textContent =
            "هم‌پیمان دیگری شناسایی نشد.";

        alliesBox.appendChild(item);

        return;
    }

    list.forEach((ally) => {
        const item =
            document.createElement("div");

        item.className =
            "ally";

        item.textContent =
            `👤 ${ally.name} — ${ally.role}`;

        alliesBox.appendChild(item);
    });
}

/* =========================================================
   مخفی کردن اکشن‌ها
========================================================= */

function setActionBoxesHidden() {
    const ids = [
        "nominationBox",
        "voteBox",
        "presidentPolicyBox",
        "ministerPolicyBox"
    ];

    ids.forEach((id) => {
        const element = $(id);

        if (element) {
            element.classList.add("hidden");
        }
    });

    if ($("publicResult")) {
        $("publicResult").textContent = "";
    }

    if ($("gameMessage")) {
        $("gameMessage").textContent = "";
    }
}

/* =========================================================
   انتخاب وزیر
========================================================= */

function renderNominees(players) {
    const select =
        $("nomineeSelect");

    if (!select) return;

    select.innerHTML = "";

    const currentPresident =
        currentState?.president?.id;

    (players || [])
        .filter(
            (player) =>
                player.id !== currentPresident
        )
        .forEach((player) => {
            const option =
                document.createElement("option");

            option.value =
                player.id;

            option.textContent =
                player.name;

            select.appendChild(option);
        });
}

/* =========================================================
   کارت سیاست
========================================================= */

function cardLabel(card) {
    if (card === "constitutional") {
        return {
            icon: "🏛️",
            title: "سیاست مشروطه",
            className: "blue"
        };
    }

    return {
        icon: "👑",
        title: "سیاست قاجاری",
        className: "red"
    };
}

function makeCard(
    card,
    index,
    handler
) {
    const info =
        cardLabel(card);

    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        `policyCard ${info.className}`;

    button.innerHTML = `
        <span>
            <span class="seal">
                ${info.icon}
            </span>
            ${info.title}
        </span>
    `;

    button.addEventListener(
        "click",
        () => {
            playClickSound();
            handler(index);
        }
    );

    return button;
}

/* =========================================================
   کارت‌های صدر
   ۳ کارت → انتخاب یک کارت برای حذف
========================================================= */

function renderPresidentCards(cards) {
    const box =
        $("presidentCards");

    if (!box) return;

    box.innerHTML = "";

    const safeCards =
        Array.isArray(cards)
            ? cards
            : [];

    if (safeCards.length !== 3) {
        const error =
            document.createElement("div");

        error.className =
            "message";

        error.textContent =
            "خطا: صدر باید ۳ کارت دریافت کند.";

        box.appendChild(error);

        return;
    }

    safeCards.forEach(
        (card, index) => {
            box.appendChild(
                makeCard(
                    card,
                    index,
                    (selectedIndex) => {
                        socket.emit(
                            "presidentDiscard",
                            {
                                index:
                                    selectedIndex
                            }
                        );

                        Array.from(
                            box.children
                        ).forEach(
                            (element) => {
                                element.disabled =
                                    true;
                            }
                        );

                        if ($("discardHint")) {
                            $("discardHint").textContent =
                                "کارت انتخاب شد؛ دو کارت باقی‌مانده به وزیر می‌رود...";
                        }
                    }
                )
            );
        }
    );
}

/* =========================================================
   کارت‌های وزیر
   ۲ کارت → انتخاب یک کارت
========================================================= */

function renderMinisterCards(cards) {
    const box =
        $("ministerCards");

    if (!box) return;

    box.innerHTML = "";

    const safeCards =
        Array.isArray(cards)
            ? cards
            : [];

    if (safeCards.length !== 2) {
        const error =
            document.createElement("div");

        error.className =
            "message";

        error.textContent =
            "خطا: وزیر باید ۲ کارت دریافت کند.";

        box.appendChild(error);

        return;
    }

    safeCards.forEach(
        (card, index) => {
            box.appendChild(
                makeCard(
                    card,
                    index,
                    (selectedIndex) => {
                        Array.from(
                            box.children
                        ).forEach(
                            (element) => {
                                element.disabled =
                                    true;
                            }
                        );

                        socket.emit(
                            "ministerEnact",
                            {
                                index:
                                    selectedIndex
                            }
                        );
                    }
                )
            );
        }
    );
}

/* =========================================================
   تایمر صدر
========================================================= */

function updateNominationTimer(
    endAt
) {
    clearInterval(
        nominationTimerInterval
    );

    const timer =
        $("nominationTimer");

    if (!timer) return;

    if (!endAt) {
        timer.textContent =
            "⏱️ --";

        return;
    }

    const tick = () => {
        const left =
            Math.max(
                0,
                Math.ceil(
                    (endAt -
                        Date.now()) /
                        1000
                )
            );

        timer.textContent =
            `⏱️ ${left}`;

        if (left <= 0) {
            clearInterval(
                nominationTimerInterval
            );
        }
    };

    tick();

    nominationTimerInterval =
        setInterval(
            tick,
            250
        );
}

/* =========================================================
   پایان بازی
========================================================= */

function showGameOver(winner) {
    if (!winner) return;

    const icon =
        $("gameOverIcon");

    const title =
        $("gameOverTitle");

    const reason =
        $("gameOverReason");

    if (icon) {
        icon.textContent =
            winner.faction === "qajar"
                ? "👑"
                : "🏛️";
    }

    if (title) {
        title.textContent =
            winner.faction === "qajar"
                ? "قاجاریان پیروز شدند"
                : "مشروطه‌خواهان پیروز شدند";
    }

    if (reason) {
        reason.textContent =
            winner.reason || "";
    }

    showScreen(
        screens.gameOver
    );
}

/* =========================================================
   نمایش وضعیت بازی
========================================================= */

function renderGameState(state) {
    if (!state) return;

    currentState = state;
    pendingState = state;

    showScreen(
        screens.game
    );

    if ($("phaseTitle")) {
        $("phaseTitle").textContent =
            state.phaseText || "---";
    }

    if ($("policyDeckCount")) {
        $("policyDeckCount").textContent =
            `کارت‌های باقی‌مانده: ${state.policyDeckCount ?? "--"}`;
    }

    if ($("constitutionalCount")) {
        $("constitutionalCount").textContent =
            `${state.constitutionalPolicies || 0} / 5`;
    }

    if ($("qajarCount")) {
        $("qajarCount").textContent =
            `${state.qajarPolicies || 0} / 6`;
    }

    renderTrack(
        $("constitutionalTrack"),
        state.constitutionalPolicies,
        5,
        "blue"
    );

    renderTrack(
        $("qajarTrack"),
        state.qajarPolicies,
        6,
        "red"
    );

    renderPlayers(
        state.players,
        $("gamePlayers")
    );

    if ($("presidentBox")) {
        $("presidentBox").innerHTML = `
            <strong>👑 صدر فعلی</strong>
            <br>
            ${state.president?.name || "نامشخص"}
        `;
    }

    if ($("nomineeBox")) {
        $("nomineeBox").innerHTML = `
            <strong>📜 وزیر معرفی‌شده</strong>
            <br>
            ${state.nominee?.name || "هنوز انتخاب نشده"}
        `;
    }

    setActionBoxesHidden();

    updateNominationTimer(
        state.phase === "nomination"
            ? state.nominationEndsAt
            : null
    );

    /* نتیجه رأی‌گیری */

    if (
        state.lastResult &&
        $("publicResult")
    ) {
        $("publicResult").textContent =
            state.lastResult.approved
                ? `✅ دولت تأیید شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`
                : `❌ دولت رد شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`;
    }

    /* مرحله معرفی وزیر */

    if (state.phase === "nomination") {
        const nominationBox =
            $("nominationBox");

        if (
            state.youArePresident &&
            nominationBox
        ) {
            nominationBox.classList.remove(
                "hidden"
            );

            renderNominees(
                state.players
            );
        } else if ($("gameMessage")) {
            $("gameMessage").textContent =
                `⏳ منتظر انتخاب وزیر توسط ${
                    state.president?.name ||
                    "صدر"
                } هستیم...`;
        }
    }

    /* مرحله رأی‌گیری */

    if (state.phase === "vote") {
        const voteBox =
            $("voteBox");

        if (voteBox) {
            voteBox.classList.remove(
                "hidden"
            );
        }

        if ($("voteDescription")) {
            $("voteDescription").textContent =
                `آیا با ریاست ${
                    state.president?.name ||
                    "صدر"
                } و وزارت ${
                    state.nominee?.name ||
                    "وزیر"
                } موافق هستید؟`;
        }

        const voted =
            Boolean(
                state.youVoted
            );

        if ($("yesVoteButton")) {
            $("yesVoteButton").disabled =
                voted;
        }

        if ($("noVoteButton")) {
            $("noVoteButton").disabled =
                voted;
        }

        if ($("voteStatus")) {
            $("voteStatus").textContent =
                voted
                    ? "✅ رأی شما ثبت شده؛ منتظر بقیه باشید."
                    : "رأی خود را انتخاب کنید.";
        }
    }

    /* مرحله صدر */

    if (
        state.phase ===
        "president_discard"
    ) {
        if (state.youArePresident) {
            if ($("gameMessage")) {
                $("gameMessage").textContent =
                    "⏳ سه کارت محرمانه برای شما ارسال شده است.";
            }
        } else if ($("gameMessage")) {
            $("gameMessage").textContent =
                "⏳ صدر در حال انتخاب یک کارت از سه کارت است...";
        }
    }

    /* مرحله وزیر */

    if (
        state.phase ===
        "minister_enact"
    ) {
        if (state.youAreNominee) {
            if ($("gameMessage")) {
                $("gameMessage").textContent =
                    "⏳ دو کارت به شما رسیده؛ یکی را برای تصویب انتخاب کنید.";
            }
        } else if ($("gameMessage")) {
            $("gameMessage").textContent =
                "⏳ وزیر در حال انتخاب یکی از دو کارت است...";
        }
    }

    /* پایان */

    if (
        state.phase === "finished" &&
        state.winner
    ) {
        showGameOver(
            state.winner
        );
    }
}

/* =========================================================
   پروفایل / سکه / آواتار
========================================================= */

function renderProfile(profile) {
    if (!profile) return;

    if ($("coinCount")) {
        $("coinCount").textContent =
            profile.coins ?? 0;
    }

    if ($("shopCoins")) {
        $("shopCoins").textContent =
            profile.coins ?? 0;
    }

    renderShop(profile);
}

function renderShop(profile) {
    const grid =
        $("avatarGrid");

    if (!grid) return;

    grid.innerHTML = "";

    const ownedAvatars =
        Array.isArray(profile.avatars)
            ? profile.avatars
            : ["default"];

    avatarCatalog.forEach(
        (avatar) => {
            const owned =
                ownedAvatars.includes(
                    avatar.id
                );

            const item =
                document.createElement("div");

            item.className =
                "avatarItem";

            item.innerHTML = `
                <div class="avatarIcon">
                    ${avatar.icon}
                </div>

                <strong>
                    ${avatar.name}
                </strong>

                <div class="avatarPrice">
                    ${
                        avatar.price
                            ? `🪙 ${avatar.price}`
                            : "رایگان"
                    }
                </div>
            `;

            const button =
                document.createElement("button");

            button.type =
                "button";

            if (owned) {
                button.textContent =
                    avatar.id === "default"
                        ? "انتخاب‌شده"
                        : "انتخاب";
            } else {
                button.textContent =
                    "خرید";
            }

            button.disabled =
                owned &&
                avatar.id === "default";

            button.addEventListener(
                "click",
                () => {
                    if (owned) {
                        socket.emit(
                            "selectAvatar",
                            {
                                avatar:
                                    avatar.id
                            }
                        );
                    } else {
                        socket.emit(
                            "buyAvatar",
                            {
                                avatar:
                                    avatar.id,
                                price:
                                    avatar.price
                            }
                        );
                    }
                }
            );

            item.appendChild(
                button
            );

            grid.appendChild(
                item
            );
        }
    );
}

/* =========================================================
   چت
========================================================= */

function sendLobbyChat() {
    const input =
        $("chatInput");

    if (!input) return;

    const text =
        input.value.trim();

    if (!text) return;

    socket.emit(
        "lobbyChat",
        { text }
    );

    input.value = "";
}

function sendGameChat() {
    const input =
        $("gameChatInput");

    if (!input) return;

    const text =
        input.value.trim();

    if (!text) return;

    socket.emit(
        "gameChat",
        { text }
    );

    input.value = "";
}

/* =========================================================
   اتصال رویدادهای HTML
========================================================= */

if ($("createRoomButton")) {
    $("createRoomButton")
        .addEventListener(
            "click",
            () => {
                playClickSound();

                const name =
                    playerNameInput?.value
                        .trim();

                showError("");

                if (!name) {
                    showError(
                        "اول نامت را وارد کن."
                    );
                    return;
                }

                socket.emit(
                    "createRoom",
                    {
                        name,
                        ...emitIdentity()
                    }
                );
            }
        );
}

if ($("joinRoomButton")) {
    $("joinRoomButton")
        .addEventListener(
            "click",
            () => {
                playClickSound();

                const name =
                    playerNameInput?.value
                        .trim();

                const code =
                    roomCodeInput?.value
                        .trim();

                showError("");

                if (!name) {
                    showError(
                        "اول نامت را وارد کن."
                    );
                    return;
                }

                if (!/^\d{4}$/.test(code)) {
                    showError(
                        "کد اتاق باید ۴ رقمی باشد."
                    );
                    return;
                }

                socket.emit(
                    "joinRoom",
                    {
                        name,
                        roomCode: code,
                        ...emitIdentity()
                    }
                );
            }
        );
}

if ($("startGameButton")) {
    $("startGameButton")
        .addEventListener(
            "click",
            () => {
                playClickSound();
                socket.emit(
                    "startGame"
                );
            }
        );
}

if ($("sendChatButton")) {
    $("sendChatButton")
        .addEventListener(
            "click",
            sendLobbyChat
        );
}

if ($("chatInput")) {
    $("chatInput")
        .addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Enter") {
                    sendLobbyChat();
                }
            }
        );
}

if ($("gameChatSendButton")) {
    $("gameChatSendButton")
        .addEventListener(
            "click",
            sendGameChat
        );
}

if ($("gameChatInput")) {
    $("gameChatInput")
        .addEventListener(
            "keydown",
            (event) => {
                if (event.key === "Enter") {
                    sendGameChat();
                }
            }
        );
}

/* =========================================================
   ورود از نقش به بازی
========================================================= */

if ($("continueGameButton")) {
    $("continueGameButton")
        .addEventListener(
            "click",
            () => {
                playClickSound();

                if (pendingState) {
                    renderGameState(
                        pendingState
                    );
                } else {
                    showScreen(
                        screens.game
                    );
                }
            }
        );
}

/* =========================================================
   معرفی وزیر
========================================================= */

if ($("nominateButton")) {
    $("nominateButton")
        .addEventListener(
            "click",
            () => {
                playClickSound();

                const select =
                    $("nomineeSelect");

                const playerId =
                    select?.value;

                if (!playerId) {
                    return;
                }

                socket.emit(
                    "nominateChancellor",
                    {
                        playerId
                    }
                );
            }
        );
}

/* =========================================================
   رأی‌گیری
========================================================= */

if ($("yesVoteButton")) {
    $("yesVoteButton")
        .addEventListener(
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
}

if ($("noVoteButton")) {
    $("noVoteButton")
        .addEventListener(
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
}

/* =========================================================
   شروع دوباره
========================================================= */

if ($("reloadButton")) {
    $("reloadButton")
        .addEventListener(
            "click",
            () => {
                window.location.reload();
            }
        );
}

/* =========================================================
   آموزش
========================================================= */

if ($("tutorialButton")) {
    $("tutorialButton")
        .addEventListener(
            "click",
            () => {
                showScreen(
                    screens.tutorial
                );
            }
        );
}

if ($("backFromTutorialButton")) {
    $("backFromTutorialButton")
        .addEventListener(
            "click",
            () => {
                showScreen(
                    screens.home
                );
            }
        );
}

/* =========================================================
   فروشگاه
========================================================= */

if ($("openShopButton")) {
    $("openShopButton")
        .addEventListener(
            "click",
            () => {
                showScreen(
                    screens.shop
                );

                socket.emit(
                    "getProfile"
                );
            }
        );
}

if ($("closeShopButton")) {
    $("closeShopButton")
        .addEventListener(
            "click",
            () => {
                showScreen(
                    screens.home
                );
            }
        );
}

/* =========================================================
   گیفت کد
========================================================= */

if ($("openGiftButton")) {
    $("openGiftButton")
        .addEventListener(
            "click",
            () => {
                showScreen(
                    screens.gift
                );
            }
        );
}

if ($("closeGiftButton")) {
    $("closeGiftButton")
        .addEventListener(
            "click",
            () => {
                showScreen(
                    screens.home
                );
            }
        );
}

if ($("redeemGiftButton")) {
    $("redeemGiftButton")
        .addEventListener(
            "click",
            () => {
                const input =
                    $("giftCodeInput");

                const code =
                    input?.value
                        .trim();

                if (!code) {
                    if ($("giftMessage")) {
                        $("giftMessage").textContent =
                            "کد هدیه را وارد کن.";
                    }
                    return;
                }

                socket.emit(
                    "redeemGiftCode",
                    { code }
                );
            }
        );
}

/* =========================================================
   موسیقی
========================================================= */

if ($("musicButton")) {
    $("musicButton")
        .addEventListener(
            "click",
            async () => {
                const audio =
                    $("menuMusic");

                if (!audio) return;

                try {
                    if (audio.paused) {
                        await audio.play();

                        $("musicButton")
                            .textContent =
                            "🔊 موسیقی: روشن";
                    } else {
                        audio.pause();

                        $("musicButton")
                            .textContent =
                            "🎵 موسیقی: خاموش";
                    }
                } catch (_) {
                    if ($("musicHint")) {
                        $("musicHint").textContent =
                            "فایل موسیقی پیدا نشد یا مرورگر اجازه پخش نداد.";
                    }
                }
            }
        );
}

/* =========================================================
   Socket Events
========================================================= */

/* ساخت اتاق */

socket.on(
    "roomCreated",
    (data) => {
        const roomCode =
            data?.roomCode;

        const token =
            data?.playerToken;

        if (token) {
            playerToken =
                token;

            localStorage.setItem(
                PLAYER_TOKEN_KEY,
                token
            );
        }

        if (roomCode) {
            saveSession(
                roomCode
            );

            if ($("roomCode")) {
                $("roomCode").textContent =
                    roomCode;
            }

            showScreen(
                screens.lobby
            );
        }
    }
);

/* توکن */

socket.on(
    "playerToken",
    (data) => {
        const token =
            data?.playerToken;

        if (!token) return;

        playerToken =
            token;

        localStorage.setItem(
            PLAYER_TOKEN_KEY,
            token
        );
    }
);

/* وضعیت لابی */

socket.on(
    "roomState",
    ({
        roomCode,
        players,
        started,
        messages
    }) => {
        if ($("roomCode")) {
            $("roomCode").textContent =
                roomCode;
        }

        if ($("playerCount")) {
            $("playerCount").textContent =
                `${players.length} / 10`;
        }

        renderPlayers(
            players
        );

        renderChat(
            messages || []
        );

        saveSession(
            roomCode
        );

        if (!started) {
            showScreen(
                screens.lobby
            );
        }
    }
);

/* چت لابی */

socket.on(
    "chatMessage",
    (message) => {
        renderChatMessage(
            message
        );
    }
);

/* شروع بازی */

socket.on(
    "gameStarted",
    () => {
        if ($("lobbyMessage")) {
            $("lobbyMessage").textContent =
                "🎴 بازی شروع شد...";
        }
    }
);

/* نقش */

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

/* وضعیت بازی */

socket.on(
    "gameState",
    (state) => {
        pendingState =
            state;

        /*
            اگر صفحه نقش باز است،
            صبر می‌کنیم بازیکن روی
            «ورود به بازی» بزند.
        */
        if (
            screens.role &&
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

/* =========================================================
   سه کارت صدر
========================================================= */

socket.on(
    "policyDrawn",
    ({
        cards
    }) => {
        showScreen(
            screens.game
        );

        if ($("presidentPolicyBox")) {
            $("presidentPolicyBox")
                .classList.remove(
                    "hidden"
                );
        }

        if ($("voteBox")) {
            $("voteBox")
                .classList.add(
                    "hidden"
                );
        }

        if ($("nominationBox")) {
            $("nominationBox")
                .classList.add(
                    "hidden"
                );
        }

        if ($("ministerPolicyBox")) {
            $("ministerPolicyBox")
                .classList.add(
                    "hidden"
                );
        }

        renderPresidentCards(
            cards
        );

        if ($("phaseTitle")) {
            $("phaseTitle").textContent =
                "📜 انتخاب یک کارت از سه کارت";
        }

        if ($("discardHint")) {
            $("discardHint").textContent =
                "یکی را کنار بگذار تا دو کارت به وزیر برود.";
        }
    }
);

/* =========================================================
   دو کارت وزیر
========================================================= */

socket.on(
    "ministerPolicy",
    (data) => {
        showScreen(
            screens.game
        );

        if ($("ministerPolicyBox")) {
            $("ministerPolicyBox")
                .classList.remove(
                    "hidden"
                );
        }

        if ($("presidentPolicyBox")) {
            $("presidentPolicyBox")
                .classList.add(
                    "hidden"
                );
        }

        if ($("nominationBox")) {
            $("nominationBox")
                .classList.add(
                    "hidden"
                );
        }

        if ($("voteBox")) {
            $("voteBox")
                .classList.add(
                    "hidden"
                );
        }

        /*
            نسخه اصلی سرور باید cards
            ارسال کند.
        */

        const cards =
            Array.isArray(data?.cards)
                ? data.cards
                : [];

        renderMinisterCards(
            cards
        );

        if ($("phaseTitle")) {
            $("phaseTitle").textContent =
                "📜 انتخاب سیاست وزیر";
        }
    }
);

/* چت بازی */

socket.on(
    "gameChatMessage",
    (message) => {
        renderChatMessage(
            message,
            $("gameChatMessages")
        );
    }
);

/* پایان بازی */

socket.on(
    "gameOver",
    (winner) => {
        showGameOver(
            winner
        );
    }
);

/* راوی */

socket.on(
    "narrator",
    ({
        text
    }) => {
        speak(
            text
        );
    }
);

/* پروفایل */

socket.on(
    "profileState",
    (profile) => {
        renderProfile(
            profile
        );
    }
);

/* گیفت */

socket.on(
    "giftResult",
    (result) => {
        if ($("giftMessage")) {
            $("giftMessage").textContent =
                result?.message || "";
        }

        if (
            result?.ok &&
            $("giftCodeInput")
        ) {
            $("giftCodeInput").value =
                "";
        }
    }
);

/* آواتار */

socket.on(
    "avatarResult",
    (result) => {
        if ($("giftMessage")) {
            $("giftMessage").textContent =
                result?.message || "";
        }

        if (result?.ok) {
            socket.emit(
                "getProfile"
            );
        }
    }
);

/* خطای سرور */

socket.on(
    "errorMessage",
    (message) => {
        showError(
            message
        );

        if ($("lobbyMessage")) {
            $("lobbyMessage").textContent =
                message;
        }

        if ($("giftMessage")) {
            $("giftMessage").textContent =
                message;
        }

        if ($("gameMessage")) {
            $("gameMessage").textContent =
                message;
        }
    }
);

/* اتصال دوباره */

socket.on(
    "reconnected",
    ({
        roomCode,
        started
    }) => {
        if (roomCode) {
            saveSession(
                roomCode
            );
        }

        if ($("lobbyMessage")) {
            $("lobbyMessage").textContent =
                started
                    ? "🔌 اتصال دوباره برقرار شد؛ جایگاه شما حفظ شد."
                    : "🔌 اتصال دوباره برقرار شد.";
        }
    }
);

/* =========================================================
   اتصال Socket
========================================================= */

socket.on(
    "connect",
    () => {
        console.log(
            "Socket connected:",
            socket.id
        );

        /*
            سرور فعلی ممکن است reconnectPlayer
            نداشته باشد؛ بنابراین فقط اگر
            چنین سیستمی در سرور وجود داشته باشد
            این درخواست را می‌فرستیم.
        */

        if (
            playerToken &&
            savedRoom
        ) {
            socket.emit(
                "reconnectPlayer",
                {
                    roomCode:
                        savedRoom,
                    playerToken
                }
            );
        }

        /*
            دریافت پروفایل در صورت وجود
            سیستم اکانت.
        */

        socket.emit(
            "getProfile"
        );
    }
);

socket.on(
    "disconnect",
    (reason) => {
        console.log(
            "Socket disconnected:",
            reason
        );
    }
);

socket.on(
    "connect_error",
    (error) => {
        console.error(
            "Socket connection error:",
            error
        );
    }
);

/* =========================================================
   آماده‌سازی Speech API
========================================================= */

if (
    window.speechSynthesis &&
    typeof window.speechSynthesis.getVoices ===
        "function"
) {
    window.speechSynthesis.getVoices();
}

/* =========================================================
   پایان game.js
========================================================= */
