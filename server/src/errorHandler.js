export function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || (err.name === "ValidationError" ? 400 : 500);
  res.status(status).json({ error: process.env.NODE_ENV === "production" && status >= 500 ? "Server error" : err.message });
}
export default errorHandler;
