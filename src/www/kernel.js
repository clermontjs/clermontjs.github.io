/* global require, console */
require([
    'jquery',
    'foundation'
], function () {
    'use strict';

    if($('.clermontjs-event-video').length > 0){
        require(['video']);
    }
});
