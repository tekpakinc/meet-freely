import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, {headers:{accept:"text/html"}}), {ASSETS:{fetch:async()=>new Response("Not found",{status:404})}}, {waitUntil(){},passThroughOnException(){}});
}

test("renders the Meet Freely public entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Meet Freely/i);
  assert.match(html, /Dating Without Swiping/i);
  assert.doesNotMatch(html, /86 people|86 here recently|SoftLaunch/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("ships honest room and membership copy", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /EXAMPLE ROOM PREVIEW/i);
  assert.match(source, /Room conversation/i);
  assert.match(source, /2\.99/);
  assert.doesNotMatch(source, /86 people|86 here recently|SoftLaunch/i);
  assert.doesNotMatch(source, /trusted beta member/i);
  assert.match(source, /complete_onboarding/);
});

for (const [path,title] of [["/privacy","Privacy Policy"],["/terms","Terms of Service"],["/community-guidelines","Community Guidelines"],["/safety","Safety Center"]]) {
  test(`renders ${path}`, async () => {
    const response = await render(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(title,"i"));
    assert.match(html, /meet freely/i);
  });
}
