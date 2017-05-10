'use strict';

var process    = require('process');
var fs         = require('fs')
var translator = require('./translator');

//*
test_stmt("DELETE a, b FROM wp_options a, wp_options b \
WHERE a.option_name LIKE '\\_transient\\_%' \
AND a.option_name NOT LIKE '\\_transient\\_timeout\\_%' \
AND b.option_name = CONCAT( '_transient_timeout_', SUBSTRING( a.option_name, 12 ) ) \
AND b.option_value < 1494171210"); //, true);
//*/

/************************************/


if (process.argv[1] == 'test') {
	var files = [ 'wordpress-setup.sql', 'wordpress-homepage.sql', 'wordpress-store.sql', 'extra.sql' ];
	for (var f in files) {
		var test_sql = fs.readFileSync(files[f], 'utf8').split('\n');
		test_sql.pop();

		for (var i in test_sql) {
			console.log(files[f] + " #" + i);
			if (test_sql[i] == '')
				continue;
			test_stmt(test_sql[i]);
		}
	}
}


/************************************/


function print_ast(ast)
{
	console.log(JSON.stringify(clean_obj(ast), null, 2));
}

function test_stmt(stmt, verbose)
{
	var ast = translator.parse_stmt(stmt);
	var sql_p = translator.ast_to_pgsql(ast);
	sql_p.then((out_sql) => {
		console.log(stmt);
		if (verbose) print_ast(ast);
		console.log(out_sql);
		console.log('---');
	}).catch((e) => {
		console.log(stmt);
		if (verbose) print_ast(ast);
		console.log('stmt not reconstructable');
		console.log('---');
	});
}

function clean_obj(obj)
{
	var o = {};
	Object.assign(o, obj);
	for (var i in o)
		if (!o[i])
			delete o[i];
	return o;
}
