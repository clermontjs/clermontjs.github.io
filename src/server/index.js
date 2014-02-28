var express = require('express');
var app = express();

app.use(express.static('public'));

// Import your applications here if you want to leverage
// development server.
// Note that for production, you should use pm2, forever or
// any other process supervisor, but not the grunt task.

module.exports = app;

if (!module.parent) {
    var port = app.get('port') || process.env.PORT || 8080;
    app.listen(port);
    console.log('Express started on port '+port);
}
