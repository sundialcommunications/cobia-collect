// copy this file to config.js and edit

var config = {}

config.serverPort = 8443;
config.listenerPort = 8550;

config.emailUser = '';
config.emailPass = '';
config.emailService = 'Gmail'; // well known services - http://www.nodemailer.com/docs/smtp

config.mongo = {};

config.mongo.dbname = 'collect';
config.mongo.host = '127.0.0.1';
config.mongo.port = 27017;

module.exports = config;
