// Room mode is fixed at creation; old rooms/fixtures retain four-player rules.
const isSanma = room => room.playerCount === 3;
const playerCount = room => isSanma(room) ? 3 : 4;
const initialScore = room => isSanma(room) ? 35000 : 25000;
const allowedTile = (tile, sanma) => !sanma || !/^[2-8]만$/.test(tile);
module.exports = {isSanma, playerCount, initialScore, allowedTile};
