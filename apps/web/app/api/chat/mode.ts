export type NarrationMode = "fixture" | "template" | "live";

/** Offline narration is the default; live stays unavailable until a server-only provider is added. */
export function narrationMode(): NarrationMode {
  const configured = process.env["NARRATION_MODE"];
  if (configured === "template" || configured === "live") return configured;
  return "fixture";
}
