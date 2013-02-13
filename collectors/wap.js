var jsonrrd = require('../lib/json-rrd.js')
var mongodb = require('mongodb');
var crypto = require('crypto');

// incomingData from listener
exports.incomingData = function (db, data, host) {
    if (db && data.length>0) {

        var o = {};
        o.hostId = host._id;
        o.collector = 'wap';
        o.status = [];

        // loop through each interface
        for (var i=0; i<data.length; i++) {
            // check that data is real
            if (typeof data[i].interface != undefined) {
                var idh = crypto.createHash('md5').update(data[i].interface).digest('hex');
                var t = {'hash':idh,'hashTitle':'MAC SIGNAL','overviewText':data[i].interface+': '+data[i].stations.length+' connected stations','alert':0};
                o.status.push(t);
                var rt = '';
                for (var e=0; e<data[i].stations.length; e++) {
                    rt += data[i].stations[e].mac+' - '+data[i].stations[e].rssi+"\n";
                }
                o.status.push({'hash':null,'hashTitle':'','overviewText':rt,'alert':0});
            }
        }

        if (o.status.length>0) {
            // update hostCollectorStatus
            db.collection('hostCollectorStatus', function (err, collection) {
                collection.update({'hostId':host._id,'collector':'wap'}, o, {'safe':false,'upsert':true}, function (err, objects) {
                });
            });
        }
    }
};

// a request to this collector from the server api, likely an interface wanting data
exports.serverApiRequest = function (db, hostId, hash, callback) {

    db.collection('wapCollector', function (err, collection) {
        collection.find({'hostId':new mongodb.ObjectID(hostId)}).toArray(function(err, docs) {
            callback(err, docs[0]);
        });
    });

}

// run on listener startup to ensure database indexes for this collector
exports.ensureIndex = function(db) {

    if (db) {
        console.log('ensuring');
        db.ensureIndex('wapCollector', {'hostId':1,'hash':1}, {'unique':true}, function(err, name) { if (err) { console.log(err) } });
    }

}
