define(['popcorn'], function(Popcorn){
    Popcorn.plugin("iframe", {
        _setup: function(options) {
            options._iframe = document.getElementById(options.target);
        },
        start: function(event, options) {
            options._iframe.src = options.src;
            options._iframe.style.display = "inline";
        },
        end: function(event, options) {},
        _teardown: function(options) {}
    });

    Popcorn.setupSlides = function(video, conf) {
        var isLocked = true,
            player = document.querySelector('.player'),
            fullScreenButton = player.querySelector('.fullscreen'),
            slides = player.querySelector('.slides'),
            lockButton = player.querySelector('.lock'),
            iFs = fullScreenButton.querySelector('i'),
            iLock = lockButton.querySelector('i');

/*        fullScreenButton.addEventListener('click', function(event) {
            event.preventDefault();
            screenfull.toggle(player);
        });

        if (screenfull.enabled) {
            document.addEventListener(screenfull.raw.fullscreenchange, function () {
                iFs.classList.toggle('fi-arrows-out', !screenfull.isFullscreen);
                iFs.classList.toggle('fi-arrows-in', screenfull.isFullscreen);
                player.classList.toggle('fullscreen', screenfull.isFullscreen)
            });
        }else{
            fullScreenButton.parentNode.removeChild(fullScreenButton);;
        }

        lockButton.addEventListener('click', function(event){
            iLock.classList.toggle('fi-unlock', !isLocked);
            iLock.classList.toggle('fi-lock', isLocked);

            isLocked = !isLocked;
        });*/

        conf.tc.forEach(function(item, index) {
            var start = index > 0 ? item.start : 0,
                end = index >= conf.tc.length - 1 ? null : conf.tc[index + 1].start;
            video.iframe({
                target: conf.target,
                start: start, // seconds
                end: end,
                src: conf.baseurl + item.hash
            });
        });
    }
})