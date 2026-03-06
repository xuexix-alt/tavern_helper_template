const http = require("http");
const fs = require("fs");
const { URL } = require("url");
const path = require("path");

const PORT = 19080;
const TARGET = "https://apiport.cc.cd";
const outDir = path.join(process.env.USERPROFILE || ".", ".openclaw", "proxy-capture");
fs.mkdirSync(outDir, { recursive: true });

let seq = 0;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    seq += 1;
    const id = String(seq).padStart(4, "0");
    const bodyBuf = Buffer.concat(chunks);
    const bodyText = bodyBuf.toString("utf8");
    const reqMeta = {
      time: new Date().toISOString(),
      method: req.method,
      path: req.url,
      headers: req.headers,
      bodyBytes: bodyBuf.length,
      bodyPreview: bodyText.slice(0, 20000),
    };
    fs.writeFileSync(path.join(outDir, `req-${id}.json`), JSON.stringify(reqMeta, null, 2), "utf8");

    try {
      const upstreamUrl = new URL(req.url, TARGET).toString();
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      delete headers["content-length"];
      delete headers["user-agent"];
      for (const k of Object.keys(headers)) {
        if (k.startsWith("x-stainless-")) delete headers[k];
      }
      // Work around provider WAF rules that block OpenAI/JS stainless headers.
      headers["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OpenClawProxy/1.0";

      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : bodyBuf,
      });
      const respBuf = Buffer.from(await upstream.arrayBuffer());
      const respText = respBuf.toString("utf8");
      const respMeta = {
        time: new Date().toISOString(),
        status: upstream.status,
        statusText: upstream.statusText,
        headers: Object.fromEntries(upstream.headers.entries()),
        bodyBytes: respBuf.length,
        bodyPreview: respText.slice(0, 50000),
      };
      fs.writeFileSync(path.join(outDir, `resp-${id}.json`), JSON.stringify(respMeta, null, 2), "utf8");

      res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
      res.end(respBuf);
    } catch (err) {
      fs.writeFileSync(path.join(outDir, `err-${id}.txt`), String(err && err.stack ? err.stack : err), "utf8");
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("proxy error");
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`proxy listening on http://127.0.0.1:${PORT}`);
});
