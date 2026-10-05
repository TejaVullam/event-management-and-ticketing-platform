import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET;
if (!secret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production");
const signingSecret = secret || "development-only-secret";

export const auth = (req, res, next) => {
  try {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer ")) throw new Error("missing token");
    req.user = jwt.verify(header.slice(7), signingSecret);
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
};
export const roles = (...allowed) => (req, res, next) =>
  allowed.includes(req.user?.role) ? next() : res.status(403).json({ error: "Forbidden" });
export const tokenFor = user => jwt.sign({ id: user.id, email: user.email, role: user.role }, signingSecret, { expiresIn: "7d" });

const hits = new Map();
export const rateLimit = (limit = 100, windowMs = 60_000) => (req, res, next) => {
  const key = req.ip || "unknown";
  const now = Date.now();
  const value = hits.get(key);
  if (!value || now - value.started > windowMs) hits.set(key, { started: now, count: 1 });
  else if (++value.count > limit) return res.status(429).json({ error: "Too many requests" });
  next();
};
