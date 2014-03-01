module.exports = function (ctx) {
    'use strict';
    var root = ctx.data.root;
    var contents = root.contents;
    var events = root.env.helpers.getSuggestions(contents);

    if (events.length) {
        return events.map(function (event) {
            return ctx.fn ? ctx.fn(event) : event.title;
        }).join('\n');
    } else {
        return ctx.inverse ? ctx.inverse(ctx) : 'Aucun événement.';
    }
};


