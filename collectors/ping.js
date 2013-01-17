var config = require('../config.js');
var mongodb = require('mongodb');
var db = new mongodb.Db(config.mongo.dbname, new mongodb.Server(config.mongo.host, config.mongo.port, {'auto_reconnect':true}), {journal:true});

process.on('message', function (data) {
    console.log('ping collector execution follows...');


    db.open(function (err, db) {
    console.log(db);
    if (db) {

    // handle incoming data
    console.log('ping collector got data');
    console.log(data);

    var host = data[1];
    var data = data[0];

    var keys = Object.keys(data);
    for (i=0; i<keys.length; i++) {
        console.log(data[keys[i]]);
        db.collection('pingCollector', function (err, collection) {
            console.log(collection);
            collection.insert({'hostId':host._id,'ts':Math.round((new Date()).getTime() / 1000)}, {'safe':true}, function (err, objects) {
                console.log(err);
                console.log(objects);
            });
        });
    }

    }
    });

    process.exit();

});
