'use strict';
// display content if there is future events planned.
// Otherwise, else content is displayed.
//
// ```
// {{#hasFutureEvent}}
//   There is planned events
// {{else}}
//   No planned event yet
// {{/hasFutureEvent}}
// ```
module.exports = function (ctx) {
    var root = ctx.data.root;
    var contents = root.contents;
    var events = root.env.helpers.getUpcomingEvents(contents);

    return (events && events.length) ? ctx.fn(this) : ctx.inverse(this);
};


