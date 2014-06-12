var config = require('./config');
var fs = require('fs');
var journey = require('journey');
var mongodb = require('mongodb');
var async = require('async');
var bcrypt = require('bcrypt');
var db = new mongodb.Db(config.mongo.dbname, new mongodb.Server(config.mongo.host, config.mongo.port, {
    'auto_reconnect': true
}), {
    journal: true
});
var net = require('net');
var http = require('http');
var https = require('https');
var nodemailer = require('nodemailer');
var static = require('node-static');

// Array.hasValue
Array.prototype.hasValue = function (value) {
    var i;
    for (i = 0; i < this.length; i++) {
        if (this[i] === value) return true;
    }
    return false;
}

function isValidMongoId(id) {

    if (!id) {
        return false;
    }

    id = id.toLowerCase();
    var validChar = '0123456789abcdef';
    var v = true;
    if (id.length != 24) {
        v = false;
    }
    for (idx = 0; idx < id.length; idx++) {
        if (validChar.indexOf(id.charAt(idx)) < 0) {
            v = false;
        }
    }
    return v;
}

function checkParams(params, validator, cb) {

    var err = false;
    var errorString = '';

    for (i = 0; i < validator.length; i++) {
        if (params[validator[i]] == undefined || params[validator[i]] == null || params[validator[i]] == '') {
            // value doesn't exist
            err = true;
            errorString += validator[i] + ' ';
        }
    }

    if (err == true) {
        cb('the following parameters must have a value: ' + errorString);
    } else {
        cb(null);
    }

}

// create list of valid collectors
var validCollectors = new Array();
var colReqs = new Array();

fs.readdir('./collectors', function (err, files) {
    for (var i = 0; i < files.length; i++) {
        // split, limit 1, remove .js
        var s = files[i].split('.');
        if (s[1] == 'js') { // check that file actually ends in .js
            // add as valid collector
            validCollectors[i] = s[0];
            colReqs[s[0]] = require('./collectors/' + files[i]);
            console.log('Adding: collectors/' + files[i]);
        }
    }
});

var router = new(journey.Router);

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
function auth(params, writePermReq, req, res, callback) {
    if (params.username == undefined || params.password == undefined) {
        res.send(401);
    } else {

        db.collection('admins', function (err, collection) {
            collection.find({
                'username': params.username
            }).toArray(function (err, docs) {
                if (docs.length > 0) {
                    var match = bcrypt.compareSync(params.password, docs[0].password);
                    if (docs.length == 0 || match == false) {
                        res.send(401);
                    } else if (docs[0].readOnly == 1 && writePermReq == true) {
                        res.send(500, {}, {
                            'error': 'you have no permission to do that'
                        });
                    } else {

                        callback(docs);

                        if (writePermReq == true) {
                            // log admin write activity
                            db.collection('adminWriteLog', function (err, collection) {
                                delete params.password
                                collection.insert({
                                    'username': params.username,
                                    'request': String(req.method + ' ' + req.url.pathname),
                                    'ts': Math.round((new Date()).getTime() / 1000),
                                    'params': params
                                }, function (err, docs) {});
                            });
                        }
                    }
                } else {
                    res.send(401);
                }
            });
        });

    }
}

/*
GET /auth - test auth

AUTH REQUIRED

REQUEST URL PARAMS
username*
password*

RESPONSE CODES
200 - Valid Zone
    returns {success:1}
400 - Unauthorized
    returns {error:err}
*/
router.get('/auth').bind(function (req, res, params) {
    auth(params, false, req, res, function (docs) {
        res.send({
            'success': 1
        });
    });
});

/*
GET /adminLog - get adminLog

AUTH REQUIRED

REQUEST URL PARAMS

RESPONSE CODES
200 - Valid Zone
    returns json document with adminLog
400 - Unauthorized
    returns nothing
*/
router.get('/adminLog').bind(function (req, res, params) {
    auth(params, false, req, res, function (docs) {

        db.collection('adminWriteLog', function (err, collection) {
            collection.find({}).sort({
                '_id': -1
            }).limit(50).toArray(function (err, docs) {
                if (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                } else {
                    res.send({
                        'success': 1,
                        'adminLog': docs
                    });
                }
            });
        });

    });
});

/*
GET /admins - get all admins

AUTH REQUIRED

REQUEST URL PARAMS

RESPONSE CODES
200 - Valid Zone
    returns json document with all admins
400 - Unauthorized
    returns nothing
*/
router.get('/admins').bind(function (req, res, params) {
    auth(params, false, req, res, function (docs) {

        db.collection('admins', function (err, collection) {
            collection.find({}).toArray(function (err, docs) {
                if (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                } else {
                    res.send({
                        'success': 1,
                        'admins': docs
                    });
                }
            });
        });

    });
});

/*
GET /admin - get an admin

AUTH REQUIRED

REQUEST URL PARAMS
adminUsername*

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.get('/admin').bind(function (req, res, params) {
    auth(params, false, req, res, function (err, docs) {

        checkParams(params, ['adminUsername'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    db.collection('admins', function (err, collection) {
                        collection.find({
                            'username': params.adminUsername
                        }).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'admin': docs[0]
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

    });
});

/*
POST /admin - create an admin

AUTH REQUIRED

REQUEST URL PARAMS

REQUEST POST PARAMS
adminUsername* - STR name of the admin
adminPassword* - STR password of the admin
adminEmail* - STR email of the admin
adminReadOnly* - BOOLEAN admin readOnly status

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.post('/admin').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        checkParams(params, ['adminUsername', 'adminPassword', 'adminEmail', 'adminReadOnly'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                db.collection('admins', function (err, collection) {
                    if (params.adminReadOnly != 0) {
                        params.adminReadOnly = 1;
                    }
                    collection.insert({
                        'username': params.adminUsername,
                        'password': bcrypt.hashSync(params.adminPassword, 8),
                        'email': params.adminEmail,
                        'readOnly': params.adminReadOnly
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'admin': docs[0]
                            });
                        }
                    });
                });

            }
        });

    });
});

/*
PUT /admin - update an admin

AUTH REQUIRED

REQUEST URL PARAMS
adminUsername* - STR name of the admin
adminPassword - STR password of the admin
adminEmail - STR email of the admin
adminReadOnly - BOOLEAN admin readOnly status

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.put('/admin').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['adminUsername'], function (err) {
                    callback(err, '');
                });
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else if (params.username == params.adminUsername && params.adminReadOnly != undefined) {
                res.send(500, {}, {
                    'error': 'you cannot change your readOnly state, you will lock yourself out'
                });
            } else if (params.username != params.adminUsername && params.adminPassword != undefined) {
                res.send(500, {}, {
                    'error': 'you can only change your password'
                });
            } else {

                db.collection('admins', function (err, collection) {
                    var i = {};
                    if (params.adminPassword != undefined && params.adminPassword != '') {
                        i.password = bcrypt.hashSync(params.adminPassword, 8);
                    }
                    if (params.adminReadOnly != undefined && params.adminReadOnly != '') {
                        i.readOnly = params.adminReadOnly;
                    }
                    if (params.adminEmail != undefined && params.adminEmail != '') {
                        i.email = params.adminEmail;
                    }
                    collection.update({
                        'username': params.adminUsername
                    }, {
                        '$set': i
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'admin': docs[0]
                            });
                        }
                    });
                });

            }
        });

    });
});

/*
DELETE /admin - delete an admin

AUTH REQUIRED

REQUEST URL PARAMS
adminUsername* - STR name of the admin

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.del('/admin').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        checkParams(params, ['adminUsername'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else if (params.username == params.adminUsername) {
                res.send(500, {}, {
                    'error': 'you cannot delete yourself'
                });
            } else {
                try {
                    db.collection('admins', function (err, collection) {
                        collection.remove({
                            'username': params.adminUsername
                        }, function (err) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

    });
});

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
    auth(params, false, req, res, function (docs) {

        db.collection('zones', function (err, collection) {
            collection.find({}).toArray(function (err, docs) {
                if (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                } else {
                    res.send({
                        'success': 1,
                        'zones': docs
                    });
                }
            });
        });

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
    auth(params, false, req, res, function (err, docs) {

        checkParams(params, ['zoneId'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    var zoneId = new mongodb.ObjectID(params.zoneId);
                    db.collection('zones', function (err, collection) {
                        collection.find({
                            '_id': zoneId
                        }).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'zone': docs[0]
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

    });
});

/*
POST /zone - create a zone

AUTH REQUIRED

REQUEST URL PARAMS

REQUEST POST PARAMS
name* - STR name of the zone
notes* - STR notes for the zone

RESPONSE CODES
200 - Valid Zone
    returns json document zone
400 - Unauthorized
    returns nothing
*/
router.post('/zone').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        checkParams(params, ['name', 'notes'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                db.collection('zones', function (err, collection) {
                    collection.insert({
                        'name': params.name,
                        'notes': params.notes,
                        'numUp': 0,
                        'numDown': 0,
                        'numTotal': 0
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'zone': docs[0]
                            });
                        }
                    });
                });

            }
        });

    });
});

/*
PUT /zone - update a zone

AUTH REQUIRED

REQUEST URL PARAMS
zoneId* - STR id of the zone
name - STR name of the zone
notes - STR notes for the zone

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.put('/zone').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['zoneId'], function (err) {
                    callback(err, '');
                });
            },
            function (callback) {
                if (isValidMongoId(params.zoneId)) {
                    callback(null, '');
                } else {
                    callback('invalid zoneId', '');
                }
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                db.collection('zones', function (err, collection) {
                    var i = {};
                    if (params.name != undefined && params.name != '') {
                        i.name = params.name;
                    }
                    if (params.notes != undefined && params.notes != '') {
                        i.notes = params.notes;
                    }
                    collection.update({
                        '_id': new mongodb.ObjectID(params.zoneId)
                    }, {
                        '$set': i
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'zone': docs[0]
                            });
                        }
                    });
                });

            }
        });

    });
});

/*
DELETE /zone - delete a zone

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
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                if (isValidMongoId(params.zoneId)) {
                    callback(null, '');
                } else {
                    callback('invalid zoneId', '');
                }
            },

            function (callback) {
                checkParams(params, ['zoneId'], function (err) {
                    callback(err, '');
                });
            },
            function (callback) {
                db.collection('groups', function (err, collection) {
                    collection.find({
                        'zoneId': new mongodb.ObjectID(params.zoneId)
                    }).toArray(function (err, docs) {
                        if (docs.length > 0) {
                            callback('all groups must be removed from a zone before deleting it', '');
                        } else {
                            callback(null, '');
                        }
                    });
                });
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                db.collection('zones', function (err, collection) {
                    collection.remove({
                        '_id': new mongodb.ObjectID(params.zoneId)
                    }, function (err) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1
                            });
                        }
                    });
                });
            }
        });

    });
});

/*
GET /groups - get all groups for zoneId

AUTH REQUIRED

REQUEST URL PARAMS
zoneId* - STR id of parent zone

RESPONSE CODES
200 - Valid Zone
    returns json document groups
400 - Unauthorized
    returns nothing
*/
router.get('/groups').bind(function (req, res, params) {
    auth(params, false, req, res, function (err, docs) {

        checkParams(params, ['zoneId'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    var zoneId = new mongodb.ObjectID(params.zoneId);
                    db.collection('groups', function (err, collection) {
                        collection.find({
                            'zoneId': zoneId
                        }).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'groups': docs
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

    });
});

/*
GET /group - get group data

AUTH REQUIRED

REQUEST URL PARAMS
groupId
supportNumber

RESPONSE CODES
200 - Valid Zone
    returns json document zone
400 - Unauthorized
    returns nothing
*/
router.get('/group').bind(function (req, res, params) {
    auth(params, false, req, res, function (err, docs) {

                try {

                    db.collection('groups', function (err, collection) {
                        var i = {};
                        if (params.groupId != undefined) {
                            i._id = new mongodb.ObjectID(params.groupId);
                        }
                        if (params.supportNumber != undefined) {
                            i.supportNumber = params.supportNumber;
                        }
                        collection.find(i).limit(1).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'group': docs[0]
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
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
supportNumber - STR support number

RESPONSE CODES
200 - Valid Zone
    returns json document group
400 - Unauthorized
    returns nothing
*/

router.post('/group').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['name', 'notes', 'zoneId'], function (err) {
                    callback(err, '');
                });
            },
            function (callback) {
                if (isValidMongoId(params.zoneId)) {
                    callback(null, '');
                } else {
                    callback('invalid zoneId', '');
                }
            },
            function (callback) {
                db.collection('zones', function (err, collection) {
                    collection.find({
                        '_id': new mongodb.ObjectID(params.zoneId)
                    }).toArray(function (err, docs) {
                        if (docs.length > 0) {
                            callback(null, '');
                        } else {
                            callback('that zoneId was not found', '');
                        }
                    });
                });
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                var zoneId = new mongodb.ObjectID(params.zoneId);
                db.collection('groups', function (err, collection) {
                    collection.insert({
                        'name': params.name,
                        'notes': params.notes,
                        'zoneId': new mongodb.ObjectID(params.zoneId),
                        'supportNumber': String(params.supportNumber),
                        'numUp': 0,
                        'numDown': 0,
                        'numTotal': 0
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'group': docs[0]
                            });
                        }
                    });
                });
            }
        });
    });
});

/*
PUT /group - update a group

AUTH REQUIRED

REQUEST URL PARAMS
groupId* - STR id of the group
name - STR name of the group
notes - STR notes for the group
supportNumber - STR support number

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.put('/group').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['groupId'], function (err) {
                    callback(err, '');
                });
            },
            function (callback) {
                if (isValidMongoId(params.groupId)) {
                    callback(null, '');
                } else {
                    callback('invalid groupId', '');
                }
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                db.collection('groups', function (err, collection) {
                    var i = {};
                    if (params.name != undefined && params.name != '') {
                        i.name = params.name;
                    }
                    if (params.notes != undefined && params.notes != '') {
                        i.notes = params.notes;
                    }
                    if (params.supportNumber != undefined && params.supportNumber != '') {
                        i.supportNumber = String(params.supportNumber);
                    }
                    collection.update({
                        '_id': new mongodb.ObjectID(params.groupId)
                    }, {
                        '$set': i
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'group': docs[0]
                            });
                        }
                    });
                });

            }
        });

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
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                if (isValidMongoId(params.groupId)) {
                    callback(null, '');
                } else {
                    callback('invalid groupId', '');
                }
            },
            function (callback) {
                checkParams(params, ['groupId'], function (err) {
                    callback(err, '');
                });
            },
            function (callback) {
                db.collection('hosts', function (err, collection) {
                    collection.find({
                        'groupId': new mongodb.ObjectID(params.groupId)
                    }).toArray(function (err, docs) {
                        if (docs.length > 0) {
                            callback('all hosts must be removed from a group before deleting it', '');
                        } else {
                            callback(null, '');
                        }
                    });
                });
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                db.collection('groups', function (err, collection) {
                    collection.remove({
                        '_id': new mongodb.ObjectID(params.groupId)
                    }, function (err) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1
                            });
                        }
                    });
                });
            }
        });
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
    auth(params, false, req, res, function (err, docs) {

        checkParams(params, ['groupId'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    var groupId = new mongodb.ObjectID(params.groupId);
                    db.collection('hosts', function (err, collection) {
                        collection.find({
                            'groupId': groupId
                        }).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'hosts': docs
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

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
    auth(params, false, req, res, function (err, docs) {

        checkParams(params, ['zoneId'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    var zoneId = new mongodb.ObjectID(params.zoneId);
                    db.collection('hosts', function (err, collection) {
                        collection.find({
                            'zoneId': zoneId
                        }).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'hosts': docs
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

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
    auth(params, false, req, res, function (err, docs) {

        checkParams(params, ['hostId'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    var hostId = new mongodb.ObjectID(params.hostId);
                    db.collection('hosts', function (err, collection) {
                        collection.find({
                            '_id': hostId
                        }).toArray(function (err, docs) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1,
                                    'host': docs[0]
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

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
wirelessMode - STR wireless mode, ap/sta
wds - INT 1/0 wds
channel - INT wifi channel for host
vlan - INT vlan ID for host
ssid - STR ssid for host
encryption - STR encryption type (psk, psk2, none)
encryptionKey - STR encryption key
groupId* - STR parent group id

RESPONSE CODES
200 - Valid Zone
    returns json document host
400 - Unauthorized
    returns nothing
*/
router.post('/host').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['login', 'key', 'name', 'notes', 'groupId'], function (err) {
                    callback(err, '');
                });
            },

            function (callback) {
                if (isValidMongoId(params.groupId)) {
                    callback(null, '');
                } else {
                    callback('invalid groupId', '');
                }
            },

            function (callback) {
                db.collection('groups', function (err, collection) {
                    collection.find({
                        '_id': new mongodb.ObjectID(params.groupId)
                    }).toArray(function (err, docs) {
                        if (docs.length > 0) {
                            callback(null, docs[0]);
                        } else {
                            callback('that groupId was not found', '');
                        }
                    });
                });
            }

        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                zoneId = String(results[2].zoneId);
                db.collection('hosts', function (err, collection) {
                    collection.insert({
                        'login': params.login,
                        'key': params.key,
                        'name': params.name,
                        'latitude': params.latitude,
                        'longitude': params.longitude,
                        'notes': params.notes,
                        'wirelessMode': params.wirelessMode,
                        'wds': params.wds,
                        'channel': params.channel,
                        'vlan': params.vlan,
                        'ssid': params.ssid,
                        'encryption': params.encryption,
                        'encryptionKey': params.encryptionKey,
                        'groupId': new mongodb.ObjectID(params.groupId),
                        'zoneId': new mongodb.ObjectID(zoneId),
                        'reboot': 1,
                        'createdAt': Math.round((new Date()).getTime() / 1000)
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'host': docs[0]
                            });
                        }
                    });
                });
            }
        });

    });
});

/*
PUT /host - update a host

AUTH REQUIRED

REQUEST URL PARAMS
hostId* - STR id of the host
login - STR host login for authentication
key - STR host password for authentication
name - STR host display name
latitude - FLOAT
longitude - FLOAT
notes - STR notes about the host
wirelessMode - STR wireless mode, ap/sta
wds - INT 1/0 wds
channel - INT wifi channel for host
vlan - INT vlan ID for host
ssid - STR ssid for host
encryption - STR encryption type (psk, psk2, none)
encryptionKey - STR encryption key
reboot - BOOLEAN true to reboot host on next update

RESPONSE CODES
200 - Valid Zone
    returns json document admin
400 - Unauthorized
    returns nothing
*/
router.put('/host').bind(function (req, res, params) {
    auth(params, true, req, res, function (err, docs) {
        console.log(params);

        async.series([

            function (callback) {
                checkParams(params, ['hostId'], function (err) {
                    callback(err, '');
                });
            },
            function (callback) {
                if (isValidMongoId(params.hostId)) {
                    callback(null, '');
                } else {
                    callback('invalid hostId', '');
                }
            }
        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                db.collection('hosts', function (err, collection) {
                    var i = {};

                    if (params.login != undefined && params.login != '') {
                        i.login = params.login;
                    }

                    if (params.key != undefined && params.key != '') {
                        i.key = params.key;
                    }

                    if (params.name != undefined && params.name != '') {
                        i.name = params.name;
                    }

                    if (params.latitude != undefined && params.latitude != '') {
                        i.latitude = params.latitude;
                    }

                    if (params.longitude != undefined && params.longitude != '') {
                        i.longitude = params.longitude;
                    }

                    if (params.notes != undefined && params.notes != '') {
                        i.notes = params.notes;
                    }

                    if (params.wirelessMode != undefined && params.wirelessMode != '') {
                        i.wirelessMode = params.wirelessMode;
                    }

                    if (params.wds != undefined && params.wds != '') {
                        i.wds = params.wds;
                    }

                    if (params.channel != undefined && params.channel != '') {
                        i.channel = params.channel;
                    }

                    if (params.vlan != undefined && params.vlan != '') {
                        i.vlan = params.vlan;
                    }

                    if (params.ssid != undefined && params.ssid != '') {
                        i.ssid = params.ssid;
                    }

                    if (params.encryption != undefined && params.encryption != '') {
                        i.encryption = params.encryption;
                    }

                    if (params.encryptionKey != undefined && params.encryptionKey != '') {
                        i.encryptionKey = params.encryptionKey;
                    }

                    if (params.reboot != undefined && params.reboot != '') {
                        i.reboot = params.reboot;
                    }

                    collection.update({
                        '_id': new mongodb.ObjectID(params.hostId)
                    }, {
                        '$set': i
                    }, function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'host': docs[0]
                            });
                        }
                    });
                });

            }
        });

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
    auth(params, true, req, res, function (err, docs) {

        checkParams(params, ['hostId'], function (err) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {
                try {
                    var hostId = new mongodb.ObjectID(params.hostId);
                    db.collection('hosts', function (err, collection) {
                        collection.remove({
                            '_id': hostId
                        }, function (err) {
                            if (err) {
                                res.send(500, {}, {
                                    'error': err
                                });
                            } else {
                                res.send({
                                    'success': 1
                                });
                            }
                        });
                    });
                } catch (err) {
                    res.send(500, {}, {
                        'error': err
                    });
                }
            }
        });

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
    auth(params, false, req, res, function (err, docs) {

        res.send({
            'success': 1,
            'collectors': validCollectors
        });

    });
});


/*
GET /collectors - get collectors with overview for a host

AUTH REQUIRED

REQUEST URL PARAMS
hostId* - STR id of the host


RESPONSE CODES
200 - Valid Zone
    returns json document collectors
400 - Unauthorized
    returns nothing
*/
router.get('/collectors').bind(function (req, res, params) {
    auth(params, false, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['hostId'], function (err) {
                    callback(err, '');
                });
            },

            function (callback) {
                if (isValidMongoId(params.hostId)) {
                    callback(null, '');
                } else {
                    callback('invalid hostId', '');
                }
            },

            function (callback) {

                if (validCollectors.indexOf(params.collector)) {
                    // this is a valid collector in the system
                    callback(null, '');
                } else {
                    callback(null, 'collector ' + params.collector + ' not valid');
                }

            }

        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                // grab the data from hostCollectorStatus and return it

                db.collection('hostCollectorStatus', function (err, collection) {
                    collection.find({
                        'hostId': new mongodb.ObjectID(params.hostId)
                    }).sort({
                        '_id': -1
                    }).toArray(function (err, docs) {
                        if (err) {
                            res.send(500, {}, {
                                'error': err
                            });
                        } else {
                            res.send({
                                'success': 1,
                                'collectors': docs
                            });
                        }
                    });
                });

            }
        });

    });
});

/*
GET /collector - get collector detail for a host

AUTH REQUIRED

REQUEST URL PARAMS
hostId* - STR id of the host
collector* - STR name of the collector
hash* - STR id of the data to return


RESPONSE CODES
200 - Valid Zone
    returns json document collector
400 - Unauthorized
    returns nothing
*/
router.get('/collector').bind(function (req, res, params) {
    auth(params, false, req, res, function (err, docs) {

        async.series([

            function (callback) {
                checkParams(params, ['hostId', 'collector', 'hash'], function (err) {
                    callback(err, '');
                });
            },

            function (callback) {
                if (isValidMongoId(params.hostId)) {
                    callback(null, '');
                } else {
                    callback('invalid hostId', '');
                }
            },

            function (callback) {

                if (validCollectors.indexOf(params.collector)) {
                    // this is a valid collector in the system
                    callback(null, '');
                } else {
                    callback(null, 'collector ' + params.collector + ' not valid');
                }

            }

        ], function (err, results) {

            if (err) {
                res.send(500, {}, {
                    'error': err
                });
            } else {

                colReqs[params.collector].serverApiRequest(db, params.hostId, params.hash, function (err, data) {
                    if (err) {
                        res.send(500, {}, {
                            'error': err
                        });
                    } else {
                        res.send({
                            'success': 1,
                            'collector': data
                        });
                    }
                });
            }
        });

    });
});


// db open START
db.open(function (err, db) {
    if (db) {

// startup checks

// indexes
// hosts
db.ensureIndex('hosts', 'login', {
    'unique': true
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});
db.ensureIndex('hosts', 'key', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});
db.ensureIndex('hosts', 'groupId', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});
db.ensureIndex('hosts', 'zoneId', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});

// groups
db.ensureIndex('groups', 'name', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});
db.ensureIndex('groups', 'zoneId', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});

// zones
db.ensureIndex('zones', 'name', {
    'unique': true
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});

// admins
db.ensureIndex('admins', 'username', {
    'unique': true
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});

// adminWriteLog
db.ensureIndex('adminWriteLog', 'username', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});

// hostCollectorStatus
db.ensureIndex('hostCollectorStatus', '{hostId:1,collector:1}', {
    'unique': false
}, function (err, name) {
    if (err) {
        console.log(err)
    }
});

// ensure there is an admin account
db.collection('admins', function (err, collection) {
    collection.find({}).toArray(function (err, docs) {
        if (docs.length == 0) {
            // create admin account - admin/password
            collection.insert({
                'username': 'admin',
                'password': bcrypt.hashSync('password', 8),
                'readOnly': 0
            }, function (err, docs) {});
        }
    });
});

upDownCount();

// run it every minute
setInterval(upDownCount, 60000);


        var options = {
            key: fs.readFileSync('./keys/privatekey.pem'),
            cert: fs.readFileSync('./keys/certificate.pem')
        };

        var fss = new static.Server('./interface');

        https.createServer(options, httpsConnection).listen(Number(config.serverPort));
        console.log('listening on port ' + Number(config.serverPort));

        function httpsConnection(request, response) {

            if (request.method == 'OPTIONS') {

                response.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS, DELETE'
                });
                response.end();

            } else if (request.url.indexOf('/api') === 0) {

                request.url = request.url.substring(4);

                var body = "";
                request.addListener('data', function (chunk) {
                    body += chunk
                });
                request.addListener('end', function () {
                    // Dispatch the request to the router
                    router.handle(request, body, function (result) {
                        result.headers['Access-Control-Allow-Origin'] = '*';
                        result.headers['Access-Control-Allow-Methods'] = '*';
                        response.writeHead(result.status, result.headers);
                        response.end(result.body);
                        console.log('###### ' + request.method + ' ' + request.url + " ######\n" + result.body);
                    });
                });
            } else {

                console.log(request.url);
                request.addListener('end', function () {
                    fss.serve(request, response);
                }).resume();

            }

        }

    }
});

var smtpTransport = nodemailer.createTransport("SMTP", {
    service: config.emailService,
    auth: {
        user: config.emailUser,
        pass: config.emailPass
    }
});

var alertCount = 0;
var alertHosts = '';

// update group and zone up/down counts
function upDownCount() {

    var groups = new Object();
    var zones = new Object();

    console.log('updating up/down count');
    // get all hosts

    db.collection('hosts', function (err, collection) {
        collection.find({}).toArray(function (err, docs) {
		console.log(err);
            // loop through each host
            var loopAlertCount = 0;
            alertHosts = '';
            for (var i = 0; i < docs.length; i++) {

                // calculate alerts
                if (docs[i].lastUpdate < Math.round((new Date()).getTime() / 1000) - 600) {
                    // host is down
                    loopAlertCount++;
                    alertHosts += "\n\n" + docs[i].name + ' down for ' + (Math.round((new Date()).getTime() / 1000)-Number(docs[i].lastUpdate)) + ' seconds';
                }

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
                    if (docs[i].lastUpdate > Math.round((new Date()).getTime() / 1000) - 600) {
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
                    if (docs[i].lastUpdate > Math.round((new Date()).getTime() / 1000) - 600) {
                        // host is alive
                        zones[docs[i].zoneId].numUp += 1;
                    } else {
                        // host is down
                        zones[docs[i].zoneId].numDown += 1;
                    }
                }

            }

            // update db

            db.collection('groups', function (err, collection) {
                collection.update({}, {
                    '$set': {
                        'numUp': 0,
                        'numDown': 0,
                        'numTotal': 0
                    }
                }, {
                    'multi': true
                }, function (err) {
                    for (var l in groups) {
                        db.collection('groups', function (err, collection) {
                            collection.update({
                                _id: new mongodb.ObjectID(l)
                            }, {
                                '$set': groups[l]
                            }, function (err) {});
                        });
                    }
                });
            });

            db.collection('zones', function (err, collection) {
                collection.update({}, {
                    '$set': {
                        'numUp': 0,
                        'numDown': 0,
                        'numTotal': 0
                    }
                }, {
                    'multi': true
                }, function (err) {
                    for (var l in zones) {
                        db.collection('zones', function (err, collection) {
                            collection.update({
                                _id: new mongodb.ObjectID(l)
                            }, {
                                '$set': zones[l]
                            }, function (err) {});
                        });
                    }
                });
            });

            if (loopAlertCount > alertCount) {
                // there are more dead hosts this time
                // send alert
                console.log('sending alert for ' + loopAlertCount + ' dead hosts');

                db.collection('admins', function (err, collection) {
                    collection.find({}).toArray(function (err, docs) {
                        // loop through each admin to send alert
                        for (var i = 0; i < docs.length; i++) {

                            if (docs[i].email != '' && config.emailUser != '') {

                                smtpTransport.sendMail({
                                    from: "cobia-collect <" + config.emailUser + ">", // sender address
                                    to: docs[i].email, // comma separated list of receivers
                                    subject: loopAlertCount + " hosts offline @ "+new Date().toLocaleString(), // Subject line
                                    text: "cobia-collect reports " + loopAlertCount + ' total hosts offline.' + alertHosts // plaintext body
                                }, function (error, response) {
                                    if (error) {
                                        console.log(error);
                                    } else {
                                        console.log("Message sent: " + response.message);
                                    }
                                });

                            }

                        }
                    });
                });

            }

            // set alertCount to loopAlertCount
            alertCount = loopAlertCount;

        });
    });

}


