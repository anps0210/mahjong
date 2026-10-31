const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const path = require("path");
const { chooseDiscard } = require("./bot");
const { openWindow, winner, applyCall } = require("./calls");
const { riichiDiscards, declareRiichi, handShanten } = require("./riichi");
const {evaluateWin,settleWins,endDraw,isFuriten,indicators}=require("./scoring");
const kongs=require("./kongs");

function createGameServer({ reconnectGraceMs = 5 * 60 * 1000, botDelayMs = 900, dealWall = null } = {}) {
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
      score: 25000,
      hand: []
    };
  }

  function assignHost(room) {
    if (!room.players.some(p => p.id === room.hostId && p.connected && !p.bot)) {
      room.hostId = room.players.find(p => p.connected && !p.bot)?.id || room.hostId;
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
    resolveCalls(room);
    sendAllPrivateStates(room);
    sendRoom(room);
    scheduleBot(room);
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
      result: room.result || null,
      doraIndicators: indicators(room),
      riichiPot: room.riichiPot || 0,
      waiting: Boolean(room.pendingCall),
      turn: room.turn,
      players: room.players.map((p, seat) => ({
        name: p.name,
        seat,
        wind: WINDS[seat],
        host: p.id === room.hostId,
        score: p.score ?? 25000,
        riichi: Boolean(p.riichi),
        melds: p.melds || [],
        bot: Boolean(p.bot),
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
      canTsumo: Boolean(room.started && !room.pendingCall && room.turn===seat && evaluateWin(room,seat,{tile:player.drawn})),
      kanOptions: kongs.options(room,seat),
      furiten: room.started ? isFuriten(room,seat) : false,
      hand: player.hand,
      riichi: Boolean(player.riichi),
      riichiDiscards: riichiDiscards(room,seat),
      shanten: handShanten(player),
      drawn: player.drawn || null,
      waiting: Boolean(room.pendingCall),
      banned: player.banned || [],
      melds: room.players.map(p => p.melds || []),
      call: room.pendingCall ? { id:room.pendingCall.id, tile:room.pendingCall.tile, from:room.pendingCall.from, index:room.pendingCall.index, answered:Object.hasOwn(room.pendingCall.responses,seat), options:room.pendingCall.offers[seat] || [] } : null,
      turn: room.turn,
      wallCount: room.wall.length,
      mySeat: seat,
      discards: room.discards,
      lastDiscard: room.discards[room.discards.length - 1] || null
    });
  }

  function sendAllPrivateStates(room) {
    room.players.forEach(player => {
      if (player.connected && !player.bot) privateState(room, player.socketId);
    });
  }

  function startGame(room) {
    const shuffled = dealWall ? dealWall() : makeWall();

    // 왕패: 영상패 4장과 도라·우라도라 표시패 각 5장.
    room.deadWall = shuffled.slice(0, 14);
    room.wall = shuffled.slice(14); // 배패 전 122장, 4인 배패 후 70장

    room.doraIndicators=[4,6,8,10,12].map(i=>room.deadWall[i]);
    room.uraIndicators=[5,7,9,11,13].map(i=>room.deadWall[i]);
    room.result=null;
    room.interrupted=false;
    room.discards = [];
    room.pendingCall = null;
    room.kanCount = 0;
    room.turn = 0;
    room.started = true;
    room.message = "동가부터 시작합니다. 내 차례에 패를 선택해 버리세요.";

    room.players.forEach(player => {
      player.hand = room.wall.splice(0, 13);
      player.melds = [];
      player.banned = [];
      player.drawn = null;
      player.riichi = false;
      player.doubleRiichi=false;player.ippatsu=false;player.rinshan=false;
      player.temporaryFuriten=false;player.riichiFuriten=false;
      player.score ??= 25000;
    });

    // 동가는 처음부터 14장. 방장 승계는 좌석 순서를 바꾸지 않는다.
    room.players[0].drawn = room.wall.pop();
    room.players[0].hand.push(room.players[0].drawn);

    sendAllPrivateStates(room);
    sendRoom(room);
    io.to(room.code).emit("game:message", "동가부터 시작합니다. 내 차례에 패를 선택해 버리세요.");
    scheduleBot(room);
  }

  function discard(room, seat, tile, riichiDeclaration = false) {
    const player = room.players[seat];
    const tileIndex = player.riichi && !riichiDeclaration ? player.hand.length - 1 : player.hand.indexOf(tile);
    player.hand.splice(tileIndex, 1);
    room.discards.push({ tile, seat, riichi: riichiDeclaration });

    room.lastDiscardRinshan=Boolean(player.rinshan);
    player.rinshan=false;
    if(!riichiDeclaration)player.ippatsu=false;
    player.drawn = null;
    player.banned = [];
    room.pendingCall = openWindow(room, seat, tile);
    if (room.pendingCall) {
      // Bots accept legal ron, otherwise retain their closed-hand strategy.
      for (const key of Object.keys(room.pendingCall.offers)) {
        if (room.players[key].bot) room.pendingCall.responses[key] = room.pendingCall.offers[key].some(o=>o.type==="ron") ? "ron" : null;
      }
      resolveCalls(room);
    } else advance(room, seat);

    sendAllPrivateStates(room);
    io.to(room.code).emit("game:discarded", {
      tile,
      seat,
      turn: room.turn,
      discards: room.discards
    });
    sendRoom(room);
    scheduleBot(room);
  }

  function advance(room, from) {
    if (!room.wall.length) {
      endDraw(room);
      return;
    }
    room.turn = (from + 1) % 4;
    const p = room.players[room.turn];
    p.temporaryFuriten=false;p.rinshan=false;
    p.drawn = room.wall.pop();
    p.hand.push(p.drawn);
  }

  function resolveCalls(room) {
    const w = room.pendingCall;
    if (!w || room.players.some(p => !p.connected) || Object.keys(w.offers).some(seat => !Object.hasOwn(w.responses,seat))) return;
    const rons=Object.keys(w.responses).map(Number).filter(seat=>w.responses[seat]==='ron').sort((a,b)=>(a-w.from+4)%4-(b-w.from+4)%4);
    if(rons.length===3){endDraw(room,'삼가화 (3인 론)');return;}
    if(rons.length){
      if(settleWins(room,rons,{tile:w.tile,from:w.from,robKan:w.kind==='kan',robAnkan:w.kanOption?.type==='ankan'})) {
        if(w.kind==='kan')room.players[w.from].hand.splice(room.players[w.from].hand.indexOf(w.tile),1);
        return;
      }
    }
    if(w.kind==='kan')kongs.apply(room,w.from,w.kanOption);
    else {
      const selected = winner(w);
      if (selected) {
        applyCall(room,w,selected);
        room.message = `${room.players[selected.seat].name}: ${{chi:'치',pon:'퐁',kan:'깡'}[selected.option.type]}`;
      } else advance(room,w.from);
    }
    room.pendingCall = null;
  }

  function scheduleBot(room) {
    clearTimeout(room.botTimer);
    if (!room.started || room.pendingCall || room.players.some(p => !p.connected) || !room.players[room.turn]?.bot) return;
    room.botTimer = setTimeout(() => {
      if (rooms.get(room.code) !== room || !room.started || room.pendingCall || room.players.some(p => !p.connected)) return;
      const player = room.players[room.turn];
      if (!player?.bot || player.hand.length !== 14 - 3 * (player.melds?.length || 0)) return;
      if(evaluateWin(room,room.turn,{tile:player.drawn})){
        settleWins(room,[room.turn],{tile:player.drawn});sendAllPrivateStates(room);sendRoom(room);return;
      }
      const candidates = riichiDiscards(room,room.turn);
      const tile = player.riichi ? player.drawn : candidates[0] || chooseDiscard(player.hand, room.discards);
      const declared = !player.riichi && candidates.length > 0 && declareRiichi(room,room.turn,tile);
      discard(room, room.turn, tile, Boolean(declared));
    }, botDelayMs);
    room.botTimer.unref();
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

    socket.on("room:bots", ({ fill } = {}, callback) => {
      const room = rooms.get(socket.data.room);
      if (!room || !room.players.some(p => p.id === room.hostId && p.socketId === socket.id)) return callback?.({ ok:false, error:"방장만 봇을 설정할 수 있어." });
      if (room.started) return callback?.({ ok:false, error:"대기실에서만 봇을 설정할 수 있어." });
      if (fill === true) {
        while (room.players.length < 4) room.players.push({ id:randomUUID(), bot:true, name:`연습봇 ${room.players.length}`, connected:true, score:25000, hand:[] });
      } else if (fill === false) {
        room.players = room.players.filter(p => !p.bot);
      } else return callback?.({ok:false,error:"봇 설정을 확인해 줘."});
      sendAllPrivateStates(room);
      sendRoom(room);
      callback?.({ok:true});
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

    socket.on("game:call", ({ id, choice } = {}, callback) => {
      const room = rooms.get(socket.data.room);
      const seat = room?.players.findIndex(p => p.socketId === socket.id);
      const w = room?.pendingCall;
      if (!w || w.id !== id || !w.offers[seat] || Object.hasOwn(w.responses,seat)) return callback?.({ok:false,error:"선택할 수 있는 부로가 없거나 이미 응답했어요."});
      if (room.players.some(p => !p.connected)) return callback?.({ok:false,error:"재접속을 기다리고 있어요."});
      if (choice !== null && !w.offers[seat].some(o => o.id === choice)) return callback?.({ok:false,error:"가능하지 않은 부로입니다."});
      if(w.offers[seat].some(o=>o.type==="ron") && choice!=="ron"){
        if(room.players[seat].riichi)room.players[seat].riichiFuriten=true;
        else room.players[seat].temporaryFuriten=true;
      }
      w.responses[seat] = choice;
      resolveCalls(room);
      sendAllPrivateStates(room);
      sendRoom(room);
      scheduleBot(room);
      callback?.({ok:true});
    });

    socket.on("game:tsumo", callback => {
      const room=rooms.get(socket.data.room);
      const seat=room?.players.findIndex(p=>p.socketId===socket.id);
      if(!room?.started || room.pendingCall || seat!==room.turn || room.players.some(p=>!p.connected))return callback?.({ok:false,error:"지금은 쯔모할 수 없어요."});
      if(!settleWins(room,[seat],{tile:room.players[seat].drawn}))return callback?.({ok:false,error:"완성형과 역이 필요합니다."});
      clearTimeout(room.botTimer);sendAllPrivateStates(room);sendRoom(room);callback?.({ok:true});
    });

    socket.on("game:kan", ({id}={}, callback) => {
      const room=rooms.get(socket.data.room);
      const seat=room?.players.findIndex(p=>p.socketId===socket.id);
      if(!room || seat<0 || room.players.some(p=>!p.connected))return callback?.({ok:false,error:"지금은 깡할 수 없어요."});
      const option=kongs.options(room,seat).find(o=>o.id===id);
      if(!option)return callback?.({ok:false,error:"가능한 깡을 선택해 주세요."});
      const offers={};
      room.players.forEach((p,i)=>{
        if(i!==seat && evaluateWin(room,i,{tile:option.tile,from:seat,robKan:true,robAnkan:option.type==='ankan'}))offers[i]=[{id:'ron',type:'ron',consume:[],banned:[]}];
      });
      if(Object.keys(offers).length){
        room.pendingCall={id:randomUUID(),kind:'kan',from:seat,tile:option.tile,kanOption:option,index:-1,offers,responses:{}};
        for(const key of Object.keys(offers))if(room.players[key].bot)room.pendingCall.responses[key]='ron';
        resolveCalls(room);
      }else kongs.apply(room,seat,option);
      sendAllPrivateStates(room);sendRoom(room);scheduleBot(room);callback?.({ok:true});
    });

    socket.on("game:discard", ({ tile, riichi = false } = {}, callback) => {
      const room = rooms.get(socket.data.room);
      if (!room || !room.started) {
        return callback?.({ ok: false, error: "진행 중인 게임이 없어." });
      }

      const seat = room.players.findIndex(p => p.socketId === socket.id);
      if (seat < 0) return callback?.({ ok: false, error: "참가자를 확인할 수 없어." });
      if (room.players.some(p => !p.connected)) return callback?.({ ok: false, error: "연결이 끊긴 참가자의 복귀를 기다리고 있어." });
      if (room.pendingCall) return callback?.({ok:false,error:"부로 선택을 기다리고 있어요."});
      if (seat !== room.turn) return callback?.({ ok: false, error: "아직 네 차례가 아니야." });

      const player = room.players[seat];
      if (player.hand.length !== 14 - 3 * (player.melds?.length || 0)) {
        return callback?.({ ok: false, error: "패를 뽑은 뒤 버릴 수 있어." });
      }

      if (player.banned?.includes(tile)) return callback?.({ok:false,error:"울기 직후에는 이 패를 버릴 수 없어요 (쿠이카에)."});
      const tileIndex = player.hand.indexOf(tile);
      if (tileIndex < 0) {
        return callback?.({ ok: false, error: "해당 패를 손패에서 찾을 수 없어." });
      }

      if (player.riichi && tile !== player.drawn) return callback?.({ok:false,error:"리치 후에는 방금 뽑은 패만 버릴 수 있어요."});
      if (riichi !== false && riichi !== true) return callback?.({ok:false,error:"리치 요청을 확인해 주세요."});
      if (riichi && !declareRiichi(room,seat,tile)) return callback?.({ok:false,error:"멘젠 텐파이·1,000점 이상·남은 패 4장 이상일 때 리치할 수 있어요."});
      discard(room, seat, tile, riichi);
      callback?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.room;
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;
      player.connected = false;
      clearTimeout(room.botTimer);
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
      if (room.players.every(p => p.bot || !p.connected)) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = setTimeout(() => {
          if (rooms.get(roomCode) === room && room.players.every(p => p.bot || !p.connected)) {
            room.players.forEach(p => clearTimeout(p.expiryTimer));
            clearTimeout(room.botTimer);
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
          clearTimeout(room.botTimer);
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
