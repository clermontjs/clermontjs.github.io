// Grunt build
// ===========
//
// ## Configuration
//
// General configuration is located in `grunt/config.json` file.
//
// This file defines the configuration object passed to `grunt.initConfig`.
// All **global values**, including **`multiTasks` options**, are defined in this file.
//
// All values are commented in the config file.
//
// > It is ok to add inline comments in grunt JSON files with this build.
//
// ## Options
//
// In `grunt/tasks/options.js` you will find a task loading all json files in the
// `grunt/options/` directory.
//
// Note that filename is used as key for your json configuration.
//
// If you define `options` key, it will be merged to all local tasks, but will not
// affect tasks outside of this file.
//
// ## High level tasks
//
// **grunt dev**: Start development environment.
//
// All launched tasks are defined in the `concurrent:dev` task. Edit it to add
// more development tasks.
//
// Please refer to tasks documentation for more information on every available tasks.
//
// **grunt preview**
//
// Build a pre-release and start release like server.
// Use it to test before shipping.
//
// **grunt release:fix** Create a new fix release.
//
// Not sure it will remain a grunt task.
//
// **grunt release:minor** Create a new minor release
//
// Not sure it will remain a grunt task.
//
// **grunt release:major** Create a new major release
//
// Not sure it will remain a grunt task.
//
// **grunt** is a shorthand for `dev` task.
//
// **grunt build:release**: Build release code.
//
// Internal task used to build application for release.
// This is the only reference for build steps.
//
// ## Tasks
//
module.exports = function (grunt) {

    // ================================================================ //
    //                                                                  //
    //                      DO NOT CHANGE THIS FILE                     //
    //                                                                  //
    // ================================================================ //
    'use strict';

    // load some dependencies
    var path = require('path');
    var _ = require('lodash');

    // Build grunt options.
    //
    // Project configuration.
    // Use pkg and grunt/config.json content.
    var options = {};
    _.extend(options, {
            // package.json file is loaded into `pkg`
            pkg: grunt.file.readJSON('package.json')
        },
        readGruntOptions('grunt/config.json'));

    // We're ready to go, so initialize grunt with computed configuration.
    grunt.initConfig(options);

    // Add the extendConfig method to grunt.
    require('./grunt/plugins/extendConfig')(grunt);
    // load all npm tasks
    require('load-grunt-tasks')(grunt);
    // load all local grunt tasks
    grunt.loadTasks(path.resolve(__dirname, 'grunt', 'tasks'));

    // Main tasks.
    grunt.registerTask('build:release', 'Build release code.', ['static:clean', 'templates:release', 'app:release', 'style:release', 'doc:release', 'static:release']);

    grunt.registerTask('dev', 'Start development environment.', ['static:clean', 'concurrent:dev']);

    grunt.registerTask('release', ['build:release']);
    grunt.registerTask('preview', 'Preview in production conditions', ['build:release', 'serve:release:keepalive']);
    grunt.registerTask('release:fix', 'Create a new fix release', ['build:release', 'bump:fix']);
    grunt.registerTask('release:minor', 'Create a new minor release', ['build:release', 'bump:minor']);
    grunt.registerTask('release:major', 'Create a new major release', ['build:release', 'bump:major']);

    grunt.registerTask('default', ['dev']);

    // This is a copy/paste from grunt/tasks/options.js, badly...
    // load a commented JSON file, strip comments
    // and returns parser JSON.
    function readGruntOptions(filename) {
        var commentRe = /^\s*\/\/.*$/gm;
        if (!grunt.file.exists(filename)) {
            return {};
        }
        var content = grunt.file.read(filename);
        content = content.replace(commentRe, '');

        return JSON.parse(content);
    }
};
