import { Ajv2020 } from "ajv/dist/2020.js";
import type { ToolManifest } from "./generated/manifest.js";
import { describe } from "./manifest.js";
import type { PayloadCheck } from "./messages.js";
import { musicRules } from "./music.js";

/** Compiles the manifest's payload schemas into a check (Ajv: it needs eval, so it's for Narai's host, the harness and
 *  the CLI; a tool under a strict CSP leaves the bodies to the host). A payload the manifest doesn't declare fails; one of
 *  Narai's music payloads is held to its rules across fields too (`musicRules`). */
export function payloadChecks(manifest: ToolManifest): PayloadCheck {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const compiled = new Map(Object.entries(manifest.payloads ?? {}).map(([ref, schema]) => [ref, ajv.compile(schema)]));
  return (ref, body) => {
    const validate = compiled.get(ref);
    if (!validate) return "not declared under the manifest's payloads";
    return validate(body) ? musicRules(ref, body) : describe(validate.errors).join("; ");
  };
}
