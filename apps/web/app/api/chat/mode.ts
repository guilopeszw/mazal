export type NarrationMode = "fixture" | "template";

/** Offline narration is the default; live provider calls are deliberately out of this task. */
export function narrationMode(): NarrationMode {
  return process.env["NARRATION_MODE"] === "template" ? "template" : "fixture";
}
