'use strict';
var Handlebars = require('handlebars');

module.exports = function (event, ctx) {
    var root = ctx.data.root;
    var video = event.metadata.video;

    if (!video) {
        return ctx.inverse ? ctx.inverse(this) : 'Pas encore de vidéo pour cet événement.';
    }

    var fn = ctx.fn || Handlebars.compile('<iframe width="560" height="315" src="http://www.youtube.com/embed/{{metadata.video}}" frameborder="0" allowfullscreen=""></iframe>');
    var data;
    if (ctx.data) {
        data = Handlebars.createFrame(ctx.data || {});
        data.event = event;
    }

    return new Handlebars.SafeString(fn(event, {data: data}));
};
