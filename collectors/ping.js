var jsonrrd = require('../lib/json-rrd.js')

exports.incomingData = function (db, data, host) {
    if (db) {
        var keys = Object.keys(data);
        // loop through each host
        for (i=0; i<keys.length; i++) {
            db.collection('pingCollector', function (err, collection) {
                // first get the old data
                collection.find({'hostId':host._id,'host':data[keys].host}).toArray(function(err, docs) {
                    var d = {};
                    if (docs.length>0) {
                        // data exists
                        d = docs[0].d;
                    }
                    // rrd update 24 hours of data at 288 periods meaning a 5 minute resolution
                    d = jsonrrd.update(5*60, 24*60/5, 'GAUGE', data[keys].avgRtt, d);
                    // update the db
                    collection.update({'hostId':host._id,'host':data[keys].host},{'$set':{'hostId':host._id,'d':d}}, {'safe':false,'upsert':true}, function (err, objects) {
                    });
                });
            });
        }
    }
};

exports.ensureIndex = function(db) {

    if (db) {
        console.log('ensuring');
        db.ensureIndex('pingCollector', {'hostId':1,'host':1}, {'unique':true}, function(err, name) { if (err) { console.log(err) } });
    }

}
