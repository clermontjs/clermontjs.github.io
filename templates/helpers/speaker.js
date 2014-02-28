'use strict';
var Handlebars = require('handlebars');

module.exports = function (event, ctx) {
    var root = ctx.data.root;
    var speaker = event.metadata.speaker;

    if (!speaker) {
        return ctx.inverse ? ctx.inverse(this) : 'Speaker inconnu.';
    }

    var fn = ctx.fn || Handlebars.compile('{{#if url}}<a href="{{url}}">{{name}}</a>{{else}}{{name}}{{/if}}');
    var data;
    if (ctx.data) {
        data = Handlebars.createFrame(ctx.data || {});
        data.event = event;
    }

    var speakerId = speaker;
    speaker = root.contents.speakers[speakerId + '.md'];
    speaker = (speaker && speaker.metadata) || {name: speakerId};

    return new Handlebars.SafeString(fn(speaker, {data: data}));
};

