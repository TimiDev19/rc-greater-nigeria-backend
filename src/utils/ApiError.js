class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Human readable message
   * @param {object} [errors] Per-field validation messages, e.g. { title: 'is required' }
   */
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    if (errors) this.errors = errors;
  }
}

module.exports = ApiError;
