var journey = require('journey');
var formidable = require('formidable');
var mongodb = require('mongodb');

/*
var nodemailer = require('nodemailer');
nodemailer.SMTP = {
    host: "smtp.gmail.com", // required
    port: 465, // optional, defaults to 25 or 465
    use_authentication: true,
    ssl: true,
    user: "",
    pass: ""
}
*/

var db = new mongodb.Db('collect', new mongodb.Server('127.0.0.1', 27017, {'auto_reconnect':true}), {});

// db open START
db.open(function (err, db) {

if (db) {

// create a router
var router = new(journey.Router);

// start the server
require('http').createServer(function (request, response) {

	if (request.method == 'OPTIONS') {

		response.writeHead(200, {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS, DELETE'});
		response.end();

	} else if (request.url != '/upload') {

		console.log(request.method+' '+request.url);

		var body = "";

		request.addListener('data', function (chunk) { body += chunk });
		request.addListener('end', function () {
			router.handle(request, body, function (result) {
				result.headers['Access-Control-Allow-Origin'] = '*';
				result.headers['Access-Control-Allow-Methods'] = '*';
				response.writeHead(result.status, result.headers);
				response.end(result.body);
			});
		});

	} else {
		// handle upload

		console.log('new file upload');

		var form = new formidable.IncomingForm(),
		files = [],
		fields = [];

		form.uploadDir = '/usr/share/nginx/html/uploads/';
		form.keepExtensions = true;

		form
			.on('field', function(field, value) {
				fields[field] = value;
			})
			.on('file', function(field, file) {
				files.push([field, file]);
			})
			.on('end', function() {
				auth(fields.username, fields.password, function (err, docs) {
					if (err) {
						response.writeHead(400, {'content-type':'application/json'});
						var myErr = {'error':err};
						response.end(JSON.stringify(myErr));
					} else {

						var allFiles = '';
						for (var i=0;i<files.length;i++) {
							if (i<0) {
								allFiles = allFiles+',';
							}
							var s = files[i][1]['path'].split('/');
							allFiles = allFiles+'"http://api1.getkneedle.com:8080/uploads/'+s[s.length-1]+'"';
						}
						response.writeHead(200, {'content-type':'application/json'});
						console.log(allFiles);
						response.end('{files:['+allFiles+']}');
					}
				});
			});
		form.parse(request);
	}
}).listen(80);

console.log('listening on port 80');


// UPDATE TYPES
/*
GET returns info on an object
POST creates an object
PUT updates an object
DELETE deletes an object
*/

/*
AUTHORIZATION
for any method which requires authorization, simple provide the following 2 params with request
username
password
*/
function auth(username, password, callback) {
	db.collection('users', function (err, collection) {
		collection.find({'username':username,'password':password}).toArray(function(err, docs) {
			if (docs.length == 0) {
				err = new Array('incorrect authentication credentials');
			}
			callback(err, docs);
		});
	});
}

/*
GET /zones

get all zones

AUTH REQUIRED

REQUEST PARAMS
N/A

RESPONSE CODES
200 - Valid Zone
	returns json document with all zones
400 - Unauthorized
	returns nothing
*/
router.get('/zones').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

		}

	});
});

// db open END

} else {

	// there was an error opening the db connection
	console.log('error opening db');

}

});
