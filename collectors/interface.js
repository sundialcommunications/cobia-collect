exports.incomingData = function (db, data, host) {
    if (db) {
        var keys = Object.keys(data);
        for (i=0; i<keys.length; i++) {
            // loop through each interface
            data[keys[i]].hostId = host._id;
            data[keys[i]].ts = Math.round((new Date()).getTime() / 1000);
            db.collection('interfaceCollector', function (err, collection) {
                collection.insert(data[keys[i]], {'safe':false}, function (err, objects) {
                });
            });
        }
    }
};
