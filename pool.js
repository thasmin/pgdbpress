var Pool = require('pg').Pool;
process.on('unhandledRejection', function(e) { console.log(e.message, e.stack) })
var db_name = 'translator';
exports.pool = new Pool({
	host: 'localhost',
	user: 'translator',
	password: 'translator',
	database: db_name,
});

