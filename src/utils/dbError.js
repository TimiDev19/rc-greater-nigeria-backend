const ApiError = require('./ApiError');

// Logs the raw Supabase error and returns a generic 500 (message is hidden in production).
module.exports = (error) => {
  console.error('[database]', error);
  return new ApiError(500, `Database error: ${error.message}`);
};
