const express = require('express');
const { GridFSBucket } = require('mongodb');
const db = require('../dbConnection');
const logger = require('../logger');

const app = express.Router();

// 處理GridFS錯誤的輔助函數
const handleApiError = (error, res) => {
    logger.error('照片API錯誤:', {
        error: error.message,
        stack: error.stack
    });
    res.status(500).json({
        success: false,
        message: '操作失敗',
        error: error.message
    });
};

// 獲取照片列表（分頁）
app.get('/api/photos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const skip = (page - 1) * pageSize;
        const siteId = req.query.siteId;
        
        logger.info('獲取照片列表', { page, pageSize, siteId, skip });

        if (!db) {
            logger.error('MongoDB 連接不可用');
            return res.status(500).json({
                success: false,
                message: 'MongoDB 連接不可用'
            });
        }
        
        const bucket = new GridFSBucket(db);
        
        // 構建查詢條件
        const query = {};
        if (siteId) {
            query['metadata.siteId'] = siteId;
        }
        
        // 只獲取圖片類型的文件
        query['contentType'] = { $regex: '^image/' };
        
        logger.info('照片查詢條件', query);
        
        // 查詢文件
        const cursor = bucket.find(query)
            .sort({ uploadDate: -1 }) // 最新上傳的排在前面
            .skip(skip)
            .limit(pageSize);
        
        const photos = await cursor.toArray();
        
        logger.info(`找到 ${photos.length} 張照片`);
        res.json(photos);
    } catch (error) {
        handleApiError(error, res);
    }
});

// 根據ID獲取照片詳情
app.get('/api/photos/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const bucket = new GridFSBucket(db);
        
        // 查詢文件
        const files = await bucket.find({ _id: id }).toArray();
        
        if (!files.length) {
            return res.status(404).json({
                success: false,
                message: '照片不存在'
            });
        }
        
        res.json(files[0]);
    } catch (error) {
        handleApiError(error, res);
    }
});

// 獲取照片統計資訊
app.get('/api/photos-stats/:siteId', async (req, res) => {
    try {
        const siteId = req.params.siteId;
        
        logger.info('獲取照片統計', { siteId });

        if (!db) {
            logger.error('MongoDB 連接不可用');
            return res.status(500).json({
                success: false,
                message: 'MongoDB 連接不可用'
            });
        }
        
        const bucket = new GridFSBucket(db);
        
        // 構建查詢條件
        const query = {
            'metadata.siteId': siteId,
            'contentType': { $regex: '^image/' }
        };
        
        // 計算照片張數
        const count = await bucket.find(query).count();
        
        // 計算總容量 (需要彙總所有符合條件的照片大小)
        const photos = await bucket.find(query).toArray();
        const totalSize = photos.reduce((sum, photo) => sum + (photo.length || 0), 0);
        
        // 轉換為 MB
        const sizeInMB = Math.round((totalSize / (1024 * 1024)) * 100) / 100;
        
        logger.info(`照片統計結果`, { siteId, count, sizeInMB });
        
        res.json({
            count: count,
            size: sizeInMB
        });
    } catch (error) {
        handleApiError(error, res);
    }
});

module.exports = app; 