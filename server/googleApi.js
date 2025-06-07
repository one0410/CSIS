const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const confighelper = require('./config');

// const log4js = require('log4js');
// const logger = log4js.getLogger();
// logger.level = 'debug';
const logger = require('./logger');

const app = express.Router();

app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(
    new GoogleStrategy(
        confighelper.get('googleSsoConfig'),
        (accessToken, refreshToken, profile, done) => {
            console.log('google return profile', profile);


            // create user in mongodb
            const mongoose = require('mongoose');
            const db = mongoose.connection;
            mongoose.connect(confighelper.get('mongodb'), { useNewUrlParser: true, useUnifiedTopology: true });

            const users = db.collection('user');
            users.findOne({ account: profile.emails?.[0].value }, (err, doc) => {
                if (err) {
                    logger.error('google auth error', err);
                }

                if (!doc) {
                    const json = {
                        name: profile.displayName,
                        email: profile.emails?.[0].value,
                        account: profile.emails?.[0].value,
                        role: 'user',
                        provider: profile.provider,
                    };
                    users.insertOne(json, (err, result) => {
                        if (err) {
                            logger.error('google auth erroro', err);
                        } else {
                            logger.info('google auth OK', result);
                        }
                    });
                }
                
                return done(null, profile);
            });

        }
    )
);

app.get(
    '/auth/google',
    passport.authenticate('google', {
        scope: ['profile', 'email']
    })
);

app.get(
    '/auth/google/callback',
    passport.authenticate('google', {
        // session: false,
        // successRedirect: 'http://localhost:4200',
        failureRedirect: '/login'
    }), (req, res) => {
        console.log('google auth callback', req, res);

        // res.json({ success: true });
        let prefix = '';
        // if localhost then prepend http://localhost:4200
        if (req.headers.host.indexOf('localhost') > -1) {
            prefix = 'http://localhost:4200';
        }
        res.redirect(`${prefix}/login?provider=google&account=${req.user.emails[0].value}&name=${req.user.displayName}&role=user&token=${req.user.provider}`);
    }
);

app.get('/api/logout', (req, res) => {
    // 這裡可以處理登出成功的邏輯
    // req.session.destroy((err) => {
    //     if (err) {
    //         logger.error(err);
    //         res.json({ success: false });
    //         return;
    //     }
    //     req.logout((err) => {
    //         if (err) {
    //             logger.error(err);
    //             res.json({ success: false });
    //             return;
    //         }
    //         res.json({ success: true });
    //     });
    // });
    req.logout((err) => {
        if (err) {
            logger.error('logout error', err);
            res.json({ success: false });
            return;
        }
        res.json({ success: true });
    });
});

module.exports = app;
