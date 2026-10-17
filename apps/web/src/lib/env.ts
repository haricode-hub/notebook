import { z } from "zod";

const serverSchema = z.object({
  API_URL: z.url().default("http://localhost:8000"),
});

export function getServerEnv() {
  return serverSchema.parse({ API_URL: process.env.API_URL });
}
