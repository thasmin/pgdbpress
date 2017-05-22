var Pool = require('pg').Pool;
var db_name = exports.name = 'translator';
var pool = new Pool({
	host: 'localhost',
	user: 'translator',
	password: 'translator',
	database: db_name,
});

function handleError(resolve, reject, sql, args, err) {
//console.log(n + ' got a sql error: ' + err.message);
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
