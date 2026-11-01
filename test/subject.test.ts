import { describe, expect, it } from "vitest";
import { manifestProblems } from "../src/index.js";
import { checkMessage } from "../src/messages.js";
import { launch } from "../src/testing.js";
import { echo } from "./fixtures.js";

// A tool never learns who the learner is, unless the learner linked their account with the tool's publisher and chose
// to let its tools know them. Then narai.tool.start carries `subject`: the learner's id with that publisher, the same
// for every tool it publishes, and never a name or an email. Narai sends it only to a tool whose manifest declares
// surfaces.account_link; the SDK's host does the same.
const SUBJECT = "a".repeat(40) + "_-Z";
const LINK = { url: "https://echo.example/connect", client_id: "https://echo.example/oauth/client.json", webhook: "https://echo.example/narai/unlinked" };
const withLink = () => { const m = echo(); m.surfaces = { ...m.surfaces, account_link: LINK }; return m; };
const START = { type: "narai.tool.start", v: 1, launch: "lch_testlaunch01", locale: "en", fallback: [] };

describe("the learner's subject", () => {
  it("reaches the tool on its start, when the learner chose it", async () => {
    const run = await launch(withLink(), { subject: SUBJECT });
    expect(run.tool.start.subject).toBe(SUBJECT);
    expect(run.toolRefused).toEqual([]);
    run.close();
  });

  it("is absent when the learner didn't choose it", async () => {
    const run = await launch(withLink());
    expect(run.tool.start).not.toHaveProperty("subject");
    run.close();
  });

  it("is dropped for a tool that declares no account linking, and the launch still starts", async () => {
    const run = await launch(echo(), { subject: SUBJECT });
    expect(run.tool.start).not.toHaveProperty("subject");
    expect(run.toolRefused).toEqual([]);
    run.close();
  });

  it("is refused on a start to a tool that declares no account linking", () => {
    const start = { ...START, subject: SUBJECT };
    expect(checkMessage(echo(), start, { from: "host" })).toEqual({ ok: false, reason: "a subject, but the manifest declares no account linking (surfaces.account_link)" });
    expect(checkMessage(withLink(), start, { from: "host" })).toEqual({ ok: true, message: start });
  });

  it("is one shape, on the start only", () => {
    for (const subject of ["a".repeat(42), "a".repeat(44), "a".repeat(42) + "=", "someone@example.com"]) {
      expect(checkMessage(withLink(), { ...START, subject }, { from: "host" }).ok, subject).toBe(false);
    }
    const ready = { type: "tool.ready", v: 1, launch: "lch_testlaunch01", locale: "en", subject: SUBJECT };
    expect(checkMessage(withLink(), ready, { from: "tool", launch: "lch_testlaunch01" }).ok).toBe(false);
  });
});

describe("a manifest's account linking", () => {
  it("is the publisher's three https URLs", () => {
    expect(manifestProblems(withLink())).toEqual([]);
    const m = withLink();
    m.surfaces.account_link = { ...LINK, webhook: "http://echo.example/narai/unlinked" };
    expect(manifestProblems(m)).toEqual(expect.arrayContaining([expect.stringMatching(/^\/surfaces\/account_link\/webhook must match/)]));
    const { webhook: _, ...noWebhook } = LINK;
    expect(manifestProblems({ ...withLink(), surfaces: { ...withLink().surfaces, account_link: noWebhook } })).not.toEqual([]);
  });
});
