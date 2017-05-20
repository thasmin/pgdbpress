var mysql = require('mysql2');
var flags = require('mysql2/lib/constants/client.js');
var auth = require('mysql2/lib/auth_41.js');

var translator = require('./translator');
var db = require('./pool');

function authenticate (params, cb) {
	//console.log(params);

	// accept anything
	cb(null);
	return;

	var doubleSha = auth.doubleSha1('pass123');
	var isValid = auth.verifyToken(params.authPluginData1, params.authPluginData2, params.authToken, doubleSha);
	if (isValid) {
		cb(null);
	} else {
		// for list of codes lib/constants/errors.js
		cb(null, {message: 'wrong password dude', code: 1045});
	}
}

var server = mysql.createServer();
console.log('listening');
server.listen(3333);
server.on('connection', function (conn) {

	// we can deny connection here:
	// conn.writeError({ message: 'secret', code: 123 });
	// conn.close();

	conn.serverHandshake({
		protocolVersion: 10,
		serverVersion: '5.6.10',
		connectionId: 1234,
		statusFlags: 2,
		characterSet: 33,
		// capabilityFlags: 0xffffff,
		// capabilityFlags: -2113931265,
		capabilityFlags: 2181036031,
		authCallback: authenticate
	});

	conn.on('error', function(err) {
		if (err.code == 'PROTOCOL_CONNECTION_LOST')
			return;
console.log('error');
console.log(err);
	});

	conn.on('query', function (query) {
		// use this to avoid translating the ast
		var pg_query = null;
		var pg_params = [];

		var query_lower = query.toLowerCase();
		if (query_lower == 'select @@version_comment limit 1')
			return send_version_comment(conn);
		if (query_lower == 'select database()')
			return send_database(conn);
		if (query_lower == 'select @@session.sql_mode')
			return send_session_sql_mode(conn);

		var ast = translator.parse_stmt(query);
		if (ast == null)
			return conn.writeEof();

		if (ast.expr == 'SET')
			return conn.writeOk();

		var promise;
		if (pg_query)
			promise = Promise.resolve([pg_query, pg_params]);
		else
			promise = translator.ast_to_pgsql(ast);

		promise.then(r => {
			var sql = r[0];
			var params = r[1];

			db.query(sql, params)
				.then(result => {
console.log();
console.log('query: ' + query);
console.log('sent: ' + sql);
if (params.length > 0) console.log(params);
					if (['SELECT', 'SHOW', 'EXPLAIN'].includes(ast.expr)) {
//console.log(result.rows);
						conn.writeColumns(result.fields.map(pg_to_my_field));
						result.rows.forEach(r => conn.writeTextRow(pg_to_my_row(r)));
						conn.writeEof();
					} else if (ast.expr == 'INSERT' || ast.expr == 'UPDATE' || ast.expr == 'DELETE') {
//console.log(result);
						conn.writeOk({affectedRows:result.rowCount});
					} else if (ast.expr == 'CREATE') {
						conn.writeOk();
					}
				})
				.catch(err => {
console.log();
console.log('query: ' + query);
console.log('sent: ' + sql);
if (params.length > 0) console.log(params);

					var missing_table = err.message.match(/^relation "(.*)" does not exist$/);
					if (missing_table)
						return conn.writeError({code:1146, message:"Table '" + db.name + "." + missing_table[1] + "' doesn't exist"});

console.log('error: ' + err.message);
					// error code 1046 is no database selected, 1146 is table doesn't exist
					return conn.writeError({ code: 0, message: err.message });
				});
		}).catch(err => {
console.log();
console.log('query: ' + query);
console.log('sent: ' + sql);
if (params.length > 0) console.log(params);
			console.log('got an error while translating');
			console.log(err);
		});
	});
});

function pg_to_my_field(field) {
	// need: catalog, schema, table, orgTable, name, orgName, characterSet 33, columnLength, columnType, flags, decimals
	// have: name: 'count', tableID: 0, columnID: 0, dataTypeID: 20, dataTypeSize: 8, dataTypeModifier: -1, format: 'text'
	return {
		catalog: 'translator', // database name
		schema: 'translator', // database name
		table: field.tableID,
		orgTable: field.tableID,
		name: field.name,
		orgName: field.name,
		characterSet: 33,
		columnLength: 400,
		columnType: field.format,
		flags: 0,
		decimals: 0
	};
}

function pg_to_my_row(row) {
	return Object.keys(row).map(k => row[k]);
}

function my_col(name) {
	return {
		catalog: 'def',
		schema: 'test',
		table: 'test_table',
		orgTable: 'test_table',
		name: name,
		orgName: name,
		characterSet: 33,
		columnLength: 384,
		columnType: 253,
		flags: 0,
		decimals: 0
	};
}

function send_show_databases(conn)
{
	conn.writeColumns([my_col('Database')]);
	conn.writeTextRow(['information_schema']);
	conn.writeTextRow(['mysql']);
	conn.writeTextRow(['performance_schema']);
	conn.writeEof();
}

function send_version_comment(conn)
{
	conn.writeColumns([my_col('@@version_comment')]);
	conn.writeTextRow(['Ubuntu 17.04']);
	conn.writeEof();
}

function send_session_sql_mode(conn)
{
	conn.writeColumns([my_col('@@session.sql_mode')]);
	conn.writeTextRow(['NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION']);
	conn.writeEof();
}

function send_database(conn)
{
	conn.writeColumns([my_col('database')]);
	conn.writeTextRow(['translator']);
	conn.writeEof();
}
