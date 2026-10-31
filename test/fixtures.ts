import type { ToolManifest } from "../src/index.js";

/** A small tool that speaks every part of the contract: a task's answer, practice, a command, a preset. */
export const ECHO: ToolManifest = {
  id: "narai-dev/echo",
  version: "0.1.0",
  sdk: "^1",
  publisher: { name: "Narai", url: "https://michinar.ai" },
  surfaces: { embed: { url: "https://echo.example/tool/", sdk: "^1" } },
  payloads: {
    "echo.preset@1": { type: "object", properties: { words: { type: "array", items: { type: "string" } } }, additionalProperties: false },
    "echo.answer@1": { type: "object", properties: { text: { type: "string", maxLength: 200 } }, required: ["text"], additionalProperties: false },
    "echo.drill@1": { type: "object", properties: { said: { type: "integer", minimum: 0 } }, required: ["said"] },
    "echo.highlight@1": { type: "object", properties: { word: { type: "string" } }, required: ["word"] },
    "echo.state@1": { type: "object", properties: { shown: { type: "string" } }, required: ["shown"], additionalProperties: false },
  },
  state: "echo.state@1",
  preset_schema: "echo.preset@1",
  answers: { "echo.say": "echo.answer@1" },
  practice: { drill: "echo.drill@1" },
  commands: { highlight: "echo.highlight@1" },
  assist: "honors",
  locales: ["en", "ja"],
  capabilities: { audio_out: false, microphone: false, network: "none" },
};

export const LAUNCH = "lch_test0000001";
export const TASK = { id: "item-1", kind: "echo.say", assist: "none", prompt: "Say hello." } as const;

/** A deep copy to change one thing in. */
export const echo = (): ToolManifest => structuredClone(ECHO);
