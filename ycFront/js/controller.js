app.controller('chattingController', function ($scope, socket, $http, $window, $q, $sce, $timeout) {
    var self = this;
    var player;
    var contentId = null;
    self.broadcast = {
        scheduledStartTime: '',
        title: '',
        description: ''
    };
    self.streaming = {
        title: '',
        description: ''
    };
    self.streamKey = '';
    self.liveBroadcast = null;
    self.liveStream = null;
    self.uid = null;

    self.media = null;
    var mediaObj = null;

    /**
     * @typeof {scope} self
     * @property {boolean} isReady
     * @property {Array} messages
     * @property {Array} users
     */
    self.status = {
        isReady: false,
        isMsgLoad: false
    };
    self.messages = [];
    self.users = {};


    self.init = function (broadcastId) {
        contentId = broadcastId || null;
        //google 로그인 팝업
        //실패 또는 취소
        //첫 페이지로(내가 첫 페이지면 두번째 페이지로)

        //구글 로그인 성공
        //라이브 youtuve 비디오 보여주기 && 채팅창

        // socket.init('http://localhost:19000', contentId);
        // socketStart();
    };
    function socketStart() {
        if (!contentId) return false;

        socket.on('connect', function () {
            console.log('연결 성공');
            self.status.isReady = true;

            socket.emit('live:on', {
                chatId: contentId
            });

            _setOauth().then(function (res) {
                socket.emit('user:join', {
                    uid: self.uid,
                    chatId: contentId
                });
            });
        });

        socket.on('disconnect', function () {
            console.log('연결 실패');
            self.status.isReady = false;

            socket.emit('user:left', {
                uid: self.uid,
                chatId: contentId
            });
        });

        socket.on('error', function (err) {
            console.log(err, '에러 발생');
        });

        socket.on('load:messages', function (data) {
            console.log(data, '메세지 로드합니다.');
            if (self.status.isMsgLoad) return false;

            var lastRead = 0, time = 0;
            _.each(data.items, function (val, idx) {
                time = moment(val.snippet.publishedAt).unix();
                if (lastRead <= time) {
                    lastRead = time;
                    self.messages.push({
                        id: val.id,
                        time: time,
                        msg: val.snippet.displayMessage,
                        name: val.authorDetails.displayName,
                        profileImageUrl: val.authorDetails.profileImageUrl
                    })
                }
            });

            self.status.isMsgLoad = true;
        });

        socket.on('new:messages', function (data) {
            console.log(data, '새로운 메세지가 도착하였습니다.');
            var time = moment(data.snippet.publishedAt).unix();
            self.messages.push({
                id: data.id,
                time: time,
                msg: data.snippet.displayMessage,
                name: data.hasOwnProperty('userinfo') ? data.userinfo.name : null,
                profileImageUrl: data.hasOwnProperty('userinfo') ? data.userinfo.picture : null
            })
        });

        socket.on('user:join', function (data) {
            console.log(data, 'user 가 입장하였습니다.')
            self.users = data;
        });

        socket.on('user:left', function (data) {
            console.log(data, 'user 가 나갔습니다.');
            self.users = data;
        });

        socket.on('live:off', function () {
            console.log('방을 삭제하였습니다.')
            self.messages = [];
            self.users = {};
        });


        socket.on('console', function (data) {
            console.log(data, ' socket console')
        })
    }

    $window.onbeforeunload = function (e) {
        if (self.status.isReady) {

            socket.emit('user:left', {
                uid: self.uid,
                chatId: contentId
            });


            if (self.uid === 1) {
                //강의하던 교수자가 나간거면 방삭제
                socket.emit('live:off', {
                    chatId: contentId
                });
            }
        }
    };

    self.outChatting = function () {
        socket.emit('user:left', {
            uid: self.uid,
            chatId: contentId
        });
    };

    self.chat = {};
    self.sendMessage = function () {
        if (!self.status.isReady) return false;
        var params = {
            chatId: contentId,
            uid: self.uid,
            msg: self.chat.msg
        };
        _setOauth().then(function (res) {
            socket.emit('send:messages', params);
            self.chat.msg = null;
        });
    };

    //토큰받을때 user에대한 정보도 받아야겠다.
    //getAuthInfo


    var oauthWindow;
    self._oauthUrl;
    self.login = function () {
        oauthWindow = $window.open(self._oauthUrl, '_blank', "width=500px, height:600px")
    }

    $window.onmessage = function (e) {
        if (e.origin == 'http://localhost:3000' && typeof oauthWindow !== 'undefined') {
            oauthWindow.close();
            var redirectUrl = e.data;
            var code = getParameterByName('code', redirectUrl);
            if (code) {
                setToken(code, self.uid)
            }
        }
    };


    getOauthUrl()
        .then(function (res) {
            self._oauthUrl = res;
        });

    function setToken(code) {
        $http.post('google/oauth/token', {code: code}).then(function (res) {
            console.log(res.data, 'setoken sccc')
        }).catch(function (err) {
            console.log(err, 'err')
        })
    }

    function getOauthUrl() {
        return $q(function (resolve, reject) {
            $http.get('google/oauth/url').then(function (res) {
                resolve(res.data)
            }).catch(function (err) {
                reject(err)
            })
        });
    }


    function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }


    self.token = function () {

        $http.get('google/oauth/token').then(function (res) {
            console.log(res.data)
        }).catch(function (err) {
            console.log(err)
        })
    };

    self.getUserInfo = function () {
        $http.get('google/userinfo')
            .then(function (res) {
                console.log(res, 'userinfo scc')
            }, function (err) {
                console.log(err, ' userinfo err')
            })
    };


    self.liveUrl = '';

    /** 생성 후 OBS프로그램을 사용한 방송시작 (스트림 키 이용) **/
    self.createLive = function () {
        _createLive()
            .then(function (res) {
                console.log(res)
                self.liveBroadcast = res.liveBroadcast;
                contentId = self.liveBroadcast.id;
                self.liveStream = res.liveStream;
                self.streamKey = self.liveStream.cdn.ingestionInfo.streamName;

                $timeout(function () {
                    mediaObj = {
                        techOrder: ['html5', 'youtube'],
                        sources: [{
                            "type": "video/youtube",
                            "src": "https://www.youtube.com/watch?v=" + contentId
                        }]
                    };
                });


            }, function (err) {
                alert('로그인 해주세요.')
                console.log(err)
            })
    };

    self.startLive = function () {
        _statusLive('testing')
            .then(function (res) {
                startTransition()
                    .then(function (res) {
                        transitionCount = 0;
                    })
            }, function (err) {
                console.log(err)
                if (err.hasOwnProperty('errors')) {
                    if (err.errors[0].reason == 'errorStreamInactive') {
                        alert('OBS 프로그램을 이용하여 방송을 시작하여주세요.')
                    } else {
                        var msg = transitionErrMessage(err.errors[0].reason);
                        alert(msg);
                    }
                } else {
                    alert(err)
                }
            })
    };

    var transitionCount = 0;

    function startTransition() {
        return _statusLive('live')
            .then(function (res) {
                console.log(res, 'startLive sccc')
                self.media = mediaObj;
                socket.init('http://localhost:19000', res.snippet.liveChatId);
                socketStart();
            }, function (err) {
                if (err.hasOwnProperty('errors')) {
                    var reason = err.errors[0].reason;
                    if (reason == 'invalidTransition' && transitionCount <= 20) {
                        $timeout(function () {
                            transitionCount++;
                            startTransition();
                        }, 3000)
                    } else {
                        var msg = transitionErrMessage(reason);
                        alert(msg);
                    }
                } else {
                    alert(err)
                }
            })
    }

    // socket.init('http://localhost:19000', "Cg0KC3FmRkRUMTY5VDlV");
    // socketStart();

    function transitionErrMessage(reason) {
        var message = '';
        switch (reason) {
            case 'errorExecutingTransition' :
                message = '실시간 방송의 상태 변경 중 오류가 발생하였습니다.';
                break;
            case 'errorStreamInactive' :
                message = '현재 실시간 방송이 비활성화 상태입니다.';
                break;
            case 'invalidTransition' :
                message = '실시간 방송의 상태변경을 하실 수 없습니다.';
            case 'redundantTransition' :
                message = '현재 상태에서는 요청하신 상태로 변경하실 수 없습니다.';
                break;
            case 'insufficientLivePermissions' :
                message = '상태이변경에 대한 권한이 존재하지 않습니다.';
                break;
            case 'livePermissionBlocked' :
                message = '실시간 방송에 대한 권한이 없습니다.';
                break;
            case 'liveStreamingNotEnabled' :
                message = '실시간 방송이 존재하지 않습니다.';
                break;
            default :
                message = '시스템 이상이 발생하였습니다.';
                break;
        }
        return message;
    }


    self.closeLive = function () {
        _statusLive('complete')
            .then(function (res) {
                console.log(res, 'closeLive sccc')
                socket.emit('live:off',{
                    chatId: contentId
                });
                alert('방송을 종료하였습니다.')
            }, function (err) {
                console.log(err, 'closeLive err')
                if (err.hasOwnProperty('errors')) {
                    var reason = err.errors[0].reason;
                    var msg = transitionErrMessage(reason);
                    alert(msg)
                } else {
                    alert(err)
                }
            })
    };

    var _createLive = function () {
        return $q(function (resolve, reject) {
            self.broadcast.scheduledStartTime = moment.utc().toISOString();
            var params = Object.assign({}, {broadcast: self.broadcast}, {streaming: self.streaming});

            $http.post('youtube/live/create', params).then(function (res) {
                if (_.isEmpty(res.data)) reject('로그인 해주세요.')
                resolve(res.data)
            }, function (err) {
                reject(err)
            });
        });
    };

    var _statusLive = function (status) {
        return $q(function (resolve, reject) {
            if (status !== 'live' && status !== 'testing' && status !== 'complete') reject('상태를 다시 입력해주세요.');

            if (contentId == null || self.liveBroadcast == null || self.liveStream == null) reject('라이브브로드캐스트가 존재하지 않습니다.');

            var _params = {
                broadcastStatus: status,
                id: contentId
            };
            $http.post('youtube/live/transition', _params)
                .then(function (res) {
                    resolve(res.data)
                }, function (err) {
                    reject(err.data)
                })
        });
    }

    var player;
    $scope.$on('vjsVideoReady', function (e, data) {
        player = data.player;
        player.width(592);
        player.height(333);
        player.play();

        console.log(player, 'player');

        player.on('play', function () {
            console.log('동영상 재생')
        });
        player.on('pause', function () {
            console.log('동영상 중지')
        });
        player.on('ended', function () {
            console.log('동영상 끝')
        });
    });


    self.allDelete = function () {
        $http.delete('/youtube/live/delete',{params: {test : 123}})
            .then(function (response) {
                var res = response.data;
                if (self.status.isReady) socket.emit('live:off', {
                    chatId: contentId
                });
                alert(res.length+'개 삭제했습니다.')
                console.log(res, '11')
            }, function (err) {
                console.log(err, '222')
            })
    }

    self.schBroadcast = function () {
        if (!contentId) return false;
        var params = {id: contentId}
        $http.get('/youtube/live/videos', {params: params})
            .then(function (response) {
                if (response.data.items.length) {
                    var res = response.data.items[0];
                    if (res.liveStreamingDetails.hasOwnProperty('activeLiveChatId') && !self.status.isReady && self.uid) {
                        socket.init('http://localhost:19000', res.liveStreamingDetails.activeLiveChatId);
                        socketStart();
                    }
                    console.log(res, 'schBroadcast scc')
                } else {
                    console.log('라이브스트림이 존재하지 않습니다.')
                }
            }, function (err) {
                console.log(err, 'schBroadcast err')
            })
    };

    self.setUid = function (uid) {
        self.uid = uid;
    }


    function _setOauth() {
        return $q(function (resolve, reject) {
            $http.post('google/setOauth')
                .then(function (res) {
                    resolve(res.data)
                }, function (err) {
                    reject(err)
                });
        });
    }

    self.console = function () {
        socket.emit('console')
    }

    self.testStart = function () {

        self.media = {
            techOrder: ['html5', 'youtube'],
            sources: [{
                "type": "video/youtube",
                "src": "https://www.youtube.com/watch?v=" + contentId
            }]
        };
    }


    self.getBraodcast = function () {
        $http.get('/youtube/live/list').then(function (res) {
            console.log(res.data.items, 'getBraodcast scc')
        }).catch(function (err) {
            console.log(err,'getBraodcast err')
        })
    }
});