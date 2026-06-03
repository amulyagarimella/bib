// Vercel Edge Middleware: HTTP Basic Auth on the home screen and the admin
// API. Individual collection pages (/c/*) and the reader data (/api/items)
// are intentionally left public so unlisted links work without a password.

export const config = {
  matcher: ["/", "/index.html", "/api/collections"],
};

export default function middleware(request) {
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD;

  const unauthorized = () =>
    new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="bib admin", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });

  // Fail closed: if no password is configured, never expose the admin surface.
  if (!expectedPass) return unauthorized();

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      return unauthorized();
    }
    const idx = decoded.indexOf(":");
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (user === expectedUser && pass === expectedPass) {
      return; // authenticated — continue to the route
    }
  }
  return unauthorized();
}
