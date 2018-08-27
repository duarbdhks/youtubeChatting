'use strict';

module.exports = function (grunt) {

    grunt.loadNpmTasks('grunt-contrib-copy');

    grunt.initConfig({
        copy: {
            main: {
                files: [
                    {
                        expand: true,
                        cwd: 'node_modules/',
                        src: [
                            'angular/**',
                            'angular-sanitize/**',
                            'video.js/**',
                            'vjs-video/**',
                            'videojs-youtube/**',
                            'underscore/**',
                            'socket.io-client/**',
                            'moment/**',
                        ],
                        dest: 'lib/'
                    }
                ]
            }
        }
    });
    grunt.registerTask('default', ['copy:main']);
};