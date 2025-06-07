const fs = require('fs');
const path = require('path');
const os = require('os');

const logger = require('./logger');

function read() {
    // 檢查 serverconfig.json 是否存在
    // let filePath = path.join(__dirname, 'serverconfig.json');
    // if (process.pkg) {
    //     filePath = path.join(path.dirname(process.execPath), 'serverconfig.json');
    // }
    let filePath = path.join(process.cwd(), 'serverconfig.json');
    let defaultjson = {
        httpPort: 3000,
        httpsPort: 443,
        mongodb: 'mongodb://localhost:27017/pacsupload',
    };

    let serverconfig = {};
    if (!fs.existsSync(filePath)) {
        serverconfig = defaultjson;
        fs.writeFileSync(filePath, JSON.stringify(defaultjson, null, 4));
        logger.info('serverconfig.json 不存在, 建立預設檔案');
    } else {
        let isDirty = false;
        try {
            serverconfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            // 去除 defaultjson 中沒有的欄位
            for (let key in serverconfig) {
                // 檢查是否有多餘的設定
                if (defaultjson[key] === undefined) {
                    delete serverconfig[key];
                    isDirty = true;
                    logger.info(`serverconfig.json 中有多餘的設定 ${key}, 移除`);
                }
            }

            // 新增 defaultjson 中有的設定
            for (let key in defaultjson) {
                if (serverconfig[key] === undefined) {
                    serverconfig[key] = defaultjson[key];
                    isDirty = true;
                    logger.info(`serverconfig.json 中缺少的設定 ${key}, 新增`);
                }
            }

        }
        catch (err) {
            logger.error('serverconfig.json 格式錯誤, 使用預設值');
            serverconfig = defaultjson;
            isDirty = true;
        }

        if (isDirty) {
            fs.writeFileSync(filePath, JSON.stringify(serverconfig, null, 4));
            logger.info('serverconfig.json 有變更, 重新寫入');
        }
    }

    return serverconfig;
}

function get(key) {
    let config = read();
    return config[key];
}

function write(config) {
    // let filePath = path.join(__dirname, 'serverconfig.json');
    // if (process.pkg) {
    //     filePath = path.join(path.dirname(process.execPath), 'serverconfig.json');
    // }
    let filePath = path.join(process.cwd(), 'serverconfig.json');

    fs.writeFileSync(filePath, JSON.stringify(config, null, 4));
}

// export
module.exports = {
    read,
    get,
    write
};
