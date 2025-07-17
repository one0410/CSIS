const express = require('express');
const { GridFSBucket } = require('mongodb');
const { EJSON } = require('bson');
const multer = require('multer');
const db = require('../dbConnection');
const logger = require('../logger');

const app = express.Router();

// 配置 multer 存儲
const storage = multer.memoryStorage();

// 配置 multer - 簡化配置，確保能正確解析表單
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    }
});

const handleGridFSError = (error, res) => {
    logger.error('GridFS operation error:', {
        error: error.message,
        stack: error.stack
    });
    res.status(500).json({
        success: false,
        message: '操作失敗',
        error: error.message
    });
};

app.get('/api/gridfs/:filename', async (req, res) => {
    try {
        const bucket = new GridFSBucket(db);
        const filename = req.params.filename;

        const files = await bucket.find({ filename: filename }).toArray();
        if (!files.length) {
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        res.set('Content-Type', files[0].contentType);
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

        const downloadStream = bucket.openDownloadStreamByName(filename);
        downloadStream.on('error', (error) => handleGridFSError(error, res));
        downloadStream.pipe(res);
    } catch (error) {
        handleGridFSError(error, res);
    }
});

// 處理文件上傳 - 直接使用 multer 中間件
app.post('/api/gridfs/upload', upload.single('file'), async (req, res) => {
    try {
        logger.info('處理上傳請求', {
            contentType: req.get('Content-Type'),
            hasBody: !!req.body,
            hasFile: !!req.file
        });

        // 檢查是否有文件
        if (!req.file) {
            logger.error('上傳失敗: 沒有檔案被上傳');
            return res.status(400).json({
                success: false,
                message: '沒有檔案被上傳'
            });
        }

        logger.info('上傳的文件', {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            hasBuffer: !!req.file.buffer
        });

        // 檢查db和連接狀態
        if (!db) {
            logger.error('MongoDB 連接不可用');
            return res.status(500).json({
                success: false,
                message: 'MongoDB 連接不可用'
            });
        }

        // 生成唯一文件名
        const timestamp = Date.now();
        const uniqueFilename = `${timestamp}_${req.file.originalname}`;

        // 創建 GridFS bucket
        const bucket = new GridFSBucket(db);

        let metadata = {
            uploadDate: new Date(),
            fileSize: req.file.size,
            originalName: req.file.originalname
        };

        if (req.body) {
            // 處理特殊欄位，特別是標籤資料
            const processedBody = { ...req.body };
            
            // 如果有 tags 欄位且為字串，嘗試解析為 JSON
            if (processedBody.tags && typeof processedBody.tags === 'string') {
                try {
                    processedBody.tags = JSON.parse(processedBody.tags);
                    logger.info('成功解析標籤資料:', processedBody.tags);
                } catch (error) {
                    logger.warn('標籤資料解析失敗，保持原始值:', processedBody.tags);
                }
            }
            
            metadata = {
                ...metadata,
                ...processedBody
            };
            
            logger.info('處理後的元數據:', metadata);
        }

        // 打開上傳流
        const uploadStream = bucket.openUploadStream(uniqueFilename, {
            contentType: req.file.mimetype,
            metadata: metadata,
        });

        // 監聽錯誤事件
        uploadStream.on('error', (error) => {
            logger.error('文件上傳錯誤', { error: error.message });
            return handleGridFSError(error, res);
        });

        // 監聽完成事件
        uploadStream.on('finish', () => {
            logger.info('文件上傳成功', {
                id: uploadStream.id,
                filename: uniqueFilename
            });

            res.json({
                success: true,
                fileId: uploadStream.id,
                filename: uniqueFilename,
                originalname: req.file.originalname,
                size: req.file.size,
                contentType: req.file.mimetype
            });
        });

        // 寫入文件數據
        if (req.file.buffer && req.file.buffer.length > 0) {
            uploadStream.write(req.file.buffer);
            uploadStream.end();
        } else {
            logger.error('上傳失敗: 文件數據為空');
            return res.status(400).json({
                success: false,
                message: '文件數據為空'
            });
        }
    } catch (error) {
        logger.error('上傳處理異常', {
            error: error.message,
            stack: error.stack
        });
        handleGridFSError(error, res);
    }
});

// 查詢 metadata 符合條件的檔案列表
app.post('/api/gridfs/metadata', async (req, res) => {
    try {
        const filter = req.body;
        
        // 將 filter 中的每個欄位都加上 metadata. 前綴
        const mongoFilter = {};
        for (const [key, value] of Object.entries(filter)) {
            mongoFilter[`metadata.${key}`] = value;
        }
        
        const files = await db.collection('fs.files').find(mongoFilter).toArray();
        res.json({
            success: true,
            files: files
        });
    } catch (error) {
        handleGridFSError(error, res);
    }
});

// patch
app.patch('/api/gridfs/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const updates = req.body;
        
        if (!updates || Object.keys(updates).length === 0) {
            logger.error('更新失敗: 沒有提供更新數據', { filename });
            return res.status(400).json({
                success: false,
                message: '沒有提供更新數據'
            });
        }
        
        logger.info('嘗試更新檔案元數據', { filename, updates });
        
        // 確認文件是否存在
        const filesCollection = db.collection('fs.files');
        const file = await filesCollection.findOne({ filename: filename });
        
        if (!file) {
            logger.error('更新失敗: 文件不存在', { filename });
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }
        
        // 確保 metadata 存在
        if (!file.metadata) {
            file.metadata = {};
        }
        
        // 更新元數據
        const updatedMetadata = {
            ...file.metadata,
            ...updates,
            lastModified: new Date()
        };
        
        // 更新文件元數據
        const result = await filesCollection.updateOne(
            { _id: file._id },
            { $set: { metadata: updatedMetadata } }
        );
        
        if (result.modifiedCount === 0) {
            logger.warn('文件找到但未更新', { filename });
            return res.status(400).json({
                success: false,
                message: '文件找到但未更新'
            });
        }
        
        logger.info('文件元數據更新成功', { filename });
        res.json({
            success: true,
            message: '文件元數據已更新',
            filename: filename,
            metadata: updatedMetadata
        });
        
    } catch (error) {
        logger.error('更新檔案元數據錯誤', { error: error.message, stack: error.stack });
        handleGridFSError(error, res);
    }
});

// 新增：取得檔案詳細資訊
app.get('/api/gridfs/:filename/info', async (req, res) => {
    try {
        const filename = req.params.filename;
        
        logger.info('嘗試獲取檔案資訊', { filename });
        
        // 確認文件是否存在
        const filesCollection = db.collection('fs.files');
        const file = await filesCollection.findOne({ filename: filename });
        
        if (!file) {
            logger.error('獲取檔案資訊失敗: 文件不存在', { filename });
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }
        
        logger.info('獲取檔案資訊成功', { filename, fileId: file._id });
        res.json({
            success: true,
            _id: file._id,
            filename: file.filename,
            contentType: file.contentType,
            length: file.length,
            uploadDate: file.uploadDate,
            metadata: file.metadata || {}
        });
        
    } catch (error) {
        logger.error('獲取檔案資訊錯誤', { error: error.message, stack: error.stack });
        handleGridFSError(error, res);
    }
});

app.delete('/api/gridfs/:filename', async (req, res) => {
    try {
        const bucket = new GridFSBucket(db);
        const filename = req.params.filename;

        logger.info('嘗試刪除檔案', { filename });

        const files = await bucket.find({ filename: filename }).toArray();
        if (!files.length) {
            logger.error('刪除失敗: 文件不存在', { filename });
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        logger.info('刪除檔案', { filename, fileId: files[0]._id });
        await bucket.delete(files[0]._id);

        logger.info('刪除成功', { filename });
        res.json({
            success: true,
            message: '文件已刪除',
            filename: filename
        });

    } catch (error) {
        logger.error('刪除檔案錯誤', { error: error.message, stack: error.stack });
        handleGridFSError(error, res);
    }
});

// 新增：搜尋符合條件的檔案
app.post('/api/gridfs/search', async (req, res) => {
    try {
        const query = EJSON.parse(JSON.stringify(req.body)) || {};
        
        logger.info('搜尋檔案', { query });

        if (!db) {
            logger.error('MongoDB 連接不可用');
            return res.status(500).json({
                success: false,
                message: 'MongoDB 連接不可用'
            });
        }
        
        const bucket = new GridFSBucket(db);
        
        // 查詢文件
        const files = await bucket.find(query)
            //.sort({ uploadDate: -1 }) // 最新上傳的排在前面
            .toArray();
        
        logger.info(`搜尋到 ${files.length} 個檔案`);
        res.json(
            {
                success: true,
                files: files
            }
        );
    } catch (error) {
        logger.error('搜尋檔案錯誤', { error: error.message, stack: error.stack });
        handleGridFSError(error, res);
    }
});

// 新增：根據檔案ID取得檔案內容（支援縮圖）
app.get('/api/gridfs/file/:id', async (req, res) => {
    try {
        const { ObjectId } = require('mongodb');
        const fileId = req.params.id;
        const thumbnail = req.query.thumbnail === 'true';
        
        logger.info('取得檔案', { fileId, thumbnail });

        if (!db) {
            logger.error('MongoDB 連接不可用');
            return res.status(500).json({
                success: false,
                message: 'MongoDB 連接不可用'
            });
        }
        
        const bucket = new GridFSBucket(db);
        
        // 檢查檔案是否存在
        // 建立查詢條件：如果 fileId 是有效的 ObjectId 格式，則同時搜尋 _id 和 filename；否則只搜尋 filename
        let query;
        if (ObjectId.isValid(fileId)) {
            query = { $or: [{ _id: new ObjectId(fileId) }, { filename: fileId }] };
        } else {
            query = { filename: fileId };
        }
        
        const files = await bucket.find(query).toArray();
        if (!files.length) {
            return res.status(404).json({
                success: false,
                message: '檔案不存在'
            });
        }
        
        const file = files[0];
        
        // 設定回應標頭
        res.set('Content-Type', file.contentType);
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
        
        if (thumbnail && file.contentType && file.contentType.startsWith('image/')) {
            // 使用 sharp 產生縮圖
            const sharp = require('sharp');
            const downloadStream = bucket.openDownloadStream(file._id);
            
            const transformer = sharp()
                .resize(150, 150, { 
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 80 });
            
            downloadStream.on('error', (error) => {
                logger.error('檔案下載錯誤', { fileId: file._id, error: error.message });
                handleGridFSError(error, res);
            });
            
            transformer.on('error', (error) => {
                logger.error('縮圖產生錯誤', { fileId: file._id, error: error.message });
                handleGridFSError(error, res);
            });
            
            downloadStream.pipe(transformer).pipe(res);
        } else {
            // 直接傳送檔案
            const downloadStream = bucket.openDownloadStream(file._id);
            downloadStream.on('error', (error) => {
                logger.error('檔案下載錯誤', { fileId: file._id, error: error.message });
                handleGridFSError(error, res);
            });
            downloadStream.pipe(res);
        }
    } catch (error) {
        logger.error('取得檔案錯誤', { error: error.message, stack: error.stack });
        handleGridFSError(error, res);
    }
});

module.exports = app;
