var fs = require('fs');
var journey = require('journey');
var mongodb = require('mongodb');
var cp = require('child_process');
var db = new mongodb.Db('collect', new mongodb.Server('127.0.0.1', 27017, {'auto_reconnect':true}), {});

// Array.hasValue
Array.prototype.hasValue = function(value) {
  var i;
  for (i=0; i<this.length; i++) { if (this[i] === value) return true; }
  return false;
}

// create list of valid collectors
var validCollectors = new Array();

fs.readdir('./collectors', function (err, files) {
	for (var i=0; i<files.length; i++) {
		// split, limit 1, remove .js
		var s = files[i].split('.js',1);
		// add as valid collector
		validCollectors[] = s[0];
		console.log('added collectors/'+files[i];
	}
}


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
				if (validCollectors.hasValue(key)) {
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
}).listen(8080);

console.log('listening on port 8080');

// db open END

} else {

	// there was an error opening the db connection
	console.log('error opening db');

}

});
