const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../dbConnection');
// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRATION = '30d';

// LINE 配置
const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID || '2007105066';
const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET || '325d48524c2505ade807b8712e91ffba';
const LINE_REDIRECT_URI = process.env.LINE_REDIRECT_URI || 'http://localhost:3000/auth/callback';

// Google 配置
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '241230885757-khevnjqaejpjfk54j17mudg8idq3614b.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback';

// 用戶存儲 (臨時使用，實際應用應該使用資料庫)
const users = db.collection('user');

// 生成JWT令牌
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture
    }, 
    JWT_SECRET, 
    { expiresIn: JWT_EXPIRATION }
  );
};

// 中間件：驗證令牌
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '未提供認證令牌' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: '無效的令牌' });
  }
};

/**
 * LINE登入處理
 * POST /auth/line
 */
router.post('/line', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: '缺少授權碼' });
    }

    // 使用授權碼交換訪問令牌
    const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINE_REDIRECT_URI,
        client_id: LINE_CLIENT_ID,
        client_secret: LINE_CLIENT_SECRET
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, id_token } = tokenResponse.data;

    // 獲取用戶資訊
    const userInfoResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const lineUser = userInfoResponse.data;
    
    // 創建或查找用戶
    let user = await users.findOne({ lineId: lineUser.userId });
    
    if (!user) {
      user = {
        lineId: lineUser.userId,
        name: lineUser.displayName,
        picture: lineUser.pictureUrl,
        // email: `${lineUser.userId}@line.example.com`, // LINE 不提供電子郵件
        provider: 'line',
        createdAt: new Date()
      };
      let result = await users.insertOne(user);
      user._id = result.insertedId;
    }

    // 生成 JWT 令牌
    const token = generateToken(user);

    res.json({ 
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        picture: user.picture,
        isAdmin: user.isAdmin ? true : undefined
      }
    });
  } catch (error) {
    console.error('LINE 登入錯誤:', error.response?.data || error.message);
    res.status(500).json({ error: '處理 LINE 登入時發生錯誤' });
  }
});

/**
 * Google登入處理
 * POST /auth/google
 */
router.post('/google', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: '缺少授權碼' });
    }

    // 使用授權碼交換訪問令牌
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token } = tokenResponse.data;

    // 獲取用戶資訊
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const googleUser = userInfoResponse.data;
    
    // 創建或查找用戶
    let user = await users.findOne({ $or: [{ googleId: googleUser.id }, { email: googleUser.email }] });
    
    if (!user) {
      user = {
        //id: uuidv4(),
        googleId: googleUser.id,
        name: googleUser.name,
        email: googleUser.email,
        picture: googleUser.picture,
        provider: 'google',
        createdAt: new Date()
      };
      let result = await users.insertOne(user);
      user._id = result.insertedId;
    } else {
      if (!user.googleId) {
        user.googleId = googleUser.id;
        await users.updateOne({ _id: user._id }, { $set: { googleId: googleUser.id } });
      }
      if (!user.email) {
        user.email = googleUser.email;
        await users.updateOne({ _id: user._id }, { $set: { email: googleUser.email } });
      }
      if (!user.picture) {
        user.picture = googleUser.picture;
        await users.updateOne({ _id: user._id }, { $set: { picture: googleUser.picture } });
      }
    }

    // 生成 JWT 令牌
    const token = generateToken(user);

    res.json({ 
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture
      }
    });
  } catch (error) {
    console.error('Google 登入錯誤:', error.response?.data || error.message);
    res.status(500).json({ error: '處理 Google 登入時發生錯誤' });
  }
});

/**
 * 登出處理
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
  // 在客戶端清除令牌，服務器端無需額外操作
  res.json({ success: true, message: '已成功登出' });
});

/**
 * 獲取當前用戶信息
 * GET /auth/me
 */
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router; 