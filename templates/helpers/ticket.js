'use strict';
var now = new Date();
var Handlebars = require('handlebars');
// Embedd eventbrite widget
module.exports = function (event, ctx) {
    // check if upcomming
    var date = new Date(event.metadata.date);
    if (date.getTime() <= now.getTime() || ! event.metadata.eventbrite) {
        return (ctx.inverse && ctx.inverse()) || 'Cet événement est déjà passé.';
    }

    var fn = ctx.fn || Handlebars.compile([
        '<div style="width:100%; text-align:left;" >',
            '<iframe  src="https://www.eventbrite.com/tickets-external?eid={{eventbrite}}&ref=etckt" frameborder="0" height="214" ',
                        'width="100%" vspace="0" hspace="0" marginheight="5" marginwidth="5" scrolling="auto" allowtransparency="true">',
            '</iframe>',
            '<div style="font-family:Helvetica, Arial; font-size:10px; padding:5px 0 5px; margin:2px; width:100%; text-align:left;" >',
            '<a style="color:#ddd; text-decoration:none;" target="_blank" href="http://www.eventbrite.com/r/etckt">Event management</a>',
            '<span style="color:#ddd;">powered by</span> ',
            '<a style="color:#ddd; text-decoration:none;" target="_blank" href="http://www.eventbrite.com?ref=etckt">Eventbrite</a>',
            '</div>',
        '</div>'].join(''));
    // display widget
    var data;
    if (ctx.data) {
        data = Handlebars.createFrame(ctx.data || {});
        data.event = event;
    }
    return new Handlebars.SafeString(fn({eventbrite: event.metadata.eventbrite}, {data: data}));
};
