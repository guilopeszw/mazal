import type { DiagnoseInput } from "@mazal/contracts";
import { diagnose } from "@mazal/engine";

/** Parse the body, call the engine, return JSON. The engine owns every number. */
export async function POST(request: Request) {
  const input = (await request.json()) as DiagnoseInput;
  return Response.json(diagnose(input));
}
