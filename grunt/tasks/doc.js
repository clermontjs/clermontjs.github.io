// ## Documentation task
//
// This task create the whole documentation by parsing files.
//
// ### Grunt tasks
//
// All grunt tasks documentation is generated from task files top comments that
// are parsed and combined into `doc/grunt-build.md` file.
//
// ### Available tasks
//
// **grunt doc:grunt** create grunt tasks documentation.
module.exports = function (grunt) {

    grunt.registerTask('doc:grunt', 'Generate grunt tasks documentation.', function () {
        var contents = [];
        // Gruntfile is the first parsed file as it contains the basic explanations
        // on how build is done.
        contents.push(parseGruntDoc('Gruntfile.js'));
        // load all subtasks
        var subtasks = grunt.file.expand('grunt/tasks/**/*.js');
        if (!subtasks || !subtasks.length) {
            contents.push('**No defined tasks**');
        } else {
            subtasks.forEach(function (task) {
                contents.push('\n');
                contents.push(parseGruntDoc(task));
                contents.push('\n> find out more in `'+task+'` file.');
            });
        }

        // get all grunt tasks files:
        grunt.file.write('doc/grunt-build.md', contents.join('\n'));
    });

    var commentRe = /^\/\//;
    function parseGruntDoc(file) {
        var res = [];
        var contents = grunt.file.read(file).split('\n');
        var i = 0;
        while(commentRe.test(contents[i])) {
            res.push(contents[i].substr(3));
            i++;
        }

        return res.join('\n');
    }

    grunt.registerTask('doc:release', 'Generate all release doc.', ['doc:grunt']);
};
