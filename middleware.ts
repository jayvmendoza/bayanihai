import { NextResponse, type NextRequest } from "next/server";
import { PRESENTER_COOKIE, presenterToken } from "@/lib/presenter";

// Locks the presenter console (/demo) behind DEMO_PASSWORD when it is set (public deployments).
export async function middleware(req: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const token = await presenterToken(password);
  if (req.cookies.get(PRESENTER_COOKIE)?.value === token) return NextResponse.next();

  // Browser login prompt: any username, the password must match.
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) {
      const res = NextResponse.next();
      res.cookies.set(PRESENTER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 7 });
      return res;
    }
  }
  return new NextResponse("Presenter login required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="BAYANIHAI presenter", charset="UTF-8"' } });
}

export const config = { matcher: ["/demo/:path*"] };
