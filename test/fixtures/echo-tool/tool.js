// The echo tool, as a developer writes one: only the public SDK, from where the harness serves it.
import { connect } from "/sdk/index.js";

const $ = (id) => document.getElementById(id);
try { void window.parent.document.title; $("isolated").textContent = "can reach the host"; } catch { $("isolated").textContent = "isolated"; }

const manifest = await (await fetch("./manifest.json")).json();
const tool = await connect(manifest, { hostOrigins: ["https://michinar.ai"] });
$("prompt").textContent = tool.task?.prompt ?? "free practice";
tool.onCommand("highlight", (payload) => { $("highlighted").textContent = payload.word; });
tool.ready(tool.start.locale);

$("say").onclick = () => tool.answer({ schema: "echo.answer@1", text: $("text").value });
$("drill").onclick = () => tool.practice("drill", { duration_s: 5, attempts: 2, payload: { schema: "echo.drill@1", said: 2 } });
$("cheat").onclick = () => {
  try { tool.answer({ schema: "echo.answer@1", text: "x", correct: true }); } catch (error) { $("error").textContent = error.message; }
};
