'use strict';
var Handlebars = require('handlebars');

module.exports = function (address, ctx) {
    if (!address) {
        return (ctx.inverse && ctx.inverse()) || 'Aucune adresse renseignée';
    }

    var root = ctx.data.root;

    var addressId = address;
    address = root.contents.locations[addressId + '.md'];
    address = (address && address.metadata && address.metadata.address) || addressId;

    var str = [
        '<a class="map center" href="http://maps.google.com/?q=', encodeURIComponent(address), '">',
        '<img src="http://maps.googleapis.com/maps/api/staticmap?center=',
        encodeURIComponent(address),
        '&markers=',
        encodeURIComponent(address),
        '&zoom=16&size=600x400&sensor=false" />',
        '</a>'
    ].join('');
    return new Handlebars.SafeString(str);
};
