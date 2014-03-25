/* global require */
require([
    'jquery',
    'foundation'
], function ($) {
    'use strict';

    if ($('[data-video]').length > 0) {
        require(['video']);
    }
});
