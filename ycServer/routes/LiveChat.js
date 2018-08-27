'use strict';

let YTChatIO = require('socket.io');
let googleapis = require('googleapis');

let YTChatServer = {};

YTChatServer._server = null;
YTChatServer._chatId = null;
YTChatServer._youtube = googleapis.youtube({version: 'v3'});
YTChatServer._oauth2 = null;
YTChatServer.users = {};
YTChatServer.rooms = [];

YTChatServer.setOauthYT = function (oauth2Client) {
    this._youtube = googleapis.youtube({
        version: 'v3',
        auth: oauth2Client
    });

    this._oauth2 = googleapis.oauth2({
        version: 'v2',
        auth: oauth2Client
    });
};

YTChatServer.start = function (port) {
    let self = this;

    this._server = YTChatIO.listen(port, {path: '/chat/youtube'});

    this._server.on('connection', function (socket) {
        self._onConnect(socket);
    });

};

YTChatServer._onConnect = function (socket) {

    let query = socket.handshake.query;
    let self = this;

    if ('object' !== typeof query) {
        throw 'INVALID_CONNECTION_PARAM';
    }

    if (!query.hasOwnProperty('chatId')) {
        throw 'EMPTY_YOUTUBE_ID';
    }

    this._chatId = query.chatId;

    /**
     * 라이브채팅방 생성.
     * @param {string} chatId
     */
    socket.on('live:on', data => this._addRoom(socket, data));

    /**
     * 교수자가 라이브채팅방 삭제.
     * @param {string} chatId
     */
    socket.on('live:off', data => this._removeRoom(socket, data));

    /**
     * 라이브채팅방 user 들어옴.
     * @param {number} uid
     * @param {string} chatId
     */
    socket.on('user:join', data => this._addUser(socket, data));

    /**
     * 라이브채팅방 user 나감.
     * @param {number} uid
     * @param {string} chatId
     */
    socket.on('user:left', data => this._removeUser(socket, data));

    socket.on('disconnect', () => this._disconnect(socket));

    /**
     * 메세지 보냄.
     * @param {string} chatId
     * @param {number} uid
     * @param {string} msg
     */
    socket.on('send:messages', data => this._sendMessage(socket, data));



    socket.on('console', function () {
        console.log(self.users,'유저리스트')
        socket.emit('console',self.users)
    })
};

YTChatServer._disconnect = function (socket) {
    // this._server.in(socket.room).emit('user:left');
    console.log('방 나가부렷응', this.users)
};

YTChatServer._addRoom = function (socket, data) {
    let isRoom = this.rooms.indexOf(data.chatId);
    //방이 존재하지 않는다면 추가
    if (isRoom === -1) this.rooms.push(this._chatId);

    socket.join(data.chatId);
};

YTChatServer._removeRoom = function (socket, data) {
    let room = data.chatId;
    let isRoom = this.rooms.indexOf(room);
    if (isRoom !== -1) this.rooms.splice(isRoom, 1);

    //만약 교수자가 나가거나 방송을 종료하면
    this._server.in(room).emit('live:off');

    socket.leave(room);
    socket.disconnect();
};

YTChatServer._addUser = function (socket, data) {

    if(!data.hasOwnProperty('chatId') || !data.chatId){
        console.log('방 아이디가 존재하지 않습니다.')
        return false;
    }

    if(!data.hasOwnProperty('uid') || !data.uid) {
        console.log('uid가 존재하지 않습니다.');
        return false;
    }

    let self = this;
    this._getUserInfo()
        .then(res => {
            this.users[data.uid] = res;
            this._server.in(data.chatId).emit('user:join', this.users);
            this._loadMessages(socket, data.chatId)
        })
        .catch(err => console.log(err))
};

YTChatServer._removeUser = function (socket, data) {
    if(!data.hasOwnProperty('chatId') || !data.chatId){
        console.log('방 아이디가 존재하지 않습니다.')
        return false;
    }

    if(!data.hasOwnProperty('uid') || !data.uid) {
        console.log('uid가 존재하지 않습니다.');
        return false;
    }

    console.log(data)
    delete this.users[data.uid];
    this._server.in(data.chatId).emit('user:left', this.users);
    socket.disconnect()
};

YTChatServer._loadMessages = function (socket, chatId) {
    if (!chatId) console.log('Chat Id is invalid.');
    let self = this;
    let _socket = socket;
    let params = {
        liveChatId: this._chatId,
        part: 'id,snippet,authorDetails',
        maxResults: 2000,
    };

    this._liveChatMessages('list', params)
        .then(res => {
            socket.emit('load:messages', res);
        })
        .catch(err => console.log(err));
};

YTChatServer._sendMessage = function (socket, data) {
    let self = this;
    let _data = data;
    let params = {
        part: 'snippet',
        resource: {
            snippet: {
                liveChatId: this._chatId,
                type: 'textMessageEvent',
                textMessageDetails: {
                    messageText: _data.msg
                }
            }
        }
    };
    this._liveChatMessages('insert', params)
        .then(res => {
            Object.assign(res, {userinfo: this.users[_data.uid]});
            self._server.in(_data.chatId).emit('new:messages', res);
        })
        .catch(err => console.log(err));
};

YTChatServer._getUserInfo = function () {
    return new Promise((resolve, reject) => {
        this._oauth2.userinfo.get((err, res) => {
            if (err) reject(err);
            else resolve(res);
        })
    });
};

YTChatServer._liveChatMessages = function (event, params) {
    if (!event) return false;
    return new Promise((resolve, reject) => {
        this._youtube.liveChatMessages[event](params, function (err, data) {
            if (err) reject(err);
            else resolve(data);
        });
    });
};

module.exports = YTChatServer;