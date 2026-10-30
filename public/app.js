
const socket = io();

const $ = id => document.getElementById(id);

let roomCode = null;
let myHand = [];
let mySeat = -1;
let currentTurn = 0;
let lastDiscards = [];

const show = id => {
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
  socket.emit("room:create", { name: name() }, res => {
    if (!res?.ok)
      return err("homeError", "방 생성에 실패했어.");

    roomCode = res.code;
    show("lobby");
    $("code").textContent = res.code;
  });
};

$("join").onclick = () => {
  socket.emit("room:join", {
    name: name(),
    code: $("roomcode").value
  }, res => {
    if (!res?.ok)
      return err("homeError", res?.error || "입장 실패");

    roomCode = res.code;
    show("lobby");
    $("code").textContent = res.code;
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

$("start").onclick = () => {
  socket.emit("game:start", res =>
    err("lobbyError", res?.error || "")
  );
};

socket.on("room:update", room => {
  if (room.code !== roomCode) return;

  $("count").textContent =
    `${room.players.length}/4`;

  $("players").innerHTML = room.players.map((p, i) =>
    `<div class="player">
      <strong>${escapeHtml(p.name)} ${p.host ? "👑" : ""}</strong>
      <small>${p.connected ? "접속 중" : "연결 끊김"}</small>
    </div>`
  ).join("");

  $("start").disabled =
    room.players.length !== 4 || room.started;

  if (room.started) {
    show("game");
    $("gameCode").textContent = room.code;
  }
});

socket.on("game:private", s => {
  myHand = s.hand;
  mySeat = s.mySeat;
  currentTurn = s.turn;

  $("wall").textContent =
    `남은 패 ${s.wallCount}개`;

  renderHand();
  renderTurn();
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

function renderHand() {
  $("hand").innerHTML = myHand.map((tile, i) =>
    `<button aria-label="${tile} 버리기" data-i="${i}">
      <span class="tile">${tile}</span>
    </button>`
  ).join("");

  $("hand").querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      const tile = myHand[Number(b.dataset.i)];

      socket.emit("game:discard", { tile }, res => {
        if (res?.error)
          $("gameMessage").textContent = res.error;
      });
    };
  });
}

function renderDiscards() {
  $("discards").innerHTML = lastDiscards.map(d =>
    `<span class="tile">${d.tile}</span>`
  ).join("");
}

function renderTurn() {
  $("turnText").textContent =
    currentTurn === mySeat
      ? "내 차례"
      : `플레이어 ${currentTurn + 1} 차례`;

  $("seats").innerHTML = [0, 1, 2, 3].map(i =>
    `<div class="seat ${i === currentTurn ? "active" : ""}">
      ${["동", "남", "서", "북"][i]}가 ·
      ${i === currentTurn ? "진행 중" : "대기"}
    </div>`
  ).join("");
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
  err("homeError", "서버에 연결할 수 없어.");
});
