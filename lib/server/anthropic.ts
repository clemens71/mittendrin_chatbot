import Anthropic from "@anthropic-ai/sdk";

// ANTHROPIC_API_KEY is read from the environment by the SDK itself and never
// touches client-side code — this module is only ever imported from
// app/api/**/route.ts (server) files.
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.",
      );
    }
    client = new Anthropic();
  }
  return client;
}

export const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
