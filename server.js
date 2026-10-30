const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static("public"));

const makeCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length: 5}, () => chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
};
const shuffle = a => {
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
};
function makeWall() {
  const wall = [];
  for (const suit of ["m","p","s"]) for (let n=1;n<=9;n++) for(let k=0;k<4;k++) wall.push(`${n}${suit}`);
  for (const honor of ["東","南","西","北","白","發","中"]) for(let k=0;k<4;k++) wall.push(honor);
  return shuffle(wall);
}
function publicRoom(room) {
  return {
    code: room.code, started: room.started, turn: room.turn,
    players: room.players.map((p,i)=>({name:p.name, seat:i, host:i===0, connected:p.connected})),
    wallCount: room.wall.length
  };
}
function sendRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function privateState(room, socketId) {
  const idx = room.players.findIndex(p=>p.id===socketId);
  if(idx<0) return;
  const p=room.players[idx];
  io.to(socketId).emit("game:private", {
    hand:p.hand, drawn:p.drawn, turn:room.turn, wallCount:room.wall.length,
    mySeat:idx, lastDiscard:room.discards.at(-1) || null
  });
}
function deal(room) {
  room.wall=makeWall(); room.discards=[]; room.turn=0; room.started=true;
  room.players.forEach(p=>{p.hand=room.wall.splice(0,13);p.drawn=null;});
  room.players[0].drawn=room.wall.pop();
  room.players[0].hand.push(room.players[0].drawn); room.players[0].drawn=null;
  room.players.forEach(p=>privateState(room,p.id));
  sendRoom(room);
}
io.on("connection", socket => {
  socket.on("room:create", ({name}, cb) => {
    const code=makeCode();
    const room={code,players:[{id:socket.id,name:String(name||"플레이어").slice(0,12),connected:true,hand:[],drawn:null}],started:false,turn:0,wall:[],discards:[]};
    rooms.set(code,room); socket.join(code); socket.data.room=code;
    cb?.({ok:true,code}); sendRoom(room);
  });
  socket.on("room:join", ({code,name}, cb) => {
    code=String(code||"").toUpperCase().trim();
    const room=rooms.get(code);
    if(!room) return cb?.({ok:false,error:"존재하지 않는 방 코드야."});
    if(room.started) return cb?.({ok:false,error:"이미 게임이 시작된 방이야."});
    if(room.players.length>=4) return cb?.({ok:false,error:"방이 가득 찼어."});
    if(room.players.some(p=>p.id===socket.id)) return cb?.({ok:true,code});
    room.players.push({id:socket.id,name:String(name||"플레이어").slice(0,12),connected:true,hand:[],drawn:null});
    socket.join(code); socket.data.room=code; cb?.({ok:true,code}); sendRoom(room);
  });
  socket.on("game:start", cb => {
    const room=rooms.get(socket.data.room);
    if(!room) return cb?.({ok:false,error:"방을 찾을 수 없어."});
    if(room.players[0].id!==socket.id) return cb?.({ok:false,error:"방장만 시작할 수 있어."});
    if(room.players.length!==4) return cb?.({ok:false,error:"게임을 시작하려면 4명이 필요해."});
    if(room.started) return;
    deal(room); cb?.({ok:true});
  });
  socket.on("game:discard", ({tile}, cb) => {
    const room=rooms.get(socket.data.room);
    if(!room||!room.started) return;
    const idx=room.players.findIndex(p=>p.id===socket.id);
    if(idx!==room.turn) return cb?.({ok:false,error:"네 차례가 아니야."});
    const p=room.players[idx], at=p.hand.indexOf(tile);
    if(at<0) return cb?.({ok:false,error:"해당 패를 찾을 수 없어."});
    p.hand.splice(at,1); room.discards.push({tile,seat:idx});
    room.turn=(room.turn+1)%4;
    if(room.wall.length===0) {
      room.started=false;
      io.to(room.code).emit("game:message","패산이 끝났어. 이번 MVP에서는 유국 처리해.");
    } else {
      const next=room.players[room.turn];
      next.hand.push(room.wall.pop());
    }
    room.players.forEach(x=>privateState(room,x.id));
    io.to(room.code).emit("game:discarded",{tile,seat:idx,turn:room.turn,discards:room.discards.slice(-12)});
    sendRoom(room); cb?.({ok:true});
  });
  socket.on("disconnect",()=>{
    const code=socket.data.room, room=rooms.get(code);
    if(!room) return;
    const p=room.players.find(x=>x.id===socket.id);
    if(p) p.connected=false;
    sendRoom(room);
    if(room.players.every(x=>!x.connected)) rooms.delete(code);
  });
});
const port=process.env.PORT||3000;
server.listen(port,()=>console.log(`Mahjong Room running on http://localhost:${port}`));
