import { mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync(".local/tls", { recursive: true });
if (!existsSync(".local/tls/key.pem") || !existsSync(".local/tls/cert.pem")) {
  const r = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      ".local/tls/key.pem",
      "-out",
      ".local/tls/cert.pem",
      "-days",
      "2",
      "-subj",
      "/CN=mtn.test",
      "-addext",
      "subjectAltName=DNS:mtn.test,DNS:games.mtn.test",
    ],
    { stdio: "ignore" },
  );
  if (r.status !== 0)
    throw new Error("OpenSSL could not generate disposable test TLS material");
}
console.log(
  "Disposable local TLS material ready. Tests use ignoreHTTPSErrors only for these local hosts.",
);
