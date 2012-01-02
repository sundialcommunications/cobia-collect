var config = require('./config');
var fs = require('fs');
var journey = require('../journey/lib/journey');
var mongodb = require('mongodb');
var cp = require('child_process');
var db = new mongodb.Db(config.mongo.dbname, new mongodb.Server(config.mongo.host, config.mongo.port, {'auto_reconnect':true}), {});

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
		validCollectors[i] = s[0];
		console.log('added collectors/'+files[i]);
	}
});


// db open START
db.open(function (err, db) {

if (db) {

// start the server
require('http').createServer(function (request, response) {
	if (request.url == '/update' && request.method == 'POST') {

		var body = '';
		request.on('data', function (data) {
			body += data;
		});
		request.on('end', function () {

			var p = 1;

			if (body) {
				try {
					var json = JSON.parse(body);
				} catch(e) {
					p = 0;
					console.log('error parsing json');
					console.log(e);
				}
			}

			if (p == 1) {
			// authenticate request
			db.collection('hosts', function (err, collection) {
				collection.find({'login':json.login,'password':json.password}).toArray(function(err, docs) {
					if (docs) {
						// update host
						//console.log(docs);
						collection.update({'login':json.login}, {'$set':{'uptime':json.uptime,'clientInfo':json.clientInfo,'version':json.version,'outsideIp':request.connection.remoteAddress,'lastUpdate':Math.round(new Date().getTime() / 1000)}}, {}, function(err) {
						});

						// update collectors
						if (json.collectors) {

							for (key in json.collectors) {
								if (validCollectors.hasValue(key)) {
									// fork the collector process
									var n = cp.fork('./collectors/'+key+'.js');
									// send the json to the collector
									n.send({hostLogin:json.login,data:json.collectors[key]});
								}
							}

						}

						response.writeHead(200, { 'Content-Type': 'text/plain' });
						response.write('success');
						response.end();
					}
				});
			});
			}
		});
	}
}).listen(8080);

console.log('listening on port 8080');

// db open END

} else {

	// there was an error opening the db connection
	console.log('error opening db');

}

});
