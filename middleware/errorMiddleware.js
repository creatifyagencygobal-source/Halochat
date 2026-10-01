function notFound(req, res) { res.status(404).json({ success: false, message: 'API route not found.' }); }
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 11000) return res.status(409).json({ success: false, message: 'Username is already taken.' });
  const status = error.status || 500;
  if (process.env.NODE_ENV !== 'production') console.error(error);
  return res.status(status).json({ success: false, message: status === 500 ? 'Something went wrong. Please try again.' : error.message });
}
module.exports = { notFound, errorHandler };
