const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

const $ = (id) => document.getElementById(id);
const screens = {
  home: $("homeScreen"), tutorial: $("tutorialScreen"), shop: $("shopScreen"), gift: $("giftScreen"),
  lobby: $("lobbyScreen"), role: $("roleScreen"), game: $("gameScreen"), gameOver: $("gameOverScreen")
};
const playerNameInput = $("playerName"), roomCodeInput = $("roomCodeInput"), errorMessage = $("errorMessage");
const playerTokenKey = "saye-darbar-player-token";
const savedRoomKey = "saye-darbar-room";
let playerToken = localStorage.getItem(playerTokenKey) || "";
let savedRoom = localStorage.getItem(savedRoomKey) || "";
let currentState = null, pendingState = null, nominationTimerInterval = null;

const avatarCatalog = [
  { id:"default", icon:"🧑🏻‍⚖️", name:"درباری", price:0 },
  { id:"shah", icon:"👑", name:"شاه قاجار", price:300 },
  { id:"vizier", icon:"🧿", name:"وزیر اعظم", price:200 },
  { id:"court", icon:"🎩", name:"اشراف‌زاده", price:150 },
  { id:"warrior", icon:"⚔️", name:"محافظ سلطنت", price:250 },
  { id:"ink", icon:"🖋️", name:"منشی دربار", price:100 }
];

function showScreen(screen){ Object.values(screens).forEach(s=>s.classList.add("hidden")); screen.classList.remove("hidden"); }
function playClickSound(){ try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=520;o.type="sine";g.gain.setValueAtTime(.025,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.08);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.08)}catch(_){}}
function showError(t){ errorMessage.textContent=t||""; }
function speak(text){
  if(!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text); u.lang="fa-IR"; u.rate=.88; u.pitch=.72; u.volume=1;
  const voices=window.speechSynthesis.getVoices();
  const preferred=voices.find(v=>/fa|persian/i.test(v.lang||v.name||"") && /male|man|مرد/i.test(v.name||"")) || voices.find(v=>/fa/i.test(v.lang||""));
  if(preferred) u.voice=preferred;
  window.speechSynthesis.speak(u);
}
function saveSession(code){ if(code){savedRoom=code;localStorage.setItem(savedRoomKey,code)} }
function emitIdentity(){ return {playerToken}; }

function renderPlayers(players, container=$("playersList")){
  container.innerHTML="";
  players.forEach(p=>{
    const item=document.createElement("div"); item.className="player"+(p.connected===false?" offline":"");
    const name=document.createElement("span"); name.className="playerName"; name.textContent=`${avatarCatalog.find(a=>a.id===p.avatar)?.icon||"👤"} ${p.name}`; item.appendChild(name);
    if(p.host){const h=document.createElement("span");h.className="host";h.textContent="👑 سازنده";item.appendChild(h)}
    if(p.connected===false){const o=document.createElement("span");o.className="smallText";o.textContent="اتصال قطع؛ جایگاه محفوظ است";item.appendChild(o)}
    container.appendChild(item);
  });
}
function renderChatMessage(m, box=$("chatMessages")){
  const item=document.createElement("div");item.className="chatMessage";
  if(m.type==="system"){item.classList.add("system");item.textContent=`• ${m.text}`}else{const n=document.createElement("span");n.className="chatName";n.textContent=`${m.name}:`;const t=document.createElement("span");t.textContent=` ${m.text}`;item.append(n,t)}
  box.appendChild(item);box.scrollTop=box.scrollHeight;
}
function renderChat(messages,box=$("chatMessages")){box.innerHTML="";(messages||[]).forEach(m=>renderChatMessage(m,box))}
function renderTrack(container,count,total,color){container.innerHTML="";for(let i=0;i<total;i++){const s=document.createElement("div");s.className="trackSlot";if(i<count)s.classList.add("active",color);container.appendChild(s)}}
function renderRole(role,allies){const card=$("roleCard");card.className="roleCard";card.innerHTML="";const names={constitutionalist:"🟦 مشروطه‌خواه",qajar:"🟥 قاجاری",naser:"👑 ناصرالدین شاه"};card.classList.add(role);card.textContent=names[role]||"نقش ناشناس";const box=$("alliesBox");box.innerHTML="";if(role==="constitutionalist"){box.textContent="شما در جبهه مشروطه‌خواهان هستید."}else{box.innerHTML=`<strong>هم‌پیمانان شما:</strong>`;(allies||[]).forEach(a=>{const d=document.createElement("div");d.className="ally";d.textContent=`👤 ${a.name} — ${a.role}`;box.appendChild(d)});if(!(allies||[]).length){const d=document.createElement("div");d.className="ally";d.textContent="هم‌پیمان دیگری شناسایی نشد.";box.appendChild(d)}}}
function setActionBoxesHidden(){$("nominationBox").classList.add("hidden");$("voteBox").classList.add("hidden");$("presidentPolicyBox").classList.add("hidden");$("ministerPolicyBox").classList.add("hidden");$("publicResult").textContent="";$("gameMessage").textContent=""}
function renderNominees(players){const s=$("nomineeSelect");s.innerHTML="";players.filter(p=>p.id!==socket.id).forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=p.name;s.appendChild(o)})}
function cardLabel(card){return card==="constitutional"?{icon:"🏛️",title:"سیاست مشروطه",class:"blue"}:{icon:"👑",title:"سیاست قاجاری",class:"red"}}
function makeCard(card,index,handler){const info=cardLabel(card),el=document.createElement("button");el.type="button";el.className=`policyCard ${info.class}`;el.innerHTML=`<span><span class="seal">${info.icon}</span>${info.title}</span>`;el.addEventListener("click",()=>{playClickSound();handler(index)});return el}
function renderPresidentCards(cards){const box=$("presidentCards");box.innerHTML="";(cards||[]).forEach((c,i)=>box.appendChild(makeCard(c,i,(index)=>{socket.emit("presidentDiscard",{index});$("discardHint").textContent="کارت کنار گذاشته شد؛ دو کارت به وزیر رفت...";[...box.children].forEach(x=>x.disabled=true)})))}
function renderMinisterCards(cards){const box=$("ministerCards");box.innerHTML="";(cards||[]).forEach((c,i)=>box.appendChild(makeCard(c,i,(index)=>{[...box.children].forEach(x=>x.disabled=true);socket.emit("ministerDiscard",{index})})))}
function updateNominationTimer(endAt){
  clearInterval(nominationTimerInterval);
  if(!endAt){$("nominationTimer").textContent="⏱️ --";return}
  const tick=()=>{const left=Math.max(0,Math.ceil((endAt-Date.now())/1000));$("nominationTimer").textContent=`⏱️ ${left}`;if(left<=0)clearInterval(nominationTimerInterval)};tick();nominationTimerInterval=setInterval(tick,250);
}
function renderGameState(state){
  currentState=state;pendingState=state;showScreen(screens.game);$("phaseTitle").textContent=state.phaseText;$("policyDeckCount").textContent=`کارت‌های باقی‌مانده: ${state.policyDeckCount}`;
  $("constitutionalCount").textContent=`${state.constitutionalPolicies} / 5`;$("qajarCount").textContent=`${state.qajarPolicies} / 6`;renderTrack($("constitutionalTrack"),state.constitutionalPolicies,5,"blue");renderTrack($("qajarTrack"),state.qajarPolicies,6,"red");renderPlayers(state.players,$("gamePlayers"));
  $("presidentBox").innerHTML=`<strong>👑 صدر فعلی</strong><br>${state.president?.name||"نامشخص"}`;$("nomineeBox").innerHTML=`<strong>📜 وزیر معرفی‌شده</strong><br>${state.nominee?.name||"هنوز انتخاب نشده"}`;setActionBoxesHidden();updateNominationTimer(state.phase==="nomination"?state.nominationEndsAt:null);
  if(state.lastResult) $("publicResult").textContent=state.lastResult.approved?`✅ دولت تأیید شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`:`❌ دولت رد شد — ${state.lastResult.yesVotes} موافق / ${state.lastResult.noVotes} مخالف`;
  if(state.phase==="nomination"){
    if(state.youArePresident){$("nominationBox").classList.remove("hidden");renderNominees(state.players)}else $("gameMessage").textContent=`⏳ منتظر انتخاب وزیر توسط ${state.president?.name||"صدر"} هستیم...`;
  }
  if(state.phase==="vote"){
    $("voteBox").classList.remove("hidden");$("voteDescription").textContent=`آیا با ریاست ${state.president?.name||"صدر"} و وزارت ${state.nominee?.name||"وزیر"} موافق هستید؟`;
    const voted=!!state.youVoted;$("yesVoteButton").disabled=voted;$("noVoteButton").disabled=voted;$("voteStatus").textContent=voted?"✅ رأی شما ثبت شده؛ منتظر بقیه باشید.":"رأی خود را انتخاب کنید.";
  }
  if(state.phase==="president_discard") $("gameMessage").textContent=state.youArePresident?"⏳ سه کارت محرمانه برای شما ارسال شده است.":"⏳ صدر در حال انتخاب یک کارت از سه کارت است...";
  if(state.phase==="minister_enact") $("gameMessage").textContent=state.youAreNominee?"⏳ دو کارت به شما رسیده؛ یکی را برای تصویب انتخاب کنید.":"⏳ وزیر در حال انتخاب یکی از دو کارت است...";
  if(state.phase==="finished"&&state.winner)showGameOver(state.winner);
}
function showGameOver(w){$("gameOverIcon").textContent=w.faction==="qajar"?"👑":"🏛️";$("gameOverTitle").textContent=w.faction==="qajar"?"قاجاریان پیروز شدند":"مشروطه‌خواهان پیروز شدند";$("gameOverReason").textContent=w.reason;showScreen(screens.gameOver)}
function renderProfile(p){$("coinCount").textContent=p.coins;$("shopCoins").textContent=p.coins;renderShop(p)}
function renderShop(p){const grid=$("avatarGrid");if(!grid)return;grid.innerHTML="";avatarCatalog.forEach(a=>{const owned=(p.avatars||[]).includes(a.id),item=document.createElement("div");item.className="avatarItem";item.innerHTML=`<div class="avatarIcon">${a.icon}</div><strong>${a.name}</strong><div class="avatarPrice">${a.price?`🪙 ${a.price}`:"رایگان"}</div>`;const b=document.createElement("button");b.type="button";b.textContent=owned?(a.id==="default"?"انتخاب‌شده":"انتخاب"):"خرید";b.disabled=owned&&a.id==="default";b.addEventListener("click",()=>{if(owned)socket.emit("selectAvatar",{avatar:a.id});else socket.emit("buyAvatar",{avatar:a.id,price:a.price})});item.appendChild(b);grid.appendChild(item)})}
function sendLobbyChat(){const t=$("chatInput").value.trim();if(!t)return;socket.emit("lobbyChat",{text:t});$("chatInput").value=""}
function sendGameChat(){const t=$("gameChatInput").value.trim();if(!t)return;socket.emit("gameChat",{text:t});$("gameChatInput").value=""}

$("createRoomButton").addEventListener("click",()=>{playClickSound();const name=playerNameInput.value.trim();showError("");if(!name)return showError("اول نامت را وارد کن.");socket.emit("createRoom",{name,...emitIdentity()})});
$("joinRoomButton").addEventListener("click",()=>{playClickSound();const name=playerNameInput.value.trim(),code=roomCodeInput.value.trim();showError("");if(!name)return showError("اول نامت را وارد کن.");if(!/^\d{4}$/.test(code))return showError("کد اتاق باید ۴ رقمی باشد.");socket.emit("joinRoom",{name,roomCode:code,...emitIdentity()})});
$("startGameButton").addEventListener("click",()=>{playClickSound();socket.emit("startGame")});
$("sendChatButton").addEventListener("click",sendLobbyChat);$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendLobbyChat()});
$("gameChatSendButton").addEventListener("click",sendGameChat);$("gameChatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendGameChat()});
$("continueGameButton").addEventListener("click",()=>{playClickSound();if(pendingState)renderGameState(pendingState)});
$("nominateButton").addEventListener("click",()=>{playClickSound();socket.emit("nominateChancellor",{playerId:$("nomineeSelect").value})});
$("yesVoteButton").addEventListener("click",()=>{playClickSound();socket.emit("castVote",{vote:"yes"})});$("noVoteButton").addEventListener("click",()=>{playClickSound();socket.emit("castVote",{vote:"no"})});
$("reloadButton").addEventListener("click",()=>window.location.reload());
$("tutorialButton").addEventListener("click",()=>showScreen(screens.tutorial));$("backFromTutorialButton").addEventListener("click",()=>showScreen(screens.home));
$("openShopButton").addEventListener("click",()=>showScreen(screens.shop));$("closeShopButton").addEventListener("click",()=>showScreen(screens.home));
$("openGiftButton").addEventListener("click",()=>showScreen(screens.gift));$("closeGiftButton").addEventListener("click",()=>showScreen(screens.home));
$("redeemGiftButton").addEventListener("click",()=>{const code=$("giftCodeInput").value.trim();if(!code)return;socket.emit("redeemGiftCode",{code})});
$("musicButton").addEventListener("click",async()=>{const a=$("menuMusic");try{if(a.paused){await a.play();$("musicButton").textContent="🔊 موسیقی: روشن"}else{a.pause();$("musicButton").textContent="🎵 موسیقی: خاموش"}}catch(_){$("musicHint").textContent="فایل موسیقی پیدا نشد یا مرورگر اجازه پخش نداد."}});

socket.on("roomCreated",({roomCode,playerToken:t})=>{if(t){playerToken=t;localStorage.setItem(playerTokenKey,t)}saveSession(roomCode);$("roomCode").textContent=roomCode;showScreen(screens.lobby)});
socket.on("playerToken",({playerToken:t})=>{if(t){playerToken=t;localStorage.setItem(playerTokenKey,t)}});
socket.on("roomState",({roomCode,players,started,messages})=>{$("roomCode").textContent=roomCode;$("playerCount").textContent=`${players.length} / 10`;renderPlayers(players);renderChat(messages||[]);if(!started)showScreen(screens.lobby)});
socket.on("chatMessage",m=>renderChatMessage(m));
socket.on("gameStarted",()=>{$("lobbyMessage").textContent="🎴 بازی شروع شد..."});
socket.on("roleAssigned",({role,allies})=>{renderRole(role,allies||[]);showScreen(screens.role)});
socket.on("gameState",state=>{pendingState=state;if(screens.role.classList.contains("hidden"))renderGameState(state)});
socket.on("policyDrawn",({cards})=>{showScreen(screens.game);$("presidentPolicyBox").classList.remove("hidden");$("voteBox").classList.add("hidden");$("nominationBox").classList.add("hidden");$("ministerPolicyBox").classList.add("hidden");renderPresidentCards(cards);$("phaseTitle").textContent="📜 انتخاب یک کارت از سه کارت";$("discardHint").textContent="یکی را کنار بگذار تا دو کارت به وزیر برود."});
socket.on("ministerPolicy",({cards})=>{showScreen(screens.game);$("ministerPolicyBox").classList.remove("hidden");$("presidentPolicyBox").classList.add("hidden");$("nominationBox").classList.add("hidden");$("voteBox").classList.add("hidden");renderMinisterCards(cards);$("phaseTitle").textContent="📜 انتخاب سیاست وزیر"});
socket.on("gameChatMessage",m=>renderChatMessage(m,$("gameChatMessages")));
socket.on("gameOver",showGameOver);
socket.on("narrator",({text})=>speak(text));
socket.on("profileState",renderProfile);
socket.on("giftResult",r=>{$("giftMessage").textContent=r.message;if(r.ok)$("giftCodeInput").value=""});
socket.on("avatarResult",r=>{$("giftMessage").textContent=r.message||"";if(r.ok)showScreen(screens.home)});
socket.on("errorMessage",m=>{showError(m);$("lobbyMessage").textContent=m;$("giftMessage").textContent=m});
socket.on("reconnected",({roomCode,started})=>{saveSession(roomCode);if(started)$("lobbyMessage").textContent="🔌 اتصال دوباره برقرار شد؛ جایگاه شما حفظ شد."});
socket.on("connect",()=>{
  console.log("connected",socket.id);
  if(playerToken&&savedRoom)socket.emit("reconnectPlayer",{roomCode:savedRoom,playerToken});
});
window.speechSynthesis?.getVoices();
