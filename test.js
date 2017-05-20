'use strict';

var process    = require('process');
var fs         = require('fs')
var translator = require('./translator');
var db         = require('./pool');

//*
test_stmt("SELECT SQL_CALC_FOUND_ROWS  wp_posts.ID FROM wp_posts  WHERE 1=1  AND wp_posts.post_type = 'post' AND (wp_posts.post_status = 'publish' OR wp_posts.post_status = 'private')  ORDER BY wp_posts.post_date DESC LIMIT 0, 10");
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

	sql_p.then(result => {
		console.log(stmt);
		if (verbose) print_ast(ast);
		console.log('---');
		console.log(result[0]);
		console.log(result[1]);
		/*
		db.query(result[0], result[1])
			.then((res) => { console.log('success in db'); })
			.catch((e) => { console.log('error in db'); console.log(e); });
		*/
		console.log('===');
		console.log();
	}).catch(e => {
		console.log(stmt);
		if (verbose) print_ast(ast);
		console.log('error');
		console.log(e);
		console.log('===');
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
