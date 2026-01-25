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
    if (!severity || !type || !message) {
      console.error('[VAT-OFF] [ERROR] [runtime] Invalid error handler call', { severity, type, message });
      return;
    }

    const prefix = 'VAT-OFF';
    const severityUpper = String(severity).toUpperCase();
    
    let detailsStr = '';
    if (details) {
      try {
        if (details instanceof Error) {
          detailsStr = ` | ${details.message}`;
        } else if (typeof details === 'object') {
          detailsStr = ` | ${JSON.stringify(details)}`;
        } else {
          detailsStr = ` | ${details}`;
        }
      } catch (e) {
        detailsStr = ' | [unserializable]';
      }
    }
    
    const formattedMessage = `[${prefix}] [${severityUpper}] [${type}] ${message}${detailsStr}`;

    switch (severity) {
      case this.Severity.DEBUG:
        break;

      case this.Severity.INFO:
        console.log(formattedMessage);
        break;

      case this.Severity.WARN:
        console.warn(formattedMessage);
        break;

      case this.Severity.ERROR:
      case this.Severity.CRITICAL:
        console.error(formattedMessage);
        break;

      default:
        console.log(formattedMessage);
    }
  },

  storage(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.ERROR, ErrorHandler.ErrorType.STORAGE, message, details);
  },

  dom(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.WARN, ErrorHandler.ErrorType.DOM, message, details);
  },

  domDebug(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.DEBUG, ErrorHandler.ErrorType.DOM, message, details);
  },

  parsing(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.WARN, ErrorHandler.ErrorType.PARSING, message, details);
  },

  validation(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.ERROR, ErrorHandler.ErrorType.VALIDATION, message, details);
  },

  performance(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.WARN, ErrorHandler.ErrorType.PERFORMANCE, message, details);
  },

  runtime(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.ERROR, ErrorHandler.ErrorType.RUNTIME, message, details);
  },

  critical(message, details = null) {
    ErrorHandler.log(ErrorHandler.Severity.CRITICAL, ErrorHandler.ErrorType.RUNTIME, message, details);
  }
};
