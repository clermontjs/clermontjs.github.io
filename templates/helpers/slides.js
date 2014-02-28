'use strict';
var Handlebars = require('handlebars');

module.exports = function (event, ctx) {
    var root = ctx.data.root;
    var slides = event.metadata.slides;

    if (!slides) {
        return ctx.inverse ? ctx.inverse(this) : 'Pas encore de slides pour cet événement';
    }

    var fn = ctx.fn || Handlebars.compile('<iframe width="560" height="315" src="{{metadata.slides}}" frameborder="0"></iframe>');
    var data;
    if (ctx.data) {
        data = Handlebars.createFrame(ctx.data || {});
        data.event = event;
    }

    return new Handlebars.SafeString(fn(event, {data: data}));
};

