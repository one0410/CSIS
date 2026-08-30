"""CSIS RAG worker 的 logging 設定(移植自 SuperAI python/shared/log.py)。

- logs/ 目錄每日一檔,保留 7 天
- 同時輸出 console(Windows 需設 PYTHONUTF8=1 避免 cp950 中文炸掉)
"""

import logging
import os
from logging.handlers import TimedRotatingFileHandler

LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(f"csis.{name}")

    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    os.makedirs(LOGS_DIR, exist_ok=True)

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(LOGS_DIR, "csis-rag.log"),
        when="midnight",
        interval=1,
        backupCount=7,
        encoding="utf-8",
    )
    file_handler.suffix = "%Y-%m-%d"
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    )

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(message)s"))

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger
