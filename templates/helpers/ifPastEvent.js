'use strict';
// display a message if event already took place, and the other one
// if event has not yet append
module.exports = function (event, ctx) {
    var root = ctx.data.root;
    var isBefore = root.env.helpers.isEventBefore(event, new Date());

    return isBefore ? ctx.fn(this) : ctx.inverse(this);
};
