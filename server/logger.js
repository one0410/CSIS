// logger.js
const winston = require('winston');
require('winston-daily-rotate-file');

const { format } = winston;

// 自定義格式
const customFormat = format.printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

// 所有級別的日誌傳輸
const allLogsTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/all-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

// 僅錯誤級別的日誌傳輸
const errorLogsTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error'
});

const _logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    customFormat
  ),
  transports: [
    allLogsTransport,
    errorLogsTransport
  ],
});

if (process.env.NODE_ENV !== 'production') {
  _logger.add(new winston.transports.Console({
    format: format.combine(
      format.colorize(),
      customFormat
    )
  }));
}

const logger = {
  // info 可以接收多個參數
  info: (...message) => {
    // 有些為物件, 全部轉成字串後輸出
    _logger.info(message.map((m) => {
      if (typeof m === 'object') {
        return JSON.stringify(m);
      }
      return m;
    }).join(' '));
  },
  error: (...message) => {
    _logger.error(message.map((m) => {
      if (typeof m === 'object') {
        return JSON.stringify(m);
      }
      return m;
    }).join(' '));
  },
  warn: (...message) => {
    _logger.warn(message.map((m) => {
      if (typeof m === 'object') {
        return JSON.stringify(m);
      }
      return m;
    }).join(' '));
  },
  debug: (...message) => {
    _logger.debug(message.map((m) => {
      if (typeof m === 'object') {
        return JSON.stringify(m);
      }
      return m;
    }).join(' '));
  }
};

module.exports = logger;