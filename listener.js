var config = require('./config');
var fs = require('fs');
var journey = require('journey');
var mongodb = require('mongodb');
var db = new mongodb.Db(config.mongo.dbname, new mongodb.Server(config.mongo.host, config.mongo.port, {'auto_reconnect':true}), {journal:true});

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
		console.log('Adding: collectors/'+files[i]);
	}
});

function authorize(d, cb) {
    // authenticate request
    db.collection('hosts', function (err, collection) {
        collection.find({'login':d.login,'key':d.key}).toArray(function(err, docs) {
            if (docs.length>0) {
                console.log('Valid login for '+d.login);
                return cb(true,docs[0]);
            } else {
                console.log('Invalid login for '+d.login);

                // check if there was actually data in login and key vars, if there was append it to unauthedBootRequests
                if (d.login != '' && d.key != '') {
                    db.collection('unauthedRequests', function (err, collection) {
                        collection.insert({'login':d.login,'key':d.key,'ts':Math.round((new Date()).getTime() / 1000)}, {}, function (err, objects) {});
                    });
                }
                return cb(false,null);
            }
        });
    });

}

var router = new(journey.Router);

router.post('/boot').bind(function (req, res, data) {

    authorize(data, function (auth, host) {

        if (auth) {

            console.log('Successful request to /boot from '+host.name);

            res.send({"host":host});
            // log lastBootRequest
            db.collection('hosts', function (err, collection) {
                collection.update({_id:host._id},{'$set':{'lastBootRequest':Math.round((new Date()).getTime() / 1000)}}, function(err) {
                });
            });

        } else {
            res.send(403);
            //res.send({"error":"invalid login"});

        }

    });

});

router.post('/update').bind(function (req, res, data) {

    authorize(data, function (auth, host) {

        if (auth) {

            console.log('Successful request to /update from '+host.name);

            // update hosts
            db.collection('hosts', function (err, collection) {
                collection.update({_id:host._id},{'$set':{'uptime':data.uptime,'wanIp':data.wanIp,'reboot':0,'clientInfo':data.clientInfo,'lastUpdate':Math.round((new Date()).getTime() / 1000),'outsideIp':req.connection.remoteAddress,'version':data.version}}, function(err) {
                });
            });

            console.log(data);

            if (data.collectors != undefined) {
                // run collectors
                console.log('Collector data: '+data.collectors);

                for (i=0; i<data.collectors.length; i++) {
                    if (validCollectors.hasValue(data.collectors[i].name)) {
                        // run this collector
                        console.log('running collector '+data.collectors[i].name+' for '+host.login);
                    } else {
                        // collector not supported on system
                        console.log('unsupported collector '+data.collectors[i].name+' for '+host.login);
                    }
                }
            }

            if (host.reboot == 1) {
                console.log('Rebooting host '+host.name);
                res.send({"reboot":1});
            } else {
                res.send(200);
            }
        } else {
            res.send(403);
        }

    });

});

// db open START
db.open(function (err, db) {
if (db) {

require('http').createServer(function (request, response) {
    var body = "";
    request.addListener('data', function (chunk) { body += chunk });
    request.addListener('end', function () {
        // Dispatch the request to the router
        router.handle(request, body, function (result) {
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });
}).listen(8080);

}
});
