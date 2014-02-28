// ## Generate static content
//
// Generate a static website using [wintersmith](http://wintersmith.io/).
module.exports = function (grunt) {
    'use strict';

    var wintersmith = require('wintersmith');
    var path = require('path');
    var _ = require('lodash');

    function patchWintersmithConfig() {
        var file = path.resolve(grunt.config.get('config.static.dir'), 'config.json');
        var config = grunt.file.readJSON(file);

        // output dir must be set to public directory.
        config.output = grunt.config.get('config.public.dir');

        grunt.file.write(file, JSON.stringify(config, null, 4));

        return file;
    }

    grunt.registerTask('static:build', 'Generate static content pages', function () {
        // wintersmith triggers several times the done callback...
        // wrap it into once, there should be no arm.
        var done = _.once(this.async());
        var env = wintersmith(patchWintersmithConfig());


        env.build(function (err) {
            if (err) return done(err);
            done();
        });
    });

    grunt.registerTask('static:clean', 'Clean generated pages', function () {
        var output = grunt.config.get('config.public.dir');
        output = path.resolve(output);
        grunt.log.writeln('Build output is: ' + output);

        if (grunt.file.exists(output)) {
            grunt.file.delete(output);
        }
    });

    grunt.extendConfig({
        watch: {
            'static': {
                //files: ['<%= config.static.dir %>/contents/**/*', '<%= config.static.dir %>/templates/**/*', '<%= config.static.dir %>/plugins/**/*', '<%= config.static.dir %>/config.json'],
                files: ['contents/**/*', 'templates/**/*', 'plugins/**/*', 'config.json'],
                tasks: ['static:build']
            }
        }
    });

    grunt.registerTask('static:dev', 'Generate static pages from wintersmith content.', ['static:build', 'watch:static']);
    grunt.registerTask('static:release', ['static:build']);

};
