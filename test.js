'use strict';

var process    = require('process');
var fs         = require('fs')
var translator = require('./translator');

var fs      = require('fs')
var PEG     = require("pegjs")
var parser = PEG.generate(fs.readFileSync("sql.pegjs", "utf8"));

//*
test_stmt("INSERT INTO `wp_options` (`option_name`, `option_value`, `autoload`) VALUES ('_transient_is_multi_author', '0', 'yes') ON DUPLICATE KEY UPDATE `option_name` = VALUES(`option_name`), `option_value` = VALUES(`option_value`), `autoload` = VALUES(`autoload`)");
//*/

/************************************/


if (process.argv[2] == 'test') {
	var files = [ 'wordpress-setup.sql', 'wordpress-homepage.sql', 'wordpress-store.sql', 'extra.sql' ];
	for (var f in files) {
		var test_sql = fs.readFileSync(files[f], 'utf8').split('\n');
		test_sql.pop();

		for (var i in test_sql) {
			//console.log(files[f] + " #" + i);
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
	var ast = translator.parse_stmt(stmt, true);
	if (!ast)
		return;

	var sql_p = translator.ast_to_pgsql(ast);
	if (!sql_p)
		return;

	sql_p.then((out_sql) => {
		console.log(stmt);
		if (verbose) print_ast(ast);
		console.log(out_sql);
		console.log('---');
	}).catch((e) => {
		console.log(stmt);
		console.log(stmt);
		if (verbose) print_ast(ast);
		console.log('error');
		console.log(e);
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
