/* global requirejs */
requirejs.config({
    baseUrl: '/js',
    paths: {
        'jquery': '<%= vendors %>/jquery/dist/jquery',
        'text': '<%= vendors %>/requirejs-text/text'
    }
});

// {{{ foundation module configuration
/*global requirejs*/
requirejs.config({
    deps: ['foundation'],
    paths: {
        'modernizr': '<%= vendors %>/modernizr/modernizr',
        'fastclick': '<%= vendors %>/fastclick/lib/fastclick',
        'foundation/abide': '<%= vendors %>/foundation/js/foundation/foundation.abide',
        'foundation/accordion': '<%= vendors %>/foundation/js/foundation/foundation.accordion',
        'foundation/alert': '<%= vendors %>/foundation/js/foundation/foundation.alert',
        'foundation/clearing': '<%= vendors %>/foundation/js/foundation/foundation.clearing',
        'foundation/dropdown': '<%= vendors %>/foundation/js/foundation/foundation.dropdown',
        'foundation/equalizer': '<%= vendors %>/foundation/js/foundation/foundation.equalizer',
        'foundation/interchange': '<%= vendors %>/foundation/js/foundation/foundation.interchange',
        'foundation/joyride': '<%= vendors %>/foundation/js/foundation/foundation.joyride',
        'foundation/magellan': '<%= vendors %>/foundation/js/foundation/foundation.magellan',
        'foundation/offcanvas': '<%= vendors %>/foundation/js/foundation/foundation.offcanvas',
        'foundation/orbit': '<%= vendors %>/foundation/js/foundation/foundation.orbit',
        'foundation/reveal': '<%= vendors %>/foundation/js/foundation/foundation.reveal',
        'foundation/tab': '<%= vendors %>/foundation/js/foundation/foundation.tab',
        'foundation/tooltip': '<%= vendors %>/foundation/js/foundation/foundation.tooltip',
        'foundation/topbar': '<%= vendors %>/foundation/js/foundation/foundation.topbar',
        'foundation/foundation': '<%= vendors %>/foundation/js/foundation/foundation'
    },

    shim: {
        'modernizr': { exports: 'Modernizr' },
        'foundation/abide': { deps: ['foundation/foundation'] },
        'foundation/accordion': { deps: ['foundation/foundation'] },
        'foundation/alert': { deps: ['foundation/foundation'] },
        'foundation/clearing': { deps: ['foundation/foundation'] },
        'foundation/dropdown': { deps: ['foundation/foundation'] },
        'foundation/equalizer': { deps: ['foundation/foundation'] },
        'foundation/interchange': { deps: ['foundation/foundation'] },
        'foundation/joyride': { deps: ['foundation/foundation'] },
        'foundation/magellan': { deps: ['foundation/foundation'] },
        'foundation/offcanvas': { deps: ['foundation/foundation'] },
        'foundation/orbit': { deps: ['foundation/foundation'] },
        'foundation/reveal': { deps: ['foundation/foundation'] },
        'foundation/tab': { deps: ['foundation/foundation'] },
        'foundation/tooltip': { deps: ['foundation/foundation'] },
        'foundation/topbar': { deps: ['foundation/foundation'] },
        'foundation/foundation': {
            deps: ['jquery', 'modernizr', 'fastclick'],
            exports: 'jQuery'
        }
    }
});

// foundation module configuration }}}