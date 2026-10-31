
const socket = io({ autoConnect: false });

const $ = id => document.getElementById(id);

let roomCode = null;
let myHand = [];
let selectedHandIndex = null;
let mySeat = -1;
let currentTurn = 0;
let lastDiscards = [];
let roomState = null;
let callState = null;
let waitingCall = false;
let bannedTiles = [];
let drawnTile = null;
let publicMelds = [];
let ownRiichi = false;
let riichiChoices = [];
let choosingRiichi = false;
let shantenValue = null;
let ready = false;
let pending = false;
let replaced = false;
const SESSION_KEY = "mahjong.session.v1";
let session = null;
try {
  const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  if (typeof saved?.code === "string" && typeof saved?.token === "string") session = saved;
} catch { /* Storage may be unavailable; the current connection still works. */ }

function saveSession(value) {
  session = value;
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    $("connectionStatus").textContent = "브라우저 저장소를 사용할 수 없어 새로고침 후 복구가 어려울 수 있어.";
  }
}

function controls() {
  $("create").disabled = $("join").disabled = !ready || pending;
  $("start").disabled = !ready || pending || !roomState || roomState.started ||
    !roomState.players[mySeat]?.host || roomState.players.length !== 4 ||
    roomState.players.some(p => !p.connected);
  $("fillBots").disabled = !ready || pending || !roomState || roomState.started || !roomState.players[mySeat]?.host || roomState.players.length >= 4;
  $("removeBots").disabled = !ready || pending || !roomState || roomState.started || !roomState.players[mySeat]?.host || !roomState.players.some(p => p.bot);
  $("callPanel").querySelectorAll("button").forEach(b => { b.disabled = !ready || pending || roomState?.paused || callState?.answered; });
  $("riichiButton").disabled = !ready || pending || !roomState?.started || roomState.paused || waitingCall || currentTurn !== mySeat || ownRiichi || !riichiChoices.length;
  $("hand").querySelectorAll("button").forEach(b => {
    b.classList.toggle("selected-tile", Number(b.dataset.i) === selectedHandIndex);
    b.setAttribute("aria-pressed", String(Number(b.dataset.i) === selectedHandIndex));
    b.classList.toggle("riichi-candidate", choosingRiichi && riichiChoices.includes(myHand[Number(b.dataset.i)]));
    b.disabled = !ready || pending || !roomState?.started || roomState.paused || waitingCall || currentTurn !== mySeat || bannedTiles.includes(myHand[Number(b.dataset.i)]) || (ownRiichi && Number(b.dataset.i) !== myHand.length-1) || (choosingRiichi && !riichiChoices.includes(myHand[Number(b.dataset.i)]));
  });
}

function request(event, data, callback) {
  if (!ready || !socket.connected || pending) return;
  pending = true;
  controls();
  const connectionId = socket.id;
  const done = (error, res) => {
    if (replaced || socket.id !== connectionId || !socket.connected) return;
    pending = false;
    controls();
    if (error) {
      // An acknowledgement may be lost after the action was applied. Reconnect
      // for an authoritative snapshot instead of replaying a stale discard.
      $("connectionStatus").textContent = "응답이 없어 연결을 다시 확인하고 있어.";
      socket.disconnect().connect();
      return;
    }
    callback(res);
  };
  if (data === undefined) socket.timeout(5000).emit(event, done);
  else socket.timeout(5000).emit(event, data, done);
}

function entered(res) {
  roomCode = res.code;
  saveSession({ code: res.code, token: res.token });
  show("lobby");
  $("code").textContent = res.code;
}

const show = id => {
  document.body.classList.toggle("in-game", id === "game");
  ["home", "lobby", "game"].forEach(x =>
    $(x).classList.toggle("hidden", x !== id)
  );
};

const name = () =>
  $("nickname").value.trim() || "플레이어";

function err(id, msg) {
  $(id).textContent = msg || "";
}

$("create").onclick = () => {
  request("room:create", { name: name() }, res => {
    if (!res?.ok)
      return err("homeError", "방 생성에 실패했어.");

    entered(res);
  });
};

$("join").onclick = () => {
  request("room:join", {
    name: name(),
    code: $("roomcode").value
  }, res => {
    if (!res?.ok)
      return err("homeError", res?.error || "입장 실패");

    entered(res);
  });
};

$("roomcode").addEventListener("input", e => {
  e.target.value = e.target.value.toUpperCase();
});

$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    $("copy").textContent = "복사 완료";
  } catch {
    $("copy").textContent = roomCode;
  }
};

$("fillBots").onclick = () => request("room:bots", {fill:true}, res => err("lobbyError", res?.error));
$("removeBots").onclick = () => request("room:bots", {fill:false}, res => err("lobbyError", res?.error));

$("start").onclick = () => {
  request("game:start", undefined, res =>
    err("lobbyError", res?.error || "")
  );
};

socket.on("room:update", room => {
  if (room.code !== roomCode) return;
  roomState = room;
  if (room.paused || !room.started) { selectedHandIndex = null; renderDiscards(); }
  $("riichiPot").textContent = `供託 · ${(room.riichiPot || 0) * 1000}점`;
  renderTurn();

  $("count").textContent =
    `${room.players.length}/4`;

  $("players").innerHTML = room.players.map((p, i) =>
    `<div class="player">
      <strong>${escapeHtml(p.name)} ${p.bot ? "🤖" : p.host ? "👑" : ""}</strong>
      <small>${p.bot ? "연습봇" : p.connected ? "접속 중" : "연결 끊김"}</small>
    </div>`
  ).join("");

  controls();
  $("connectionStatus").textContent = room.paused
    ? "참가자의 연결이 끊겨 대국을 일시 정지했어. 복귀하면 계속할 수 있어."
    : "서버에 연결됨";
  $("gameMessage").textContent = room.message;
  err("lobbyError", room.message);

  if (room.started) {
    show("game");
    $("gameCode").textContent = room.code;
  } else {
    show("lobby");
  }
});

socket.on("game:private", s => {
  selectedHandIndex = null;
  myHand = s.hand;
  ownRiichi = s.riichi;
  riichiChoices = s.riichiDiscards || [];
  shantenValue = s.shanten;
  choosingRiichi = false;
  renderShanten();
  $("riichiButton").textContent = ownRiichi ? "리치 선언 완료" : "리치 · 1,000점";
  callState = s.call;
  waitingCall = s.waiting;
  bannedTiles = s.banned || [];
  drawnTile = s.drawn;
  publicMelds = s.melds || [];
  mySeat = s.mySeat;
  currentTurn = s.turn;
  lastDiscards = s.discards || [];

  $("wall").textContent =
    `남은 패 ${s.wallCount}개`;

  renderCalls();
  renderMelds();
  renderHand();
  renderTurn();
  renderDiscards();
  controls();
});

socket.on("game:discarded", d => {
  currentTurn = d.turn;
  lastDiscards = d.discards;

  renderDiscards();
  renderTurn();
});

socket.on("game:message", m => {
  $("gameMessage").textContent = m;
});

const winds = ["동", "남", "서", "북"];
const positions = ["bottom", "right", "top", "left"];
const tileOrder = tile => {
  const suit = ["만", "통", "삭"].indexOf(tile.slice(-1));
  return suit < 0 ? 30 + ["동", "남", "서", "북", "백", "발", "중"].indexOf(tile) : suit * 10 + Number(tile[0]);
};
function tileFace(tile, extra = "") {
  const suit = tile.slice(-1);
  const kind = { "만": "man", "통": "pin", "삭": "sou", "중": "red", "발": "green", "백": "white" }[suit] || "honor";
  const number = Number(tile[0]);
  let face;
  if (number && (suit === "통" || suit === "삭")) {
    const points = number === 1 ? [[30,30]] : Array.from({length:number}, (_,i) => [18 + (i%3)*12, 15 + Math.floor(i/3)*15]);
    face = `<svg viewBox="0 0 60 60" aria-hidden="true">${points.map(([x,y],i) => suit === "통" ? `<circle cx="${x}" cy="${y}" r="${number===1?16:5}" fill="none" stroke="${i%3===1?'#b83735':'#235e84'}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="2" fill="#235e84"/>` : `<path d="M${x} ${y-5}v10m-3-7h6m-6 4h6" stroke="#23734f" stroke-width="3" stroke-linecap="round"/>`).join("")}</svg><small>${tile}</small>`;
  } else if (number) face = `<b>${["","一","二","三","四","五","六","七","八","九"][number]}</b><em>萬</em>`;
  else face = `<b>${{"동":"東","남":"南","서":"西","북":"北","백":"","발":"發","중":"中"}[tile]}</b><small>${tile}</small>`;
  return `<span class="tile ${kind} ${extra}" aria-label="${tile}">${face}</span>`;
}
function renderHand() {
  const tiles = myHand.map((tile, i) => ({tile, i}));
  const drawn = drawnTile ? tiles.pop() : null;
  if ($("sortHand").checked) tiles.sort((a,b) => tileOrder(a.tile)-tileOrder(b.tile));
  if (drawn) tiles.push(drawn);
  $("hand").innerHTML = tiles.map(({tile,i}) => `<button aria-label="${tile} 버리기" data-i="${i}" class="${drawn?.i === i ? 'drawn' : ''}">${tileFace(tile)}</button>`).join("");
  $("hand").querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      const index = Number(b.dataset.i);
      if (selectedHandIndex !== index) {
        selectedHandIndex = index;
        controls();
        renderDiscards();
        renderTurn();
        return;
      }
      const tile = myHand[index];
      selectedHandIndex = null;
      controls();
      renderDiscards();
      request("game:discard", { tile, riichi: choosingRiichi }, res => {
        if (res?.error) $("gameMessage").textContent = res.error;
      });
    };
  });
  controls();
}
$("sortHand").onchange = () => { selectedHandIndex = null; renderHand(); renderDiscards(); renderTurn(); };
function renderDiscards() {
  $("discards").innerHTML = [0,1,2,3].map(offset => {
    const seat = (Math.max(0,mySeat)+offset)%4;
    const tiles = lastDiscards.map((d,i)=>({...d,index:i})).filter(d=>d.seat===seat);
    return `<div class="river ${positions[offset]}" aria-label="${winds[seat]}가 버림패">${tiles.map(d=>tileFace(d.tile,`${selectedHandIndex !== null && d.tile === myHand[selectedHandIndex] ? 'matching-tile' : ''} ${d.riichi ? 'riichi-discard' : ''} ${d.calledBy !== undefined ? 'claimed' : ''} ${d.index===lastDiscards.length-1?'latest':''} ${callState && !callState.answered && callState.options.length && d.index===callState.index?'callable':''}`)).join("")}</div>`;
  }).join("");
}
function renderCalls() {
  const panel = $("callPanel");
  panel.classList.toggle("hidden", !waitingCall);
  if (!waitingCall) { panel.innerHTML = ""; return; }
  if (!callState?.options.length || callState.answered) {
    panel.innerHTML = '<strong>다른 플레이어의 부로 선택을 기다리고 있어요…</strong>';
    return;
  }
  panel.innerHTML = `<div class="call-target">${tileFace(callState.tile)}<strong>이 패를 울 수 있어요</strong></div><div class="call-actions">${callState.options.map(o=>`<button data-choice="${o.id}"><b>${{chi:'치',pon:'퐁',kan:'깡'}[o.type]}</b><span class="call-preview">${o.consume.map(t=>tileFace(t)).join('')}</span></button>`).join('')}<button data-choice="skip" class="skip-call">스킵</button></div>`;
  panel.querySelectorAll('button').forEach(b=>b.onclick=()=>request('game:call',{id:callState.id,choice:b.dataset.choice==='skip'?null:b.dataset.choice},res=>{if(res?.error) $("gameMessage").textContent=res.error;}));
}
function renderMelds() {
  $("melds").innerHTML = [0,1,2,3].map(offset=>{
    const seat=(Math.max(0,mySeat)+offset)%4;
    const melds=publicMelds[seat] || [];
    if(!melds.length) return '';
    return `<div class="meld-row"><strong>${winds[seat]}가${seat===mySeat?' · 나':''}</strong>${melds.map(m=>`<div class="meld-group" aria-label="${winds[m.from]}가에서 ${m.type}"><small>${{chi:'치',pon:'퐁',kan:'깡'}[m.type]} · ${winds[m.from]}가</small><div>${m.tiles.map(t=>tileFace(t)).join('')}</div></div>`).join('')}</div>`;
  }).join('');
}

function renderShanten() {
  $("shantenValue").classList.toggle("hidden", !$("showShanten").checked);
  $("shantenValue").textContent = shantenValue == null ? "" : shantenValue === -1 ? "완성형 (화료 판정 전)" : shantenValue === 0 ? "텐파이 · 0샹텐" : `${shantenValue}샹텐`;
}
try { $("showShanten").checked = localStorage.getItem("mahjong.showShanten") !== "false"; } catch {}
$("showShanten").onchange = () => {
  try { localStorage.setItem("mahjong.showShanten", String($("showShanten").checked)); } catch {}
  renderShanten();
};
$("riichiButton").onclick = () => {
  selectedHandIndex = null;
  renderDiscards();
  choosingRiichi = !choosingRiichi;
  $("riichiButton").textContent = choosingRiichi ? "리치 선택 취소" : "리치 · 1,000점";
  renderTurn();
  controls();
};
function renderTurn() {
  $("turnText").textContent = roomState?.paused ? "복귀 대기" : waitingCall ? "부로 선택 중" : currentTurn === mySeat ? "내 차례" : `플레이어 ${currentTurn + 1} 차례`;
  $("turnText").classList.toggle("my-turn",currentTurn===mySeat && !roomState?.paused && !waitingCall);
  $("handHint").textContent = roomState?.paused ? "참가자의 재접속을 기다리고 있어요" : waitingCall ? "치·퐁·깡 또는 스킵을 선택하세요" : selectedHandIndex !== null ? `${myHand[selectedHandIndex]} · 한 번 더 누르면 ${choosingRiichi ? "리치 선언" : "버립니다"}` : choosingRiichi ? "강조된 패를 두 번 눌러 리치하세요" : ownRiichi && currentTurn===mySeat ? "쯔모패를 두 번 눌러 버리세요" : currentTurn===mySeat ? "한 번 선택 · 다시 눌러 버리기" : "다른 플레이어의 차례입니다";
  $("seats").innerHTML = [0,1,2,3].map(offset => {
    const i=(Math.max(0,mySeat)+offset)%4;
    const p=roomState?.players[i];
    return `<div class="seat ${positions[offset]} ${i===currentTurn?'active':''} ${p && !p.connected?'offline':''}"><span class="wind-badge">${winds[i]}</span><div><strong>${escapeHtml(p?.name || `플레이어 ${i+1}`)}${p?.bot?' · 봇':i===mySeat?' · 나':''}</strong><small>${p?.riichi?'리치 · ':''}${p && !p.connected?'연결 끊김':i===currentTurn?'● 현재 차례':'대기 중'}</small><small>${(p?.score ?? 25000).toLocaleString()}점</small></div></div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

socket.on("connect_error", () => {
  ready = false;
  $("connectionStatus").textContent = "서버에 연결할 수 없어. 다시 연결을 시도하고 있어.";
  $("retryConnection").classList.remove("hidden");
  controls();
});

function restore() {
  ready = false;
  controls();
  $("retryConnection").classList.add("hidden");
  if (!session) {
    ready = true;
    $("connectionStatus").textContent = "서버에 연결됨";
    controls();
    return;
  }
  $("connectionStatus").textContent = "기존 좌석과 게임을 복구하고 있어…";
  const connectionId = socket.id;
  socket.timeout(5000).emit("room:resume", session, (error, res) => {
    if (!socket.connected || socket.id !== connectionId) return;
    if (error) {
      $("connectionStatus").textContent = "복구 응답을 받지 못했어. 연결을 다시 시도해 줘.";
      $("retryConnection").classList.remove("hidden");
      return;
    }
    ready = true;
    if (res?.ok) entered(res);
    else {
      saveSession(null);
      roomCode = null;
      roomState = null;
      myHand = [];
      mySeat = -1;
      lastDiscards = [];
      show("home");
      err("homeError", res?.error || "방을 복구할 수 없어.");
    }
    $("connectionStatus").textContent = "서버에 연결됨";
    controls();
  });
}

socket.on("connect", restore);
socket.on("disconnect", () => {
  selectedHandIndex = null;
  renderDiscards();
  ready = false;
  pending = false;
  controls();
  if (!replaced) {
    $("connectionStatus").textContent = "연결이 끊겼어. 기존 좌석으로 다시 연결하고 있어…";
    $("retryConnection").classList.remove("hidden");
  }
});
socket.on("session:replaced", () => {
  replaced = true;
  saveSession(null);
  ready = false;
  roomState = null;
  roomCode = null;
  show("home");
  $("connectionStatus").textContent = "다른 연결에서 이 좌석을 복구했어. 이 창을 새로고침해 줘.";
  $("retryConnection").classList.add("hidden");
  controls();
});
$("retryConnection").onclick = () => socket.disconnect().connect();
$("fullscreenButton").onclick = async () => {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (!document.documentElement.requestFullscreen) {
      $("gameMessage").textContent = "기기를 가로로 돌려 주세요. 이 브라우저는 전체화면을 지원하지 않아요.";
      return;
    }
    await document.documentElement.requestFullscreen();
    try { await screen.orientation?.lock?.("landscape"); } catch { /* Rotation remains user-controlled when unsupported. */ }
  } catch { $("gameMessage").textContent = "기기를 가로로 돌리면 넓은 화면으로 플레이할 수 있어요."; }
};
document.addEventListener("fullscreenchange", () => {
  $("fullscreenButton").textContent = document.fullscreenElement ? "전체화면 해제" : "전체화면";
});
controls();
socket.connect();
