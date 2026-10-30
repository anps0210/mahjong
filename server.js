const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const path = require("path");

function createGameServer({ reconnectGraceMs = 5 * 60 * 1000 } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const rooms = new Map();

  app.use(express.static(path.join(__dirname, "public")));

  function makePlayer(socket, name) {
    return {
      id: randomUUID(),
      token: randomUUID(),
      socketId: socket.id,
      name: String(name || "플레이어").slice(0, 12),
      connected: true,
      hand: []
    };
  }

  function assignHost(room) {
    if (!room.players.some(p => p.id === room.hostId && p.connected)) {
      room.hostId = room.players.find(p => p.connected)?.id || room.hostId;
    }
  }

  function attach(socket, room, player, callback) {
    clearTimeout(room.cleanupTimer);
    clearTimeout(player.expiryTimer);
    player.socketId = socket.id;
    player.connected = true;
    socket.join(room.code);
    socket.data.room = room.code;
    assignHost(room);
    callback?.({ ok: true, code: room.code, token: player.token });
    // Send identity and a complete snapshot before the public room update.
    sendAllPrivateStates(room);
    sendRoom(room);
  }

  function alreadyJoined(socket, callback) {
    if (!socket.data.room) return false;
    callback?.({ ok: false, error: "이미 방에 참가 중이야." });
    return true;
  }

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
      paused: room.started && room.players.some(p => !p.connected),
      message: room.message || "",
      turn: room.turn,
      players: room.players.map((p, seat) => ({
        name: p.name,
        seat,
        wind: WINDS[seat],
        host: p.id === room.hostId,
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
    const seat = room.players.findIndex(p => p.socketId === socketId);
    if (seat < 0) return;
    const player = room.players[seat];

    io.to(socketId).emit("game:private", {
      hand: player.hand,
      drawn: null,
      turn: room.turn,
      wallCount: room.wall.length,
      mySeat: seat,
      discards: room.discards,
      lastDiscard: room.discards[room.discards.length - 1] || null
    });
  }

  function sendAllPrivateStates(room) {
    room.players.forEach(player => {
      if (player.connected) privateState(room, player.socketId);
    });
  }

  function startGame(room) {
    const shuffled = makeWall();

    // 왕패 14장은 별도 보존. 깡/도라 구현 단계에서 사용한다.
    room.deadWall = shuffled.slice(0, 14);
    room.wall = shuffled.slice(14); // 배패 전 122장, 4인 배패 후 70장

    room.discards = [];
    room.turn = 0;
    room.started = true;
    room.message = "동가부터 시작합니다. 내 차례에 패를 선택해 버리세요.";

    room.players.forEach(player => {
      player.hand = room.wall.splice(0, 13);
    });

    // 동가는 처음부터 14장. 방장 승계는 좌석 순서를 바꾸지 않는다.
    room.players[0].hand.push(room.wall.pop());

    sendAllPrivateStates(room);
    sendRoom(room);
    io.to(room.code).emit("game:message", "동가부터 시작합니다. 내 차례에 패를 선택해 버리세요.");
  }

  io.on("connection", socket => {
    socket.on("room:create", ({ name } = {}, callback) => {
      if (alreadyJoined(socket, callback)) return;
      const code = makeCode();
      const player = makePlayer(socket, name);
      const room = {
        code,
        players: [player],
        hostId: player.id,
        started: false,
        turn: 0,
        wall: [],
        deadWall: [],
        discards: []
      };

      rooms.set(code, room);
      attach(socket, room, player, callback);
    });

    socket.on("room:join", ({ code, name } = {}, callback) => {
      if (alreadyJoined(socket, callback)) return;
      const roomCode = String(code || "").toUpperCase().trim();
      const room = rooms.get(roomCode);

      if (!room) return callback?.({ ok: false, error: "존재하지 않는 방 코드야." });
      if (room.started) return callback?.({ ok: false, error: "이미 게임이 시작된 방이야." });
      if (room.players.length >= 4) return callback?.({ ok: false, error: "방이 가득 찼어." });

      const player = makePlayer(socket, name);
      room.players.push(player);

      attach(socket, room, player, callback);
    });

    socket.on("room:resume", ({ code, token } = {}, callback) => {
      if (alreadyJoined(socket, callback)) return;
      const room = rooms.get(String(code || "").toUpperCase().trim());
      const player = room?.players.find(p => typeof token === "string" && p.token === token);
      if (!player) return callback?.({ ok: false, error: "복구할 참가 정보가 없거나 만료됐어. 방에 다시 참가해 줘." });

      // A refreshed page may reconnect before the old transport times out.
      // Revoke the old socket before assigning this seat to the new connection.
      const previous = io.sockets.sockets.get(player.socketId);
      if (previous && previous.id !== socket.id) {
        previous.data.room = null;
        previous.emit("session:replaced");
        previous.disconnect(true);
      }
      attach(socket, room, player, callback);
    });

    socket.on("game:start", callback => {
      const room = rooms.get(socket.data.room);

      if (!room) return callback?.({ ok: false, error: "방을 찾을 수 없어." });
      if (!room.players.some(p => p.id === room.hostId && p.socketId === socket.id)) return callback?.({ ok: false, error: "방장만 시작할 수 있어." });
      if (room.players.length !== 4 || room.players.some(p => !p.connected)) return callback?.({ ok: false, error: "게임을 시작하려면 4명 모두 접속해야 해." });
      if (room.started) return callback?.({ ok: false, error: "이미 시작된 게임이야." });

      startGame(room);
      callback?.({ ok: true });
    });

    socket.on("game:discard", ({ tile } = {}, callback) => {
      const room = rooms.get(socket.data.room);
      if (!room || !room.started) {
        return callback?.({ ok: false, error: "진행 중인 게임이 없어." });
      }

      const seat = room.players.findIndex(p => p.socketId === socket.id);
      if (seat < 0) return callback?.({ ok: false, error: "참가자를 확인할 수 없어." });
      if (room.players.some(p => !p.connected)) return callback?.({ ok: false, error: "연결이 끊긴 참가자의 복귀를 기다리고 있어." });
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
        room.message = "패산이 모두 소진됐어. 이번 국은 유국 처리야. 방장이 다음 게임을 시작할 수 있어.";
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
        discards: room.discards
      });
      sendRoom(room);
      callback?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.room;
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;
      player.connected = false;
      assignHost(room);

      // Reserve lobby seats briefly; never remove a seat during a live game.
      player.expiryTimer = setTimeout(() => {
        if (rooms.get(roomCode) !== room || player.connected || room.started) return;
        room.players = room.players.filter(p => p !== player);
        assignHost(room);
        sendAllPrivateStates(room);
        sendRoom(room);
      }, reconnectGraceMs);
      player.expiryTimer.unref();

      sendRoom(room);
      if (room.players.every(p => !p.connected)) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = setTimeout(() => {
          if (rooms.get(roomCode) === room && room.players.every(p => !p.connected)) {
            room.players.forEach(p => clearTimeout(p.expiryTimer));
            rooms.delete(roomCode);
          }
        }, reconnectGraceMs);
        room.cleanupTimer.unref();
      }
    });
  });

  return {
    server,
    close: () => new Promise(resolve => {
      io.close(() => {
        for (const room of rooms.values()) {
          clearTimeout(room.cleanupTimer);
          room.players.forEach(p => clearTimeout(p.expiryTimer));
        }
        resolve();
      });
    })
  };
}

if (require.main === module) {
  const { server } = createGameServer();
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Mahjong Room running on port ${port}`));
}

module.exports = { createGameServer };
