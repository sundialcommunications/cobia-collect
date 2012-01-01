var journey = require('journey');
var mongodb = require('mongodb');
var cp = require('child_process');
var db = new mongodb.Db('collect', new mongodb.Server('127.0.0.1', 27017, {'auto_reconnect':true}), {});

// create list of valid collectors
var validCollectors = new Object();

// db open START
db.open(function (err, db) {

if (db) {

// start the server
require('http').createServer(function (request, response) {

	if (request.url == '/update') {

		console.log(request);

		var json = new Object();

		// get JSON

		// authenticate request

		// update host

		// update collectors
		if (json.collectors) {

			for (json.collectors as key) {
				if (json.collectors.inArray(key)) {
					// fork the collector process
					var n = cp.fork('./collectors/'+key+'.js');
					// send the json to the collector
					n.send({hostLogin:username,data:json.collectors[key]});
				}
			}

		}

		response.writeHead(200, {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS, DELETE'});
		response.end();

	}
}).listen(80);

console.log('listening on port 80');

// db open END

} else {

	// there was an error opening the db connection
	console.log('error opening db');

}

});
