import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { EntryContext } from "react-router";

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: unknown
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    // Determine rendering strategy
    let readyOption: keyof NonNullable<Parameters<typeof renderToPipeableStream>[1]> =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    // Set security headers
    responseHeaders.set(
      "Content-Security-Policy",
      "default-src 'self';style-src 'self' 'unsafe-inline';script-src 'self';img-src 'self' data:;base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';object-src 'none';script-src-attr 'none';upgrade-insecure-requests"
    );
    responseHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
    responseHeaders.set("Referrer-Policy", "no-referrer");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-DNS-Prefetch-Control", "off");
    responseHeaders.set("X-Frame-Options", "SAMEORIGIN");
    responseHeaders.set("X-XSS-Protection", "0");
    responseHeaders.set("X-Download-Options", "noopen");
    responseHeaders.set("X-Permitted-Cross-Domain-Policies", "none");
    responseHeaders.set("Origin-Agent-Cluster", "?1");

    // Remove compression-related headers that may cause WAF issues
    // responseHeaders.delete("Vary");
    // responseHeaders.delete("Content-Encoding");
    // responseHeaders.delete("Content-Type");

    // Set content length manually (helps with security scanners)
    // responseHeaders.set("Content-Length", "299");

    const timeoutId = setTimeout(() => {
      reject(new Error("Response timeout"));
    }, ABORT_DELAY);

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(() => {
      abort();
      reject(new Error("Response aborted"));
    }, ABORT_DELAY);
  });
}