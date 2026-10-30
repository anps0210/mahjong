
const socket = io({ autoConnect: false });

const $ = id => document.getElementById(id);

let roomCode = null;
let myHand = [];
let mySeat = -1;
let currentTurn = 0;
let lastDiscards = [];
let roomState = null;
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
  $("hand").querySelectorAll("button").forEach(b => {
    b.disabled = !ready || pending || !roomState?.started || roomState.paused || currentTurn !== mySeat;
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
  myHand = s.hand;
  mySeat = s.mySeat;
  currentTurn = s.turn;
  lastDiscards = s.discards || [];

  $("wall").textContent =
    `남은 패 ${s.wallCount}개`;

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
  const drawn = myHand.length === 14 ? tiles.pop() : null;
  if ($("sortHand").checked) tiles.sort((a,b) => tileOrder(a.tile)-tileOrder(b.tile));
  if (drawn) tiles.push(drawn);
  $("hand").innerHTML = tiles.map(({tile,i}) => `<button aria-label="${tile} 버리기" data-i="${i}" class="${drawn?.i === i ? 'drawn' : ''}">${tileFace(tile)}</button>`).join("");
  $("hand").querySelectorAll("button").forEach(b => {
    b.onclick = () => request("game:discard", { tile: myHand[Number(b.dataset.i)] }, res => {
      if (res?.error) $("gameMessage").textContent = res.error;
    });
  });
  controls();
}
$("sortHand").onchange = renderHand;
function renderDiscards() {
  $("discards").innerHTML = [0,1,2,3].map(offset => {
    const seat = (Math.max(0,mySeat)+offset)%4;
    const tiles = lastDiscards.map((d,i)=>({...d,index:i})).filter(d=>d.seat===seat);
    return `<div class="river ${positions[offset]}" aria-label="${winds[seat]}가 버림패">${tiles.map(d=>tileFace(d.tile,d.index===lastDiscards.length-1?'latest':'')).join("")}</div>`;
  }).join("");
}
function renderTurn() {
  $("turnText").textContent = roomState?.paused ? "복귀 대기" : currentTurn === mySeat ? "내 차례" : `플레이어 ${currentTurn + 1} 차례`;
  $("turnText").classList.toggle("my-turn",currentTurn===mySeat && !roomState?.paused);
  $("handHint").textContent = roomState?.paused ? "참가자의 재접속을 기다리고 있어요" : currentTurn===mySeat ? "버릴 패를 선택하세요" : "다른 플레이어의 차례입니다";
  $("seats").innerHTML = [0,1,2,3].map(offset => {
    const i=(Math.max(0,mySeat)+offset)%4;
    const p=roomState?.players[i];
    return `<div class="seat ${positions[offset]} ${i===currentTurn?'active':''} ${p && !p.connected?'offline':''}"><span class="wind-badge">${winds[i]}</span><div><strong>${escapeHtml(p?.name || `플레이어 ${i+1}`)}${p?.bot?' · 봇':i===mySeat?' · 나':''}</strong><small>${p && !p.connected?'연결 끊김':i===currentTurn?'● 현재 차례':'대기 중'}</small></div></div>`;
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
controls();
socket.connect();
