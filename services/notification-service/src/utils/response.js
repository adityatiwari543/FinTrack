function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data
  });
}

function sendError(res, message, statusCode = 400, details = null, code = null) {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(code && { code }),
      ...(details && { details })
    }
  });
}

module.exports = {
  sendSuccess,
  sendError
};
