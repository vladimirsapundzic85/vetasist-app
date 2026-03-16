import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const url = request.nextUrl.clone();

  if (host === "app.vetasist.net") {
    const isRoot = url.pathname === "/";
    const isAlreadyApp = url.pathname.startsWith("/app");
    const isNextAsset = url.pathname.startsWith("/_next");
    const isApi = url.pathname.startsWith("/api");
    const isStaticFile = /\.[a-zA-Z0-9]+$/.test(url.pathname);

    if (isRoot) {
      url.pathname = "/app";
      return NextResponse.rewrite(url);
    }

    if (!isAlreadyApp && !isNextAsset && !isApi && !isStaticFile) {
      url.pathname = `/app${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
