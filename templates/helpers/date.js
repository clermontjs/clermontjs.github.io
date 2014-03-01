'use strict';
var moment = require('moment');
moment.lang('fr');

module.exports = function (date, format, ctx) {
    if (!date) {
        return ctx.inverse ? ctx.inverse(this) : 'date inconnue';
    }
    if (typeof format !== 'string') {
        format = 'DD. MMMM YYYY';
    }
    return moment(date).format(format);
};
