/* global define */
define([
    'jquery',
    'popcorn',
    'popcorn-slides'
], function ($, Popcorn) {
    'use strict';
    var $dataItem = $('[data-video]'),
        videoId = $dataItem.data('video'),
        slidesURL = $dataItem.data('slides'),
        tc = $dataItem.data('tc'),
        video;

    if (videoId) {
        video = Popcorn.youtube('.clermontjs-event-videocontainer', 'http://www.youtube.com/watch?html5=1&v=' + videoId);

        Popcorn.setupSlides(video, {
            target: 'clermontjs-event-slides-iframe',
            baseurl : slidesURL,
            tc : tc
        });
    }
});
