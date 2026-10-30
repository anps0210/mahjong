const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { createGameServer } = require("../server");

async function until(check) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Client condition timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test("actual page restores a refreshed player, disables offline actions and resumes play", async t => {
  const game = createGameServer();
  await new Promise(resolve => game.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${game.server.address().port}`;
  const pages = [];
  t.after(async () => {
    for (const page of pages) {
      page.window.eval("socket.disconnect()");
      page.window.close();
    }
    await game.close();
  });
  async function page(saved) {
    const dom = await JSDOM.fromURL(url, {
      resources: "usable",
      runScripts: "dangerously",
      beforeParse(window) {
        if (saved) window.sessionStorage.setItem("mahjong.session.v1", saved);
      }
    });
    pages.push(dom);
    await until(() => dom.window.document.getElementById("connectionStatus")?.textContent === "서버에 연결됨");
    return dom;
  }
  const element = (dom, id) => dom.window.document.getElementById(id);
  const host = await page();
  element(host, "create").click();
  await until(() => host.window.sessionStorage.getItem("mahjong.session.v1"));
  const saved = host.window.sessionStorage.getItem("mahjong.session.v1");
  const { code } = JSON.parse(saved);
  const guests = [];
  for (let i = 0; i < 3; i++) {
    const guest = await page();
    guests.push(guest);
    element(guest, "roomcode").value = code;
    element(guest, "join").click();
    await until(() => guest.window.sessionStorage.getItem("mahjong.session.v1"));
  }
  await until(() => !element(host, "start").disabled);
  assert.equal(element(guests[0], "start").disabled, true);
  element(host, "start").click();
  await until(() => !element(host, "game").classList.contains("hidden"));
  const hand = element(host, "hand").textContent;
  assert.equal(element(host, "hand").querySelectorAll("button").length, 14);

  host.window.eval("socket.disconnect()");
  await until(() => element(guests[0], "connectionStatus").textContent.includes("일시 정지"));
  assert.ok([...element(host, "hand").querySelectorAll("button")].every(b => b.disabled));

  const refreshed = await page(saved);
  await until(() => !element(refreshed, "game").classList.contains("hidden"));
  assert.equal(element(refreshed, "hand").textContent, hand);
  assert.equal(element(refreshed, "turnText").textContent, "내 차례");
  element(refreshed, "hand").querySelector("button").click();
  await until(() => element(refreshed, "discards").children.length === 1);
  assert.equal(element(refreshed, "hand").querySelectorAll("button").length, 13);

  // Reconnect the same page: its connect handler must restore the room itself.
  const guest = guests[0];
  await until(() => element(guest, "turnText").textContent === "내 차례");
  const guestHand = element(guest, "hand").textContent;
  guest.window.eval("socket.disconnect()");
  await until(() => element(refreshed, "connectionStatus").textContent.includes("일시 정지"));
  guest.window.eval("socket.connect()");
  await until(() => !element(guest, "hand").querySelector("button").disabled);
  assert.equal(element(guest, "hand").textContent, guestHand);
  assert.equal(element(guest, "discards").children.length, 1);
  element(guest, "hand").querySelector("button").click();
  await until(() => element(refreshed, "discards").children.length === 2);
});

test("expired browser session returns to home with an actionable message", async t => {
  const game = createGameServer();
  await new Promise(resolve => game.server.listen(0, "127.0.0.1", resolve));
  let page;
  t.after(async () => {
    page?.window.eval("socket.disconnect()");
    page?.window.close();
    await game.close();
  });
  page = await JSDOM.fromURL(`http://127.0.0.1:${game.server.address().port}`, {
    resources: "usable", runScripts: "dangerously",
    beforeParse(window) {
      window.sessionStorage.setItem("mahjong.session.v1", JSON.stringify({ code: "GONE", token: "expired" }));
    }
  });
  await until(() => page.window.document.getElementById("homeError")?.textContent.includes("만료"));
  assert.equal(page.window.sessionStorage.getItem("mahjong.session.v1"), null);
  assert.equal(page.window.document.getElementById("home").classList.contains("hidden"), false);
  assert.equal(page.window.document.getElementById("create").disabled, false);
});
