'use strict';
module.exports = function (event, ctx) {
    var root = ctx.data.root;
    var isBefore = root.env.helpers.isEventBefore(event, new Date());

    return isBefore ? 'past' : 'upcoming';
};
