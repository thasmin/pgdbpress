var mysql = require('mysql2');
var flags = require('mysql2/lib/constants/client.js');
var auth = require('mysql2/lib/auth_41.js');

var config_file = process.argv[2] || './config.json';
var config = require(config_file);
var db = require('./pool');
var translator = require('./translator');
db.open(config);
translator.init(db);

// YEAR and MONTH polyfills
//db.query("CREATE OR REPLACE FUNCTION year(TIMESTAMP WITHOUT TIME ZONE) RETURNS INTEGER AS 'SELECT EXTRACT(year FROM $1)::integer;' LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT", []);
//db.query("CREATE OR REPLACE FUNCTION month(TIMESTAMP WITHOUT TIME ZONE) RETURNS INTEGER AS 'SELECT EXTRACT(month FROM $1)::integer;' LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT", []);

function authenticate (params, cb)
{
	if (params.database) {
		db.open(config, params.database);
		translator.init(db);
	}

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

var last_calc_found_rows = -1;

var server = mysql.createServer();
console.log('listening');
var port = config.port || 6446;
server.listen(port);
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
		capabilityFlags: 0x81FFF7FF,
		authCallback: authenticate
	});

	conn.on('error', function(err) {
		if (err.code == 'PROTOCOL_CONNECTION_LOST')
			return;

		console.log('error');
		console.log(err);
	});

	conn.on('init_db', db_name => {
		db.open(config, db_name);
		translator.init(db);
		conn.writeOk();
	});

	conn.on('query', query => {
		//console.log(query);
		translator.translate(query).then(result => {
			switch (result.result) {
				case 'rowset':
					conn.writeColumns(result.columns.map(to_my_col));
					result.rows.forEach(r => conn.writeTextRow(r));
					conn.writeEof();
					break;
				case 'ok':
					conn.writeOk({ affectedRows: result.affectedRows, insertId: result.insertId });
					break;
				case 'table_not_found':
					conn.writeError({ code: 1146, message: "Table '" + result.table + "' doesn't exist" });
					break;
				case 'error':
					conn.writeError({ code: 0, message: result.reason });
					break;
				default:
					console.log("unknown result");
					console.log(result);
					conn.writeOk();
			}
		}).catch(e => {
			console.log('error');
			console.log(e);
			conn.writeOk();
		});
	});
});

function pg_datatypeid_to_my_coltype(format)
{
	// mysql id: https://mariadb.com/kb/en/mariadb/resultset/
	// pgsql oids: SELECT oid, typname FROM pg_type
	var map = {
		19: 253, // name -> var_string
		20: 3, // int8 -> long
		23: 2, // int4 -> short
		25: 252, // text -> blob
		701: 5, // float8 -> double
		705: 253, // unknown -> var_string
		1043: 253, // varchar -> var_string
		1114: 12, // timestamp -> datetime
	};
	if (map[format])
		return map[format];
	console.log('missing pg format: ' + format);
	return 3;
}

function to_my_col(field)
{
	return {
		catalog: 'translator', // database name
		schema: 'translator', // database name
		table: field.table,
		orgTable: field.table,
		name: field.name,
		orgName: field.name,
		characterSet: 33,
		columnLength: 368,
		columnType: pg_datatypeid_to_my_coltype(field.dataType),
		flags: 0,
		decimals: 0
	};
}

/*
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
*/
