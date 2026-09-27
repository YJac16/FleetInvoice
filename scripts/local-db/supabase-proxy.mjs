#!/usr/bin/env node
import http from "node:http";
import { request as httpRequest } from "node:http";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 54321);
const GOTRUE = process.env.GOTRUE_URL ?? "http://127.0.0.1:9999";
const REST = process.env.REST_URL ?? "http://127.0.0.1:3002";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

function sendJson(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "text/plain" });
  res.end(body);
}

function proxy(targetBase, req, res, stripPrefix) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = stripPrefix
    ? url.pathname.replace(stripPrefix, "") || "/"
    : url.pathname;
  const target = new URL(path + url.search, targetBase);

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("error", () => sendJson(res, 400, "Bad request"));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = { ...req.headers, host: new URL(targetBase).host };
    delete headers.connection;
    delete headers["transfer-encoding"];
    delete headers["content-length"];
    if (body.length > 0) {
      headers["content-length"] = String(body.length);
    }

    const upstream = httpRequest(
      target,
      { method: req.method, headers },
      (up) => {
        const outHeaders = { ...up.headers };
        delete outHeaders.connection;
        for (const key of Object.keys(outHeaders)) {
          if (key.toLowerCase().startsWith("access-control-")) {
            delete outHeaders[key];
          }
        }
        res.writeHead(up.statusCode ?? 502, { ...outHeaders, ...CORS });
        up.pipe(res);
      }
    );
    upstream.on("error", () => sendJson(res, 502, "Bad gateway"));
    if (body.length > 0) {
      upstream.write(body);
    }
    upstream.end();
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const path = req.url ?? "/";
  if (path.startsWith("/auth/v1")) {
    return proxy(GOTRUE, req, res, "/auth/v1");
  }
  if (path.startsWith("/rest/v1")) {
    return proxy(REST, req, res, "/rest/v1");
  }
  sendJson(res, 404, "Not found");
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(`Supabase proxy http://127.0.0.1:${PROXY_PORT}`);
});
