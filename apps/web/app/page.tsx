import { Chat } from "@/components/chat";
import { buildAnswers } from "@/lib/answers";

/**
 * Server component on purpose: `buildAnswers` runs the engine against the committed fixtures
 * and the benchmark tables here, at render time, so the client receives three small payloads
 * of formatted strings and never downloads the benchmark JSON.
 */
export default function Home() {
  return <Chat answers={buildAnswers()} />;
}
