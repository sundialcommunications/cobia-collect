exports.incomingData = function (db, data, host) {
    if (db) {
        data.hostId = host._id;
        data.ts = Math.round((new Date()).getTime() / 1000);
        db.collection('systemCollector', function (err, collection) {
            collection.insert(data, {'safe':false}, function (err, objects) {
            });
        });
    }
};
