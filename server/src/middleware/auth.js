import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || "development-only-secret";

export function authenticate(req, res, next) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(header.slice(7), secret);
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

export const auth = authenticate;

export const requireRoles = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: "Forbidden" });
