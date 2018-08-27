'use strict';

let _ = require('underscore');
let multer = require('multer');
let path = require('path');
let fs = require('fs');
let srt2vtt = require('srt-to-vtt');
let crypto = require('crypto');
let moment = require('moment');
let LiveChat = require('./LiveChat');
let config = require('../config');

let googleapis = require('googleapis');
let Oauth2 = googleapis.auth.OAuth2;
let oauth2Client = new Oauth2(
    config.Client, //클라이언트 아이디
    config.Secret, //시크릿 아이디
    "http://localhost:3000/oauthcallback"   //리다이렉트 url
);
let youtubeApiKey = config.ApiKey;

let scopes = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/userinfo.profile'
];
let url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
});
let youtube = googleapis.youtube({version: 'v3'});
let oauthYoutube;

let code = null;

module.exports = function (app) {

    const _getVideos = function (YT, params) {
        return new Promise((resolve, reject) => {
            YT.videos.list(params, function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    }

    const _getSearch = function (youtube, params) {
        return new Promise((resolve, reject) => {
            youtube.search.list(params, function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    }

    /** File Upload **/
    const upload = multer({
        storage: multer.diskStorage({
            destination(req, file, cb) {
                // cb(null, './server/assets/');
                cb(null, './app/upload/');
            },
            filename(freq, file, cb) {
                cb(null, file.originalname);
            }
        })
    });

    /**
     * Oauth 인증 url Get
     */
    app.get('/google/oauth/url', function (request, response) {
        response.json(url);
    });

    /**
     * 인증 코드를 받아 사용자 토큰 생성
     */
    app.post('/google/oauth/token', function (request, response) {
        let posted = request.body;
        code = posted.code || null;
        let session = request.session;
        //uid 별 토큰으로 작업해주자.

        oauth2Client.getToken(code, function (err, tokens) {
            if (err) {
                return response.json(err);
            }

            oauth2Client.setCredentials(tokens);
            session['tokens'] = tokens;
            googleapis.options({
                auth: oauth2Client
            });

            response.json({token: tokens, code: code});
        });
    });

    /**
     * If you has token, Get Google Api Token
     */
    app.get('/google/oauth/token', function (request, response) {
        response.json(request.session['tokens']);
    });

    /**
     * Delete Google Api Token. Logout Api
     */
    app.delete('/google/oauth/token', function (request, response) {
        request.session['tokens'] = null;
        response.json(true);
    });

    /**
     * Get Youtube Search Datas
     */
    app.get('/youtube/search/list', function (request, response) {
        let query = request.query;
        let params = {
            key: youtubeApiKey,
            type: 'video',
            maxResults: 10,
            pageToken: query.pageToken ? query.pageToken : '',
            part: 'id,snippet',
            q: query.search ? query.search : ''
        };
        _getSearch(youtube, params)
            .then(res => {

                if (res.items.length) {
                    var _data = _.clone(res);
                    var ids = _.chain(_data.items).pluck('id').pluck('videoId').value();
                    _getVideos(youtube, {
                        key: youtubeApiKey,
                        part: 'id, snippet, contentDetails, liveStreamingDetails, statistics, status',
                        id: ids.join()
                    })
                        .then(res => {
                            _data.items = res.items;
                            response.json(_data)
                        })
                } else {
                    response.json(res)
                }

            })
            .catch(err => response.json(err))
    });

    /**
     * Get My Youtube Upload Datas
     */
    app.get('/youtube/upload/list', function (request, response) {
        let query = request.query;
        let params = {
            part: 'id,snippet',
            forMine: true,
            type: 'video',
            maxResults: 5,
            pageToken: query.pageToken ? query.pageToken : '',
            q: query.search ? query.search : ''
        };

        oauth2Client.setCredentials(request.session['tokens']);
        oauthYoutube = googleapis.youtube({
            version: 'v3',
            auth: oauth2Client
        });
        LiveChat.setOauthYT(oauth2Client);

        _getSearch(oauthYoutube, params)
            .then(res => {
                if (res.items.length) {
                    var _data = _.clone(res);
                    var ids = _.chain(_data.items).pluck('id').pluck('videoId').value();
                    _getVideos(youtube, {
                        key: youtubeApiKey,
                        part: 'id, snippet, contentDetails, liveStreamingDetails, statistics, status',
                        id: ids.join()
                    })
                        .then(res => {
                            _data.items = res.items;
                            response.json(_data)

                        })
                } else {
                    response.json(res)
                }
            })
            .catch(err => response.json(err))
    });

    /**
     * Oauth 인증 redirect Url
     */
    app.get('/oauthcallback', function (request, response) {
        response.write('<script type="text/javascript">window.opener.postMessage(location.href, "*");</script>');
        response.status(200).end();
    })

    /**
     *  Srt file Conver Vtt file And Save
     */
    app.post('/convert', upload.single('file'), function (req, res, next) {
        let assets = path.resolve('.', 'app/upload') + '/';

        let name = req.file.originalname.replace(/\.srt/ig, "\.vtt");
        let md5Name = crypto.createHash('md5').update(name).digest('hex')

        //create vtt file
        fs.createReadStream(assets + req.file.originalname)
            .pipe(srt2vtt())
            .pipe(fs.createWriteStream(assets + md5Name))

        //delete srt file
        fs.unlink(assets + req.file.originalname)

        res.json({
            filename: md5Name,
            originalname: name
        })
    });


    /**
     * liveBroadcasts(이벤트)
     * @param YT
     * @param params
     * @return {Promise<any>}
     * @private
     */
    const _liveBroadcasts = function (event, params) {
        return new Promise((resolve, reject) => {
            oauthYoutube.liveBroadcasts[event](params, function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    };

    /**
     * liveStreams(이벤트)
     * @param event
     * @param params
     * @return {Promise<any>}
     * @private
     */
    const _liveStreams = function (event, params) {
        if (!event) return false;
        return new Promise((resolve, reject) => {

            oauthYoutube.liveStreams[event](params, function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    };

    /**
     * liveChatMessages(이벤트)
     * @param event
     * @param params
     * @return {Promise<any>}
     * @private
     */
    const _liveChatMessages = function (event, params) {
        if (!event) return false;
        return new Promise((resolve, reject) => {
            oauthYoutube.liveChatMessages[event](params, function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    };

    /**
     * Videos 이벤트
     * @param event
     * @param params
     * @return {Promise<any>}
     * @private
     */
    const _Videos = function (event, params) {
        if (!event) return false;
        return new Promise((resolve, reject) => {
            oauthYoutube.videos[event](params, function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    };

    const _setOuath = function (req) {
        oauth2Client.setCredentials(req.session['tokens']);
        oauthYoutube = googleapis.youtube({
            version: 'v3',
            auth: oauth2Client
        });
        LiveChat.setOauthYT(oauth2Client);
    };

    app.post('/youtube/live/create', function (request, response) {
        let posted = request.body;
        let _liveBroadcast = {};
        let _liveStream = {};

        // oauth2Client.setCredentials(request.session['tokens']);
        // oauthYoutube = googleapis.youtube({
        //     version: 'v3',
        //     auth: oauth2Client
        // });
        // LiveChat.setOauthYT(oauthYoutube);

        _setOuath(request);

        let broadParams = {
            part: 'id, snippet, contentDetails, status',
            resource: {
                snippet: {
                    scheduledStartTime: posted.broadcast.scheduledStartTime,
                    title: posted.broadcast.title,
                    description: posted.broadcast.description
                },
                status: {
                    privacyStatus: "unlisted"
                },
                // contentDetails: {
                //     startWithSlate: true
                // }
            }
        };

        let streamParams = {
            part: 'id, snippet, cdn, contentDetails, status',
            resource: {
                snippet: {
                    title: posted.streaming.title,
                    description: posted.streaming.description
                },
                cdn: {
                    format: "1080p",
                    ingestionType: "rtmp"
                }
            }
        };


        /** 1. 현재시간으로 liveBroadcast 생성 **/
        _liveBroadcasts('insert', broadParams)
            .then(res => {
                _liveBroadcast = res;

                /** 2. liveStreaming 생성 **/
                _liveStreams('insert', streamParams)
                    .then(res => {
                        _liveStream = res;

                        /** 3. liveBroadcast 로 liveStreaming 바인딩 **/
                        _liveBroadcasts('bind', {
                            part: 'id,snippet,contentDetails,status',
                            id: _liveBroadcast.id,
                            streamId: _liveStream.id,
                        })
                            .then(res => {
                                _liveBroadcast = res;

                                // _liveBroadcasts('delete', {id: _liveBroadcast.id});
                                // _liveStreams('delete', {id: _liveStream.id});

                                response.json({
                                    liveBroadcast: _liveBroadcast,
                                    liveStream: _liveStream
                                });
                            })
                            .catch(err => response.status(500).json(err))
                    })
                    .catch(err => response.status(500).json(err))

            })
            .catch(err => response.status(500).json(err))


    });

    /** liveBroadcast 상태 변경 : live(실시간), testing(테스트), complete(종료) **/
    app.post('/youtube/live/transition', function (request, response, nex) {
        let posted = request.body;
        let params = {
            broadcastStatus: posted.broadcastStatus,
            id: posted.id,
            part: 'id,snippet,status'
        };

        // oauth2Client.setCredentials(request.session['tokens']);
        // oauthYoutube = googleapis.youtube({
        //     version: 'v3',
        //     auth: oauth2Client
        // });
        // LiveChat.setOauthYT(oauthYoutube);
        _setOuath(request);

        _liveBroadcasts('transition', params)
            .then(res => {
                response.json(res);
            })
            .catch(err => response.status(500).json(err))

    });


    app.delete('/youtube/live/delete', function (request, response) {
        let query = request.query;
        // oauth2Client.setCredentials(request.session['tokens']);
        // oauthYoutube = googleapis.youtube({
        //     version: 'v3',
        //     auth: oauth2Client
        // });
        // LiveChat.setOauthYT(oauthYoutube);
        _setOuath(request);


        _liveBroadcasts('list', {
            part: 'id,snippet,contentDetails,status',
            mine: true
        }).then(res => {
            let broadIds = [];
            for (let item of res.items) {
                broadIds.push(item.id);
                _liveBroadcasts('delete', {id: item.id})
                _liveStreams('delete', {id: item.contentDetails.boundStreamId})
            }
            response.json(broadIds)
        });

    });


    app.get('/youtube/live/list', function (request, response) {
        _setOuath(request);

        _liveBroadcasts('list', {
            part: 'id,snippet,contentDetails,status',
            mine: true
        }).then(res => {
            response.json(res)
        });

    });

    /** liveChatMessage insert **/
    app.post('/youtube/chat/insert', function (request, response) {
        let posted = request.body;
        let params = {
            part: 'snippet',
            resource: {
                "snippet": {
                    "liveChatId": posted.chatId,
                    "type": "textMessageEvent",
                    "textMessageDetails": {
                        "messageText": posted.message
                    }
                }
            }
        };

        _setOuath(request);

        _liveChatMessages('insert', params)
            .then(res => response.json(res))
            .catch(err => response.status(500).json(err))
    });

    app.get('/youtube/live/videos', function (request, response) {
        let query = request.query;
        let params = {
            part: 'liveStreamingDetails',
            id: query.id
        };

        _setOuath(request);
        _Videos('list', params)
            .then(res => response.json(res))
            .catch(err => response.status(500).json(err))
    });

    app.get('/google/userinfo', function (request, response) {
        oauth2Client.setCredentials(request.session['tokens']);
        let oauth2 = googleapis.oauth2({
            auth: oauth2Client,
            version: 'v2'
        });
        oauth2.userinfo.get(
            function (err, res) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(res);
                }
            });
    });

    app.post('/google/setOauth', function (request, response) {
        _setOuath(request);
        response.json(true)
    });
};