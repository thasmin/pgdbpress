'use strict';

var process    = require('process');
var fs         = require('fs')
var translator = require('./translator');
var db         = require('./pool');

//*
test_stmt("SELECT wp_term_taxonomy.term_id FROM wp_term_taxonomy INNER JOIN wp_terms USING (term_id) WHERE taxonomy = 'category' AND wp_terms.slug IN ('uncategorized')");
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

function test_stmt(stmt, match)
{
	var ast = translator.parse_stmt(stmt, true);
	if (!ast)
		return;

	var sql_p = translator.ast_to_pgsql(ast);
	if (!sql_p)
		return;

	sql_p.then(result => {
		console.log(stmt);
		//console.log(ast);
		console.log('---');
		console.log(result[0]);
		if (result[1].length > 0)
			console.log(result[1]);
		if (match) {
			console.log(match);
			console.log(result[0] == match ? 'success' : 'no match');
		}
		/*
		db.query(result[0], result[1])
			.then((res) => { console.log('success in db'); })
			.catch((e) => { console.log('error in db'); console.log(e); });
		*/
		console.log('===');
		console.log();
	}).catch(e => {
		console.log(stmt);
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
