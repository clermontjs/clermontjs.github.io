/* global define */
define(['jquery', 'popcorn', 'screenfull'], function ($, Popcorn, screenfull) {
    'use strict';
    Popcorn.plugin('iframe', {
        _setup: function (options) {
            options._iframe = document.getElementById(options.target);
        },
        start: function (event, options) {
            options._iframe.src = options.src;
            options._iframe.style.display = 'inline';
        }
    });

    Popcorn.setupSlides = function (video, conf) {
        var $player = $('.clermontjs-event-video-player'),
            $fullScreenButton = $('.clermontjs-event-video-player-fullscreen');

        $fullScreenButton.click(function (event) {
            event.preventDefault();
            screenfull.toggle($player.get(0));
        });

        if (screenfull.enabled) {
            $('.clermontjs-event-video-fullscreen-calout').show();

            document.addEventListener(screenfull.raw.fullscreenchange, function () {
                $player.toggleClass('fullscreen', screenfull.isFullscreen);
            });
        }

        function getTc(input) {
            return (input + '').split(':').reduce(function (prev, curr, index, array) {
                curr = parseInt(curr, 10);
                switch (index) {
                    case 0:
                        return array.length === 3 ? prev + curr * 3600 : prev + curr * 60;
                    case 1:
                        return array.length === 3 ? prev + curr * 60 : prev + curr;
                    case 2:
                        return prev + curr;
                    default:
                        return prev;
                }
            }, 0);
        }

        conf.tc.forEach(function (item, index) {
            var end = index >= conf.tc.length - 1 ? null : conf.tc[index + 1].start;
            video.iframe({
                target: conf.target,
                start: getTc(item.start), // seconds
                end: getTc(end),
                src: conf.baseurl + (item.url || '')
            });
        });
    };
});
