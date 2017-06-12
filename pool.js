var Pool = require('pg').Pool;

var pool = null;
exports.name = null;

exports.open = function(config, db_name)
{
	exports.name = db_name;
	var opts = {
		host: config.host,
		user: config.user,
		password: config.password,
		database: db_name,
	};
	pool = new Pool(opts);
}

function handleError(resolve, reject, sql, args, err)
{
//console.log('got a sql error: ' + err.message);
	// attempt to fix comparison mismatch errors
	if (err.message.indexOf('operator does not exist: ') === 0) {
		// comparison type mismatch
		// find out the types
		var types = err.message.substr('operator does not exist: '.length).split(' ');
		// find first nonspace after error
		var errorAt = parseInt(err.position, 10);
		while (/\s/.test(sql[errorAt]))
			errorAt += 1;
		var remainder = sql.substr(errorAt);
		var spaceAt = remainder.match(/[^ ] /).index+1;
		var fixed = remainder.substr(0, spaceAt) + "::" + types[0] + remainder.substr(spaceAt);
		sql = sql.substr(0, errorAt) + fixed;
//console.log(sql);
		exports.query(sql, args)
			.then(resolve)
			.catch(err => { handleError(resolve, reject, sql, args, err); });
	} else if (err.message.indexOf('invalid input syntax for type timestamp: ') === 0) {
		// date is in format Sat Jun 10 2017 03:35:44 GMT+0000 (UTC)
		var old_date_str = err.message.split('"')[1];
		var new_date_str = new Date(old_date_str).toISOString();
		sql = sql.replace(old_date_str, new_date_str);
		exports.query(sql, args)
			.then(resolve)
			.catch(err => { handleError(resolve, reject, sql, args, err); });
	} else {
		reject(err);
	}
}

exports.query = function(sql, args)
{
	return new Promise((resolve, reject) => {
//console.log('querying: ' + sql);
		if (!args)
			args = [];
		pool.query({text: sql, values: args, rowMode: 'array'})
			.then(resolve)
			//.then(result => { console.log(n + " got a result"); resolve(result); })
			.catch(err => { handleError(resolve, reject, sql, args, err); });
	});
}
