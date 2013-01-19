var config = require('./config');
var fs = require('fs');
var journey = require('journey');
var mongodb = require('mongodb');
var bcrypt = require('bcrypt');
var db = new mongodb.Db(config.mongo.dbname, new mongodb.Server(config.mongo.host, config.mongo.port, {'auto_reconnect':true}), {journal:true});

// Array.hasValue
Array.prototype.hasValue = function(value) {
    var i;
    for (i=0; i<this.length; i++) { if (this[i] === value) return true; }
    return false;
}

function checkParams(params, validator, cb) {

    var err = new Array();
    err.errorExists = false;
    err.errorString = '';

    for (i=0; i<validator.length; i++) {
        if (params[validator[i]] == undefined || params[validator[i]] == null) {
            // value doesn't exist
            err.errorExists = true;
            err.errorString += validator[i]+' ';
        }
    }

    if (err.errorExists == true) {
        err.errorString = 'the following parameters must have a value: '+err.errorString;
    }

    cb(err);
}

// create list of valid collectors
var validCollectors = new Array();
var colReqs = new Array();

fs.readdir('./collectors', function (err, files) {
for (var i=0; i<files.length; i++) {
		// split, limit 1, remove .js
		var s = files[i].split('.');
        if (s[1] == 'js') { // check that file actually ends in .js
		    // add as valid collector
		    validCollectors[i] = s[0];
            colReqs[s[0]] = require('./collectors/'+files[i]);
		    console.log('Adding: collectors/'+files[i]);
        }
	}
});

var router = new(journey.Router);

// CURRENTLY HOLDING IN SERVER FOR COLLECTOR CALL
router.post('/update').bind(function (req, res, data) {

    authorize(data, function (auth, host) {

        if (auth) {

            console.log('Successful request to /update from '+host.name);

            // update hosts
            db.collection('hosts', function (err, collection) {
                collection.update({_id:host._id},{'$set':{'uptime':data.uptime,'wanIp':data.wanIp,'reboot':0,'clientInfo':data.clientInfo,'lastUpdate':Math.round((new Date()).getTime() / 1000),'outsideIp':req.connection.remoteAddress,'version':data.version}}, function(err) {
                });
            });

            if (data.collectors != undefined) {
                // run collectors

                var keys = Object.keys(data.collectors);
                for (f=0; f<keys.length; f++) {
                    if (validCollectors.hasValue(keys[f])) {
                        // run this collector
                        console.log('running collector '+keys[f]+' for '+host.login);
                        try {
                            colReqs[keys[f]].incomingData(db, data.collectors[keys[f]], host);
                        } catch (err) {
                            console.log('Error starting collector: '+err);
                        }
                    } else {
                        // collector not supported on system
                        console.log('unsupported collector '+keys[f]+' for '+host.login);
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
    if (username == undefined || password == undefined) {
        callback('undefined username or password', new Array());
    } else {

	db.collection('admins', function (err, collection) {
		collection.find({'username':username}).toArray(function(err, docs) {
            var bhash = bcrypt.hashSync(password, 8);
            var match = bcrypt.compareSync(password, docs[0].password);
			if (docs.length == 0 || match == false) {
				err = 'incorrect authentication credentials for '+username+' : '+password+'/'+bhash;
			}
			callback(err, docs);
		});
	});

    }
}

/*
GET /zones - get all zones

AUTH REQUIRED

REQUEST URL PARAMS

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

            db.collection('zones', function (err, collection) {
                collection.find({}).toArray(function(err, docs) {
                    if (err) {
                        res.send(500, {}, {'error':err});
                    } else {
                        res.send({'success':1, 'zones':docs});
                    }
                });
            });

		}
	});
});

/*
GET /zone - get zone

AUTH REQUIRED

REQUEST URL PARAMS
zoneId*

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.get('/zone').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['zoneId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var zoneId = new mongodb.ObjectID(params.zoneId);
                        db.collection('zones', function (err, collection) {
                            collection.find({'_id':zoneId}).toArray(function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'group':docs[0]});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
POST /zone - create a zone

AUTH REQUIRED

REQUEST URL PARAMS

REQUEST POST PARAMS
name* - STR name of the zone
notes* - STR notes for the group

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.post('/zone').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['name','notes'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {

                    db.collection('zones', function (err, collection) {
                        collection.insert({'name':params.name, 'notes':params.notes, 'numUp':0, 'numDown':0, 'numTotal':0}, function(err, docs) {
                            if (err) {
                                res.send(500, {}, {'error':err});
                            } else {
                                res.send({'success':1, 'zone':docs[0]});
                            }
                        });
                    });

                }
            });

		}

	});
});

/*
DELETE  /zone - delete a zone

AUTH REQUIRED

REQUEST URL PARAMS
zoneId*

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.del('/zone').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['zoneId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var zoneId = new mongodb.ObjectID(params.zoneId);
                        db.collection('zones', function (err, collection) {
                            collection.remove({'_id':zoneId}, function(err) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
GET /groups - get all groups for zoneId

AUTH REQUIRED

REQUEST URL PARAMS
zoneId* - STR id of parent zone

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.get('/groups').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['zoneId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var zoneId = new mongodb.ObjectID(params.zoneId);
                        db.collection('groups', function (err, collection) {
                            collection.find({'zoneId':zoneId}).toArray(function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'group':docs});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
GET /group - get group data

AUTH REQUIRED

REQUEST URL PARAMS
groupId*

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.get('/group').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['groupId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var groupId = new mongodb.ObjectID(params.groupId);
                        db.collection('groups', function (err, collection) {
                            collection.find({'_id':groupId}).toArray(function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'group':docs[0]});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
POST /group - create a group

AUTH REQUIRED

REQUEST URL PARAMS

REQUEST POST PARAMS
name* - STR name for group
notes* - STR notes for group
zoneId* - STR zone _id of parent zone

RESPONSE CODES
200 - Valid Zone
	returns json document group
400 - Unauthorized
	returns nothing
*/
router.post('/group').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['name','notes','zoneId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var zoneId = new mongodb.ObjectID(params.zoneId);
                        db.collection('groups', function (err, collection) {
                            collection.insert({'name':params.name, 'notes':params.notes, 'zoneId':zoneId, 'numUp':0, 'numDown':0, 'numTotal':0}, function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'group':docs[0]});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}
	});
});

/*
DELETE /group - delete a group 

AUTH REQUIRED

REQUEST URL PARAMS
groupId*

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.del('/group').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['groupId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var groupId = new mongodb.ObjectID(params.groupId);
                        db.collection('groups', function (err, collection) {
                            collection.remove({'_id':groupId}, function(err) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
GET /hosts - get all hosts for groupId

AUTH REQUIRED

REQUEST URL PARAMS
groupId*

RESPONSE CODES
200 - Valid Zone
	returns json document hosts
400 - Unauthorized
	returns nothing
*/
router.get('/hosts').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['groupId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var groupId = new mongodb.ObjectID(params.groupId);
                        db.collection('hosts', function (err, collection) {
                            collection.find({'groupId':groupId}).toArray(function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'hosts':docs});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
GET /hostsForZone - get all hosts for zoneId

AUTH REQUIRED

REQUEST URL PARAMS
zoneId*

RESPONSE CODES
200 - Valid Zone
	returns json document hosts
400 - Unauthorized
	returns nothing
*/
router.get('/hostsForZone').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['zoneId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var zoneId = new mongodb.ObjectID(params.zoneId);
                        db.collection('hosts', function (err, collection) {
                            collection.find({'zoneId':zoneId}).toArray(function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'hosts':docs});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
GET /host - get host data

AUTH REQUIRED

REQUEST URL PARAMS
hostId*

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.get('/host').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['hostId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var hostId = new mongodb.ObjectID(params.hostId);
                        db.collection('hosts', function (err, collection) {
                            collection.find({'_id':hostId}).toArray(function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'host':docs[0]});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
POST /host - create a host

AUTH REQUIRED

REQUEST URL PARAMS

REQUEST POST PARAMS
login* - STR host login for authentication
key* - STR host password for authentication
name* - STR host display name
latitude - FLOAT
longitude - FLOAT
notes* - STR notes about the host
channel - INT wifi channel for host
vlan - INT vlan ID for host
ssid - STR ssid for host
encryption - STR encryption type (psk, psk2, none)
encryptionKey - STR encryption key
groupId* - STR parent group id
zoneId* - STR parent zone id

RESPONSE CODES
200 - Valid Zone
	returns json document host
400 - Unauthorized
	returns nothing
*/
router.post('/host').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['login','key','name','notes','groupId','zoneId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var groupId = new mongodb.ObjectID(params.groupId);
                        var zoneId = new mongodb.ObjectID(params.zoneId);
                        db.collection('hosts', function (err, collection) {
                            collection.insert({'login':params.login, 'key':params.key, 'name':params.name, 'latitude':params.latitude, 'longitude':params.longitude, 'notes':params.notes, 'channel':params.channel, 'vlan':params.vlan, 'ssid':params.ssid, 'encryption':params.encryption, 'encryptionKey':params.encryptionKey, 'groupId':groupId, 'zoneId':zoneId}, function(err, docs) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1, 'host':docs[0]});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
DELETE /host - delete a host

AUTH REQUIRED

REQUEST URL PARAMS
hostId*

RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.del('/host').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            checkParams(params, ['hostId'], function (err) {

                if (err.errorExists) {
                    res.send(500, {}, {'error':err.errorString});
                } else {
                    try {
                        var hostId = new mongodb.ObjectID(params.hostId);
                        db.collection('hosts', function (err, collection) {
                            collection.remove({'_id':hostId}, function(err) {
                                if (err) {
                                    res.send(500, {}, {'error':err});
                                } else {
                                    res.send({'success':1});
                                }
                            });
                        });
                    } catch (err) {
                        res.send(500, {}, {'error':err});
                    }
                }
            });

		}

	});
});

/*
GET /globalCollectors - list all active collectors in the system

AUTH REQUIRED

REQUEST URL PARAMS

RESPONSE CODES
200 - Valid
	returns json collectors
400 - Unauthorized
	returns nothing
*/
router.get('/globalCollectors').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {

            res.send({'success':1, 'collectors':validCollectors});

		}

	});
});


/*
GET /collectors - get collector data for a host

AUTH REQUIRED

REQUEST URL PARAMS
hostId, detailed=false


RESPONSE CODES
200 - Valid Zone
	returns json document zone
400 - Unauthorized
	returns nothing
*/
router.get('/collectors ').bind(function (req, res, params) {
	auth(params.username, params.password, function (err, docs) {
		if (err) {
			res.send(400, {}, {'error':err});
		} else {
            res.send({'success':1});

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
            console.log(request.method+' '+request.url);
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });
}).listen(8551);
console.log('listening on port 8551');

}
});

// update group and zone up/down counts
function upDownCount() {

    var groups = new Object();
    var zones = new Object();

	console.log('updating up/down count');
	// get all hosts

	db.collection('hosts', function (err, collection) {
		collection.find({}).toArray(function(err, docs) {
            // loop through each host
            for (var i=0; i<docs.length; i++) {

                // calculate groups
                if (docs[i].groupId != undefined) {

                    if (!groups[docs[i].groupId]) {
                        // setup
                        groups[docs[i].groupId] = {};
                        groups[docs[i].groupId].numTotal = 0;
                        groups[docs[i].groupId].numDown = 0;
                        groups[docs[i].groupId].numUp = 0;
                    }

                    // add this node to group
                    groups[docs[i].groupId].numTotal += 1;
                    // check if host has updated in last 10 minutes
                    if (docs[i].lastUpdate > Math.round((new Date()).getTime() / 1000)-600) {
                        // host is alive
                        groups[docs[i].groupId].numUp += 1;
                    } else {
                        // host is down
                        groups[docs[i].groupId].numDown += 1;
                    }
                }

                // calculate zones
                if (docs[i].zoneId != undefined) {

                    if (!zones[docs[i].zoneId]) {
                        // setup
                        zones[docs[i].zoneId] = {};
                        zones[docs[i].zoneId].numTotal = 0;
                        zones[docs[i].zoneId].numDown = 0;
                        zones[docs[i].zoneId].numUp = 0;
                    }
                    // add this node to zone
                    zones[docs[i].zoneId].numTotal += 1;
                    // check if host has updated in last 10 minutes
                    if (docs[i].lastUpdate > Math.round((new Date()).getTime() / 1000)-600) {
                        // host is alive
                        zones[docs[i].zoneId].numUp += 1;
                    } else {
                        // host is down
                        zones[docs[i].zoneId].numDown += 1;
                    }
                }

            }

            // update db

            for (var l in groups) {
                db.collection('groups', function (err, collection) {
                    collection.update({_id:new mongodb.ObjectID(l)},{'$set':groups[l]}, function(err) {
                    });
                });
            }

            for (var l in zones) {
                db.collection('zones', function (err, collection) {
                    collection.update({_id:new mongodb.ObjectID(l)},{'$set':zones[l]}, function(err) {
                    });
                });
            }

		});
	});

}

// run it every 5 minutes
setInterval(upDownCount,300000);
