var jsonrrd = require('../lib/json-rrd.js')
var mongodb = require('mongodb');
var crypto = require('crypto');

// incomingData from listener
exports.incomingData = function (db, data, host) {
    if (db && data.length>0) {

        var o = {};
        o.hostId = host._id;
        o.collector = 'ping';
        o.status = [];

        // loop through each host
        for (i=0; i<data.length; i++) {
            // check that data is real
            if (data[i] != undefined) {
                var idh = crypto.createHash('md5').update(data[i].host).digest('hex')
                var t = {'id':idh,'text':'host: '+data[i].host+' - avgRtt: '+data[i].avgRtt+', loss: '+data[i].loss+', minRtt: '+data[i].minRtt+', maxRtt: '+data[i].maxRtt};
                o.status.push(t);
            }
        }

        if (o.status.length>0) {
            // update hostCollectorStatus
            db.collection('hostCollectorStatus', function (err, collection) {
                collection.update({'hostId':host._id,'collector':'ping'}, o, {'safe':false,'upsert':true}, function (err, objects) {
                });
            });
        }
    }
};

// a request to this collector from the server api, likely an interface wanting data
exports.serverApiRequest = function (db, hostId, dataId, callback) {

    db.collection('pingCollector', function (err, collection) {
        collection.find({'hostId':new mongodb.ObjectID(hostId)}).toArray(function(err, docs) {
            callback(err, docs[0]);
        });
    });

}

// run on listener startup to ensure database indexes for this collector
exports.ensureIndex = function(db) {

    if (db) {
        console.log('ensuring');
        db.ensureIndex('pingCollector', {'hostId':1,'hash':1}, {'unique':true}, function(err, name) { if (err) { console.log(err) } });
    }

}
