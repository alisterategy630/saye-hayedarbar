const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

const $ = (id) =>
    document.getElementById(id);

const screens = {
    home: $("homeScreen"),
    tutorial: $("tutorialScreen"),
    lobby: $("lobbyScreen"),
    role: $("roleScreen"),
    game: $("gameScreen"),
    gameOver: $("gameOverScreen")
};

const playerNameInput =
    $("playerName");

const roomCodeInput =
    $("roomCodeInput");

const errorMessage =
    $("errorMessage");

const playerTokenKey =
    "saye-darbar-player-token";

const savedRoomKey =
    "saye-darbar-room";

let playerToken =
    localStorage.getItem(
        playerTokenKey
    ) || "";

let savedRoom =
    localStorage.getItem(
        savedRoomKey
    ) || "";

let currentState = null;

let pendingState = null;

/*
    نمایش صفحه
*/
function showScreen(screen) {

    Object.values(screens)
        .forEach((screenItem) => {
            if (screenItem) {
                screenItem.classList.add(
                    "hidden"
                );
            }
        });

    if (screen) {
        screen.classList.remove(
            "hidden"
        );
    }
}

/*
    صدای کلیک
*/
function playClickSound() {

    try {

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) {
            return;
        }

        const ctx =
            new AudioContext();

        const oscillator =
            ctx.createOscillator();

        const gain =
            ctx.createGain();

        oscillator.frequency.value =
            520;

        oscillator.type =
            "sine";

        gain.gain.setValueAtTime(
            0.03,
            ctx.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            ctx.currentTime + 0.08
        );

        oscillator.connect(gain);

        gain.connect(
            ctx.destination
        );

        oscillator.start();

        oscillator.stop(
            ctx.currentTime + 0.08
        );

    } catch (_) {}
}

/*
    خطا
*/
function showError(text) {

    if (errorMessage) {
        errorMessage.textContent =
            text || "";
    }
}

/*
    ذخیره اتاق
*/
function saveSession(code) {

    if (!code) {
        return;
    }

    savedRoom = code;

    localStorage.setItem(
        savedRoomKey,
        code
    );
}

/*
    بازیکنان
*/
function renderPlayers(
    players,
    container = $("playersList")
) {

    if (!container) {
        return;
    }

    container.innerHTML = "";

    (players || []).forEach(
        (player) => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "player";

            if (
                player.connected === false
            ) {
                item.classList.add(
                    "offline"
                );
            }

            const name =
                document.createElement(
                    "span"
                );

            name.className =
                "playerName";

            name.textContent =
                `👤 ${player.name}`;

            item.appendChild(name);

            if (player.host) {

                const host =
                    document.createElement(
                        "span"
                    );

                host.className =
                    "host";

                host.textContent =
                    "👑 سازنده";

                item.appendChild(host);
            }

            if (
                player.connected === false
            ) {

                const offline =
                    document.createElement(
                        "span"
                    );

                offline.className =
                    "smallText";

                offline.textContent =
                    "اتصال قطع";

                item.appendChild(
                    offline
                );
            }

            container.appendChild(
                item
            );
        }
    );
}

/*
    چت
*/
function renderChatMessage(
    message,
    box = $("chatMessages")
) {

    if (!box) {
        return;
    }

    const item =
        document.createElement(
            "div"
        );

    item.className =
        "chatMessage";

    if (
        message.type === "system"
    ) {

        item.classList.add(
            "system"
        );

        item.textContent =
            `• ${message.text}`;

    } else {

        const name =
            document.createElement(
                "span"
            );

        name.className =
            "chatName";

        name.textContent =
            `${message.name}:`;

        const text =
            document.createElement(
                "span"
            );

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

    if (!box) {
        return;
    }

    box.innerHTML = "";

    (messages || []).forEach(
        (message) =>
            renderChatMessage(
                message,
                box
            )
    );
}

/*
    نوار سیاست‌ها
*/
function renderTrack(
    container,
    count,
    total,
    color
) {

    if (!container) {
        return;
    }

    container.innerHTML = "";

    for (
        let i = 0;
        i < total;
        i++
    ) {

        const slot =
            document.createElement(
                "div"
            );

        slot.className =
            "trackSlot";

        if (i < count) {

            slot.classList.add(
                "active",
                color
            );
        }

        container.appendChild(
            slot
        );
    }
}

/*
    نقش
*/
function renderRole(
    role,
    allies
) {

    const card =
        $("roleCard");

    const box =
        $("alliesBox");

    if (!card || !box) {
        return;
    }

    card.className =
        "roleCard";

    box.innerHTML = "";

    if (
        role ===
        "constitutionalist"
    ) {

        card.classList.add(
            "constitutionalist"
        );

        card.textContent =
            "🟦 مشروطه‌خواه";

        box.textContent =
            "شما در جبهه مشروطه‌خواهان هستید.";

    } else if (
        role === "qajar"
    ) {

        card.classList.add(
            "qajar"
        );

        card.textContent =
            "🟥 قاجاری";

        box.innerHTML =
            "<strong>هم‌پیمانان شما:</strong>";

        renderAllies(
            allies
        );

    } else if (
        role === "naser"
    ) {

        card.classList.add(
            "naser"
        );

        card.textContent =
            "👑 ناصرالدین شاه";

        box.innerHTML =
            "<strong>هم‌پیمانان قاجاری شما:</strong>";

        renderAllies(
            allies
        );
    }
}

function renderAllies(
    allies
) {

    const box =
        $("alliesBox");

    if (!box) {
        return;
    }

    if (
        !allies ||
        !allies.length
    ) {

        const div =
            document.createElement(
                "div"
            );

        div.className =
            "ally";

        div.textContent =
            "هم‌پیمان دیگری شناسایی نشد.";

        box.appendChild(div);

        return;
    }

    allies.forEach(
        (ally) => {

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "ally";

            div.textContent =
                `👤 ${ally.name} — ${ally.role}`;

            box.appendChild(
                div
            );
        }
    );
}

/*
    مخفی کردن اکشن‌ها
*/
function setActionBoxesHidden() {

    $("nominationBox")
        ?.classList.add("hidden");

    $("voteBox")
        ?.classList.add("hidden");

    $("presidentPolicyBox")
        ?.classList.add("hidden");

    $("ministerPolicyBox")
        ?.classList.add("hidden");

    if ($("publicResult")) {
        $("publicResult")
            .textContent = "";
    }

    if ($("gameMessage")) {
        $("gameMessage")
            .textContent = "";
    }

    if ($("discardHint")) {
        $("discardHint")
            .textContent = "";
    }
}

/*
    لیست وزیرها
*/
function renderNominees(
    players
) {

    const select =
        $("nomineeSelect");

    if (!select) {
        return;
    }

    select.innerHTML = "";

    (players || []).forEach(
        (player) => {

            if (
                player.id ===
                socket.id
            ) {
                return;
            }

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                player.id;

            option.textContent =
                player.name;

            select.appendChild(
                option
            );
        }
    );
}

/*
    اطلاعات کارت
*/
function getCardInfo(
    card
) {

    if (
        card ===
        "constitutional"
    ) {

        return {
            icon: "🏛️",
            title:
                "سیاست مشروطه",
            className: "blue"
        };
    }

    return {
        icon: "👑",
        title:
            "سیاست قاجاری",
        className: "red"
    };
}

/*
    ساخت کارت
*/
function createPolicyCard(
    card,
    index,
    onClick
) {

    const info =
        getCardInfo(card);

    const button =
        document.createElement(
            "button"
        );

    button.type =
        "button";

    button.className =
        `policyCard ${info.className}`;

    button.innerHTML = `
        <span class="policyCardIcon">
            ${info.icon}
        </span>
        <strong>
            ${info.title}
        </strong>
    `;

    button.addEventListener(
        "click",
        () => {

            playClickSound();

            onClick(index);
        }
    );

    return button;
}

/*
    ==================================================
    کارت‌های صدر
    ==================================================

    اینجا دقیقاً 3 کارت نمایش داده می‌شود.
*/
function renderPresidentCards(
    cards
) {

    const box =
        $("presidentCards");

    if (!box) {
        console.error(
            "presidentCards پیدا نشد."
        );

        return;
    }

    box.innerHTML = "";

    if (
        !Array.isArray(cards) ||
        cards.length !== 3
    ) {

        console.error(
            "تعداد کارت‌های صدر باید 3 باشد:",
            cards
        );

        if ($("discardHint")) {

            $("discardHint")
                .textContent =
                "خطا: سه کارت سیاست دریافت نشد.";
        }

        return;
    }

    cards.forEach(
        (card, index) => {

            const element =
                createPolicyCard(
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

                        /*
                            بعد از انتخاب،
                            همه کارت‌ها غیرفعال می‌شوند.
                        */
                        Array.from(
                            box.children
                        ).forEach(
                            (child) => {
                                child.disabled =
                                    true;
                            }
                        );

                        if (
                            $("discardHint")
                        ) {

                            $("discardHint")
                                .textContent =
                                "کارت کنار گذاشته شد؛ دو کارت باقی‌مانده به وزیر رفت.";
                        }
                    }
                );

            box.appendChild(
                element
            );
        }
    );
}

/*
    ==================================================
    کارت‌های وزیر
    ==================================================

    وزیر دو کارت می‌بیند.
    یکی را انتخاب می‌کند.
    سپس دکمه تصویب را می‌زند.
*/
let selectedMinisterIndex =
    null;

function renderMinisterCards(
    cards
) {

    const container =
        $("ministerCard");

    if (!container) {
        console.error(
            "ministerCard پیدا نشد."
        );

        return;
    }

    container.innerHTML = "";

    selectedMinisterIndex =
        null;

    if (
        !Array.isArray(cards) ||
        cards.length !== 2
    ) {

        container.textContent =
            "خطا: دو کارت وزیر دریافت نشد.";

        return;
    }

    cards.forEach(
        (card, index) => {

            const element =
                createPolicyCard(
                    card,
                    index,
                    (selectedIndex) => {

                        selectedMinisterIndex =
                            selectedIndex;

                        Array.from(
                            container.children
                        ).forEach(
                            (child, childIndex) => {

                                child.classList.toggle(
                                    "selected",
                                    childIndex ===
                                        selectedIndex
                                );
                            }
                        );

                        const enactButton =
                            $("enactButton");

                        if (enactButton) {
                            enactButton.disabled =
                                false;
                        }

                        if ($("gameMessage")) {

                            $("gameMessage")
                                .textContent =
                                "کارت انتخاب شد؛ حالا روی «تصویب این سیاست» بزن.";
                        }
                    }
                );

            container.appendChild(
                element
            );
        }
    );

    const enactButton =
        $("enactButton");

    if (enactButton) {
        enactButton.disabled =
            true;
    }
}

/*
    تایمر/وضعیت بازی
*/
function renderGameState(
    state
) {

    if (!state) {
        return;
    }

    currentState =
        state;

    pendingState =
        state;

    showScreen(
        screens.game
    );

    $("phaseTitle").textContent =
        state.phaseText || "---";

    $("policyDeckCount").textContent =
        `کارت‌های باقی‌مانده: ${state.policyDeckCount ?? "--"}`;

    $("constitutionalCount").textContent =
        `${state.constitutionalPolicies} / 5`;

    $("qajarCount").textContent =
        `${state.qajarPolicies} / 6`;

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

    const presidentName =
        state.president?.name ||
        "نامشخص";

    const nomineeName =
        state.nominee?.name ||
        "هنوز انتخاب نشده";

    $("presidentBox").innerHTML = `
        <strong>👑 صدر فعلی</strong>
        <br>
        ${presidentName}
    `;

    $("nomineeBox").innerHTML = `
        <strong>📜 وزیر معرفی‌شده</strong>
        <br>
        ${nomineeName}
    `;

    setActionBoxesHidden();

    /*
        نتیجه رأی قبلی
    */
    if (state.lastResult) {

        $("publicResult").textContent =
            state.lastResult.approved
                ? `✅ دولت تأیید شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`
                : `❌ دولت رد شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`;
    }

    /*
        انتخاب وزیر
    */
    if (
        state.phase ===
        "nomination"
    ) {

        if (
            state.youArePresident
        ) {

            $("nominationBox")
                .classList.remove(
                    "hidden"
                );

            renderNominees(
                state.players
            );

        } else {

            $("gameMessage")
                .textContent =
                `⏳ منتظر انتخاب وزیر توسط ${presidentName} هستیم...`;
        }
    }

    /*
        رأی‌گیری
    */
    if (
        state.phase ===
        "vote"
    ) {

        $("voteBox")
            .classList.remove(
                "hidden"
            );

        $("voteDescription")
            .textContent =
            `آیا با ریاست ${presidentName} و وزارت ${nomineeName} موافق هستید؟`;

        const voted =
            Boolean(
                state.youVoted
            );

        $("yesVoteButton")
            .disabled =
            voted;

        $("noVoteButton")
            .disabled =
            voted;

        $("voteStatus")
            .textContent =
            voted
                ? "✅ رأی شما ثبت شده؛ منتظر بقیه باشید."
                : "رأی خود را انتخاب کنید.";
    }

    /*
        مرحله صدر
    */
    if (
        state.phase ===
        "president_discard"
    ) {

        if (
            state.youArePresident
        ) {

            $("presidentPolicyBox")
                .classList.remove(
                    "hidden"
                );

            $("discardHint")
                .textContent =
                "۳ کارت داری؛ یکی را کنار بگذار.";
        } else {

            $("gameMessage")
                .textContent =
                `⏳ صدر در حال انتخاب یک کارت از سه کارت است...`;
        }
    }

    /*
        مرحله وزیر
    */
    if (
        state.phase ===
        "minister_enact"
    ) {

        if (
            state.youAreNominee
        ) {

            $("ministerPolicyBox")
                .classList.remove(
                    "hidden"
                );

            $("gameMessage")
                .textContent =
                "دو کارت به شما رسیده؛ یکی را انتخاب و تصویب کنید.";

        } else {

            $("gameMessage")
                .textContent =
                `⏳ وزیر در حال انتخاب یکی از دو کارت است...`;
        }
    }

    /*
        پایان بازی
    */
    if (
        state.phase ===
        "finished" &&
        state.winner
    ) {

        showGameOver(
            state.winner
        );
    }
}

/*
    پایان بازی
*/
function showGameOver(
    winner
) {

    if (!winner) {
        return;
    }

    const isQajar =
        winner.faction ===
        "qajar";

    $("gameOverIcon").textContent =
        isQajar
            ? "👑"
            : "🏛️";

    $("gameOverTitle")
        .textContent =
        isQajar
            ? "قاجاریان پیروز شدند"
            : "مشروطه‌خواهان پیروز شدند";

    $("gameOverReason")
        .textContent =
        winner.reason || "";

    showScreen(
        screens.gameOver
    );
}

/*
    ساخت اتاق
*/
$("createRoomButton")
    .addEventListener(
        "click",
        () => {

            playClickSound();

            const name =
                playerNameInput.value
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
                    name
                }
            );
        }
    );

/*
    ورود به اتاق
*/
$("joinRoomButton")
    .addEventListener(
        "click",
        () => {

            playClickSound();

            const name =
                playerNameInput.value
                    .trim();

            const code =
                roomCodeInput.value
                    .trim();

            showError("");

            if (!name) {

                showError(
                    "اول نامت را وارد کن."
                );

                return;
            }

            if (
                !/^\d{4}$/.test(code)
            ) {

                showError(
                    "کد اتاق باید ۴ رقمی باشد."
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

/*
    شروع بازی
*/
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

/*
    چت لابی
*/
function sendLobbyChat() {

    const input =
        $("chatInput");

    if (!input) {
        return;
    }

    const text =
        input.value.trim();

    if (!text) {
        return;
    }

    socket.emit(
        "lobbyChat",
        {
            text
        }
    );

    input.value = "";
}

$("sendChatButton")
    .addEventListener(
        "click",
        sendLobbyChat
    );

$("chatInput")
    .addEventListener(
        "keydown",
        (event) => {

            if (
                event.key ===
                "Enter"
            ) {

                sendLobbyChat();
            }
        }
    );

/*
    ورود به بازی بعد از نقش
*/
$("continueGameButton")
    .addEventListener(
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

/*
    معرفی وزیر
*/
$("nominateButton")
    .addEventListener(
        "click",
        () => {

            playClickSound();

            socket.emit(
                "nominateChancellor",
                {
                    playerId:
                        $("nomineeSelect")
                            .value
                }
            );
        }
    );

/*
    رأی مثبت
*/
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

/*
    رأی منفی
*/
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

/*
    تصویب کارت وزیر
*/
$("enactButton")
    .addEventListener(
        "click",
        () => {

            playClickSound();

            if (
                selectedMinisterIndex ===
                null
            ) {

                return;
            }

            $("enactButton")
                .disabled = true;

            socket.emit(
                "ministerEnact",
                {
                    index:
                        selectedMinisterIndex
                }
            );
        }
    );

/*
    شروع دوباره
*/
$("reloadButton")
    .addEventListener(
        "click",
        () => {

            window.location.reload();
        }
    );

/*
    ساخت اتاق
*/
socket.on(
    "roomCreated",
    ({
        roomCode: code
    }) => {

        $("roomCode")
            .textContent =
            code;

        saveSession(
            code
        );

        showScreen(
            screens.lobby
        );
    }
);

/*
    وضعیت لابی
*/
socket.on(
    "roomState",
    ({
        roomCode: code,
        players,
        started,
        messages
    }) => {

        $("roomCode")
            .textContent =
            code;

        $("playerCount")
            .textContent =
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

/*
    چت
*/
socket.on(
    "chatMessage",
    (message) =>
        renderChatMessage(
            message
        )
);

/*
    شروع بازی
*/
socket.on(
    "gameStarted",
    () => {

        $("lobbyMessage")
            .textContent =
            "🎴 بازی شروع شد...";
    }
);

/*
    نقش
*/
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

/*
    وضعیت بازی
*/
socket.on(
    "gameState",
    (state) => {

        pendingState =
            state;

        /*
            ابتدا بازیکن نقش خودش را ببیند.
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

/*
    ==================================================
    3 کارت صدر
    ==================================================
*/
socket.on(
    "policyDrawn",
    ({ cards }) => {

        showScreen(
            screens.game
        );

        $("presidentPolicyBox")
            .classList.remove(
                "hidden"
            );

        $("voteBox")
            .classList.add(
                "hidden"
            );

        $("nominationBox")
            .classList.add(
                "hidden"
            );

        $("ministerPolicyBox")
            .classList.add(
                "hidden"
            );

        renderPresidentCards(
            cards
        );

        $("phaseTitle")
            .textContent =
            "📜 سه کارت سیاست صدر";

        $("discardHint")
            .textContent =
            "یکی از ۳ کارت را کنار بگذار.";
    }
);

/*
    ==================================================
    2 کارت وزیر
    ==================================================
*/
socket.on(
    "ministerPolicy",
    ({ cards }) => {

        showScreen(
            screens.game
        );

        $("ministerPolicyBox")
            .classList.remove(
                "hidden"
            );

        $("presidentPolicyBox")
            .classList.add(
                "hidden"
            );

        $("nominationBox")
            .classList.add(
                "hidden"
            );

        $("voteBox")
            .classList.add(
                "hidden"
            );

        renderMinisterCards(
            cards
        );

        $("phaseTitle")
            .textContent =
            "📜 دو کارت وزیر";

        $("gameMessage")
            .textContent =
            "یکی از دو کارت را انتخاب کن و سپس تصویبش کن.";
    }
);

/*
    پایان
*/
socket.on(
    "gameOver",
    (winner) =>
        showGameOver(
            winner
        )
);

/*
    خطا
*/
socket.on(
    "errorMessage",
    (message) => {

        showError(
            message
        );

        if (
            $("lobbyMessage")
        ) {

            $("lobbyMessage")
                .textContent =
                message;
        }
    }
);

/*
    اتصال
*/
socket.on(
    "connect",
    () => {

        console.log(
            "✅ اتصال به سرور برقرار شد:",
            socket.id
        );
    }
);
