import type { PredictInput } from "@mazal/contracts";
import { predict } from "@mazal/engine";

/** Parse the body, call the engine, return JSON. */
export async function POST(request: Request) {
  const input = (await request.json()) as PredictInput;
  return Response.json(predict(input));
}
