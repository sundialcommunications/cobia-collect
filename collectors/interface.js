var jsonrrd = require('../lib/json-rrd.js')
var mongodb = require('mongodb');
var crypto = require('crypto');

// incomingData from listener
exports.incomingData = function (db, data, host) {
    if (db && data.length>0) {

        var o = {};
        o.hostId = host._id;
        o.collector = 'interface';
        o.status = [];

        // loop through each interface
        for (i=0; i<data.length; i++) {
            // check that data is real
            if (data[i] != undefined) {
                var idh = crypto.createHash('md5').update(data[i].if).digest('hex');
                var t = {'hash':idh,'hashTitle':'Interface','overviewText':data[i].if+': '+data[i].recBytes+' bytes in, '+data[i].sentBytes+' bytes out','alert':0};
                o.status.push(t);
            }
        }

        if (o.status.length>0) {
            // update hostCollectorStatus
            db.collection('hostCollectorStatus', function (err, collection) {
                collection.update({'hostId':host._id,'collector':'interface'}, o, {'safe':false,'upsert':true}, function (err, objects) {
                });
            });
        }
    }
};

// a request to this collector from the server api, likely an interface wanting data
exports.serverApiRequest = function (db, hostId, hash, callback) {

    db.collection('interfaceCollector', function (err, collection) {
        collection.find({'hostId':new mongodb.ObjectID(hostId)}).toArray(function(err, docs) {
            callback(err, docs[0]);
        });
    });

}

// run on listener startup to ensure database indexes for this collector
exports.ensureIndex = function(db) {

    if (db) {
        console.log('ensuring');
        db.ensureIndex('interfaceCollector', {'hostId':1,'hash':1}, {'unique':true}, function(err, name) { if (err) { console.log(err) } });
    }

}
