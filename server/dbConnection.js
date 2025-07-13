const mongoose = require('mongoose');
const confighelper = require('./config');
const logger = require('./logger');

// 設定資料庫
const db = mongoose.connection;
db.on('error', (err) => {
    logger.error('MongoDB connection error', err);
});
db.once('open', async () => {
    logger.info('Connected to MongoDB --> ', confighelper.get('mongodb'));

    // 檢查使用者
    const userCollection = db.collection('user');
    const userCount = await userCollection.countDocuments();
    if (userCount === 0) {
        await userCollection.insertOne({
            account: 'admin',
            name: '管理員',
            password: '1234',
            role: 'admin',
            createdAt: new Date(),
            enabled: true,
        });

        const roleCollection = db.collection('role');
        await roleCollection.insertOne({
            "name": "IT",
            "description": "IT角色",
            "enabled": true,
            "system": true,
            "permissions": {
                "home": true,
                "call": true,
                "inbound": true,
                "outbound": true,
                "case": true,
                "history": true,
                "report": true,
                "system": true,
                "audit": true,
                "announcement": true,
                "correction": true,
                "parameter": true,
                "status": true
            }
        });
        await roleCollection.insertOne({
            "name": "一般人員",
            "description": "一般人員角色",
            "enabled": true,
            "system": true,
            "permissions": {

            }
        });
        await roleCollection.insertOne({
            "name": "單位主管",
            "description": "單位主管角色",
            "enabled": true,
            "system": true,
            "permissions": {
                "home": true,
                "call": true,
                "inbound": false,
                "outbound": false,
                "case": true,
                "history": true,
                "report": false,
                "system": false,
                "audit": false,
                "announcement": false,
                "correction": false,
                "parameter": false,
                "status": false
            }
        });
        await roleCollection.insertOne({
            "name": "單位經辨",
            "description": "單位經辨角色",
            "enabled": true,
            "system": true,
            "permissions": {
            }
        });
        await roleCollection.insertOne({
            "name": "稽核人員",
            "description": "稽核人員角色",
            "enabled": true,
            "system": true,
            "permissions": {
                "home": false,
                "call": false,
                "inbound": false,
                "outbound": false,
                "case": false,
                "history": false,
                "report": false,
                "system": false,
                "audit": false,
                "announcement": false,
                "correction": false,
                "parameter": false,
                "status": false
            }
        });
    }
});
// 優先使用環境變數，如果沒有則使用配置檔案
const mongoUri = process.env.MONGODB_URI || confighelper.get('mongodb');
logger.info('Connecting to MongoDB:', mongoUri.replace(/\/\/[^:]*:[^@]*@/, '//***:***@')); // 隱藏密碼
mongoose.connect(mongoUri);


module.exports = db;