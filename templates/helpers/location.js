'use strict';
var Handlebars = require('handlebars');

// display page location.
module.exports = function (event, ctx) {
    var location = event.metadata.location || '';
    if (!location) {
        return ctx.inverse ? ctx.inverse(this) : 'dans un lieu inconnu.';
    }

    var root = ctx.data.root;

    var fn = ctx.fn || Handlebars.compile('{{#if url}}{{prefix}} <a href="{{url}}">{{name}}</a>{{else}}{{name}}{{/if}}');
    var data;
    if (ctx.data) {
        data = Handlebars.createFrame(ctx.data || {});
        data.event = event;
    }

    var locationId = location;
    location = root.contents.locations[locationId + '.md'];
    location = (location && location.metadata) || {name: locationId};

    return new Handlebars.SafeString(fn(location, {data: data}));
};

