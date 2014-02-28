/* global require, console */
require([
    'jquery'
], function () {
    'use strict';

    console.log('I\'m ready to start.');
    console.log([
        'Your application uses [requirejs](http://requirejs.org).',
        'Your JavaScript frontend development is located in src/www',
        'For your convenience, jQuery is installed.'
    ].join('\n'));
});
