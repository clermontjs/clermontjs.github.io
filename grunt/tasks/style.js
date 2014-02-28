// ## Style task
//
// Manage styles. By default sass files available in `<%= config.www.sass %>`
// are processed.
//
// * **style:dev** compiles stylesheets files and watch files for change.
// * **style:release** compiles stylesheets files and optimize for prodution.
module.exports = function (grunt) {
    "use strict";

    var dev = [];
    var release = [];

    // configure foundation
    grunt.extendConfig({
        "copy": {
            "foundation-icons": {
                "files": {
                    "<%= config.public.font %>/foundation-icons.eot": "<%= config.www.bower %>/foundation-icon-fonts/foundation-icons.eot",
                    "<%= config.public.font %>/foundation-icons.ttf": "<%= config.www.bower %>/foundation-icon-fonts/foundation-icons.ttf",
                    "<%= config.public.font %>/foundation-icons.svg": "<%= config.www.bower %>/foundation-icon-fonts/foundation-icons.svg",
                    "<%= config.public.font %>/foundation-icons.woff": "<%= config.www.bower %>/foundation-icon-fonts/foundation-icons.woff",
                }
            }
        }
    });
    dev.push('copy:foundation-icons');
    release.push('copy:foundation-icons');



    // This is the sass configuration section.
    // This might work out of the box.
    grunt.extendConfig({
        "sass": {
            "options": {
                // foundation
                // If not already installed, just install through bower:
                //
                // `bower install --save-dev foundation foundation-icon-fonts`
                "includePaths": [
                    "<%= config.www.bower %>/foundation/scss/",
                    "<%= config.www.bower %>/foundation-icon-fonts/"
                ]
                },
            "all": {
                "files": [{
                    "expand": true,
                    "cwd": "<%= config.www.sass %>",
                    "src": "**/*.scss",
                    "dest": "<%= config.public.css %>",
                    "ext": ".css"
                }]
            }
        },
        "watch": {
            "style": {
                "tasks": ["sass:all"],
                "files": ["<%= config.www.sass %>/**/*.scss"]
            }
        }
    });

    dev.push('sass:all');
    dev.push('watch:style');
    release.push('sass:all');


    grunt.extendConfig({
        "cssmin": {
            "release": {
                "files": [{
                    "expand": true,
                    "cwd": "<%= config.public.css %>",
                    "src": "**/*.css",
                    "dest": "<%= config.public.css %>",
                    "ext": ".css"
                }]
            }
        }
    });
    release.push('cssmin:release');

    grunt.registerTask('style:dev', 'Build stylesheets continuously.', dev);
    grunt.registerTask('style:release', 'Build stylesheets for release.', release);
};
