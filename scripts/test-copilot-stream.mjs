import assert from "node:assert/strict";
import { test } from "node:test";
import { createApprovalPreviewStore, visibleApprovalPreview } from "../src/pages/copilot/approval-preview.ts";
import { createCopilotChatStore } from "../src/pages/copilot/chat-state.ts";

const session = (id) => ({ id, title: id, createdAt: 0, updatedAt: 0, messages: [] });
const setup = () => createCopilotChatStore({ sessions: [session("A"), session("B")], activeSessionId: "A" });
const start = (store, id, requestId) => store.beginRequest(id, { id: requestId, role: "assistant", content: "" }, (current) => [
  ...current, { id: `${requestId}-user`, role: "user", content: `question ${id}` },
]);
const latest = (store, id) => store.getState().sessions.find((entry) => entry.id === id).messages.at(-1);
const activeRequest = (store) => store.getState().requests.get(store.getState().activeSessionId);
const delta = (requestId, text, serverAlias = "server A") => ({
  requestId, kind: "text_delta", stage: "model_stream", message: `progress ${text}`, delta: text, serverAlias, completed: false,
});
const response = (reply) => ({ reply, warnings: [], toolCalls: [], modelName: "synthetic", historyTrimmed: 0 });

test("N1: a new subscriber sees in-flight progress and the original request result", async () => {
  const store = setup();
  assert.ok(start(store, "A", "req-a"));
  const unmount = store.subscribe(() => assert.fail("unsubscribed page received an update"));
  unmount();

  const reply = Promise.resolve(response("final answer"));
  const finish = reply.then((result) => store.finishRequest("A", "req-a", { result }));

  store.receiveProgress("A", delta("req-a", "first"));
  assert.equal(latest(store, "A").content, "first");
  assert.equal(activeRequest(store).progress.message, "progress first");
  assert.equal(activeRequest(store).progress.serverAlias, "server A");
  const seen = [];
  const unsubscribe = store.subscribe((state) => seen.push({
    busy: state.requests.has("A"),
    message: state.sessions[0].messages.at(-1),
  }));
  store.receiveProgress("A", delta("req-a", " second"));
  await finish;
  unsubscribe();

  assert.deepEqual(seen.map(({ busy, message }) => [busy, message.content, message.streaming]), [
    [true, "first second", true],
    [false, "final answer", false],
  ]);
});

test("N2: switching to B permits its own request and isolates both requests", () => {
  const store = setup();
  assert.ok(start(store, "A", "req-a"));
  assert.equal(start(store, "A", "duplicate-a"), false);
  store.setActiveSessionId("B");
  store.receiveProgress("A", delta("req-a", "partial A"));
  assert.equal(activeRequest(store), undefined);
  assert.equal(latest(store, "B"), undefined);

  assert.ok(start(store, "B", "req-b"));
  const before = store.getState();
  store.receiveProgress("B", delta("req-a", "wrong owner"));
  store.receiveProgress("B", delta("unknown", "unknown request"));
  assert.equal(store.getState(), before);

  store.receiveProgress("B", delta("req-b", "partial B", "server B"));
  store.finishRequest("A", "req-a", { result: response("final A") });
  assert.equal(activeRequest(store).progress.serverAlias, "server B");
  assert.equal(latest(store, "B").content, "partial B");
  assert.equal(latest(store, "A").content, "final A");
  store.finishRequest("B", "req-b", { result: response("final B") });
  assert.equal(activeRequest(store), undefined);
  assert.equal(latest(store, "B").content, "final B");
});

for (const kind of ["done", "error"]) {
  test(`N3: ignores late deltas after ${kind} and after Promise settlement`, () => {
    const store = setup();
    assert.ok(start(store, "A", "req-a"));
    store.receiveProgress("A", delta("req-a", "partial"));
    store.receiveProgress("A", { ...delta("req-a", ""), kind, completed: true });
    const terminal = store.getState();
    store.receiveProgress("A", delta("req-a", "too late"));
    assert.equal(store.getState(), terminal);
    assert.equal(latest(store, "A").streaming, false);

    store.finishRequest("A", "req-a", kind === "done" ? { result: response("final") } : { error: "synthetic failure" });
    const settled = store.getState();
    store.receiveProgress("A", delta("req-a", "too late again"));
    assert.equal(store.getState(), settled);
    assert.equal(activeRequest(store), undefined);
    assert.equal(latest(store, "A").streaming, false);
    assert.equal(latest(store, "A").content, kind === "done" ? "final" : "partial");
    if (kind === "error") assert.deepEqual(latest(store, "A").warnings, ["synthetic failure"]);
  });
}

test("N3: settling without a terminal event rejects old deltas during a new request", () => {
  const store = setup();
  assert.ok(start(store, "A", "old"));
  store.finishRequest("A", "old", { result: response("first result") });
  assert.ok(start(store, "A", "new"));
  const before = store.getState();
  store.receiveProgress("A", delta("old", "late"));
  store.finishRequest("A", "old", { error: "duplicate settlement" });
  assert.equal(store.getState(), before);
  assert.equal(activeRequest(store).id, "new");
  assert.equal(store.getState().sessions[0].messages.find((item) => item.id === "old").streaming, false);
});

const approvalDetail = (id, serverAlias) => ({ approval: { id, serverAlias }, plan: null });

test("R1: B reviews 802 before A completes, and confirmation still submits only 802", async () => {
  const chats = setup();
  const review = createApprovalPreviewStore();
  const requestA = { sessionId: "A", requestId: "req-a" };
  const requestB = { sessionId: "B", requestId: "req-b" };
  const planA = approvalDetail(801, "server A");
  const planB = approvalDetail(802, "server B");
  assert.ok(start(chats, "A", requestA.requestId));
  chats.setActiveSessionId("B");
  assert.ok(start(chats, "B", requestB.requestId));

  const activeSession = () => chats.getState().activeSessionId;
  let finishA;
  const responseA = new Promise((resolve) => { finishA = resolve; });
  const onPlan = (owner, detail) => {
    chats.finishRequest(owner.sessionId, owner.requestId, { result: response("approval required") });
    return review.openFromRequest(detail, owner, activeSession());
  };
  const pendingA = responseA.then((detail) => onPlan(requestA, detail));
  assert.equal(await Promise.resolve(planB).then((detail) => onPlan(requestB, detail)), true);
  const reviewed = visibleApprovalPreview(review.getState(), activeSession());
  assert.equal(reviewed.detail.approval.serverAlias, "server B");
  assert.deepEqual(reviewed.owner, requestB);

  finishA(planA);
  assert.equal(await pendingA, false);
  assert.equal(review.getState(), reviewed);
  const approveCalls = [];
  const id = review.reviewedApprovalId(reviewed, activeSession());
  if (id !== null) approveCalls.push({ id });
  assert.deepEqual(approveCalls, [{ id: 802 }]);
});

test("R1: open reviews survive another result and stale confirmations are rejected", () => {
  const review = createApprovalPreviewStore();
  const planA = approvalDetail(801, "server A");
  const planB = approvalDetail(802, "server B");
  const requestB = { sessionId: "B", requestId: "req-b" };
  assert.equal(review.openFromRequest(planA, { sessionId: "A", requestId: "req-a" }, "B"), false);
  assert.equal(review.getState(), null);

  review.open(planA, null);
  const manual = review.getState();
  assert.equal(review.openFromRequest(planB, requestB, "B"), false);
  assert.equal(review.reviewedApprovalId(manual, "B"), 801);
  review.close();
  assert.equal(review.reviewedApprovalId(manual, "B"), null);

  assert.equal(review.openFromRequest(planB, requestB, "B"), true);
  const requestPreview = review.getState();
  assert.equal(review.openFromRequest(planA, { sessionId: "B", requestId: "later" }, "B"), false);
  assert.equal(visibleApprovalPreview(requestPreview, "A"), null);
  assert.equal(review.reviewedApprovalId(requestPreview, "A"), null);
  assert.equal(review.reviewedApprovalId(requestPreview, "B"), 802);
});
