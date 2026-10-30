const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { createGameServer } = require("../server");

function event(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out: ${name}`));
    }, 3000);
    function listener(data) {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(data);
    }
    socket.on(name, listener);
  });
}

function call(socket, name, data) {
  return new Promise((resolve, reject) => {
    const callback = (error, result) => error ? reject(error) : resolve(result);
    if (data === undefined) socket.timeout(2000).emit(name, callback);
    else socket.timeout(2000).emit(name, data, callback);
  });
}

async function setup(t, options) {
  const game = createGameServer(options);
  await new Promise(resolve => game.server.listen(0, "127.0.0.1", resolve));
  const sockets = [];
  t.after(async () => {
    sockets.forEach(s => s.disconnect());
    await game.close();
  });
  const url = `http://127.0.0.1:${game.server.address().port}`;
  async function connect() {
    const socket = io(url, { autoConnect: false, reconnection: false });
    sockets.push(socket);
    socket.on("game:private", state => { socket.state = state; });
    socket.on("room:update", room => { socket.room = room; });
    const connected = event(socket, "connect");
    socket.connect();
    await connected;
    return socket;
  }
  async function join(socket, name, data) {
    const updated = event(socket, "room:update");
    const result = await call(socket, name, data);
    assert.equal(result.ok, true);
    await updated;
    return result;
  }
  async function fourPlayers() {
    const players = [];
    const sessions = [];
    for (let i = 0; i < 4; i++) {
      const socket = await connect();
      players.push(socket);
      sessions.push(await join(socket, i ? "room:join" : "room:create", {
        name: `Player ${i}`, code: sessions[0]?.code
      }));
    }
    return { players, sessions };
  }
  async function start(players) {
    const updates = players.map(s => event(s, "room:update", r => r.started));
    assert.equal((await call(players[0], "game:start")).ok, true);
    await Promise.all(updates);
  }
  return { connect, join, fourPlayers, start, url };
}

test("reconnect preserves seat, hand, wall, turn and all discards; play continues", async t => {
  const { connect, join, fourPlayers, start } = await setup(t);
  const { players, sessions } = await fourPlayers();
  await start(players);
  // More than 16 discards verifies restoration is not a truncated event history.
  for (let turn = 0; turn < 20; turn++) {
    const player = players[turn % 4];
    const states = players.map(s => event(s, "game:private", state => state.discards.length === turn + 1));
    assert.equal((await call(player, "game:discard", { tile: player.state.hand[0] })).ok, true);
    await Promise.all(states);
  }
  const before = structuredClone(players[0].state);
  const paused = event(players[1], "room:update", r => r.paused);
  players[0].disconnect();
  await paused;
  const resumed = await connect();
  await join(resumed, "room:resume", sessions[0]);
  assert.deepEqual(resumed.state, before);
  assert.equal(resumed.room.players.length, 4);
  assert.equal(resumed.room.paused, false);
  assert.equal((await call(resumed, "game:discard", { tile: before.hand[0] })).ok, true);
});

test("missing participant pauses mutations and only a valid token can resume", async t => {
  const { connect, join, fourPlayers, start } = await setup(t);
  const { players, sessions } = await fourPlayers();
  await start(players);
  const before = structuredClone(players[0].state);
  const paused = event(players[0], "room:update", r => r.paused);
  players[1].disconnect();
  await paused;
  assert.equal((await call(players[0], "game:discard", { tile: before.hand[0] })).ok, false);
  const outsider = await connect();
  assert.equal((await call(outsider, "room:resume", { code: sessions[0].code, token: "wrong" })).ok, false);
  assert.equal(outsider.state, undefined);
  assert.equal((await call(outsider, "room:join", { code: sessions[0].code, name: "Player 1" })).ok, false);
  await join(outsider, "room:resume", sessions[1]);
  assert.equal(outsider.state.mySeat, 1);
  assert.equal((await call(players[0], "game:discard", { tile: before.hand[0] })).ok, true);
});

test("refresh takes over an old live socket without giving it further private state", async t => {
  const { connect, join, fourPlayers, start } = await setup(t);
  const { players, sessions } = await fourPlayers();
  await start(players);
  const before = structuredClone(players[0].state);
  const replaced = event(players[0], "session:replaced");
  const disconnected = event(players[0], "disconnect");
  const fresh = await connect();
  await join(fresh, "room:resume", sessions[0]);
  await replaced;
  await disconnected;
  assert.deepEqual(fresh.state, before);
  assert.equal(fresh.room.paused, false);
  const update = event(fresh, "game:private", s => s.discards.length === 1);
  assert.equal((await call(fresh, "game:discard", { tile: before.hand[0] })).ok, true);
  await update;
  assert.deepEqual(players[0].state, before);
});

test("lobby reconnect reuses its seat; disconnected players cannot satisfy start requirement", async t => {
  const { connect, join, fourPlayers } = await setup(t);
  const { players, sessions } = await fourPlayers();
  const offline = event(players[0], "room:update", r => !r.players[2].connected);
  players[2].disconnect();
  await offline;
  assert.equal((await call(players[0], "game:start")).ok, false);
  const fresh = await connect();
  await join(fresh, "room:resume", sessions[2]);
  assert.equal(fresh.room.players.length, 4);
  assert.equal(fresh.state.mySeat, 2);
  assert.equal((await call(players[0], "game:start")).ok, true);
});

test("host transfers without changing seats and duplicate membership is rejected", async t => {
  const { connect, join, fourPlayers } = await setup(t);
  const { players, sessions } = await fourPlayers();
  assert.equal((await call(players[1], "room:join", { code: sessions[0].code })).ok, false);
  assert.equal((await call(players[1], "room:create", {})).ok, false);
  const changed = event(players[1], "room:update", r => r.players[1].host);
  players[0].disconnect();
  await changed;
  const fresh = await connect();
  await join(fresh, "room:resume", sessions[0]);
  assert.equal(fresh.state.mySeat, 0);
  assert.equal((await call(fresh, "game:start")).ok, false);
  assert.equal((await call(players[1], "game:start")).ok, true);
});

test("all players can resume before abandoned-room expiry", async t => {
  const { connect, join, fourPlayers, start } = await setup(t);
  const { players, sessions } = await fourPlayers();
  await start(players);
  const before = players.map(s => structuredClone(s.state));
  const lastOffline = event(players[3], "room:update", r => r.players.slice(0, 3).every(p => !p.connected));
  players.slice(0, 3).forEach(s => s.disconnect());
  await lastOffline;
  players[3].disconnect();
  for (let i = 0; i < 4; i++) {
    const fresh = await connect();
    await join(fresh, "room:resume", sessions[i]);
    assert.deepEqual(fresh.state, before[i]);
    assert.equal(fresh.room.paused, i !== 3);
  }
});

test("abandoned rooms expire and private sessions are not exposed publicly", async t => {
  const { connect, join } = await setup(t, { reconnectGraceMs: 50 });
  const owner = await connect();
  const session = await join(owner, "room:create", {});
  assert.equal(JSON.stringify(owner.room).includes(session.token), false);
  assert.equal("hand" in owner.room.players[0], false);
  owner.disconnect();
  await new Promise(resolve => setTimeout(resolve, 150));
  const fresh = await connect();
  assert.equal((await call(fresh, "room:resume", session)).ok, false);
  assert.equal((await call(fresh, "room:join", { code: session.code })).ok, false);
});

test("expired lobby seats are released and remaining players receive updated seats", async t => {
  const { connect, join } = await setup(t, { reconnectGraceMs: 80 });
  const owner = await connect();
  const session = await join(owner, "room:create", {});
  const guest = await connect();
  await join(guest, "room:join", { code: session.code });
  const released = event(guest, "room:update", r => r.players.length === 1);
  owner.disconnect();
  await released;
  assert.equal(guest.state.mySeat, 0);
  assert.equal(guest.room.players[0].host, true);
  const fresh = await connect();
  assert.equal((await call(fresh, "room:resume", session)).ok, false);
  await join(fresh, "room:join", { code: session.code });
  assert.equal(fresh.state.mySeat, 1);
});

test("wall exhaustion returns to lobby and a new game resets discard history", async t => {
  const { fourPlayers, start } = await setup(t);
  const { players } = await fourPlayers();
  await start(players);
  for (let turn = 0; turn < 70; turn++) {
    const player = players[turn % 4];
    const updates = players.map(s => event(s, "room:update", r => r.wallCount === Math.max(68 - turn, 0) && (turn < 69 || !r.started)));
    assert.equal((await call(player, "game:discard", { tile: player.state.hand[0] })).ok, true);
    await Promise.all(updates);
  }
  assert.equal(players[0].room.started, false);
  await start(players);
  assert.equal(players[0].state.discards.length, 0);
  assert.equal(players[0].state.hand.length, 14);
  assert.equal(players[0].state.wallCount, 69);
});

test("solo player completes a round with three bots and resumes interrupted bot turns", async t => {
  const { connect, join } = await setup(t, {botDelayMs:20});
  const host=await connect();
  const session=await join(host,'room:create',{});
  const filled=event(host,'room:update',r=>r.players.length===4);
  assert.equal((await call(host,'room:bots',{fill:true})).ok,true);await filled;
  assert.equal(host.room.players.filter(p=>p.bot).length,3);
  const start=event(host,'room:update',r=>r.started);
  assert.equal((await call(host,'game:start')).ok,true);await start;
  assert.equal((await call(host,'room:bots',{fill:false})).ok,false);
  assert.equal((await call(host,'game:discard',{tile:host.state.hand[0]})).ok,true);
  host.disconnect();
  await new Promise(r=>setTimeout(r,80));
  const resumed=await connect();
  await join(resumed,'room:resume',session);
  // No bot should have consumed the remaining round during a disconnection.
  assert.ok(resumed.state.discards.length<=4);
  while(resumed.room.started) {
    if(resumed.state.turn!==0) {
      await event(resumed,'room:update',r=>r.turn===0 || !r.started);
      continue;
    }
    const updated=event(resumed,'room:update');
    assert.equal((await call(resumed,'game:discard',{tile:resumed.state.hand[0]})).ok,true);
    await updated;
  }
  assert.equal(resumed.state.discards.length,70);
  const removed=event(resumed,'room:update',r=>r.players.length===1);
  assert.equal((await call(resumed,'room:bots',{fill:false})).ok,true);await removed;
  assert.equal(resumed.state.mySeat,0);
});

test("only host controls bots; bot-only rooms expire after humans leave", async t => {
  const {connect,join}=await setup(t,{reconnectGraceMs:60});
  const host=await connect();const session=await join(host,'room:create',{});
  const guest=await connect();await join(guest,'room:join',{code:session.code});
  assert.equal((await call(guest,'room:bots',{fill:true})).ok,false);
  const full=event(host,'room:update',r=>r.players.length===4);
  assert.equal((await call(host,'room:bots',{fill:true})).ok,true);await full;
  assert.equal(host.room.players.filter(p=>p.bot).length,2);
  const changed=event(guest,'room:update',r=>r.players[1].host);
  host.disconnect();await changed;
  assert.equal(guest.room.players.filter(p=>p.bot&&p.host).length,0);
  guest.disconnect();await new Promise(r=>setTimeout(r,160));
  const fresh=await connect();
  assert.equal((await call(fresh,'room:resume',session)).ok,false);
});
