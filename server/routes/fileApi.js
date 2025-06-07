const express = require('express');
const fs = require('fs');
const path = require('path');

// const log4js = require('log4js');
// const logger = log4js.getLogger();
// logger.level = 'debug';
const logger = require('../logger');

const app = express();

// 新增檔案 /api/file/:path path 為包含路徑的檔案名稱, 例如: /data/test.json
app.post('/api/file/:path(*)', async (req, res) => {
    try {
        console.log(req.params.path);
        // let filePath = path.join(__dirname, req.params.path);
        // if (process.pkg) {
        //     filePath = path.join(path.dirname(process.execPath), req.params.path);
        // }
        let filePath = path.join(process.cwd(), req.params.path);

        // read content from body, if json then convert to string
        //const fileData = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;

        // 檢查目錄是否存在, 不存在就建立一個
        const folderPath = path.dirname(filePath);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        // if header has content-type: application/json, then convert to string
        let fileData;
        if (req.get('content-type') === 'application/json') {
            fileData = JSON.stringify(req.body);
        } else {
            fileData = req.body;
        }

        try {
            fs.writeFile(filePath, fileData, (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('無法新增檔案。');
                    logger.error('新增檔案ERROR', req.params.path, err);
                } else {
                    res.send('檔案已成功新增。');
                    logger.info('新增檔案API', req.params.path, fileData.length, ', IP:', req.ip);
                }
            });
        } catch (error) {
            logger.error('新增檔案 try catch ERROR', req.params.path, error);
        }

        try {
            // 如果檔案系統已達 95% 使用量, 就刪除 path 第一層目錄下的最舊檔案, 直到使用量降到 90%
            const checkDiskSpace = require('check-disk-space').default;
            let firstLevelPath = req.params.path.split('/').filter((item) => item)[0];
            // let checkPath = path.join(__dirname, firstLevelPath);
            // if (process.pkg) {
            //     checkPath = path.join(path.dirname(process.execPath), firstLevelPath);
            // }
            let checkPath = path.join(process.cwd(), firstLevelPath);
            let info = await checkDiskSpace(checkPath);
            let percent = (info.free / info.size) * 100;
            if (percent < 5) {
                logger.info('已達 95% 使用量, 開始刪除舊檔', checkPath, percent);
                while (percent < 10) {
                    let files = fs.readdirSync(checkPath, { withFileTypes: true });
                    let oldestFile = files.reduce((oldest, file) => {
                        let stats = fs.statSync(path.join(checkPath, file.name));
                        if (!oldest || stats.birthtime < oldest.birthtime) {
                            return { name: file.name, birthtime: stats.birthtime };
                        }
                        return oldest;
                    }, null);
                    fs.rmSync(path.join(checkPath, oldestFile.name));
                    info = await checkDiskSpace(checkPath);
                    percent = (info.free / info.size) * 100;
                }
            }
        } catch (error) {
            logger.error('新增檔案刪除舊檔 ERROR12', req.params.path, error);
        }

    } catch (error) {
        logger.error('新增檔案 try catch ERROR2', req.params.path, error);
    }
});

// 刪除檔案
app.delete('/api/file/:path(*)', (req, res) => {
    // 檢查 header 有沒有 username 參數
    let username = req.get('username');
    if (username) {
        username = path.join('users', username);
    }

    // let filePath = path.join(__dirname, username, req.params.path);
    // if (process.pkg) {
    //     filePath = path.join(path.dirname(process.execPath), username, req.params.path);
    // }
    let filePath = path.join(process.cwd(), req.params.path);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('無法刪除檔案。');
            logger.error('刪除檔案ERROR', req.params.path, err);
        } else {
            res.send('檔案已成功刪除。');
            logger.info('刪除檔案API, ', req.params.path, ', IP:', req.ip);
        }
    });
});

// 讀取檔案
app.get('/api/file/:path(*)', (req, res) => {
    let reqPath = req.params.path;

    // 檢查 header 有沒有 username 參數
    let username = req.get('username') || '';
    if (username) {
        username = path.join('users', username);
    }

    // let filePath = path.join(__dirname, username, reqPath);
    // if (process.pkg) {
    //     filePath = path.join(path.dirname(process.execPath), username, reqPath);
    // }
    let filePath = path.join(process.cwd(), reqPath);

    // 檢查檔案是否存在
    if (!fs.existsSync(filePath)) {
        res.status(404).send('檔案不存在。');
        logger.info('讀取檔案檔案不存在', req.params.path);
        return;
    }


    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send('無法讀取檔案。');
            logger.error('讀取檔案ERROR', res.status, req.params.path, err);
        } else {
            // 如果檔案結尾是圖片檔, 設定回傳的標頭為 image/png
            console.info('app.get filepath', filePath);
            if (filePath.match(/\.(png|jpg|jpeg|gif)$/i)) {
                res.set('Content-Type', 'image/png');
            } else if (filePath.match(/\.(pdf)$/i)) {
                res.set('Content-Type', 'application/pdf');
            } else if (filePath.match(/\.(mp4)$/i)) {
                res.set('Content-Type', 'video/mp4');
            } else if (filePath.match(/\.(mp3)$/i)) {
                res.set('Content-Type', 'audio/mpeg');
            } else if (filePath.match(/\.(txt|srt)$/i)) {
                res.set('Content-Type', 'text/plain');
            } else if (filePath.match(/\.(json)$/i)) {
                res.set('Content-Type', 'application/json');
            } else if (filePath.match(/\.(wav)$/i)) {
                res.set('Content-Type', 'application/octet-stream');
                res.set('Accept-Ranges', 'bytes');
            } else {
                res.set('Content-Type', 'application/octet-stream');
                res.set('Content-Disposition', 'attachment; filename=' + encodeURI(reqPath));
            }

            res.send(data);
            logger.info('讀取檔案API, ', req.params.path, data.length, ', IP:', req.ip);
        }
    });


    // res.sendFile(filePath, (err) => {
    //     if (err) {
    //         console.error(err);
    //         res.status(500).send('無法讀取檔案。');
    //         logger.error('讀取檔案ERROR', res.status, req.params.path, err);
    //     } else {
    //         logger.info('讀取檔案API, ', res.status, req.params.path, ', IP:', req.ip);
    //     }
    // });
});

// 讀取多個檔案, 壓縮成 zip 檔案送出
app.post('/api/download', async (req, res) => {
    try {
        let reqPath = req.params.path;

        // 檢查 header 有沒有 username 參數
        let username = req.get('username');
        if (username) {
            username = path.join('users', username);
        }

        // 建立一個 zip , 檔案名為 download.zip
        const filename = 'download.zip';
        // let filePath = path.join(__dirname, username, filename);
        // let basePath = path.join(__dirname, username, req.body.path);
        // if (process.pkg) {
        //     filePath = path.join(path.dirname(process.execPath), username, filename);
        //     basePath = path.join(path.dirname(process.execPath), username, req.body.path);
        // }
        let filePath = path.join(process.cwd(), filename);
        let basePath = path.join(process.cwd(), req.body.path);

        let files = req.body.items.filter((file) => {
            return file.type === 'file';
        });
        let folders = req.body.items.filter((file) => {
            return file.type === 'directory';
        });

        await zipFiles(basePath, folders, files, filePath);

        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', 'attachment; filename=Download.zip');
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error(err);
                res.status(500).send('無法讀取多檔案。');
                logger.error('讀取多檔案ERROR', res.status, req.params.path, err);
            } else {
                // 讀取完成後, 刪除 zip 檔案
                fs.rmSync(filePath, { recursive: true });

                logger.info('讀取多檔案API, ', res.status, req.params.path, ', IP:', req.ip);
            }
        });
    } catch (error) {
        logger.error('讀取多個檔案 try catch ERROR', req.params.path, error);
    }
});

// 列出資料夾內容
app.get('/api/folder/:path(*)', (req, res) => {
    try {
        // let folderPath = __dirname;
        // if (process.pkg) {
        //     folderPath = path.dirname(process.execPath);
        // }
        let folderPath = process.cwd();
        if (req.params.path) {
            folderPath = path.join(folderPath, req.params.path);
        }

        if (!fs.existsSync(folderPath)) {
            res.status(500).send('資料夾不存在。');
            logger.error('列出資料夾內容ERROR, 資料夾不存在', req.params.path);
            return;
        }

        fs.readdir(folderPath, { withFileTypes: true }, (err, files) => {
            if (err) {
                console.error(err);
                res.status(500).send('無法列出資料夾內容。');
                logger.error('列出資料夾內容ERROR', req.params.path, err);
            } else {
                const items = files.map((file) => {
                    const filePath = path.join(folderPath, file.name);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file.name,
                        type: file.isDirectory() ? 'directory' : 'file',
                        createdAt: stats.birthtime,
                        modifiedAt: stats.mtime,
                        size: stats.size
                    };
                });
                res.send(items);
                logger.info('列出資料夾內容 API:', folderPath, ', 數量:', items.length, ', IP:', req.ip);
            }
        });
    } catch (error) {
        logger.error('列出資料夾內容 try catch ERROR', req.params.path, error);
    }
});

// 建立目錄
app.post('/api/folder/:path(*)', (req, res) => {
    // let folderPath = path.join(__dirname, req.params.path);
    // if (process.pkg) {
    //     folderPath = path.join(path.dirname(process.execPath), req.params.path);
    // }
    let folderPath = path.join(process.cwd(), req.params.path);

    fs.mkdir(folderPath, { recursive: true }, (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('無法建立目錄。');
            logger.error('建立目錄ERROR', req.params.path, err);
        } else {
            res.sendStatus(200);
            logger.info('建立目錄 API:', folderPath, ', IP:', req.ip);
        }
    });
});

// 刪除目錄
app.delete('/api/folder/:path(*)', (req, res) => {
    // 檢查 header 有沒有 username 參數
    let username = req.get('username');
    if (username) {
        username = path.join('users', username);
    } else {
        username = '';
    }

    // let folderPath = path.join(__dirname, username, req.params.path);
    // if (process.pkg) {
    //     folderPath = path.join(path.dirname(process.execPath), username, req.params.path);
    // }
    let folderPath = path.join(process.cwd(), username, req.params.path);

    fs.rm(folderPath, { recursive: true }, (err) => {
        if (err) {
            console.error(err);
            logger.error('刪除目錄ERROR', req.params.path, err);
            res.status(500).send('無法刪除目錄。');
        } else {
            res.sendStatus(200);
            logger.info('刪除目錄 API:', folderPath, ', IP:', req.ip);
        }
    });
});

// 目錄改名, 例如: /api/folder/test/test.txt?newname=test2.txt
app.put('/api/folder/:path(*)', (req, res) => {
    // let folderPath = path.join(__dirname, req.params.path);
    // if (process.pkg) {
    //     folderPath = path.join(path.dirname(process.execPath), req.params.path);
    // }
    let folderPath = path.join(process.cwd(), req.params.path);

    // read Query String
    let newName = req.query.newName || req.query.newname || req.query.name;
    if (!newName) {
        res.status(500).send('沒有新名稱');
        logger.error('改名目錄ERROR, 沒有新名稱', req.params.path);
        return;
    }
    // let newPath = path.join(__dirname, newName);
    // if (process.pkg) {
    //     newPath = path.join(path.dirname(process.execPath), newName);
    // }
    newName = path.join(process.cwd(), newName);

    // 檢查目錄是否存在, 不存在就建立一個
    let newPath = path.dirname(newName);
    if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
    }

    fs.rename(folderPath, newName, (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('無法改名目錄。');
            logger.error('改名目錄ERROR', req.params.path, err);
        } else {
            res.sendStatus(200);
            logger.info('改名目錄 API:', folderPath, newPath, ', IP:', req.ip);
        }
    });
});

app.get('/api/serverconfig/:key', (req, res) => {
    const config = require('../config');
    const value = config.get(req.params.key);
    console.log('serverconfig', req.params.key, value);
    res.send(value);
});

module.exports = app;
