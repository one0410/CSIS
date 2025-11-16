// 提供給 index.js 使用 (引入所有路由)
const express = require('express');
const mongoose = require('mongoose');
const confighelper = require('../config');
const { EJSON, ObjectId } = require('bson');
const path = require('path');
const db = require('../dbConnection');
const logger = require('../logger');

const app = express.Router();


app.post('/api/login', async (req, res) => {
    let account = req.body.account;
    let password = req.body.password;
    // if (username === 'admin' && password === '1234') {
    //     res.send({ success: true, name: username, account: username, role: 'admin' });
    // } else {
    //     res.send({ success: false });
    // }

    // 找出 (account == acount 或 sessionId == account) && password == password 的使用者
    const users = db.collection('user');
    users.findOne({ $or: [{ account: account }, { sessionId: account }], password: password }, async (err, doc) => {
        if (err) {
            logger.error('login error', err);
            res.status(500).send;
        }
        if (doc) {
            // 檢查帳號是否停用
            if (doc.isEnabled === false) {
                res.send({ success: false, enabled: false, message: '帳號已停用' });
                return;
            }

            // 如果有 provider, 檢查 expiration 是否過期
            if (doc.provider && doc.expiration && doc.expiration < new Date()) {
                res.send({ success: false, expired: true, message: '登入已過期' });
                return;
            }

            // 檢查帳號是否 locked
            if (doc.locked) {
                res.send({ success: false, locked: true, lockedAt: doc.lockedAt, message: '帳號已鎖定' });
                return;
            }

            res.send({ success: true,
                user: {
                    _id: doc._id,
                    name: doc.name,
                    account: doc.account,
                    role: doc.role
                },
                token: '1234567890'
            });
        } else {
            // if (account === 'admin' && password === '1234') {
            //     try {
            //         // 表示是第一次登入, 建立 admin 帳號
            //         await users.insertOne({ account, password, role: 'admin', name: '管理員', email: 'admin@mydomain.domain', isEnabled: true });
            //         // 新增三筆會議室
            //         const meetingrooms = db.collection('room');
            //         await meetingrooms.insertOne({ name: '會議室A', isEnabled: true, color: '#7fff00' });
            //         await meetingrooms.insertOne({ name: '會議室B', isEnabled: true, color: '#6495ed' });
            //         await meetingrooms.insertOne({ name: '會議室C', isEnabled: true, color: '#ff69b4' });
            //         res.send({ success: true, _id: result._id, name: '管理員', account: account, role: 'admin' });
            //     } catch (error) {
            //         logger.error('login insert admin error', error);
            //         res.status(500).send(err);
            //     }

            //     return;
            // }

            res.send({ success: false });
        }
    });
});


// GET /api/mongodb/:collectionName/:filter filter 可以是空字串或是 JSON 字串
// GET /api/mongodb/:collectionName?filter={}&projection={}&sort={}&limit=0&skip=0
app.get('/api/mongodb/:collectionName/:filter?', async (req, res) => {
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);

    // 取得 filter 或 query 變數
    let filter = req.params.filter || req.query.filter || req.query.query || '{}';
    try {
        filter = EJSON.parse(filter);
    } catch (error) {
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.status(500).send(`filter 參數錯誤\n${filter}\n${error}`);
        return;
    }

    // 取得 projection 變數
    let projection = req.query.projection || '{}';
    try {
        projection = EJSON.parse(projection);
    } catch (error) {
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.status(500).send(`projection 參數錯誤\n${projection}\n${error}`);
        return;
    }

    // 取得 sort 變數
    let sort = req.query.sort || '{}';
    try {
        sort = JSON.parse(sort);
    } catch (error) {
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.status(500).send(`sort 參數錯誤\n${sort}\n${error}`);
        return;
    }

    // 取得 limit 變數
    let limit = 0;
    if (req.query.limit) {
        limit = parseInt(req.query.limit);
    }

    // 取得 skip 變數
    let skip = 0;
    if (req.query.skip) {
        skip = parseInt(req.query.skip);
    }

    try {
        let count = await collection.countDocuments(filter);
        let docs = await collection.find(filter).project(projection).sort(sort).limit(limit).skip(skip).toArray();

        // _id 轉換為 string
        docs.forEach(doc => {
            doc._id = doc._id.toString();
        });

        res.header('X-Pagination', JSON.stringify({ count, limit, skip }));
        res.set('Content-Type', 'application/json');
        res.send(EJSON.stringify(docs));
    } catch (error) {
        logger.error('mongodb get error', error);
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.status(500).send(error);
    }
});

// app.get('/api/mongodb/:collectionName/:id', (req, res) => {
//     let objId = new ObjectId(req.params.id);
//     const collectionName = req.params.collectionName;
//     const collection = db.collection(collectionName);
//     collection.findOne({ _id: objId }, (err, doc) => {
//         if (err) {
//             logger.error(err);
//             res.status(500).send(err);
//         } else {
//             res.send(doc);
//         }
//     });
// });

app.post('/api/mongodb/:collectionName', (req, res) => {
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);
    const doc = req.body;
    const json = EJSON.parse(JSON.stringify(doc));

    // 如果沒有 _id 屬性, 則自動產生一個
    if (!json._id) {
        json._id = new ObjectId();
    }

    collection.insertOne(json, (err, result) => {
        if (err) {
            logger.error('mongodb insert error', err);
            res.status(500).send(err);
        } else {
            res.send(result);
        }
    });
});

// 修改 collection 中 id 為 :id 的資料
app.put('/api/mongodb/:collectionName/:id', (req, res) => {
    let id = new ObjectId(req.params.id);
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);
    const doc = req.body;
    let json = EJSON.parse(JSON.stringify(doc));

    // 刪除 _id 屬性
    delete json._id;

    collection.updateOne({ _id: id }, { $set: json }, (err, result) => {
        if (err) {
            logger.error('mongodb put error', err);
            res.status(500).send(err);
        } else {
            res.send(result);
        }
    });
});

app.patch('/api/mongodb/:collectionName/:id', (req, res) => {
    // 只更新指定的欄位
    let id = new ObjectId(req.params.id);
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);
    const doc = req.body;
    let json = EJSON.parse(JSON.stringify(doc));
    // 刪除 _id 屬性
    delete json._id;

    collection.updateOne({ _id: id }, { $set: json }, (err, result) => {
        if (err) {
            logger.error('mongodb patch error', err);
            res.status(500).send
        }
        res.send(result);
    }
    );
});


// 刪除 collection 中 id 為 :id 的資料
app.delete('/api/mongodb/:collectionName/:id', (req, res) => {
    let objId = new ObjectId(req.params.id);
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);

    collection.deleteOne({ _id: objId }, (err, result) => {
        if (err) {
            logger.error('mongodb delete error', err);
            res.status(500).send(err);
        } else {
            res.send(result);
        }
    });
});


// 刪除 collection 中符合 filter 的資料
app.post('/api/mongodb/:collectionName/deleteMany', (req, res) => {
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);
    const filter = req.body;
    collection.deleteMany(filter, (err, result) => {
        if (err) {
            logger.error('mongodb deleteMany error', err);
            res.status(500).send(err);
        }
        res.send(result);
    });
});

// 取得 collection 中符合 filter 的資料數量
app.get('/api/mongodb/:collectionName/count', async (req, res) => {
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);
    const filter = req.body || {};
    let count = await collection.countDocuments(filter);
    res.send({ count });
});

//aggregate
app.post('/api/mongodb/:collectionName/aggregate', async (req, res) => {
    const collectionName = req.params.collectionName;
    const collection = db.collection(collectionName);
    const expressions = req.body;
    let result = await collection.aggregate(expressions).toArray();
    res.send(result);
});

// 取得 server 狀態
app.get('/api/status', async (req, res) => {
    let version = '2024-12-09';
    let online = true;

    // get harddrive free space
    let freeSpace = 0;
    let totalSpace = 0;
    let usedSpace = 0;
    let percent = 0;

    const checkDiskSpace = require('check-disk-space').default;
    let checkPath = '/';
    if (process.platform === 'win32') {
        checkPath = path.dirname(process.cwd());
    }

    let info = await checkDiskSpace(checkPath);
    freeSpace = info.free;
    totalSpace = info.size;
    usedSpace = totalSpace - freeSpace;
    percent = Math.round((usedSpace / totalSpace) * 100);

    res.send({ version, online, freeSpace, totalSpace, usedSpace, percent });

    // 回傳 JSON 物件，例如: { version: '2024-02-11', online: true, freeSpace: 123456, totalSpace: 123456, usedSpace: 123456, percent: 50 } 
});

module.exports = app;
