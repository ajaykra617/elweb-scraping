// src/api/middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "changeme123";

export async function requireAuth(req, res, next) {
  try {
    // try cookie token first
    let token = req.cookies?.token;

    // fallback: check Authorization Bearer
    if (!token && req.headers?.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    console.log("DEBUG requireAuth: incoming request", {
      path: req.originalUrl,
      cookie_token_present: !!req.cookies?.token,
      auth_header_present: !!req.headers?.authorization,
    });

    if (!token) {
      console.log("DEBUG requireAuth: no token provided");
      return res.status(401).json({ error: "Unauthorized" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      console.log("DEBUG requireAuth: jwt.verify failed:", e.message);
      return res.status(401).json({ error: "Unauthorized" });
    }

    // log decoded token
    console.log("DEBUG requireAuth: decoded token:", decoded);

    const user = await User.findByPk(decoded.id);
    if (!user) {
      console.log("DEBUG requireAuth: user not found for id", decoded.id);
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Attach trimmed user object (avoid heavy payloads)
    req.user = { id: user.id, email: user.email, name: user.name ?? null };
    console.log("DEBUG requireAuth: user attached", req.user);

    next();
  } catch (err) {
    console.log("DEBUG requireAuth: unexpected error", err && err.stack ? err.stack : err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}