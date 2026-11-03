
const socket = io({ autoConnect: false });

const $ = id => document.getElementById(id);

let roomCode = null;
let myHand = [];
let selectedHandIndex = null;
let discardOrigin = null;
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
let canTsumo = false;
let kanChoices = [];
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
  $("tsumoButton").disabled = !ready || pending || !canTsumo || roomState?.paused || waitingCall;
  $("selfKanActions").querySelectorAll("button").forEach(b=>b.disabled=!ready||pending||roomState?.paused||waitingCall);
  $("riichiButton").disabled = !ready || pending || !roomState?.started || roomState.paused || waitingCall || currentTurn !== mySeat || ownRiichi || !riichiChoices.length;
  $("hand").querySelectorAll("button").forEach(b => {
    b.classList.toggle("selected-tile", Number(b.dataset.i) === selectedHandIndex);
    b.setAttribute("aria-pressed", String(Number(b.dataset.i) === selectedHandIndex));
    b.classList.toggle("riichi-candidate", choosingRiichi && riichiChoices.includes(myHand[Number(b.dataset.i)]));
    b.disabled = !ready || pending || !roomState?.started || roomState.paused;
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
  if(id!=="game" && $("musicButton").getAttribute("aria-pressed")==="true") $("musicButton").click();
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
  renderResult(room);
  $("doraIndicators").innerHTML = `<small>도라 표시패</small>${(room.doraIndicators||[]).map(t=>tileFace(t)).join("")}`;
  if (room.paused || !room.started) selectedHandIndex = null;
  renderDiscards();
  $("riichiPot").textContent = `공탁 ${(room.riichiPot || 0) * 1000}`;
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
  canTsumo = s.canTsumo;
  kanChoices = s.kanOptions || [];
  $("tsumoButton").classList.toggle("hidden", !canTsumo);
  $("furitenBadge").classList.toggle("hidden", !s.furiten);
  $("selfKanActions").innerHTML = kanChoices.map((o,i)=>`<button data-kan="${i}">${o.type==='ankan'?'암깡':'가깡'} · ${escapeHtml(o.tile)}</button>`).join("");
  $("selfKanActions").querySelectorAll("button").forEach(b=>b.onclick=()=>request("game:kan",{id:kanChoices[Number(b.dataset.kan)].id},res=>{if(res?.error)$("gameMessage").textContent=res.error;}));
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
    `X ${s.wallCount}`;

  $("wall").setAttribute("aria-label", `남은 패 ${s.wallCount}장`);
  const details=s.waitDetails||[];
  if(!details.length) hideWaitPreview();
  $("waitButton").classList.toggle("hidden", !details.length);
  $("waitHelp").textContent='';
  $("waitPreview").innerHTML=`<strong>대기패${s.furiten?' · 후리텐':''}</strong><div class="wait-tiles">${details.map(d=>`<div>${tileFace(d.tile)}<b>${d.remaining}장</b></div>`).join('')}</div>${renderWaitYaku(s.waitYaku)}<small>장수는 보이지 않는 패 기준 · 상대 손패·왕패 포함</small>`;
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
  animateDiscard(d);
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
  const suit = {"만":"m","통":"p","삭":"s"}[tile.slice(-1)];
  const code = suit ? suit + tile[0] : 'z' + (["동","남","서","북","백","발","중"].indexOf(tile)+1);
  return `<span class="tile ${extra}" role="img" aria-label="${escapeHtml(tile)}"><span class="tile-side front" aria-hidden="true"></span><span class="tile-side back" aria-hidden="true"></span><span class="tile-side left" aria-hidden="true"></span><span class="tile-side right" aria-hidden="true"></span><img src="/tiles/${code}.png?v=20261101-large-rivers" alt="" draggable="false"><span class="sr-only">${escapeHtml(tile)}</span></span>`;
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
      if (currentTurn !== mySeat || waitingCall || bannedTiles.includes(myHand[index]) || (ownRiichi && index !== myHand.length-1) || (choosingRiichi && !riichiChoices.includes(myHand[index]))) return;
      discardOrigin = b.getBoundingClientRect();
      const tile = myHand[index];
      selectedHandIndex = null;
      controls();
      renderDiscards();
      request("game:discard", { tile, riichi: choosingRiichi }, res => {
        if (res?.error) { discardOrigin = null; $("gameMessage").textContent = res.error; }
      });
    };
  });
  controls();
}
$("sortHand").onchange = () => { selectedHandIndex = null; renderHand(); renderDiscards(); renderTurn(); };
function renderDiscards() {
  const riverMarkup = [0,1,2,3].map(offset => {
    const seat = (Math.max(0,mySeat)+offset)%4;
    const tiles = lastDiscards.map((d,i)=>({...d,index:i})).filter(d=>d.seat===seat);
    return `<section class="river-zone ${positions[offset]}"><div class="river-label"><b>${winds[seat]}가${seat===mySeat?" · 나":""}</b><span>${escapeHtml(roomState?.players[seat]?.name||"")}${roomState?.players[seat]?.riichi?" · 리치":""}${roomState?.players[seat]?.connected===false?" · 연결 끊김":""}</span></div><div class="river ${positions[offset]}" aria-label="${winds[seat]}가 버림패">${tiles.map(d=>tileFace(d.tile,`${selectedHandIndex !== null && d.tile === myHand[selectedHandIndex] ? 'matching-tile' : ''} ${d.riichi ? 'riichi-discard' : ''} ${d.calledBy !== undefined ? 'claimed' : ''} ${d.index===lastDiscards.length-1?'latest':''} ${callState && !callState.answered && callState.options.length && d.index===callState.index?'callable':''}`)).join("")}</div></section>`;
  }).join("");
  if(renderDiscards.lastMarkup===riverMarkup)return;
  renderDiscards.lastMarkup=riverMarkup;
  // Preserve existing 3D tile elements; only append or update changed discards.
  const template=document.createElement('template');template.innerHTML=riverMarkup;
  if($("discards").children.length!==4) $("discards").replaceChildren(template.content.cloneNode(true));
  else [...template.content.children].forEach((fresh,i)=>{
    const existing=$("discards").children[i];
    const label=existing.querySelector('.river-label'),nextLabel=fresh.querySelector('.river-label');
    if(label.innerHTML!==nextLabel.innerHTML)label.innerHTML=nextLabel.innerHTML;
    const river=existing.querySelector('.river'),next=fresh.querySelector('.river');
    river.setAttribute('aria-label',next.getAttribute('aria-label'));
    while(river.children.length>next.children.length)river.lastElementChild.remove();
    [...next.children].forEach((tile,j)=>{
      const current=river.children[j];
      if(!current)river.append(tile.cloneNode(true));
      else if(current.getAttribute('aria-label')!==tile.getAttribute('aria-label'))current.replaceWith(tile.cloneNode(true));
      else if(current.className!==tile.className)current.className=tile.className;
    });
  });
  $("discards").querySelectorAll(".river").forEach(river=>{river.scrollTop=river.scrollHeight;});
}
function renderCalls() {
  const panel = $("callPanel");
  panel.classList.toggle("hidden", !waitingCall);
  if (!waitingCall) { panel.innerHTML = ""; return; }
  if (!callState?.options.length || callState.answered) {
    panel.innerHTML = '<strong>다른 플레이어의 론·부로 선택을 기다리고 있어요…</strong>';
    return;
  }
  panel.innerHTML = `<div class="call-target">${tileFace(callState.tile)}<strong>이 패에 응답할 수 있어요</strong></div><div class="call-actions">${callState.options.map(o=>`<button data-choice="${o.id}"><b>${{chi:'치',pon:'퐁',kan:'깡',ron:'론',ankan:'암깡',kakan:'가깡'}[o.type]}</b><span class="call-preview">${o.consume.map(t=>tileFace(t)).join('')}</span></button>`).join('')}<button data-choice="skip" class="skip-call">스킵</button></div>`;
  panel.querySelectorAll('button').forEach(b=>b.onclick=()=>request('game:call',{id:callState.id,choice:b.dataset.choice==='skip'?null:b.dataset.choice},res=>{if(res?.error) $("gameMessage").textContent=res.error;}));
}
function renderMelds() {
  $("melds").innerHTML = [0,1,2,3].map(offset=>{
    const seat=(Math.max(0,mySeat)+offset)%4;
    const melds=publicMelds[seat] || [];
    if(!melds.length) return '';
    return `<div class="meld-row"><strong>${winds[seat]}가${seat===mySeat?' · 나':''}</strong>${melds.map(m=>`<div class="meld-group" aria-label="${m.type==='ankan'?'멘젠':winds[m.from]+'가'}에서 ${m.type}"><small>${{chi:'치',pon:'퐁',kan:'깡',ron:'론',ankan:'암깡',kakan:'가깡'}[m.type]} · ${m.type==='ankan'?'멘젠':winds[m.from]+'가'}</small><div>${m.tiles.map(t=>tileFace(t)).join('')}</div></div>`).join('')}</div>`;
  }).join('');
}

$("tsumoButton").onclick = () => request("game:tsumo",undefined,res=>{if(res?.error)$("gameMessage").textContent=res.error;});
function renderResult(room) {
  const panel=$("roundResult"),r=room.result;
  panel.classList.toggle("hidden",!r);
  if(!r){panel.innerHTML='';return;}
  const name=seat=>escapeHtml(r.names?.[seat]||room.players[seat]?.name||`플레이어 ${seat+1}`);
  panel.innerHTML=`<h2>${r.type==='win'?'화료':r.nagashi?.length?'유국만관':'유국'}</h2>${r.type==='draw'?`<p>${escapeHtml(r.reason||'')} · ${r.nagashi?.length?'유국만관: '+r.nagashi.map(name).join(', '):'텐파이: '+((r.tenpai||[]).map(name).join(', ')||'없음')}</p>`:''}${(r.winners||[]).map(w=>`<article class="winner-result"><h3>${name(w.seat)} · ${w.method==='ron'?`론 (${name(w.from)})`:'쯔모'} · ${w.points.toLocaleString()}점</h3><p>${w.yakuman?`${w.yakuman}배 역만`:`${w.han}판 ${w.fu}부`}</p><ul>${w.yaku.map(y=>`<li>${escapeHtml(y.name)} <b>${y.yakuman?`${y.yakuman}배 역만`:`${y.han}판`}</b></li>`).join('')}</ul><div class="winning-hand">${w.hand.map(t=>tileFace(t)).join('')}${w.melds.map(m=>`<span class="result-meld">${m.tiles.map(t=>tileFace(t)).join('')}</span>`).join('')}</div></article>`).join('')}<div class="result-scores">${r.scores.map((score,i)=>`<div><strong>${name(i)}</strong><span>${score.toLocaleString()}점</span><b class="${r.deltas[i]>=0?'gain':'loss'}">${r.deltas[i]>0?'+':''}${r.deltas[i].toLocaleString()}</b></div>`).join('')}</div>${r.pot?`<p>리치 공탁금 ${r.pot.toLocaleString()}점 포함</p>`:''}${r.doraIndicators?.length?`<p>도라 표시패: ${r.doraIndicators.map(escapeHtml).join(' · ')}</p>`:''}${r.uraIndicators?.length?`<p>우라도라 표시패: ${r.uraIndicators.map(escapeHtml).join(' · ')}</p>`:''}`;
}

function renderShanten() {
  $("shantenValue").classList.toggle("hidden", !$("showShanten").checked);
  $("shantenValue").textContent = shantenValue == null ? "" : shantenValue === -1 ? "완성형" : shantenValue === 0 ? "텐파이 · 0샹텐" : `${shantenValue}샹텐`;
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
  $("turnText").textContent = roomState?.paused ? "복귀 대기" : waitingCall ? "론·부로 선택 중" : currentTurn === mySeat ? "내 차례" : `플레이어 ${currentTurn + 1} 차례`;
  $("turnText").classList.toggle("my-turn",currentTurn===mySeat && !roomState?.paused && !waitingCall);
  $("handHint").textContent = roomState?.paused ? "참가자의 재접속을 기다리고 있어요" : waitingCall ? "론·치·퐁·깡 또는 스킵을 선택하세요" : selectedHandIndex !== null ? currentTurn!==mySeat?`${myHand[selectedHandIndex]} 선택 · 내 차례에 버릴 수 있어요`:`${myHand[selectedHandIndex]} · 한 번 더 누르면 ${choosingRiichi ? "리치 선언" : "버립니다"}` : choosingRiichi ? "강조된 패를 두 번 눌러 리치하세요" : ownRiichi && currentTurn===mySeat ? "쯔모패를 두 번 눌러 버리세요" : currentTurn===mySeat ? "한 번 선택 · 다시 눌러 버리기" : "다른 플레이어의 차례입니다";
  const seatOrder = [0,1,2,3].map(offset => ({seat:(Math.max(0,mySeat)+offset)%4,position:positions[offset]}));
  $("seats").innerHTML = seatOrder.map(({seat,position}) => {
    const p=roomState?.players[seat];
    return `<div class="seat ${position} ${seat===currentTurn?'active':''} ${p && !p.connected?'offline':''}"><span class="wind-badge">${winds[seat]}</span><div><strong>${escapeHtml(p?.name || `플레이어 ${seat+1}`)}${p?.bot?' · 봇':seat===mySeat?' · 나':''}</strong><small>${p && !p.connected?'연결 끊김':p?.riichi?'리치':seat===mySeat?'내 자리':''}</small></div></div>`;
  }).join("");
  $("centerScores").innerHTML = seatOrder.map(({seat,position}) => {
    const p=roomState?.players[seat];
    const active=seat===currentTurn&&!roomState?.paused;
    return `<div class="center-score ${position} ${active?'active':''}" data-seat="${seat}" ${active?'aria-current="true"':''} aria-label="${winds[seat]}가 ${escapeHtml(p?.name||'')} ${(p?.score??25000).toLocaleString()}점${active?' 현재 차례':''}"><span class="score-wind">${winds[seat]}</span><b>${(p?.score??25000).toLocaleString()}</b>${p?.riichi?'<i class="score-riichi" title="리치"></i>':''}</div>`;
  }).join("");
  $("centerTurn").textContent=roomState?.paused?'복귀 대기':waitingCall?'론·부로 선택':`${winds[currentTurn]} 차례`;
  $("centerTurn").classList.toggle("is-mine",currentTurn===mySeat&&!waitingCall&&!roomState?.paused);
  $("centerBoard").classList.toggle("is-paused",Boolean(roomState?.paused));
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


function animateDiscard(discard) {
  const origin = discard.seat === mySeat ? discardOrigin : null;
  discardOrigin = null;
  if (!window.requestAnimationFrame || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  requestAnimationFrame(() => {
    const offset = (discard.seat - mySeat + 4) % 4;
    const target = document.querySelector(`.river.${positions[offset]} .tile:last-child`);
    if (!target || typeof target.animate !== 'function') return;
    const end = (target.querySelector('img') || target).getBoundingClientRect();
    const seat = document.querySelector(`.seat.${positions[offset]}`);
    const start = origin || seat?.getBoundingClientRect() || end;
    const ghost = document.createElement('div');
    ghost.className = 'discard-flight';
    ghost.innerHTML = tileFace(discard.tile);
    const rotation = [0,-90,180,90][offset];
    const w = offset % 2 ? end.height : end.width;
    const h = offset % 2 ? end.width : end.height;
    Object.assign(ghost.style,{left:`${end.x+end.width/2}px`,top:`${end.y+end.height/2}px`,width:`${w}px`,height:`${h}px`});
    document.body.append(ghost);
    const dx=start.x+start.width/2-end.x-end.width/2;
    const dy=start.y+start.height/2-end.y-end.height/2;
    const animation=ghost.animate([
      {transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${rotation}deg) scale(1.15)`,opacity:1},
      {transform:`translate(-50%,-50%) translate(${dx*.3}px,${dy*.3-12}px) rotate(${rotation}deg) scale(1.08)`,offset:.65,opacity:1},
      {transform:`translate(-50%,-50%) rotate(${rotation}deg) scale(1)`,opacity:1}
    ],{duration:280,easing:'cubic-bezier(.2,.65,.3,1)'});
    target.animate([{opacity:0},{opacity:0,offset:.8},{opacity:1}],{duration:280});
    animation.finished.catch(()=>{}).finally(()=>ghost.remove());
  });
}


function hideWaitPreview(){
  $("waitPreview").classList.add("hidden");
  $("waitButton").setAttribute("aria-expanded","false");
}
function showWaitPreview(){
  if($("waitButton").classList.contains("hidden")||!ready||!roomState?.started)return;
  $("waitPreview").classList.remove("hidden");
  $("waitButton").setAttribute("aria-expanded","true");
}
$("waitButton").addEventListener('pointerdown',e=>{e.preventDefault();$("waitButton").setPointerCapture?.(e.pointerId);showWaitPreview();});
for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])$("waitButton").addEventListener(event,hideWaitPreview);
$("waitButton").addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();showWaitPreview();}});
$("waitButton").addEventListener('keyup',hideWaitPreview);
$("waitButton").addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',hideWaitPreview);
document.addEventListener('visibilitychange',hideWaitPreview);
socket.on('disconnect',hideWaitPreview);


function renderWaitYaku(guide){
 if(!guide)return '';
 const value=y=>y?.yakuman?`${y.yakuman}배 역만`:`${y?.han||0}판`;
 const list=(entries,kind)=>entries.length?entries.map(y=>`<span class="yaku-${kind}" title="${escapeHtml(y.condition||'모든 대기패의 일반 론·쯔모에서 성립')}">${escapeHtml(y.name)} <b>${value(y)}</b>${y.condition?`<small>${escapeHtml(y.condition)}</small>`:''}</span>`).join(''):'<span class="yaku-possible">없음</span>';
 return `<div class="wait-yaku">${guide.afterDraw?'<p>쯔모패를 버리고 현재 대기를 유지할 경우</p>':''}<strong>확정 역</strong><div>${list(guide.guaranteed,'guaranteed')}</div><strong>가능 역</strong><div>${list(guide.possible,'possible')}</div><p>${guide.totals.map(t=>`${escapeHtml(t.tile)}: 론 ${t.ron?.han||t.ron?.yakuman?value(t.ron):'역 없음'} · 쯔모 ${t.tsumo?.han||t.tsumo?.yakuman?value(t.tsumo):'역 없음'}`).join('<br>')}</p><small>현재 대기형의 일반 화료 기준 · 도라·우라도라·특수상황 역은 합계 제외<br>후리텐이면 론 불가. 가능한 역은 조건 충족 시에만 추가됩니다.</small></div>`;
}


// The original YouTube player handles playback and attribution.
$("musicButton").onclick = () => {
  const player=$("musicPlayer"), enabled=$("musicButton").getAttribute("aria-pressed") !== "true";
  $("musicButton").setAttribute("aria-pressed",String(enabled));
  $("musicButton").textContent=enabled?"음악 끄기":"음악 켜기";
  document.body.append(player);
  document.body.classList.toggle("music-on",enabled);
  player.classList.toggle("hidden",!enabled);
  if(enabled){
    const frame=document.createElement("iframe");
    frame.src="https://www.youtube-nocookie.com/embed/bRU2AwnJoLo?autoplay=1&playsinline=1&loop=1&playlist=bRU2AwnJoLo";
    frame.title="배경 음악 YouTube 플레이어";
    frame.allow="autoplay; encrypted-media; picture-in-picture";
    frame.allowFullscreen=true;
    player.replaceChildren(frame);
  } else player.replaceChildren();
};
