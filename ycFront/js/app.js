var app = angular.module('app', ['vjs.video', 'ngSanitize']);

app.config(function ($httpProvider) {
        delete $httpProvider.defaults.headers.common['X-Requested-With'];
    });