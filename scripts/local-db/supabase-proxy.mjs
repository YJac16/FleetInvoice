#!/usr/bin/env node
import http from "node:http";
import { request as httpRequest } from "node:http";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 54321);
const GOTRUE = process.env.GOTRUE_URL ?? "http://127.0.0.1:9999";
const REST = process.env.REST_URL ?? "http://127.0.0.1:3002";

function withCors(res, status, headers, body) {
  res.writeHead(status, {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
  });
  if (body) res.end(body);
}

function proxy(targetBase, req, res, stripPrefix) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = stripPrefix
    ? url.pathname.replace(stripPrefix, "") || "/"
    : url.pathname;
  const target = new URL(path + url.search, targetBase);
  const headers = { ...req.headers, host: target.host };
  const upstream = httpRequest(
    target,
    { method: req.method, headers },
    (up) => {
      withCors(res, up.statusCode ?? 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    withCors(res, 502, {}, "Bad gateway");
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    return withCors(res, 204, {}, "");
  }
  const path = req.url ?? "/";
  if (path.startsWith("/auth/v1")) {
    return proxy(GOTRUE, req, res, "/auth/v1");
  }
  if (path.startsWith("/rest/v1")) {
    return proxy(REST, req, res, "/rest/v1");
  }
  withCors(res, 404, {}, "Not found");
});

server.listen(PROXY_PORT, () => {
  console.log(`Supabase proxy http://127.0.0.1:${PROXY_PORT}`);
});
