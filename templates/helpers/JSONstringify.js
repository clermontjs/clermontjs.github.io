module.exports = function(object, space) {
    space = space || 0;

    if(typeof object === 'string'){
        object = JSON.parse(object);
    }
    return JSON.stringify(object, null, space);
};
