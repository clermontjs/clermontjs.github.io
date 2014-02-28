'use strict';
var moment = require('moment');
moment.lang('fr');

module.exports = function (date, format) {
    if (typeof format !== 'string') {
        format = 'DD. MMMM YYYY';
    }
    return moment(date).format(format);
};
