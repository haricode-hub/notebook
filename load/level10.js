import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Trend } from "k6/metrics";

const chatResponseSeconds = new Trend("chat_response_seconds", true);
const web = __ENV.WEB_ORIGIN || "http://localhost:3000";
const api = __ENV.API_ORIGIN || "http://localhost:8000";
let notebookId;
let artifactCreated = false;
let apiToken;

export const options = {
  scenarios: {
    five_users: {
      executor: "constant-vus",
      vus: 5,
      duration: "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    chat_response_seconds: ["p(95)<4"],
  },
};

function signIn() {
  const email = __ENV[`K6_EMAIL_${__VU}`] || __ENV.K6_EMAIL;
  const password = __ENV[`K6_PASSWORD_${__VU}`] || __ENV.K6_PASSWORD;
  if (!email || !password) fail("Set K6_EMAIL/PASSWORD or per-VU K6_EMAIL_1..5/K6_PASSWORD_1..5.");
  const login = http.post(
    `${web}/api/auth/sign-in/email`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" }, tags: { journey: "sign-in" } },
  );
  if (!check(login, { "sign-in succeeded": (r) => r.status === 200 })) {
    fail(`Sign-in failed (${login.status}).`);
  }
  const tokenResponse = http.get(`${web}/api/auth/token`, {
    tags: { journey: "token" },
  });
  if (!check(tokenResponse, { "JWT token acquired": (r) => r.status === 200 })) {
    fail(`Could not retrieve the API JWT (${tokenResponse.status}).`);
  }
  const token = tokenResponse.json("token");
  if (typeof token !== "string" || token.length < 20) fail("JWT response had no token.");
  return token;
}

export default function () {
  if (!apiToken) apiToken = signIn();
  const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };
  if (!notebookId) {
    const created = http.post(
      `${api}/notebooks`,
      JSON.stringify({ title: `Level 10 load VU ${__VU}`, response_length: "short" }),
      { headers, tags: { journey: "notebook-create" } },
    );
    if (!check(created, { "notebook created": (r) => r.status === 201 })) return;
    notebookId = created.json("id");
    const source = http.post(
      `${api}/notebooks/${notebookId}/sources/text`,
      JSON.stringify({
        name: `load-${__VU}.txt`,
        text: "A load-test notebook records that the observatory opened in 1998. Its main telescope has a 4.2-meter mirror.",
      }),
      { headers, tags: { journey: "upload" } },
    );
    if (!check(source, { "source accepted": (r) => r.status === 201 })) return;
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      const listed = http.get(`${api}/notebooks/${notebookId}/sources`, {
        headers,
        tags: { journey: "wait-for-index" },
      });
      const rows = listed.status === 200 ? listed.json() : [];
      ready = Array.isArray(rows) && rows.some((row) => row.status === "ready");
      if (!ready) sleep(1);
    }
    if (!ready) {
      check(null, { "uploaded source reached ready": () => false });
      return;
    }
  }

  const started = Date.now();
  const chat = http.post(
    `${api}/notebooks/${notebookId}/chat`,
    JSON.stringify({ question: "When did the observatory open?" }),
    { headers, tags: { journey: "chat" }, timeout: "90s" },
  );
  chatResponseSeconds.add((Date.now() - started) / 1000);
  check(chat, {
    "chat stream completed": (r) => r.status === 200 && String(r.body).includes("event: final"),
  });

  if (!artifactCreated) {
    const artifact = http.post(
      `${api}/notebooks/${notebookId}/artifacts`,
      JSON.stringify({ recipe: "briefing", length: "short" }),
      { headers, tags: { journey: "generate" } },
    );
    artifactCreated = check(artifact, { "artifact queued": (r) => r.status === 202 });
  }
  sleep(15);
}
