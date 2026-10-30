const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static("public"));

const WINDS = ["동", "남", "서", "북"];

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function shuffle(tiles) {
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

// 34종 × 4장 = 136장
function makeWall() {
  const tiles = [];
  for (const suit of ["만", "통", "삭"]) {
    for (let n = 1; n <= 9; n++) {
      for (let copy = 0; copy < 4; copy++) tiles.push(`${n}${suit}`);
    }
  }
  for (const honor of ["동", "남", "서", "북", "백", "발", "중"]) {
    for (let copy = 0; copy < 4; copy++) tiles.push(honor);
  }
  return shuffle(tiles);
}

function publicRoom(room) {
  return {
    code: room.code,
    started: room.started,
    turn: room.turn,
    players: room.players.map((p, seat) => ({
      name: p.name,
      seat,
      wind: WINDS[seat],
      host: seat === 0,
      connected: p.connected
    })),
    wallCount: room.wall.length
  };
}

function sendRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

// 손패는 해당 플레이어의 소켓에만 보낸다.
function privateState(room, socketId) {
  const seat = room.players.findIndex(p => p.id === socketId);
  if (seat < 0) return;
  const player = room.players[seat];

  io.to(socketId).emit("game:private", {
    hand: player.hand,
    drawn: null,
    turn: room.turn,
    wallCount: room.wall.length,
    mySeat: seat,
    lastDiscard: room.discards[room.discards.length - 1] || null
  });
}

function sendAllPrivateStates(room) {
  room.players.forEach(player => {
    if (player.connected) privateState(room, player.id);
  });
}

function startGame(room) {
  const shuffled = makeWall();

  // 왕패 14장은 별도 보존. 깡/도라 구현 단계에서 사용한다.
  room.deadWall = shuffled.slice(0, 14);
  room.wall = shuffled.slice(14); // 실제 라이브 월 70장

  room.discards = [];
  room.turn = 0;
  room.started = true;

  room.players.forEach(player => {
    player.hand = room.wall.splice(0, 13);
  });

  // 동가(방장)는 처음부터 14장.
  room.players[0].hand.push(room.wall.pop());

  sendAllPrivateStates(room);
  sendRoom(room);
  io.to(room.code).emit("game:message", "동가부터 시작합니다. 내 차례에 패를 선택해 버리세요.");
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, callback) => {
    const code = makeCode();
    const room = {
      code,
      players: [{
        id: socket.id,
        name: String(name || "플레이어").slice(0, 12),
        connected: true,
        hand: []
      }],
      started: false,
      turn: 0,
      wall: [],
      deadWall: [],
      discards: []
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    callback?.({ ok: true, code });
    sendRoom(room);
  });

  socket.on("room:join", ({ code, name } = {}, callback) => {
    const roomCode = String(code || "").toUpperCase().trim();
    const room = rooms.get(roomCode);

    if (!room) return callback?.({ ok: false, error: "존재하지 않는 방 코드야." });
    if (room.started) return callback?.({ ok: false, error: "이미 게임이 시작된 방이야." });
    if (room.players.length >= 4) return callback?.({ ok: false, error: "방이 가득 찼어." });

    room.players.push({
      id: socket.id,
      name: String(name || "플레이어").slice(0, 12),
      connected: true,
      hand: []
    });

    socket.join(roomCode);
    socket.data.room = roomCode;
    callback?.({ ok: true, code: roomCode });
    sendRoom(room);
  });

  socket.on("game:start", callback => {
    const room = rooms.get(socket.data.room);

    if (!room) return callback?.({ ok: false, error: "방을 찾을 수 없어." });
    if (room.players[0].id !== socket.id) return callback?.({ ok: false, error: "방장만 시작할 수 있어." });
    if (room.players.length !== 4) return callback?.({ ok: false, error: "게임을 시작하려면 4명이 필요해." });
    if (room.started) return callback?.({ ok: false, error: "이미 시작된 게임이야." });

    startGame(room);
    callback?.({ ok: true });
  });

  socket.on("game:discard", ({ tile } = {}, callback) => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.started) {
      return callback?.({ ok: false, error: "진행 중인 게임이 없어." });
    }

    const seat = room.players.findIndex(p => p.id === socket.id);
    if (seat < 0) return callback?.({ ok: false, error: "참가자를 확인할 수 없어." });
    if (seat !== room.turn) return callback?.({ ok: false, error: "아직 네 차례가 아니야." });

    const player = room.players[seat];
    if (player.hand.length !== 14) {
      return callback?.({ ok: false, error: "패를 뽑은 뒤 버릴 수 있어." });
    }

    const tileIndex = player.hand.indexOf(tile);
    if (tileIndex < 0) {
      return callback?.({ ok: false, error: "해당 패를 손패에서 찾을 수 없어." });
    }

    player.hand.splice(tileIndex, 1);
    room.discards.push({ tile, seat });

    const nextSeat = (seat + 1) % 4;

    if (room.wall.length === 0) {
      room.started = false;
      io.to(room.code).emit("game:message", "패산이 모두 소진됐어. 이번 국은 유국 처리야.");
    } else {
      room.turn = nextSeat;
      room.players[nextSeat].hand.push(room.wall.pop());
    }

    sendAllPrivateStates(room);
    io.to(room.code).emit("game:discarded", {
      tile,
      seat,
      turn: room.turn,
      discards: room.discards.slice(-16)
    });
    sendRoom(room);
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.room;
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.connected = false;

    sendRoom(room);
    if (room.players.every(p => !p.connected)) rooms.delete(roomCode);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Mahjong Room running on port ${port}`);
});
