const ErrorHandler = {
  Severity: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical'
  },

  ErrorType: {
    STORAGE: 'storage',
    DOM: 'dom',
    PARSING: 'parsing',
    VALIDATION: 'validation',
    PERFORMANCE: 'performance',
    RUNTIME: 'runtime'
  },

  log(severity, type, message, details = null) {
    const timestamp = new Date().toISOString();
    const prefix = 'VAT-OFF';
    const formattedMessage = `[${prefix}] [${severity.toUpperCase()}] [${type}] ${message}`;

    switch (severity) {
      case this.Severity.DEBUG:
      case this.Severity.INFO:
        if (details) {
          console.log(formattedMessage, details);
        } else {
          console.log(formattedMessage);
        }
        break;

      case this.Severity.WARN:
        if (details) {
          console.warn(formattedMessage, details);
        } else {
          console.warn(formattedMessage);
        }
        break;

      case this.Severity.ERROR:
      case this.Severity.CRITICAL:
        if (details) {
          console.error(formattedMessage, details);
        } else {
          console.error(formattedMessage);
        }
        break;

      default:
        console.log(formattedMessage, details);
    }
  },

  storage(message, details = null) {
    this.log(this.Severity.ERROR, this.ErrorType.STORAGE, message, details);
  },

  dom(message, details = null) {
    this.log(this.Severity.WARN, this.ErrorType.DOM, message, details);
  },

  parsing(message, details = null) {
    this.log(this.Severity.WARN, this.ErrorType.PARSING, message, details);
  },

  validation(message, details = null) {
    this.log(this.Severity.ERROR, this.ErrorType.VALIDATION, message, details);
  },

  performance(message, details = null) {
    this.log(this.Severity.WARN, this.ErrorType.PERFORMANCE, message, details);
  },

  runtime(message, details = null) {
    this.log(this.Severity.ERROR, this.ErrorType.RUNTIME, message, details);
  },

  critical(message, details = null) {
    this.log(this.Severity.CRITICAL, this.ErrorType.RUNTIME, message, details);
  }
};
