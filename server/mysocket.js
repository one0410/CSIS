const expressWs = require('express-ws');
const WebSocket = require('ws');
const { Server } = require('socket.io');
const http = require('http');

// const log4js = require('log4js');
// const logger = log4js.getLogger();
// logger.level = 'debug';
const logger = require('./logger');

const meetings = {};
let io = null;

function attachWebSocket(app) {
    // 創建 HTTP 伺服器
    const server = http.createServer(app);
    
    // 設定 Socket.IO
    io = new Server(server, {
        cors: {
            origin: ["http://localhost:4200", "http://localhost:3000"],
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['polling', 'websocket']
    });

    // Socket.IO 連接處理
    io.on('connection', (socket) => {
        logger.info(`Socket.IO 用戶連接: ${socket.id}`);

        // 處理加入管理員房間（用於接收 feedback 通知）
        socket.on('join-admin-room', (data) => {
            const { userId, userRole } = data;
            if (userRole === 'admin' || userRole === 'manager') {
                socket.join('admin-feedback');
                logger.info(`管理員 ${userId} 加入 feedback 通知房間`);
                socket.emit('joined-admin-room', { success: true });
            } else {
                socket.emit('joined-admin-room', { success: false, message: '權限不足' });
            }
        });

        // 處理離開管理員房間
        socket.on('leave-admin-room', () => {
            socket.leave('admin-feedback');
            logger.info(`用戶 ${socket.id} 離開 feedback 通知房間`);
        });

        // 處理 feedback 事件
        socket.on('feedback-submitted', (data) => {
            logger.info('收到 feedback 提交事件:', data);
            // 廣播給所有在 admin-feedback 房間的管理員
            socket.to('admin-feedback').emit('feedback-count-update', {
                type: 'submitted',
                message: '有新的意見反饋提交'
            });
        });

        socket.on('feedback-status-updated', (data) => {
            logger.info('收到 feedback 狀態更新事件:', data);
            // 廣播給所有在 admin-feedback 房間的管理員
            socket.to('admin-feedback').emit('feedback-count-update', {
                type: 'status-updated',
                feedbackId: data.feedbackId,
                newStatus: data.newStatus,
                message: '意見反饋狀態已更新'
            });
        });

        socket.on('feedback-deleted', (data) => {
            logger.info('收到 feedback 刪除事件:', data);
            // 廣播給所有在 admin-feedback 房間的管理員
            socket.to('admin-feedback').emit('feedback-count-update', {
                type: 'deleted',
                feedbackId: data.feedbackId,
                message: '意見反饋已刪除'
            });
        });

        // === 機具管理相關事件 ===
        socket.on('equipment-created', (data) => {
            logger.info('收到機具創建事件:', data);
            // 廣播給所有在該工地的用戶
            socket.broadcast.emit('equipment-update', {
                type: 'created',
                equipmentId: data.equipmentId,
                siteId: data.siteId,
                message: '新機具已添加'
            });
        });

        socket.on('equipment-updated', (data) => {
            logger.info('收到機具更新事件:', data);
            socket.broadcast.emit('equipment-update', {
                type: 'updated',
                equipmentId: data.equipmentId,
                siteId: data.siteId,
                message: '機具資料已更新'
            });
        });

        socket.on('equipment-deleted', (data) => {
            logger.info('收到機具刪除事件:', data);
            socket.broadcast.emit('equipment-update', {
                type: 'deleted',
                equipmentId: data.equipmentId,
                siteId: data.siteId,
                message: '機具已刪除'
            });
        });

        // === 表單相關事件 ===
        socket.on('form-created', (data) => {
            logger.info('收到表單創建事件:', data);
            socket.broadcast.emit('form-update', {
                type: 'created',
                formId: data.formId,
                formType: data.formType,
                siteId: data.siteId,
                message: '新表單已創建'
            });
        });

        socket.on('form-updated', (data) => {
            logger.info('收到表單更新事件:', data);
            socket.broadcast.emit('form-update', {
                type: 'updated',
                formId: data.formId,
                formType: data.formType,
                siteId: data.siteId,
                message: '表單已更新'
            });
        });

        socket.on('form-deleted', (data) => {
            logger.info('收到表單刪除事件:', data);
            socket.broadcast.emit('form-update', {
                type: 'deleted',
                formId: data.formId,
                formType: data.formType,
                siteId: data.siteId,
                message: '表單已刪除'
            });
        });

        // === 工人相關事件 ===
        socket.on('worker-created', (data) => {
            logger.info('收到工人創建事件:', data);
            socket.broadcast.emit('worker-update', {
                type: 'created',
                workerId: data.workerId,
                siteId: data.siteId,
                message: '新工人已創建'
            });
        });

        socket.on('worker-updated', (data) => {
            logger.info('收到工人更新事件:', data);
            socket.broadcast.emit('worker-update', {
                type: 'updated',
                workerId: data.workerId,
                siteId: data.siteId,
                message: '工人資料已更新'
            });
        });

        socket.on('worker-deleted', (data) => {
            logger.info('收到工人刪除事件:', data);
            socket.broadcast.emit('worker-update', {
                type: 'deleted',
                workerId: data.workerId,
                siteId: data.siteId,
                message: '工人已刪除'
            });
        });

        socket.on('worker-added-to-site', (data) => {
            logger.info('收到工人加入工地事件:', data);
            socket.broadcast.emit('worker-update', {
                type: 'added-to-site',
                workerId: data.workerId,
                siteId: data.siteId,
                message: '工人已加入工地'
            });
        });

        socket.on('worker-removed-from-site', (data) => {
            logger.info('收到工人移出工地事件:', data);
            socket.broadcast.emit('worker-update', {
                type: 'removed-from-site',
                workerId: data.workerId,
                siteId: data.siteId,
                message: '工人已移出工地'
            });
        });

        // 連接斷開處理
        socket.on('disconnect', () => {
            logger.info(`Socket.IO 用戶斷開連接: ${socket.id}`);
        });
    });

    // 保持原有的 express-ws 功能（用於現有的 meeting 功能）
    expressWs(app);
    app.ws('/meeting/:id', function (ws, req) {
        const meetingId = req.params.id;
        console.log('socket connected', meetingId);

        if (!meetings[meetingId]) {
            meetings[meetingId] = [];
        }

        meetings[meetingId].push(ws);

        ws.on('message', function (msg) {
            console.log('socket received:', msg);

            // if blob, convert to string
            if (msg instanceof Buffer) {
                msg = msg.toString();
                console.log('converted to string:', msg);
            }
            meetings[meetingId].forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        });

        ws.on('close', function () {
            console.log('socket closed');
            let index = meetings[meetingId].indexOf(ws);
            if (index >= 0) {
                meetings[meetingId].splice(index, 1);
            }
        });
    });

    // 將 server 實例添加到 app 中，以便在 index.ts 中使用
    app.set('server', server);
}

// 獲取 Socket.IO 實例的函數
function getIO() {
    if (!io) {
        throw new Error('Socket.IO 尚未初始化！請先調用 attachWebSocket()');
    }
    return io;
}

// 廣播 feedback 事件的輔助函數
function broadcastFeedbackUpdate(type, data = {}) {
    if (io) {
        io.to('admin-feedback').emit('feedback-count-update', {
            type,
            ...data,
            timestamp: new Date().toISOString()
        });
        logger.info(`廣播 feedback 更新事件: ${type}`);
    }
}

module.exports = {
    attachWebSocket,
    getIO,
    broadcastFeedbackUpdate
};